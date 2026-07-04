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
import type { PolicyReader, PolicyStore } from './store.js';
import { RoleResolver } from './resolver.js';
import { ConditionEvaluator } from './conditions.js';
import {
  StoreUnavailableError,
  InvalidInputError,
  ConditionEvaluationError,
  ConditionTimeoutError,
  EmptyConditionArrayError,
  InvalidEngineOptionError,
} from './errors.js';
import type { EngineOptions } from './types.js';

declare var console: { warn(...args: unknown[]): void };

type IndexedPerm = { role: Role; permission: Permission };
type PermissionIndex = Map<string, Map<string, IndexedPerm[]>>;

interface ResolvedCacheEntry {
  roles: Role[];
  index: PermissionIndex | null;
  expiresAt: number;
}

export interface EngineCacheStats {
  resolvedRoles: { size: number; hits: number; misses: number };
}

const DEFAULT_RESOLVED_TTL = 1000;

export class Engine {
  private readonly store: PolicyReader;
  private readonly options: Required<EngineOptions>;
  private readonly resolver: RoleResolver;
  private readonly conditions: ConditionEvaluator;

  private readonly resolvedCache: Map<string, ResolvedCacheEntry>;
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(store: PolicyReader, options: EngineOptions = {}) {
    this.store = store;
    this.resolver = new RoleResolver(store);
    this.conditions = new ConditionEvaluator();
    this.options = {
      timeoutMs: options.timeoutMs ?? 1000,
      failOpen: options.failOpen ?? false,
      disableRoleHintWarning: options.disableRoleHintWarning ?? false,
      useIndex: options.useIndex ?? true,
      resolvedCacheTTL: options.resolvedCacheTTL ?? DEFAULT_RESOLVED_TTL,
    };
    if (!Number.isFinite(this.options.timeoutMs) || this.options.timeoutMs < 0) {
      throw new InvalidEngineOptionError('timeoutMs must be a non-negative finite number');
    }
    if (options.resolvedCacheTTL !== undefined && (!Number.isFinite(options.resolvedCacheTTL) || options.resolvedCacheTTL < 0)) {
      throw new InvalidEngineOptionError('resolvedCacheTTL must be a non-negative finite number or undefined');
    }
    this.resolvedCache = new Map();
  }

  getStore(): PolicyReader {
    return this.store;
  }

  getCacheStats(): EngineCacheStats {
    return {
      resolvedRoles: {
        size: this.resolvedCache.size,
        hits: this.cacheHits,
        misses: this.cacheMisses,
      },
    };
  }

