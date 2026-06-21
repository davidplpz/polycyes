import type {
  Role,
  Permission,
  PermissionScope,
  PermissionEffect,
  Condition,
  ConditionMode,
  ScopeFunction,
  EvalContext,
  ResourceInstance,
  User,
} from './types.js';

// ============================================================================
// Helpers para construir el modelo de forma más expresiva
// ============================================================================

/**
 * Crea un permiso con valores por defecto sensibles.
 *
 * @example
 * ```ts
 * perm("post", "edit", { scope: "own" })
 * perm("post", "create")
 * perm("*", "*", { scope: "any" })
 * perm("post", "delete", { effect: "deny" })
 * ```
 */
export function perm(
  resource: string,
  action: string,
  opts?: {
    scope?: PermissionScope;
    effect?: PermissionEffect;
    condition?: Condition;
    conditionMode?: ConditionMode;
  },
): Permission {
  return {
    resource,
    action,
    scope: opts?.scope ?? 'any',
    effect: opts?.effect ?? 'allow',
    condition: opts?.condition,
    conditionMode: opts?.conditionMode ?? 'all',
  };
}

/**
 * Crea un rol con validación básica.
 *
 * @example
 * ```ts
 * const editor = role("editor", {
 *   description: "Editor de contenido",
 *   permissions: [
 *     perm("post", "create"),
 *     perm("post", "edit", { scope: "own" }),
 *   ],
 *   inherits: ["viewer"],
 * })
 * ```
 */
export function role(
  name: string,
  opts?: {
    description?: string;
    permissions?: Permission[];
    inherits?: string[];
  },
): Role {
  return {
    name,
    description: opts?.description,
    permissions: opts?.permissions ?? [],
    inherits: opts?.inherits,
  };
}

/**
 * Crea un usuario para usar en tests o seeds.
 *
 * @example
 * ```ts
 * const david = user("usr_1", {
 *   roles: ["admin"],
 *   attributes: { department: "engineering" },
 * })
 * ```
 */
export function user(
  id: string,
  opts?: {
    roles?: string[];
    attributes?: Record<string, unknown>;
  },
): User {
  return {
    id,
    roles: opts?.roles ?? [],
    attributes: opts?.attributes,
  };
}

/**
 * Crea una instancia de recurso.
 *
 * @deprecated Usá directamente el objeto `ResourceInstance`.
 */
export function resourceInstance(opts: {
  id?: string;
  ownerId?: string;
  attributes?: Record<string, unknown>;
}): ResourceInstance {
  return {
    id: opts.id,
    ownerId: opts.ownerId,
    attributes: opts.attributes,
  };
}

// ---------------------------------------------------------------------------
// Scope helpers — funciones predefinidas para scopes comunes
// ---------------------------------------------------------------------------

/**
 * Scope: recurso pertenece al mismo equipo que el usuario.
 */
export const scopeTeam: ScopeFunction = (ctx: EvalContext) =>
  ctx.userAttributes?.teamId === ctx.resourceAttributes?.teamId;

/**
 * Scope: recurso pertenece al mismo tenant que el usuario.
 */
export const scopeTenant: ScopeFunction = (ctx: EvalContext) =>
  ctx.userAttributes?.tenantId === ctx.resourceAttributes?.tenantId;

/**
 * Scope: recurso pertenece a la misma organización que el usuario.
 */
export const scopeOrg: ScopeFunction = (ctx: EvalContext) =>
  ctx.userAttributes?.orgId === ctx.resourceAttributes?.orgId;
