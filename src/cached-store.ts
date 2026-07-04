import type { Role } from './types.js';
import type { PolicyStore } from './store.js';

declare var console: { warn(...args: unknown[]): void };

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface CachedPolicyStoreOptions {
  store: PolicyStore;
  ttl?: number;
  roleTtl?: number;
  userRolesTtl?: number;
}

export interface CacheStats {
  size: number;
  hits: number;
  misses: number;
  inflight: number;
}

function now(): number {
  return Date.now();
}

function cacheKey(prefix: string, id: string): string {
  return `${prefix}:${id}`;
}

function isExpired(entry: CacheEntry<unknown>): boolean {
  return now() >= entry.expiresAt;
}

export class CachedPolicyStore implements PolicyStore {
  private readonly store: PolicyStore;
  private readonly ttl: number;
  private readonly roleTtl: number;
  private readonly userRolesTtl: number;

  private cache = new Map<string, CacheEntry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();
  private hits = 0;
  private misses = 0;

  constructor(options: CachedPolicyStoreOptions) {
    this.store = options.store;
    this.ttl = options.ttl ?? 30_000;
    this.roleTtl = options.roleTtl ?? this.ttl;
    this.userRolesTtl = options.userRolesTtl ?? this.ttl;
  }

  private getRoleTtl(): number {
    return this.ttl === 0 ? 0 : this.roleTtl;
  }

  private getUserRolesTtl(): number {
    return this.ttl === 0 ? 0 : this.userRolesTtl;
  }

  private getFromCache<T>(key: string): T | undefined {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    if (entry === undefined) return undefined;
    if (isExpired(entry)) {
      this.cache.delete(key);
      return undefined;
    }
    this.hits++;
    return entry.value;
  }

  private setCache<T>(key: string, value: T, ttl: number): void {
    if (ttl <= 0) return;
    this.cache.set(key, { value, expiresAt: now() + ttl });
  }

  private invalidate(key: string): void {
    this.cache.delete(key);
  }

  private async dedup<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = fetcher()
      .then((result) => {
        this.inflight.delete(key);
        return result;
      })
      .catch((err) => {
        this.inflight.delete(key);
        throw err;
      });

    this.inflight.set(key, promise);
    return promise;
  }

  cacheStats(): CacheStats {
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      inflight: this.inflight.size,
    };
  }

  clearCache(): void {
    this.cache.clear();
    this.inflight.clear();
    this.hits = 0;
    this.misses = 0;
  }

  async getRole(name: string): Promise<Role | null> {
    const key = cacheKey('role', name);
    const cached = this.getFromCache<Role | null>(key);
    if (cached !== undefined) return cached;

    this.misses++;
    return this.dedup(key, async () => {
      const role = await this.store.getRole(name);
      this.setCache(key, role, this.getRoleTtl());
      return role;
    });
  }

  async getRolesByNames(names: string[]): Promise<Role[]> {
    const cached: Role[] = [];
    const missing: string[] = [];

    for (const name of names) {
      const entry = this.getFromCache<Role | null>(cacheKey('role', name));
      if (entry !== undefined) {
        if (entry !== null) cached.push(entry);
      } else {
        missing.push(name);
      }
    }

    if (missing.length > 0) {
      this.misses += missing.length;
      const fetched = await this.store.getRolesByNames(missing);
      const ttl = this.getRoleTtl();
      for (const role of fetched) {
        this.setCache(cacheKey('role', role.name), role, ttl);
        cached.push(role);
      }
      for (const name of missing) {
        if (!fetched.some((r) => r.name === name)) {
          this.setCache(cacheKey('role', name), null, ttl);
        }
      }
    }

    return cached;
  }

  async getUserRoles(userId: string): Promise<string[]> {
    const key = cacheKey('userRoles', userId);
    const cached = this.getFromCache<string[]>(key);
    if (cached !== undefined) return cached;

    this.misses++;
    return this.dedup(key, async () => {
      const roles = await this.store.getUserRoles(userId);
      const result = [...roles];
      this.setCache(key, result, this.getUserRolesTtl());
      return result;
    });
  }

  async addRole(role: Role): Promise<void> {
    await this.store.addRole(role);
    this.invalidate(cacheKey('role', role.name));
  }

  async updateRole(role: Role): Promise<void> {
    await this.store.updateRole(role);
    this.invalidate(cacheKey('role', role.name));
  }

  async deleteRole(name: string): Promise<void> {
    await this.store.deleteRole(name);
    this.invalidate(cacheKey('role', name));
  }

  async setUserRoles(userId: string, roleNames: string[]): Promise<void> {
    await this.store.setUserRoles(userId, roleNames);
    this.invalidate(cacheKey('userRoles', userId));
  }

  async addUserRole(userId: string, roleName: string): Promise<void> {
    await this.store.addUserRole(userId, roleName);
    this.invalidate(cacheKey('userRoles', userId));
  }

  async removeUserRole(userId: string, roleName: string): Promise<void> {
    await this.store.removeUserRole(userId, roleName);
    this.invalidate(cacheKey('userRoles', userId));
  }
}
