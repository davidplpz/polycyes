import type {
  Role,
  Permission,
  CheckInput,
  CheckResult,
  EvalContext,
  DeniedBy,
  FilterInput,
  FilterResult,
  DebugStep,
  DebugTrace,
} from './types.js';
import type { PolicyReader } from './store.js';
import {
  CircularRoleHierarchyError,
  HierarchyTooDeepError,
  StoreUnavailableError,
  InvalidInputError,
  ConditionEvaluationError,
  EmptyConditionArrayError,
  ConditionTimeoutError,
} from './errors.js';
import type { EngineOptions } from './types.js';

declare var console: { warn(...args: unknown[]): void };
declare function setTimeout(cb: () => void, ms: number): number;

const MAX_INHERITANCE_DEPTH = 50;

export class Engine {
  private readonly store: PolicyReader;
  private readonly options: Required<EngineOptions>;

  constructor(store: PolicyReader, options: EngineOptions = {}) {
    this.store = store;
    this.options = {
      timeoutMs: options.timeoutMs ?? 1000,
      failOpen: options.failOpen ?? false,
      disableRoleHintWarning: options.disableRoleHintWarning ?? false,
      useIndex: options.useIndex ?? true,
    };
    if (!Number.isFinite(this.options.timeoutMs) || this.options.timeoutMs <= 0) {
      throw new Error(`Invalid engine option: timeoutMs must be a positive finite number`);
    }
  }

  async check(input: CheckInput): Promise<CheckResult> {
    this.validateInput(input);

    let roleNames: string[];
    try {
      roleNames = await this.store.getUserRoles(input.user.id);
    } catch (err) {
      if (this.options.failOpen) {
        return {
          allowed: true,
          reason: 'granted: store unavailable, failOpen=true (SECURITY WARNING)',
          evaluatedAt: new Date(),
        };
      }
      throw new StoreUnavailableError(err);
    }

    this.warnRoleHintMismatch(input.user.roles, roleNames);

    if (roleNames.length === 0) {
      return {
        allowed: false,
        reason: `denied: user '${input.user.id}' has no roles`,
        deniedBy: { type: 'no-roles', detail: `user has no roles in store` },
        evaluatedAt: new Date(),
      };
    }

    const resolved = await this.resolveRoles(roleNames);
    return this.evaluate(input, resolved);
  }

  async checkMany(inputs: CheckInput[]): Promise<CheckResult[]> {
    // Group by userId, resolve roles once per unique user
    const grouped = new Map<string, { input: CheckInput; idx: number }[]>();
    for (let i = 0; i < inputs.length; i++) {
      const uid = inputs[i].user.id;
      if (!grouped.has(uid)) grouped.set(uid, []);
      grouped.get(uid)!.push({ input: inputs[i], idx: i });
    }

    const results: (CheckResult | null)[] = new Array(inputs.length).fill(null);

    for (const [userId, entries] of grouped) {
      try {
        this.validateInput(entries[0].input);
        const roleNames = await this.store.getUserRoles(userId);
        this.warnRoleHintMismatch(entries[0].input.user.roles, roleNames);

        if (roleNames.length > 0) {
          const resolved = await this.resolveRoles(roleNames);
          for (const { input, idx } of entries) {
            try {
              results[idx] = await this.evaluate(input, resolved);
            } catch (err) {
              results[idx] = {
                allowed: false,
                reason: `error: ${err instanceof Error ? err.message : 'unknown'}`,
                deniedBy: { type: 'condition-failed', detail: String(err) },
                evaluatedAt: new Date(),
              };
            }
          }
        } else {
          for (const { input, idx } of entries) {
            results[idx] = {
              allowed: false,
              reason: `denied: user '${input.user.id}' has no roles`,
              deniedBy: { type: 'no-roles', detail: `user has no roles in store` },
              evaluatedAt: new Date(),
            };
          }
        }
      } catch (err) {
        for (const { input: _input, idx } of entries) {
          results[idx] = {
            allowed: false,
            reason: `error: ${err instanceof Error ? err.message : 'unknown'}`,
            deniedBy: { type: 'condition-failed', detail: String(err) },
            evaluatedAt: new Date(),
          };
        }
      }
    }

    return results as CheckResult[];
  }

