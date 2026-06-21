// ============================================================================
// polycyes — Modelo de datos central
//
// Todos los tipos que definen el modelo de autorización.
// Este archivo NO tiene dependencias del runtime ni de frameworks.
// ============================================================================

// ---------------------------------------------------------------------------
// Branded Types — type safety beyond string
//
// Estos tipos son strings en runtime pero el compilador los trata como
// tipos nominales. No se pueden asignar `string` → `UserId` sin cast
// explícito, previniendo bugs de intercambio accidental de IDs.
// ============================================================================

/** Marca genérica para tipos nominales (branded types). */
export type Brand<T, BrandName extends string> = T & { readonly __brand: BrandName };

/** ID único de usuario. */
export type UserId = Brand<string, 'UserId'>;

/** Nombre de rol. */
export type RoleName = Brand<string, 'RoleName'>;

/** Nombre de tipo de recurso (e.g., "post", "comment"). */
export type ResourceName = Brand<string, 'ResourceName'>;

/** Nombre de acción (e.g., "create", "edit", "delete"). */
export type ActionName = Brand<string, 'ActionName'>;

// ---------------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------------

/**
 * Representa un usuario en el sistema de autorización.
 * No reemplaza tu modelo de usuario — es la proyección mínima que necesita el
 * engine para evaluar permisos.
 *
 * @example
 * ```ts
 * const user: User = {
 *   id: "usr_abc123",
 *   roles: ["admin", "editor"],
 *   attributes: { department: "engineering", country: "AR" }
 * }
 * ```
 */
export interface User {
  /** Identificador único del usuario */
  id: string;

  /**
   * Nombres de los roles asignados al usuario.
   *
   * @deprecated HINT ONLY. The engine NEVER uses this field for authorization.
   * The store is the single source of truth. This field may be used for
   * logging or pre-validation, but the actual authorization decision comes
   * from `store.getUserRoles(user.id)`.
   */
  roles: string[];

  /**
   * Atributos adicionales para evaluación ABAC.
   * Se exponen en `EvalContext.userAttributes` para que las condiciones
   * puedan usarlos.
   */
  attributes?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Roles y Permisos
// ---------------------------------------------------------------------------

/**
 * Define el alcance (scope) de un permiso sobre recursos.
 *
 * - `any`: El permiso aplica a **cualquier** recurso del tipo correspondiente,
 *          sin importar su dueño. Típico para admins.
 * - `own`: El permiso aplica **solamente** a recursos cuyo `ownerId` coincida
 *          con el `id` del usuario. Típico para editores.
 * - `none`: El permiso no requiere un recurso concreto. Útil para acciones
 *           globales como "acceder al panel de admin" o "exportar datos".
 * - `ScopeFunction`: Función custom que recibe el contexto y devuelve boolean.
 */
export type PermissionScope = 'any' | 'own' | 'none' | ScopeFunction;

/**
 * Función de scope custom. Recibe el EvalContext y devuelve true si el
 * scope se cumple.
 *
 * @example
 * ```ts
 * const scopeTeam: ScopeFunction = (ctx) =>
 *   ctx.userAttributes?.teamId === ctx.resourceAttributes?.teamId
 * ```
 */
export type ScopeFunction = (ctx: EvalContext) => boolean;

/**
 * Efecto de un permiso: concede o deniega explícitamente.
 * `deny` tiene precedencia sobre `allow`.
 */
export type PermissionEffect = 'allow' | 'deny';

/**
 * Modo de evaluación para condiciones múltiples.
 * - `all`: Todas las condiciones deben cumplirse (AND)
 * - `any`: Al menos una condición debe cumplirse (OR)
 */
export type ConditionMode = 'all' | 'any';

/**
 * Función condicional para ABAC (Attribute-Based Access Control).
 *
 * Recibe el contexto completo de evaluación y debe devolver `true` si la
 * condición se cumple, o `false` si no. Soporta async.
 *
 * Puede ser una función única o un array de condiciones.
 *
 * @example
 * ```ts
 * const soloIngenieria: Condition =
 *   (ctx) => ctx.userAttributes?.department === 'engineering'
 *
 * const multiCond: Condition = [
 *   (ctx) => ctx.userAttributes?.role === 'editor',
 *   async (ctx) => await externalCheck(ctx),
 * ]
 * ```
 */
export type Condition =
  | ((ctx: EvalContext) => boolean | Promise<boolean>)
  | ((ctx: EvalContext) => boolean | Promise<boolean>)[];

/**
 * Define un permiso atómico dentro de un rol.
 *
 * @example
 * ```ts
 * const permission: Permission = {
 *   resource: "post",
 *   action: "edit",
 *   scope: "own",
 *   effect: "deny",
 *   condition: (ctx) => ctx.userAttributes?.department === ctx.resourceAttributes?.department,
 *   conditionMode: "all",
 * }
 * ```
 */
export interface Permission {
  /**
   * Tipo de recurso sobre el que aplica el permiso.
   * Puede incluir wildcards: `"*"` significa "todos los recursos".
   *
   * @example "post", "comment", "user", "*"
   */
  resource: string;

