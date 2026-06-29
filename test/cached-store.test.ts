import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CachedPolicyStore } from '../src/cached-store.js';
import { InMemoryPolicyStore } from '../src/memory-store.js';
import { DuplicateRoleError, RoleNotFoundError } from '../src/errors.js';
import type { PolicyStore } from '../src/store.js';
import type { Role } from '../src/types.js';

class SpyStore implements PolicyStore {
  calls: Record<string, number> = { roles: 0, rolesBatch: 0, userRoles: 0, add: 0, update: 0, delete: 0, set: 0 };
  private inner: PolicyStore;

  constructor(inner: PolicyStore) {
    this.inner = inner;
  }

  async getRole(name: string): Promise<Role | null> {
    this.calls.roles++;
    return this.inner.getRole(name);
  }
  async getRolesByNames(names: string[]): Promise<Role[]> {
    this.calls.rolesBatch++;
    return this.inner.getRolesByNames(names);
  }
  async getUserRoles(userId: string): Promise<string[]> {
    this.calls.userRoles++;
    return this.inner.getUserRoles(userId);
  }
  async addRole(role: Role): Promise<void> {
    this.calls.add++;
    return this.inner.addRole(role);
  }
  async updateRole(role: Role): Promise<void> {
    this.calls.update++;
    return this.inner.updateRole(role);
  }
  async deleteRole(name: string): Promise<void> {
    this.calls.delete++;
    return this.inner.deleteRole(name);
  }
  async setUserRoles(userId: string, roleNames: string[]): Promise<void> {
    this.calls.set++;
    return this.inner.setUserRoles(userId, roleNames);
  }
}