  async filter(input: FilterInput): Promise<FilterResult> {
    const allowed: FilterResult['allowed'] = [];
    const denied: FilterResult['denied'] = [];

    for (const resource of input.resources) {
      const result = await this.check({
        user: input.user,
        resource: input.resourceType,
        action: input.action,
        resourceInstance: {
          id: resource.id,
          ownerId: resource.ownerId,
          attributes: resource.attributes,
        },
      });
      if (result.allowed) {
        allowed.push(resource);
      } else {
        denied.push({ id: resource.id, reason: result.reason });
      }
    }

    return { allowed, denied };
  }

  async debug(input: CheckInput): Promise<DebugTrace> {
    const steps: DebugStep[] = [];
    const add = (type: DebugStep['type'], detail: string, passed: boolean) =>
      steps.push({ type, detail, passed, timestamp: new Date() });

    this.validateInput(input);

    let roleNames: string[];
    try {
      roleNames = await this.store.getUserRoles(input.user.id);
      add('role-resolution', `resolved user roles: [${roleNames}]`, roleNames.length > 0);
    } catch (err) {
      add('role-resolution', `store error: ${String(err)}`, false);
      throw new StoreUnavailableError(err);
    }

    const resolvedRoles = await this.resolveRoles(roleNames);
    add('role-resolution', `resolved ${resolvedRoles.length} roles with inheritance`, true);

    const ctx = this.buildEvalContext(input);
    let bestResult = await this.check(input);

    // Replay permission checks for trace
    const candidates = this.options.useIndex
      ? lookupIndex(buildPermissionIndex(resolvedRoles), input.resource, input.action)
      : resolvedRoles.flatMap((role) =>
          role.permissions
            .filter((p) => matchResource(input.resource, p.resource) && matchAction(input.action, p.action))
            .map((permission) => ({ role, permission })),
        );

    for (const { role, permission } of candidates) {
      add('resource-match', `${permission.resource} === ${input.resource}`, true);
      add('action-match', `${permission.action} === ${input.action}`, true);

      const scopeOk = this.matchScope(input, permission.scope ?? 'any');
      add('scope', `scope=${permission.scope ?? 'any'}`, scopeOk);
      if (!scopeOk) continue;

      const condOk = await this.matchConditions(ctx, permission);
      if (permission.condition !== undefined) {
        add('condition', `effect=${permission.effect ?? 'allow'}`, condOk);
      }
    }

    add('result', bestResult.reason, bestResult.allowed);

    return { input, steps, result: bestResult };
  }

  // -- evaluate (shared by check + checkMany) ----------------------------

  private async evaluate(input: CheckInput, resolvedRoles: Role[]): Promise<CheckResult> {
    const ctx = this.buildEvalContext(input);

    let bestAllow: { role: Role; permission: Permission } | null = null;
    let bestDeny: { role: Role; permission: Permission } | null = null;
    let deniedReason: DeniedBy | null = null;

    const candidates = this.options.useIndex
      ? lookupIndex(buildPermissionIndex(resolvedRoles), input.resource, input.action)
      : resolvedRoles.flatMap((role) =>
          role.permissions
            .filter((p) => matchResource(input.resource, p.resource) && matchAction(input.action, p.action))
            .map((permission) => ({ role, permission })),
        );

    for (const { role, permission } of candidates) {
      if (!this.matchScope(input, permission.scope ?? 'any')) {
        if (!deniedReason) {
          deniedReason = { type: 'scope-failed', detail: `scope '${permission.scope}' not satisfied` };
        }
        continue;
      }

      if (permission.effect === 'deny') {
        bestDeny = { role, permission };
        break;
      }

      const conditionPassed = await this.matchConditions(ctx, permission);
      if (!conditionPassed) {
        if (!deniedReason) {
          deniedReason = { type: 'condition-failed', detail: 'ABAC condition not met' };
        }
        continue;
      }

      if (!bestAllow) {
        bestAllow = { role, permission };
      }
    }

    if (bestDeny) {
      return {
        allowed: false,
        reason: `denied: explicit deny by role '${bestDeny.role.name}'`,
        deniedBy: {
          type: 'explicit-deny',
          detail: `permission ${bestDeny.permission.resource}:${bestDeny.permission.action}`,
        },
        evaluatedAt: new Date(),
      };
    }

    if (bestAllow) {
      return {
        allowed: true,
        reason: `granted by role '${bestAllow.role.name}'`,
        matchedRole: bestAllow.role.name,
        matchedPermission: {
          resource: bestAllow.permission.resource,
          action: bestAllow.permission.action,
          effect: 'allow',
        },
        evaluatedAt: new Date(),
      };
    }

    return {
      allowed: false,
      reason: `denied: no matching permission for resource '${input.resource}' action '${input.action}'`,
      deniedBy: deniedReason ?? {
        type: 'no-match',
        detail: `no permission matches resource='${input.resource}' action='${input.action}'`,
      },
      evaluatedAt: new Date(),
    };
  }

