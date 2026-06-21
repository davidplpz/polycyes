import type { Role } from './types.js';
import type { PolicyStore } from './store.js';
import { RoleNotFoundError, DuplicateRoleError, UnsafeRoleError } from './errors.js';

// `console` is a global in Node.js, Deno, Bun, and Cloudflare Workers.
// ESLint/TypeScript strict lib (ES2022 without DOM) doesn't declare it.
declare var console: { warn(...args: unknown[]): void };

// ============================================================================
// InMemoryPolicyStore
//
// Store en memoria para desarrollo, tests, y prototipado.
// No persistente — los datos se pierden al reiniciar el proceso.
// ============================================================================

interface AuditWarning {
  severity: 'low' | 'medium' | 'high';
  code: string;
  message: string;
  role: string;
  permission: { resource: string; action: string };
}

interface StoreOptions {
  /** If true, throws UnsafeRoleError on high-severity audit warnings (default: true) */
  strictMode?: boolean;
  /** Callback for audit warnings. Default: console.warn */
  onAuditWarning?: (warnings: AuditWarning[]) => void;
}

export class InMemoryPolicyStore implements PolicyStore {
  private roles: Map<string, Role> = new Map();
  private userRoles: Map<string, string[]> = new Map();
  private options: Required<StoreOptions>;

  constructor(options: StoreOptions = {}) {
    this.options = {
      strictMode: options.strictMode ?? true,
      onAuditWarning: options.onAuditWarning ?? ((warnings) => {
        for (const w of warnings) console.warn(`[polycyes audit] ${w.code}: ${w.message}`);
      }),
    };
  }

  // ---- Roles ----

  async getRole(name: string): Promise<Role | null> {
    const role = this.roles.get(name);
    return role ? cloneRole(role) : null;
  }

  async getRolesByNames(names: string[]): Promise<Role[]> {
    const result: Role[] = [];
    for (const name of names) {
      const role = this.roles.get(name);
      if (role) result.push(cloneRole(role));
    }
    return result;
  }

  async addRole(role: Role): Promise<void> {
    if (this.roles.has(role.name)) {
      throw new DuplicateRoleError(role.name);
    }

    const warnings = this.auditRole(role);
    if (warnings.length > 0) {
      this.options.onAuditWarning(warnings);
      const hasHigh = warnings.some((w) => w.severity === 'high');
      if (hasHigh && this.options.strictMode) {
        throw new UnsafeRoleError(
          `Role '${role.name}' has high-severity audit warnings: ${warnings.map((w) => w.code).join(', ')}`,
        );
      }
    }

    this.roles.set(role.name, cloneRole(role));
  }

  async updateRole(role: Role): Promise<void> {
    if (!this.roles.has(role.name)) {
      throw new RoleNotFoundError(role.name);
    }
    this.roles.set(role.name, cloneRole(role));
  }

  async deleteRole(name: string): Promise<void> {
    if (!this.roles.has(name)) {
      throw new RoleNotFoundError(name);
    }
    this.roles.delete(name);
  }

  // ---- User roles ----

  async getUserRoles(userId: string): Promise<string[]> {
    return [...(this.userRoles.get(userId) ?? [])];
  }

  async setUserRoles(userId: string, roleNames: string[]): Promise<void> {
    for (const name of roleNames) {
      if (!this.roles.has(name)) {
        throw new RoleNotFoundError(name);
      }
    }
    this.userRoles.set(userId, [...roleNames]);
  }

  // ---- Utility ----

  async clear(): Promise<void> {
    this.roles.clear();
    this.userRoles.clear();
  }

  // ---- Private ----

  private auditRole(role: Role): AuditWarning[] {
    const warnings: AuditWarning[] = [];

    for (const permission of role.permissions) {
      if (
        permission.resource === '*' &&
        permission.action === '*' &&
        !permission.condition
      ) {
        warnings.push({
          severity: 'high',
          code: 'WILDCARD_GOD_MODE',
          message: `Role '${role.name}' grants perm("*", "*") with no condition. This is a god-mode permission.`,
          role: role.name,
          permission: { resource: permission.resource, action: permission.action },
        });
      }
    }

    if (role.inherits?.includes('admin') && role.permissions.length === 0) {
      warnings.push({
        severity: 'medium',
        code: 'EMPTY_ROLE_INHERITS_HIGH_TRUST',
        message: `Role '${role.name}' inherits from 'admin' but has no direct permissions.`,
        role: role.name,
        permission: { resource: '', action: '' },
      });
    }

    return warnings;
  }
}

/**
 * Deep-copies a role, preserving function references (conditions).
 * structuredClone can't clone functions, so we copy everything
 * except conditions (passed by reference) and permissions array.
 */
function cloneRole(role: Role): Role {
  return {
    ...role,
    permissions: role.permissions.map((p) => ({ ...p })),
    inherits: role.inherits ? [...role.inherits] : undefined,
  };
}