async function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('CachedPolicyStore', () => {
  let inner: InMemoryPolicyStore;
  let spy: SpyStore;
  let cached: CachedPolicyStore;

  beforeEach(async () => {
    inner = new InMemoryPolicyStore({ strictMode: false });
    await inner.addRole({ name: 'admin', permissions: [{ resource: '*', action: '*' }] });
    await inner.addRole({ name: 'editor', permissions: [{ resource: 'post', action: 'edit', scope: 'own' }] });
    await inner.addRole({ name: 'viewer', permissions: [{ resource: 'post', action: 'read' }] });
    await inner.setUserRoles('u1', ['admin']);
    await inner.setUserRoles('u2', ['editor', 'viewer']);
  });

  describe('basic read caching', () => {
    beforeEach(() => {
      spy = new SpyStore(inner);
      cached = new CachedPolicyStore({ store: spy, ttl: 30_000 });
    });

    it('MUST fetch from store on first getRole call', async () => {
      const role = await cached.getRole('admin');
      expect(role).not.toBeNull();
      expect(role!.name).toBe('admin');
      expect(spy.calls.roles).toBe(1);
    });

    it('MUST return cached result on second getRole call', async () => {
      await cached.getRole('admin');
      await cached.getRole('admin');
      expect(spy.calls.roles).toBe(1);
    });

    it('MUST fetch from store for different roles', async () => {
      await cached.getRole('admin');
      await cached.getRole('editor');
      expect(spy.calls.roles).toBe(2);
    });

    it('MUST cache null for non-existent roles', async () => {
      const r1 = await cached.getRole('ghost');
      expect(r1).toBeNull();
      const r2 = await cached.getRole('ghost');
      expect(r2).toBeNull();
      expect(spy.calls.roles).toBe(1);
    });

    it('MUST fetch from store on first getUserRoles call', async () => {
      const roles = await cached.getUserRoles('u1');
      expect(roles).toEqual(['admin']);
      expect(spy.calls.userRoles).toBe(1);
    });

    it('MUST return cached result on second getUserRoles call', async () => {
      await cached.getUserRoles('u1');
      await cached.getUserRoles('u1');
      expect(spy.calls.userRoles).toBe(1);
    });

    it('MUST cache different users separately', async () => {
      await cached.getUserRoles('u1');
      await cached.getUserRoles('u2');
      expect(spy.calls.userRoles).toBe(2);
    });
  });

  describe('getRolesByNames caching', () => {
    beforeEach(() => {
      spy = new SpyStore(inner);
      cached = new CachedPolicyStore({ store: spy, ttl: 30_000 });
    });

    it('MUST fetch batch on first call and cache individually', async () => {
      const roles = await cached.getRolesByNames(['admin', 'editor']);
      expect(roles).toHaveLength(2);
      expect(spy.calls.rolesBatch).toBe(1);

      await cached.getRole('admin');
      expect(spy.calls.roles).toBe(0);
    });

    it('MUST fetch only missing roles from batch', async () => {
      await cached.getRole('admin');
      await cached.getRolesByNames(['admin', 'editor']);
      expect(spy.calls.rolesBatch).toBe(1);
      expect(spy.calls.roles).toBe(1);
    });

    it('MUST return empty array for all missing', async () => {
      const result = await cached.getRolesByNames(['ghost1', 'ghost2']);
      expect(result).toEqual([]);
      expect(spy.calls.rolesBatch).toBe(1);

      const r = await cached.getRole('ghost1');
      expect(r).toBeNull();
      expect(spy.calls.roles).toBe(0);
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      spy = new SpyStore(inner);
      cached = new CachedPolicyStore({ store: spy, ttl: 50, roleTtl: 50, userRolesTtl: 50 });
    });

    it('MUST re-fetch after TTL expires (getRole)', async () => {
      await cached.getRole('admin');
      await wait(60);
      await cached.getRole('admin');
      expect(spy.calls.roles).toBe(2);
    });

    it('MUST re-fetch after TTL expires (getUserRoles)', async () => {
      await cached.getUserRoles('u1');
      await wait(60);
      await cached.getUserRoles('u1');
      expect(spy.calls.userRoles).toBe(2);
    });

    it('MUST NOT re-fetch before TTL expires', async () => {
      await cached.getRole('admin');
      await wait(20);
      await cached.getRole('admin');
      expect(spy.calls.roles).toBe(1);
    });
  });

  describe('cache invalidation on write', () => {
    beforeEach(() => {
      spy = new SpyStore(inner);
      cached = new CachedPolicyStore({ store: spy, ttl: 30_000 });
    });

    it('MUST invalidate role cache on updateRole', async () => {
      await cached.getRole('admin');
      await cached.updateRole({ name: 'admin', permissions: [{ resource: 'dashboard', action: 'view' }] });
      const role = await cached.getRole('admin');
      expect(role!.permissions).toHaveLength(1);
      expect(role!.permissions[0].resource).toBe('dashboard');
      expect(spy.calls.roles).toBe(2);
    });

    it('MUST invalidate role cache on addRole', async () => {
      await cached.getRole('admin');
      await cached.addRole({ name: 'new-role', permissions: [] });
      const r = await cached.getRole('new-role');
      expect(r).not.toBeNull();
      expect(spy.calls.roles).toBe(2);
    });

    it('MUST invalidate role cache on deleteRole', async () => {
      await cached.getRole('admin');
      await cached.deleteRole('admin');
      const r = await cached.getRole('admin');
      expect(r).toBeNull();
      expect(spy.calls.roles).toBe(2);
    });

    it('MUST invalidate userRoles cache on setUserRoles', async () => {
      await cached.getUserRoles('u1');
      await cached.setUserRoles('u1', ['editor']);
      const roles = await cached.getUserRoles('u1');
      expect(roles).toEqual(['editor']);
      expect(spy.calls.userRoles).toBe(2);
    });

    it('MUST NOT invalidate unrelated cache keys', async () => {
      await cached.getRole('admin');
      await cached.getUserRoles('u1');
      await cached.setUserRoles('u1', ['editor']);

      const role = await cached.getRole('admin');
      expect(role).not.toBeNull();
      expect(spy.calls.roles).toBe(1);
    });
  });

  describe('ttl=0 disables caching', () => {
    beforeEach(() => {
      spy = new SpyStore(inner);
      cached = new CachedPolicyStore({ store: spy, ttl: 0 });
    });

    it('MUST always fetch getRole from store', async () => {
      await cached.getRole('admin');
      await cached.getRole('admin');
      expect(spy.calls.roles).toBe(2);
    });

    it('MUST always fetch getUserRoles from store', async () => {
      await cached.getUserRoles('u1');
      await cached.getUserRoles('u1');
      expect(spy.calls.userRoles).toBe(2);
    });
  });

  describe('concurrent dedup', () => {
    beforeEach(() => {
      spy = new SpyStore(inner);
      cached = new CachedPolicyStore({ store: spy, ttl: 30_000 });
    });

    it('MUST call underlying store only once for concurrent getRole calls', async () => {
      await Promise.all([
        cached.getRole('admin'),
        cached.getRole('admin'),
        cached.getRole('admin'),
      ]);
      expect(spy.calls.roles).toBe(1);
    });

    it('MUST call underlying store only once for concurrent getUserRoles calls', async () => {
      await Promise.all([
        cached.getUserRoles('u1'),
        cached.getUserRoles('u1'),
        cached.getUserRoles('u1'),
      ]);
      expect(spy.calls.userRoles).toBe(1);
    });
  });

  describe('error propagation', () => {
    it('MUST NOT cache errors from underlying store', async () => {
      const broken: PolicyStore = {
        getRole: async () => { throw new Error('db down'); },
        getRolesByNames: async () => { throw new Error('db down'); },
        getUserRoles: async () => { throw new Error('db down'); },
        addRole: async () => { throw new Error('db down'); },
        updateRole: async () => { throw new Error('db down'); },
        deleteRole: async () => { throw new Error('db down'); },
        setUserRoles: async () => { throw new Error('db down'); },
      };
      cached = new CachedPolicyStore({ store: broken, ttl: 30_000 });

      await expect(cached.getRole('x')).rejects.toThrow('db down');

      const stats = cached.cacheStats();
      expect(stats.size).toBe(0);
    });
  });

  describe('cacheStats', () => {
    beforeEach(() => {
      spy = new SpyStore(inner);
      cached = new CachedPolicyStore({ store: spy, ttl: 30_000 });
    });

    it('MUST report correct hit/miss counts', async () => {
      let stats = cached.cacheStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);

      await cached.getRole('admin');
      stats = cached.cacheStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(0);
      expect(stats.size).toBe(1);

      await cached.getRole('admin');
      stats = cached.cacheStats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(1);
      expect(stats.size).toBe(1);
    });

    it('MUST reset stats after clearCache', async () => {
      await cached.getRole('admin');
      cached.clearCache();
      const stats = cached.cacheStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.size).toBe(0);
      expect(stats.inflight).toBe(0);
    });
  });

  describe('integration with InMemoryPolicyStore', () => {
    beforeEach(() => {
      cached = new CachedPolicyStore({ store: inner, ttl: 30_000 });
    });

    it('MUST work end-to-end for read-then-write-then-read', async () => {
      const r1 = await cached.getRole('admin');
      expect(r1!.name).toBe('admin');

      await cached.updateRole({ name: 'admin', permissions: [{ resource: 'dashboard', action: 'view' }] });

      const r2 = await cached.getRole('admin');
      expect(r2!.permissions).toHaveLength(1);
      expect(r2!.permissions[0].resource).toBe('dashboard');
    });

    it('MUST reflect new user roles after setUserRoles', async () => {
      await inner.addRole({ name: 'moderator', permissions: [] });

      await cached.setUserRoles('u1', ['moderator']);
      const roles = await cached.getUserRoles('u1');
      expect(roles).toEqual(['moderator']);
    });

    it('MUST propagate errors from underlying store', async () => {
      await expect(cached.addRole({ name: 'admin', permissions: [] }))
        .rejects.toThrow(DuplicateRoleError);
    });

    it('MUST propagate delete on non-existent role', async () => {
      await expect(cached.deleteRole('ghost'))
        .rejects.toThrow(RoleNotFoundError);
    });

    it('MUST handle addRole + getRole correctly', async () => {
      await cached.addRole({ name: 'new', permissions: [] });
      const r = await cached.getRole('new');
      expect(r).not.toBeNull();
      expect(r!.name).toBe('new');
    });
  });

  describe('different TTLs per type', () => {
    it('MUST use different TTL for roles vs userRoles', async () => {
      spy = new SpyStore(inner);
      cached = new CachedPolicyStore({ store: spy, ttl: 200, roleTtl: 50, userRolesTtl: 200 });

      await cached.getRole('admin');
      await cached.getUserRoles('u1');

      await wait(70);

      await cached.getRole('admin');
      expect(spy.calls.roles).toBe(2);

      await cached.getUserRoles('u1');
      expect(spy.calls.userRoles).toBe(1);
    });
  });
});
