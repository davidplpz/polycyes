import type { Role } from './types.js';
import type { PolicyStore, PolicyReader } from './store.js';

declare var console: { log(...args: unknown[]): void };
declare var performance: { now(): number };

// ============================================================================
// Store Decorators — composable wrappers around PolicyStore
//
// These implement the classic GoF Decorator pattern: wrap a PolicyStore and
// add cross-cutting behavior (logging, metrics, fail-open) without changing
// the store interface.
//
// Decorators are fully composable. Chain them freely:
//
//   const store = new MetricsPolicyStore(
//     new LoggingPolicyStore(
//       new CachedPolicyStore({ store: new InMemoryPolicyStore(), ttl: 30_000 }),
//       { includeArgs: false },
//     ),
//   );
//
// ============================================================================

// ---------------------------------------------------------------------------
// LoggingPolicyStore
// ---------------------------------------------------------------------------

export interface LoggingPolicyStoreOptions {
  logger?: (msg: string) => void;
  includeArgs?: boolean;
  includeResult?: boolean;
}

export class LoggingPolicyStore implements PolicyStore {
  private readonly inner: PolicyStore;
  private readonly log: (msg: string) => void;
  private readonly includeArgs: boolean;
  private readonly includeResult: boolean;

  constructor(inner: PolicyStore, options: LoggingPolicyStoreOptions = {}) {
    this.inner = inner;
    this.log = options.logger ?? ((msg) => console.log(msg));
    this.includeArgs = options.includeArgs ?? true;
    this.includeResult = options.includeResult ?? false;
  }

  async getRole(name: string): Promise<Role | null> {
    return this.trace('getRole', [name], () => this.inner.getRole(name));
  }

  async getRolesByNames(names: string[]): Promise<Role[]> {
    return this.trace('getRolesByNames', [names], () => this.inner.getRolesByNames(names));
  }

  async getUserRoles(userId: string): Promise<string[]> {
    return this.trace('getUserRoles', [userId], () => this.inner.getUserRoles(userId));
  }

  async addRole(role: Role): Promise<void> {
    return this.trace('addRole', [role.name], () => this.inner.addRole(role));
  }

  async updateRole(role: Role): Promise<void> {
    return this.trace('updateRole', [role.name], () => this.inner.updateRole(role));
  }

  async deleteRole(name: string): Promise<void> {
    return this.trace('deleteRole', [name], () => this.inner.deleteRole(name));
  }

  async setUserRoles(userId: string, roleNames: string[]): Promise<void> {
    return this.trace('setUserRoles', [userId, roleNames], () => this.inner.setUserRoles(userId, roleNames));
  }

  async addUserRole(userId: string, roleName: string): Promise<void> {
    return this.trace('addUserRole', [userId, roleName], () => this.inner.addUserRole(userId, roleName));
  }

  async removeUserRole(userId: string, roleName: string): Promise<void> {
    return this.trace('removeUserRole', [userId, roleName], () => this.inner.removeUserRole(userId, roleName));
  }