  /**
   * Acción que se autoriza sobre el recurso.
   * Puede incluir wildcards: `"*"` significa "todas las acciones".
   *
   * @example "create", "edit", "delete", "read", "publish", "*"
   */
  action: string;

  /**
   * Alcance del permiso. Determina si aplica a cualquier recurso, solo
   * a recursos propios, o no requiere recurso.
   *
   * @default "any"
   */
  scope?: PermissionScope;

  /**
   * Efecto del permiso: "allow" (concede) o "deny" (deniega explícitamente).
   * `deny` tiene precedencia sobre `allow`.
   *
   * @default "allow"
   */
  effect?: PermissionEffect;

  /**
   * Condición ABAC opcional. Si se define, debe evaluar a `true` para
   * que el permiso se conceda. La condición se evalúa DESPUÉS del scope.
   * Puede ser una función única o un array.
   */
  condition?: Condition;

  /**
   * Modo de evaluación para condiciones múltiples.
   * - `"all"`: Todas deben cumplirse (AND)
   * - `"any"`: Al menos una debe cumplirse (OR)
   *
   * @default "all"
   */
  conditionMode?: ConditionMode;
}

/**
 * Define un rol con su nombre, permisos y roles de los que hereda.
 *
 * @example
 * ```ts
 * const admin: Role = {
 *   name: "admin",
 *   description: "Administrador del sistema",
 *   permissions: [
 *     { resource: "*", action: "*", scope: "any" }
 *   ],
 *   inherits: ["editor", "viewer"]
 * }
 * ```
 */
export interface Role {
  /** Nombre único del rol. Se usa como identificador. */
  name: string;

  /** Descripción legible del propósito del rol. */
  description?: string;

  /** Lista de permisos atómicos del rol. */
  permissions: Permission[];

  /**
   * Roles de los que hereda permisos.
   * La herencia es transitiva: si A hereda de B y B hereda de C,
   * A tiene todos los permisos de B + C.
   *
   * El engine detecta automáticamente ciclos y lanza `CircularRoleHierarchyError`.
   */
  inherits?: string[];
}

// ---------------------------------------------------------------------------
// Recursos
// ---------------------------------------------------------------------------

/**
 * Representa una instancia concreta de un recurso sobre el que se evalúa
 * un permiso. Opcional — solo necesaria cuando el permiso tiene
 * `scope: "own"` o una condición ABAC que inspecciona atributos del recurso.
 *
 * @example
 * ```ts
 * const post: ResourceInstance = {
 *   id: "post_456",
 *   ownerId: "usr_abc123",
 *   attributes: { department: "engineering", status: "draft" }
 * }
 * ```
 */
export interface ResourceInstance {
  /** Identificador único de la instancia del recurso */
  id?: string;

  /** ID del usuario propietario del recurso */
  ownerId?: string;

  /** Atributos del recurso para evaluación ABAC */
  attributes?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Contexto de evaluación
// ---------------------------------------------------------------------------

/**
 * Contexto completo de evaluación que se pasa al engine y a las condiciones
 * ABAC. Contiene todo lo que se necesita para decidir si un permiso se
 * concede o no.
 */
export interface EvalContext {
  /** Usuario que solicita la acción */
  user: User;

  /** Tipo de recurso sobre el que se solicita la acción */
  resource: string;

  /** Acción que se solicita */
  action: string;

  /** Instancia del recurso (opcional — para scope 'own' y ABAC) */
  resourceInstance?: ResourceInstance;

  /**
   * Metadatos adicionales del contexto de la request.
   *
   * @example
   * ```ts
   * { time: "2025-06-15T14:00:00Z", ip: "192.168.1.1" }
   * ```
   */
  metadata?: Record<string, unknown>;

