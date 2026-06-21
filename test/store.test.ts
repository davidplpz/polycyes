import { describe, it, expect, beforeEach } from 'vitest';
import type {
  PolicyReader,
  PolicyWriter,
  PolicyStore,
} from '../src/store.js';
import type { Role } from '../src/types.js';

class MinimalStore implements PolicyStore {
  private roles = new Map<string, Role>();
  private userRoles = new Map<string, string[]>();

  async getRole(name: string): Promise<Role | null> {
    return this.roles.get(name) ?? null;
  }

  async getRolesByNames(names: string[]): Promise<Role[]> {
    return names
      .map((n) => this.roles.get(n))
      .filter((r): r is Role => r !== null && r !== undefined);
  }

  async getUserRoles(userId: string): Promise<string[]> {
    return this.userRoles.get(userId) ?? [];
  }

  async addRole(role: Role): Promise<void> {
    if (this.roles.has(role.name)) {
      throw new Error(`Duplicate role: ${role.name}`);
    }
    this.roles.set(role.name, { ...role });
  }

  async updateRole(role: Role): Promise<void> {
    if (!this.roles.has(role.name)) {
      throw new Error(`Role not found: ${role.name}`);
    }
    this.roles.set(role.name, { ...role });
  }

  async deleteRole(name: string): Promise<void> {
    this.roles.delete(name);
  }

  async setUserRoles(userId: string, roleNames: string[]): Promise<void> {
    this.userRoles.set(userId, [...roleNames]);
  }
}

describe('PolicyStore interfaces', () => {
  it('MUST separate PolicyReader and PolicyWriter', () => {
    const reader: PolicyReader = new MinimalStore();
    expect(reader.getRole).toBeInstanceOf(Function);
    expect(reader.getRolesByNames).toBeInstanceOf(Function);
    expect(reader.getUserRoles).toBeInstanceOf(Function);
  });

  it('MUST allow PolicyWriter usage', () => {
    const writer: PolicyWriter = new MinimalStore();
    expect(writer.addRole).toBeInstanceOf(Function);
    expect(writer.updateRole).toBeInstanceOf(Function);
    expect(writer.deleteRole).toBeInstanceOf(Function);
    expect(writer.setUserRoles).toBeInstanceOf(Function);
  });

  it('PolicyStore MUST extend both PolicyReader and PolicyWriter', () => {
    const store: PolicyStore = new MinimalStore();

    // Can use as reader
    const reader: PolicyReader = store;
    expect(reader).toBe(store);

    // Can use as writer
    const writer: PolicyWriter = store;
    expect(writer).toBe(store);
  });

  it('getRolesByNames MUST return only found roles', async () => {
    const store = new MinimalStore();
    await store.addRole({ name: 'a', permissions: [] });
    await store.addRole({ name: 'b', permissions: [] });

    const result = await store.getRolesByNames(['a', 'c', 'b']);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name).sort()).toEqual(['a', 'b']);
  });
});

// ============================================================================
// InMemoryPolicyStore — real implementation tests
// ============================================================================

import { InMemoryPolicyStore } from '../src/index.js';
import { DuplicateRoleError, UnsafeRoleError } from '../src/errors.js';