  private warnRoleHintMismatch(hint: string[] | undefined, actual: string[]): void {
    if (this.options.disableRoleHintWarning) return;
    if (!Array.isArray(hint) || hint.length === 0) return;
    const sorted = (a: string[]) => [...a].sort().join(',');
    if (sorted(hint) !== sorted(actual)) {
      console.warn(
        `[polycyes] user.roles hint (${hint}) differs from store (${actual}). Store is authoritative.`,
      );
    }
  }

  // -- resolveRoles --------------------------------------------------------

  private async resolveRoles(roleNames: string[]): Promise<Role[]> {
    const allRoles = await this.store.getRolesByNames(roleNames);
    const roleMap = new Map(allRoles.map((r) => [r.name, r]));
    const visited = new Set<string>();
    const resolved: Role[] = [];

    const resolveOne = async (name: string, chain: string[]): Promise<void> => {
      if (visited.has(name)) return;

      let role: Role | undefined = roleMap.get(name);
      if (!role) {
        const fromStore = await this.store.getRole(name);
        if (fromStore) {
          role = fromStore;
          roleMap.set(name, role);
        }
      }
      if (!role) return;

      visited.add(name);

      if (role.inherits) {
        for (const parent of role.inherits) {
          if (chain.includes(parent)) {
            throw new CircularRoleHierarchyError([...chain, parent]);
          }
          if (chain.length >= MAX_INHERITANCE_DEPTH) {
            throw new HierarchyTooDeepError([...chain, parent]);
          }
          await resolveOne(parent, [...chain, parent]);
        }
      }

      if (!resolved.some((r) => r.name === role.name)) {
        resolved.push(role);
      }
    };

    for (const name of roleNames) {
      await resolveOne(name, [name]);
    }

    return resolved;
  }

  // -- scope ---------------------------------------------------------------

  private matchScope(input: CheckInput, scope: Permission['scope']): boolean {
    if (scope === 'any' || scope === 'none') return true;
    if (typeof scope === 'function') {
      return scope(this.buildEvalContext(input));
    }
    if (scope === 'own') {
      if (!input.resourceInstance?.ownerId) return false;
      return input.resourceInstance.ownerId === input.user.id;
    }
    return false;
  }

  // -- conditions ----------------------------------------------------------