  /**
   * Per-condition timeout en milisegundos. Populated por `buildEvalContext`
   * desde `EngineOptions.timeoutMs` (default 1000ms si no se setea).
   */
  timeoutMs?: number;

  /**
   * Atajo a `user.attributes` para acceso rápido en condiciones.
   */
  get userAttributes(): Record<string, unknown> | undefined;

  /**
   * Atajo a `resourceInstance?.attributes` para acceso rápido en condiciones.
   */
  get resourceAttributes(): Record<string, unknown> | undefined;
}

// ---------------------------------------------------------------------------
// Input / Output del Engine
// ---------------------------------------------------------------------------

/**
 * Input que recibe el engine para evaluar un permiso.
 */
export interface CheckInput {
  /** Usuario que solicita la acción */
  user: User;

  /** Tipo de recurso (e.g., "post", "comment", "user") */
  resource: string;

  /** Acción solicitada (e.g., "create", "edit", "delete") */
  action: string;

  /** Instancia del recurso (opcional) */
  resourceInstance?: ResourceInstance;

  /** Metadatos del contexto (opcional) */
  metadata?: Record<string, unknown>;
}

/**
 * Razón estructurada de denegación.
 * Permite a los callers manejar cada caso programáticamente.
 */
export type DeniedBy =
  | { type: 'no-roles'; detail: string }
  | { type: 'no-match'; detail: string }
  | { type: 'scope-failed'; detail: string }
  | { type: 'condition-failed'; detail: string }
  | { type: 'explicit-deny'; detail: string };

/**
 * Resultado de la evaluación de un permiso.
 * Contiene no solo el booleano `allowed` sino también una explicación
 * legible de por qué se concedió o denegó.
 */
export interface CheckResult {
  /** `true` si el permiso está concedido, `false` si no */
  allowed: boolean;

  /**
   * Explicación legible del resultado.
   *
   * @example
   * - "granted by role 'admin'"
   * - "denied: no matching permission for resource 'post' action 'delete'"
   */
  reason: string;

  /** Rol que concedió el acceso (si allowed) */
  matchedRole?: string;

  /** Permiso que matcheó (si allowed) */
  matchedPermission?: {
    resource: string;
    action: string;
    effect: 'allow' | 'deny';
  };

  /** Por qué se denegó (si !allowed) */
  deniedBy?: DeniedBy;

  /** Timestamp de evaluación (para auditoría) */
  evaluatedAt: Date;
}

// ---------------------------------------------------------------------------
// Engine Configuration
// ---------------------------------------------------------------------------

/**
 * Opciones de configuración del Engine.
 */
export interface EngineOptions {
  /** Per-condition timeout en ms (default: 1000) */
  timeoutMs?: number;

  /** Si true, errores del store se traducen a allowed:true (default: false) */
  failOpen?: boolean;

  /** Si true, silencia dev-mode warnings de user.roles vs store (default: false) */
  disableRoleHintWarning?: boolean;

  /** Si true, usa permission index para matching O(1) (default: true) */
  useIndex?: boolean;
}

// ---------------------------------------------------------------------------
// Filter Operations
// ---------------------------------------------------------------------------

/**
 * Input para filter(): filtra una colección de recursos por permisos.
 */
export interface FilterInput {
  /** Usuario que solicita la acción */
  user: User;

  /** Acción a verificar sobre cada recurso */
  action: string;

  /** Recursos a filtrar */
  resources: Array<{
    id: string;
    ownerId?: string;
    attributes?: Record<string, unknown>;
  }>;

  /** Tipo de recurso (e.g., "post", "comment") */
  resourceType: string;
}

/**
 * Resultado de filter(): recursos permitidos y denegados.
 */
export interface FilterResult {
  /** Recursos sobre los que el usuario tiene permiso */
  allowed: Array<{
    id: string;
    ownerId?: string;
    attributes?: Record<string, unknown>;
  }>;

  /** Recursos denegados con razón */
  denied: Array<{ id: string; reason: string }>;
}

// ---------------------------------------------------------------------------
// Debug
// ---------------------------------------------------------------------------

/** Paso individual en la traza de debug. */
export interface DebugStep {
  type: 'role-resolution' | 'resource-match' | 'action-match' | 'scope' | 'condition' | 'result';
  detail: string;
  passed: boolean;
  timestamp: Date;
}

/** Traza completa de una evaluación, retornada por engine.debug(). */
export interface DebugTrace {
  input: CheckInput;
  steps: DebugStep[];
  result: CheckResult;
}