  clearCache(): void {
    this.resolvedCache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  async check(input: CheckInput): Promise<CheckResult> {
    const { result } = await this.evaluate(input);
    return result;
  }

  async checkMany(inputs: CheckInput[]): Promise<CheckResult[]> {
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
          const resolved = await this.resolver.resolve(roleNames);
          const index = this.options.useIndex ? buildPermissionIndex(resolved) : null;

          for (const { input, idx } of entries) {
            try {
              const { result } = await this.evaluate(input, { resolvedRoles: resolved, index });
              results[idx] = result;
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
              deniedBy: { type: 'no-roles', detail: 'user has no roles in store' },
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
    const checkInputs = input.resources.map((resource) => ({
      user: input.user,
      resource: input.resourceType,
      action: input.action,
      resourceInstance: {
        id: resource.id,
        ownerId: resource.ownerId,
        attributes: resource.attributes,
      },
    }));

    const results = await this.checkMany(checkInputs);

    const allowed: FilterResult['allowed'] = [];
    const denied: FilterResult['denied'] = [];

    for (let i = 0; i < results.length; i++) {
      if (results[i].allowed) {
        allowed.push(input.resources[i]);
      } else {
        denied.push({ id: input.resources[i].id, reason: results[i].reason });
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

    const resolvedRoles = await this.resolver.resolve(roleNames);
    add('role-resolution', `resolved ${resolvedRoles.length} roles with inheritance`, true);

    const { result, candidates } = await this.evaluate(input, { resolvedRoles });
    const ctx = buildEvalContext(input, this.options.timeoutMs);

    for (const { role, permission } of candidates) {
      add('resource-match', `${permission.resource} === ${input.resource}`, true);
      add('action-match', `${permission.action} === ${input.action}`, true);

      const scopeResult = matchScope(permission.scope ?? 'any', ctx);
      add('scope', `scope=${permission.scope ?? 'any'}`, scopeResult.passed);

      if (permission.condition !== undefined) {
        add('condition', `effect=${permission.effect ?? 'allow'}`, result.allowed);
      }
    }

    add('result', result.reason, result.allowed);

    return { input, steps, result };
  }

  // -- Private ---------------------------------------------------------------

  private async evaluate(
    input: CheckInput,
    opts: { resolvedRoles?: Role[]; index?: PermissionIndex | null } = {},
  ): Promise<{ result: CheckResult; candidates: IndexedPerm[] }> {
    this.validateInput(input);

    let resolved: Role[];
    let index: PermissionIndex | null | undefined = opts.index;

    if (opts.resolvedRoles) {
      resolved = opts.resolvedRoles;
    } else {
      const cached = this.getCachedResolved(input.user.id);
      if (cached) {
        resolved = cached.roles;
        if (index === undefined) index = cached.index;
      } else {
        let roleNames: string[];
        try {
          roleNames = await this.store.getUserRoles(input.user.id);
        } catch (err) {
          if (this.options.failOpen) {
            return {
              result: {
                allowed: true,
                reason: 'granted: store unavailable, failOpen=true (SECURITY WARNING)',
                evaluatedAt: new Date(),
              },
              candidates: [],
            };
          }
          throw new StoreUnavailableError(err);
        }

        this.warnRoleHintMismatch(input.user.roles, roleNames);

        if (roleNames.length === 0) {
          return {
            result: {
              allowed: false,
              reason: `denied: user '${input.user.id}' has no roles`,
              deniedBy: { type: 'no-roles', detail: 'user has no roles in store' },
              evaluatedAt: new Date(),
            },
            candidates: [],
          };
        }

        resolved = await this.resolver.resolve(roleNames);
        if (index === undefined) index = this.options.useIndex ? buildPermissionIndex(resolved) : null;
        this.setCachedResolved(input.user.id, resolved, index);
      }
    }

    const ctx = buildEvalContext(input, this.options.timeoutMs);
    if (index === undefined) {
      index = this.options.useIndex ? buildPermissionIndex(resolved) : null;
    }

    const candidates = index
      ? lookupIndex(index, input.resource, input.action)
      : resolved.flatMap((role) =>
          role.permissions
            .filter((p) => matchResource(input.resource, p.resource) && matchAction(input.action, p.action))
            .map((permission) => ({ role, permission })),
        );

    let bestAllow: { role: Role; permission: Permission } | null = null;
    let bestDeny: { role: Role; permission: Permission } | null = null;
    let deniedReason: DeniedBy | null = null;

    for (const { role, permission } of candidates) {
      const scopeResult = matchScope(permission.scope ?? 'any', ctx);
      if (!scopeResult.passed) {
        if (!deniedReason) {
          deniedReason = { type: 'scope-failed', detail: scopeResult.reason ?? `scope '${permission.scope}' not satisfied` };
        }
        continue;
      }

      if (permission.effect === 'deny') {
        bestDeny = { role, permission };
        break;
      }

      const conditionPassed = await this.conditions.evaluate(ctx, permission);
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
        result: {
          allowed: false,
          reason: `denied: explicit deny by role '${bestDeny.role.name}'`,
          deniedBy: {
            type: 'explicit-deny',
            detail: `permission ${bestDeny.permission.resource}:${bestDeny.permission.action}`,
          },
          evaluatedAt: new Date(),
        },
        candidates,
      };
    }

    if (bestAllow) {
      return {
        result: {
          allowed: true,
          reason: `granted by role '${bestAllow.role.name}'`,
          matchedRole: bestAllow.role.name,
          matchedPermission: {
            resource: bestAllow.permission.resource,
            action: bestAllow.permission.action,
            effect: 'allow',
          },
          evaluatedAt: new Date(),
        },
        candidates,
      };
    }

    return {
      result: {
        allowed: false,
        reason: `denied: no matching permission for resource '${input.resource}' action '${input.action}'`,
        deniedBy: deniedReason ?? {
          type: 'no-match',
          detail: `no permission matches resource='${input.resource}' action='${input.action}'`,
        },
        evaluatedAt: new Date(),
      },
      candidates,
    };
  }

  private getCachedResolved(userId: string): { roles: Role[]; index: PermissionIndex | null } | null {
    const ttl = this.options.resolvedCacheTTL;
    if (!ttl || ttl <= 0) return null;

    const entry = this.resolvedCache.get(userId);
    if (!entry) {
      this.cacheMisses++;
      return null;
    }
    if (Date.now() >= entry.expiresAt) {
      this.resolvedCache.delete(userId);
      this.cacheMisses++;
      return null;
    }
    this.cacheHits++;
    return { roles: entry.roles, index: entry.index };
  }

  private setCachedResolved(userId: string, roles: Role[], index: PermissionIndex | null): void {
    const ttl = this.options.resolvedCacheTTL;
    if (!ttl || ttl <= 0) return;

    this.resolvedCache.set(userId, {
      roles,
      index,
      expiresAt: Date.now() + ttl,
    });
  }

  private warnRoleHintMismatch(hint: string[] | undefined, actual: string[]): void {
    if (this.options.disableRoleHintWarning) return;
    if (!Array.isArray(hint) || hint.length === 0) return;
    const sortJoin = (a: string[]) => [...a].sort().join(',');
    if (sortJoin(hint) !== sortJoin(actual)) {
      console.warn(
        `[polycyes] user.roles hint (${hint}) differs from store (${actual}). Store is authoritative.`,
      );
    }
  }

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

// -- Factory ----------------------------------------------------------------

export function createEngine(store: PolicyReader, options?: EngineOptions): Engine {
  return new Engine(store, options);
}

// -- Module-level helpers ---------------------------------------------------

function buildEvalContext(input: CheckInput, timeoutMs: number): EvalContext {
  const s = sanitizeInput(input);

  return {
    user: Object.freeze({
      ...s.user,
      attributes: s.user.attributes ? Object.freeze({ ...s.user.attributes }) : undefined,
    }),
    resource: s.resource,
    action: s.action,
    resourceInstance: s.resourceInstance
      ? Object.freeze({
          ...s.resourceInstance,
          attributes: s.resourceInstance.attributes ? Object.freeze({ ...s.resourceInstance.attributes }) : undefined,
        })
      : undefined,
    metadata: s.metadata,
    timeoutMs,
    get userAttributes() {
      return this.user.attributes;
    },
    get resourceAttributes() {
      return this.resourceInstance?.attributes;
    },
  };
}

function matchResource(inputResource: string, permResource: string): boolean {
  return permResource === '*' || permResource === inputResource;
}

function matchAction(inputAction: string, permAction: string): boolean {
  return permAction === '*' || permAction === inputAction;
}

function matchScope(scope: Permission['scope'], ctx: EvalContext): { passed: boolean; reason?: string } {
  if (scope === 'any' || scope === 'none') return { passed: true };
  if (typeof scope === 'function') {
    const result = scope(ctx);
    return result ? { passed: true } : { passed: false, reason: 'scope function returned false' };
  }
  if (scope === 'own') {
    if (!ctx.resourceInstance?.ownerId) return { passed: false, reason: 'scope own: no resource owner' };
    if (ctx.resourceInstance.ownerId !== ctx.user.id) return { passed: false, reason: 'scope own: user is not the owner' };
    return { passed: true };
  }
  return { passed: false, reason: `unknown scope: ${String(scope)}` };
}

const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeInput(input: CheckInput): CheckInput {
  function deepClean(value: unknown): unknown {
    if (value === null || value === undefined || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(deepClean);

    const obj = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      if (!DANGEROUS_KEYS.has(key)) {
        result[key] = deepClean(obj[key]);
      }
    }
    return result;
  }

  return {
    ...input,
    user: {
      ...input.user,
      attributes: input.user.attributes
        ? deepClean(input.user.attributes) as Record<string, unknown>
        : undefined,
    },
    resourceInstance: input.resourceInstance
      ? {
          ...input.resourceInstance,
          attributes: input.resourceInstance.attributes
            ? deepClean(input.resourceInstance.attributes) as Record<string, unknown>
            : undefined,
        }
      : undefined,
    metadata: input.metadata
      ? deepClean(input.metadata) as Record<string, unknown>
      : undefined,
  };
}

// -- permission index (O(1) lookup) -----------------------------------------

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
