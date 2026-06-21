import type { Role } from './types.js';

// ============================================================================
// PolicyStore — Contrato para almacenar políticas
//
// Separado en PolicyReader (solo lectura — lo que el Engine necesita)
// y PolicyWriter (administración). Interface Segregation Principle:
// el Engine NUNCA escribe, por lo que recibe solo PolicyReader.
// ============================================================================

/**
 * Interfaz de solo lectura para el Engine (hot path de autorización).
 * Define las queries que el engine necesita para evaluar permisos.
 */
export interface PolicyReader {
  /** Retorna un rol por su nombre, o `null` si no existe. */
  getRole(name: string): Promise<Role | null>;

  /**
   * Retorna múltiples roles por nombre en una sola llamada (batch loading).
   * Elimina el problema N+1 cuando se resuelve herencia de múltiples roles.
   * Si un nombre no existe, se omite (no se incluye en el resultado).
   */
  getRolesByNames(names: string[]): Promise<Role[]>;

  /** Retorna los nombres de los roles asignados a un usuario. */
  getUserRoles(userId: string): Promise<string[]>;
}

/**
 * Interfaz de escritura para administración de políticas.
 * Usada por seeds, CLI tools, admin panels, etc.
 * El Engine NUNCA recibe PolicyWriter — solo PolicyReader.
 */
export interface PolicyWriter {
  /** Agrega un rol nuevo. Error si ya existe. */
  addRole(role: Role): Promise<void>;

  /** Reemplaza un rol existente. Error si no existe. */
  updateRole(role: Role): Promise<void>;

  /** Elimina un rol por nombre. Error si no existe. */
  deleteRole(name: string): Promise<void>;

  /** Asigna roles a un usuario (reemplaza asignación anterior). */
  setUserRoles(userId: string, roleNames: string[]): Promise<void>;
}

/**
 * Unión de PolicyReader + PolicyWriter para implementaciones que manejan
 * ambas operaciones (ej: InMemoryPolicyStore).
 */
export interface PolicyStore extends PolicyReader, PolicyWriter {}