describe('InMemoryPolicyStore', () => {
  let store: InMemoryPolicyStore;

  beforeEach(() => {
    store = new InMemoryPolicyStore();
  });

  describe('CRUD', () => {
    it('MUST add and retrieve a role', async () => {
      await store.addRole({ name: 'admin', permissions: [] });
      const role = await store.getRole('admin');
      expect(role).not.toBeNull();
      expect(role!.name).toBe('admin');
    });

    it('MUST throw DuplicateRoleError on duplicate add', async () => {
      await store.addRole({ name: 'admin', permissions: [] });
      await expect(store.addRole({ name: 'admin', permissions: [] }))
        .rejects.toThrow(DuplicateRoleError);
    });

    it('MUST update existing role', async () => {
      await store.addRole({ name: 'viewer', permissions: [] });
      await store.updateRole({ name: 'viewer', permissions: [{ resource: 'post', action: 'read' }] });
      const role = await store.getRole('viewer');
      expect(role!.permissions).toHaveLength(1);
    });

    it('MUST delete role', async () => {
      await store.addRole({ name: 'temp', permissions: [] });
      await store.deleteRole('temp');
      const role = await store.getRole('temp');
      expect(role).toBeNull();
    });
  });

  describe('getRolesByNames (batch)', () => {
    it('MUST return multiple roles in one call', async () => {
      await store.addRole({ name: 'a', permissions: [] });
      await store.addRole({ name: 'b', permissions: [] });
      await store.addRole({ name: 'c', permissions: [] });

      const result = await store.getRolesByNames(['a', 'b']);
      expect(result).toHaveLength(2);
      expect(result.map((r) => r.name).sort()).toEqual(['a', 'b']);
    });

    it('MUST skip not-found roles silently', async () => {
      await store.addRole({ name: 'a', permissions: [] });
      const result = await store.getRolesByNames(['a', 'ghost']);
      expect(result).toHaveLength(1);
    });

    it('MUST return empty for all missing', async () => {
      const result = await store.getRolesByNames(['ghost']);
      expect(result).toEqual([]);
    });
  });

  describe('immutability (structuredClone)', () => {
    it('MUST not mutate store when modifying returned role', async () => {
      await store.addRole({ name: 'x', permissions: [] });
      const role = await store.getRole('x');
      role!.permissions.push({ resource: '*', action: '*' });
      const fresh = await store.getRole('x');
      expect(fresh!.permissions).toHaveLength(0);
    });

    it('MUST not mutate store when modifying role after add', async () => {
      const role = { name: 'y', permissions: [{ resource: 'post', action: 'read' }] };
      await store.addRole(role);
      role.permissions.push({ resource: '*', action: '*' });
      const stored = await store.getRole('y');
      expect(stored!.permissions).toHaveLength(1);
    });
  });

  describe('user roles', () => {
    it('MUST assign and retrieve user roles', async () => {
      await store.addRole({ name: 'editor', permissions: [] });
      await store.setUserRoles('u1', ['editor']);
      const names = await store.getUserRoles('u1');
      expect(names).toEqual(['editor']);
    });

    it('MUST return empty for unknown user', async () => {
      const names = await store.getUserRoles('ghost');
      expect(names).toEqual([]);
    });

    it('MUST replace existing user roles', async () => {
      await store.addRole({ name: 'a', permissions: [] });
      await store.addRole({ name: 'b', permissions: [] });
      await store.setUserRoles('u1', ['a']);
      await store.setUserRoles('u1', ['b']);
      const names = await store.getUserRoles('u1');
      expect(names).toEqual(['b']);
    });
  });

  describe('clear()', () => {
    it('MUST remove all roles and assignments', async () => {
      await store.addRole({ name: 'admin', permissions: [] });
      await store.setUserRoles('u1', ['admin']);
      await store.clear();

      const role = await store.getRole('admin');
      expect(role).toBeNull();
      const names = await store.getUserRoles('u1');
      expect(names).toEqual([]);
    });
  });

  describe('auditRole', () => {
    it('MUST warn on perm(*,*) without condition (strictMode false)', async () => {
      const store = new InMemoryPolicyStore({ strictMode: false });
      const warnings: string[] = [];
      const orig = console.warn;
      console.warn = (msg: string) => warnings.push(msg);
      try {
        await store.addRole({ name: 'god', permissions: [{ resource: '*', action: '*' }] });
        expect(warnings.some((w) => w.includes('WILDCARD_GOD_MODE'))).toBe(true);
      } finally {
        console.warn = orig;
      }
    });

    it('MUST throw UnsafeRoleError in strictMode', async () => {
      const store = new InMemoryPolicyStore({ strictMode: true });
      await expect(
        store.addRole({ name: 'god', permissions: [{ resource: '*', action: '*' }] }),
      ).rejects.toThrow(UnsafeRoleError);
    });

    it('MUST NOT warn on perm(*,*) with condition', async () => {
      const store = new InMemoryPolicyStore();
      const warnings: string[] = [];
      const orig = console.warn;
      console.warn = (msg: string) => warnings.push(msg);
      try {
        await store.addRole({
          name: 'safe',
          permissions: [{ resource: '*', action: '*', condition: () => true }],
        });
        expect(warnings.some((w) => w.includes('WILDCARD_GOD_MODE'))).toBe(false);
      } finally {
        console.warn = orig;
      }
    });
  });
});