  private async matchConditions(ctx: EvalContext, permission: Permission): Promise<boolean> {
    if (permission.condition === undefined) return true;

    const conditions = Array.isArray(permission.condition)
      ? permission.condition
      : [permission.condition];

    if (conditions.length === 0) {
      throw new EmptyConditionArrayError(permission);
    }

    const mode = permission.conditionMode ?? 'all';
    const timeoutMs = ctx.timeoutMs ?? this.options.timeoutMs;

    try {
      const results = await Promise.all(
        conditions.map(async (c) => {
          const result = await Promise.race([
            Promise.resolve(c(ctx)),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new ConditionTimeoutError(permission, timeoutMs)), timeoutMs),
            ),
          ]);
          if (typeof result !== 'boolean') {
            throw new ConditionEvaluationError(
              permission,
              new TypeError(`Condition returned ${typeof result}, expected boolean`),
            );
          }
          return result;
        }),
      );
      return mode === 'all' ? results.every(Boolean) : results.some(Boolean);
    } catch (err) {
      if (err instanceof ConditionTimeoutError) throw err;
      if (err instanceof EmptyConditionArrayError) throw err;
      if (err instanceof ConditionEvaluationError) throw err;
      throw new ConditionEvaluationError(permission, err);
    }
  }

  // -- context -------------------------------------------------------------

  private buildEvalContext(input: CheckInput): EvalContext {
    const s = sanitizeInput(input);

    const ctx: EvalContext = {
      user: deepFreeze({ ...s.user, attributes: deepFreeze({ ...s.user.attributes }) }),
      resource: s.resource,
      action: s.action,
      resourceInstance: s.resourceInstance
        ? deepFreeze({ ...s.resourceInstance, attributes: deepFreeze({ ...s.resourceInstance.attributes }) })
        : undefined,
      metadata: s.metadata ? deepFreeze({ ...s.metadata }) : undefined,
      timeoutMs: this.options.timeoutMs,
      get userAttributes() {
        return this.user.attributes;
      },
      get resourceAttributes() {
        return this.resourceInstance?.attributes;
      },
    };

    return ctx;
  }

  // -- validation ----------------------------------------------------------

  private validateInput(input: CheckInput): void {
    if (!input.user?.id || typeof input.user.id !== 'string' || !input.user.id.trim()) {
      throw new InvalidInputError('user.id is required and must be a non-empty string');
    }
    if (!input.resource || typeof input.resource !== 'string' || !input.resource.trim()) {
      throw new InvalidInputError('resource is required and must be a non-empty string');
    }
    if (!input.action || typeof input.action !== 'string' || !input.action.trim()) {
      throw new InvalidInputError('action is required and must be a non-empty string');
    }
  }
}

// -- module-level helpers --------------------------------------------------

function matchResource(inputResource: string, permResource: string): boolean {
  return permResource === '*' || permResource === inputResource;
}

function matchAction(inputAction: string, permAction: string): boolean {
  return permAction === '*' || permAction === inputAction;
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    for (const value of Object.values(obj as object)) {
      deepFreeze(value);
    }
    Object.freeze(obj);
  }
  return obj;
}

const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

function sanitizeInput(input: CheckInput): CheckInput {
  function strip(obj: Record<string, unknown>): Record<string, unknown> {
    for (const key of DANGEROUS_KEYS) delete obj[key];
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        strip(value as Record<string, unknown>);
      }
    }
    return obj;
  }

  return {
    ...input,
    user: {
      ...input.user,
      attributes: input.user.attributes
        ? strip({ ...input.user.attributes }) as Record<string, unknown>
        : undefined,
    },
    resourceInstance: input.resourceInstance
      ? {
          ...input.resourceInstance,
          attributes: input.resourceInstance.attributes
            ? strip({ ...input.resourceInstance.attributes }) as Record<string, unknown>
            : undefined,
        }
      : undefined,
    metadata: input.metadata
      ? strip({ ...input.metadata }) as Record<string, unknown>
      : undefined,
  };
}

// -- permission index (O(1) lookup) ---------------------------------------

type IndexedPerm = { role: Role; permission: Permission };
type PermissionIndex = Map<string, Map<string, IndexedPerm[]>>;

function buildPermissionIndex(roles: Role[]): PermissionIndex {
  const index: PermissionIndex = new Map();

  const add = (resource: string, action: string, entry: IndexedPerm) => {
    if (!index.has(resource)) index.set(resource, new Map());
    const actionMap = index.get(resource)!;
    if (!actionMap.has(action)) actionMap.set(action, []);
    actionMap.get(action)!.push(entry);
  };

  for (const role of roles) {
    for (const permission of role.permissions) {
      add(permission.resource, permission.action, { role, permission });
    }
  }

  return index;
}

function lookupIndex(
  index: PermissionIndex,
  resource: string,
  action: string,
): IndexedPerm[] {
  const results: IndexedPerm[] = [];
  const seen = new Set<Permission>();

  const addUnique = (perms: IndexedPerm[] | undefined) => {
    if (!perms) return;
    for (const p of perms) {
      if (!seen.has(p.permission)) {
        seen.add(p.permission);
        results.push(p);
      }
    }
  };

  addUnique(index.get(resource)?.get(action));
  addUnique(index.get(resource)?.get('*'));
  addUnique(index.get('*')?.get(action));
  addUnique(index.get('*')?.get('*'));

  return results;
}