  private async trace<T>(method: string, args: unknown[], fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const elapsed = ((performance.now() - start) * 1000).toFixed(2);
      const parts = [`[polycyes] ${method}`];
      if (this.includeArgs) parts.push(JSON.stringify(args));
      parts.push(`${elapsed}µs`);
      if (this.includeResult) parts.push(`→ ${JSON.stringify(result)}`);
      this.log(parts.join(' '));
      return result;
    } catch (err) {
      const elapsed = ((performance.now() - start) * 1000).toFixed(2);
      this.log(`[polycyes] ${method} ERROR ${elapsed}µs: ${err}`);
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// MetricsPolicyStore
// ---------------------------------------------------------------------------

interface MethodMetrics {
  count: number;
  totalMs: number;
  errors: number;
}

export interface StoreMetrics {
  getRole: MethodMetrics;
  getRolesByNames: MethodMetrics;
  getUserRoles: MethodMetrics;
  addRole: MethodMetrics;
  updateRole: MethodMetrics;
  deleteRole: MethodMetrics;
  setUserRoles: MethodMetrics;
  addUserRole: MethodMetrics;
  removeUserRole: MethodMetrics;
}

function emptyMetrics(): MethodMetrics {
  return { count: 0, totalMs: 0, errors: 0 };
}

export class MetricsPolicyStore implements PolicyStore {
  private readonly inner: PolicyStore;
  private readonly metrics: StoreMetrics = {
    getRole: emptyMetrics(),
    getRolesByNames: emptyMetrics(),
    getUserRoles: emptyMetrics(),
    addRole: emptyMetrics(),
    updateRole: emptyMetrics(),
    deleteRole: emptyMetrics(),
    setUserRoles: emptyMetrics(),
    addUserRole: emptyMetrics(),
    removeUserRole: emptyMetrics(),
  };

  constructor(inner: PolicyStore) {
    this.inner = inner;
  }

  async getRole(name: string): Promise<Role | null> {
    return this.measure('getRole', () => this.inner.getRole(name));
  }

  async getRolesByNames(names: string[]): Promise<Role[]> {
    return this.measure('getRolesByNames', () => this.inner.getRolesByNames(names));
  }

  async getUserRoles(userId: string): Promise<string[]> {
    return this.measure('getUserRoles', () => this.inner.getUserRoles(userId));
  }

  async addRole(role: Role): Promise<void> {
    return this.measure('addRole', () => this.inner.addRole(role));
  }

  async updateRole(role: Role): Promise<void> {
    return this.measure('updateRole', () => this.inner.updateRole(role));
  }

  async deleteRole(name: string): Promise<void> {
    return this.measure('deleteRole', () => this.inner.deleteRole(name));
  }

  async setUserRoles(userId: string, roleNames: string[]): Promise<void> {
    return this.measure('setUserRoles', () => this.inner.setUserRoles(userId, roleNames));
  }

  async addUserRole(userId: string, roleName: string): Promise<void> {
    return this.measure('addUserRole', () => this.inner.addUserRole(userId, roleName));
  }

  async removeUserRole(userId: string, roleName: string): Promise<void> {
    return this.measure('removeUserRole', () => this.inner.removeUserRole(userId, roleName));
  }

  getMetrics(): StoreMetrics {
    return {
      getRole: { ...this.metrics.getRole },
      getRolesByNames: { ...this.metrics.getRolesByNames },
      getUserRoles: { ...this.metrics.getUserRoles },
      addRole: { ...this.metrics.addRole },
      updateRole: { ...this.metrics.updateRole },
      deleteRole: { ...this.metrics.deleteRole },
      setUserRoles: { ...this.metrics.setUserRoles },
      addUserRole: { ...this.metrics.addUserRole },
      removeUserRole: { ...this.metrics.removeUserRole },
    };
  }

  resetMetrics(): void {
    for (const key of Object.keys(this.metrics) as (keyof StoreMetrics)[]) {
      this.metrics[key] = emptyMetrics();
    }
  }

  private async measure<T>(method: keyof StoreMetrics, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const elapsed = performance.now() - start;
      this.metrics[method].count++;
      this.metrics[method].totalMs += elapsed;
      return result;
    } catch (err) {
      const elapsed = performance.now() - start;
      this.metrics[method].count++;
      this.metrics[method].totalMs += elapsed;
      this.metrics[method].errors++;
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// FailOpenPolicyStore
// ---------------------------------------------------------------------------

export class FailOpenPolicyStore implements PolicyStore {
  private readonly inner: PolicyStore;

  constructor(inner: PolicyStore) {
    this.inner = inner;
  }

  async getRole(name: string): Promise<Role | null> {
    try {
      return await this.inner.getRole(name);
    } catch {
      return null;
    }
  }

  async getRolesByNames(names: string[]): Promise<Role[]> {
    try {
      return await this.inner.getRolesByNames(names);
    } catch {
      return [];
    }
  }

  async getUserRoles(userId: string): Promise<string[]> {
    try {
      return await this.inner.getUserRoles(userId);
    } catch {
      return [];
    }
  }

  async addRole(role: Role): Promise<void> {
    await this.inner.addRole(role);
  }

  async updateRole(role: Role): Promise<void> {
    await this.inner.updateRole(role);
  }

  async deleteRole(name: string): Promise<void> {
    await this.inner.deleteRole(name);
  }

  async setUserRoles(userId: string, roleNames: string[]): Promise<void> {
    await this.inner.setUserRoles(userId, roleNames);
  }

  async addUserRole(userId: string, roleName: string): Promise<void> {
    await this.inner.addUserRole(userId, roleName);
  }

  async removeUserRole(userId: string, roleName: string): Promise<void> {
    await this.inner.removeUserRole(userId, roleName);
  }
}
