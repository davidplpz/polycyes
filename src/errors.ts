import type { Permission } from './types.js';

/**
 * Error lanzado cuando se consulta un rol que no existe en el store.
 */
export class RoleNotFoundError extends Error {
  constructor(roleName: string) {
    super(`Role '${roleName}' not found`);
    this.name = 'RoleNotFoundError';
  }
}

/**
 * Error lanzado cuando se detecta un ciclo en la herencia de roles.
 * Ejemplo: A hereda de B, B hereda de C, C hereda de A → ciclo.
 */
export class CircularRoleHierarchyError extends Error {
  constructor(chain: string[]) {
    super(`Circular role inheritance detected: ${chain.join(' → ')}`);
    this.name = 'CircularRoleHierarchyError';
  }
}

/**
 * Error lanzado cuando un store de políticas no está configurado.
 */
export class StoreNotConfiguredError extends Error {
  constructor() {
    super('PolicyStore is not configured');
    this.name = 'StoreNotConfiguredError';
  }
}

// ---------------------------------------------------------------------------
// Errores de condición (ABAC)
// ---------------------------------------------------------------------------

/**
 * Error lanzado cuando una condición ABAC evalúa a un valor no-booleano
 * (string, number, object, undefined, null, etc.).
 */
export class ConditionEvaluationError extends Error {
  constructor(
    permission: { resource: string; action: string },
    cause: unknown,
  ) {
    super(
      `Condition evaluation failed for ${permission.resource}:${permission.action}: ${String(cause)}`,
    );
    this.name = 'ConditionEvaluationError';
    this.cause = cause;
  }
}

/**
 * Error lanzado cuando se intenta agregar un rol que ya existe en el store.
 */
export class DuplicateRoleError extends Error {
  constructor(roleName: string) {
    super(`Role '${roleName}' already exists`);
    this.name = 'DuplicateRoleError';
  }
}

/**
 * Error lanzado cuando la profundidad de herencia excede 50 niveles.
 */
export class HierarchyTooDeepError extends Error {
  constructor(chain: string[]) {
    super(
      `Role inheritance depth exceeds 50 levels: ${chain.join(' → ')}`,
    );
    this.name = 'HierarchyTooDeepError';
  }
}

/**
 * Error lanzado cuando un permiso tiene `condition: []` (array vacío) que
 * produciría silent open-access con `[].every(...)` → `true`.
 */
export class EmptyConditionArrayError extends Error {
  constructor(permission: { resource: string; action: string }) {
    super(
      `empty condition array for ${permission.resource}:${permission.action} — use condition: undefined for no-condition (RBAC) or provide at least one condition`,
    );
    this.name = 'EmptyConditionArrayError';
  }
}

/**
 * Error lanzado cuando una condición ABAC excede el timeout configurable.
 */
export class ConditionTimeoutError extends Error {
  constructor(
    permission: { resource: string; action: string },
    timeoutMs: number,
  ) {
    super(
      `Condition timeout after ${timeoutMs}ms for ${permission.resource}:${permission.action}`,
    );
    this.name = 'ConditionTimeoutError';
  }
}

// ---------------------------------------------------------------------------
// Errores de store
// ---------------------------------------------------------------------------

/**
 * Error lanzado cuando el store de políticas no está disponible.
 * El engine lo re-lanza desde cualquier excepción del store.
 */
export class StoreUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(cause ? `Policy store unavailable: ${String(cause)}` : 'Policy store unavailable');
    this.name = 'StoreUnavailableError';
    if (cause) this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// Errores de auditoría
// ---------------------------------------------------------------------------

/**
 * Error lanzado por `auditRole()` en strictMode cuando detecta
 * configuraciones peligrosas (ej: god-mode wildcards sin condición).
 */
export class UnsafeRoleError extends Error {
  constructor(reason: string) {
    super(`Unsafe role configuration: ${reason}`);
    this.name = 'UnsafeRoleError';
  }
}

// ---------------------------------------------------------------------------
// Errores de engine
// ---------------------------------------------------------------------------

/**
 * Error lanzado cuando una opción del Engine es inválida
 * (ej: timeoutMs <= 0, failOpen no es boolean).
 */
export class InvalidEngineOptionError extends Error {
  constructor(message: string) {
    super(`Invalid engine option: ${message}`);
    this.name = 'InvalidEngineOptionError';
  }
}

/**
 * Error lanzado cuando el input del engine es inválido
 * (ej: user.id vacío, resource vacío, action vacía).
 */
export class InvalidInputError extends Error {
  constructor(message: string) {
    super(`Invalid input: ${message}`);
    this.name = 'InvalidInputError';
  }
}
