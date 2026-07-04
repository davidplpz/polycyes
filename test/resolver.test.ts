import { describe, it, expect } from 'vitest';
import { RoleResolver } from '../src/resolver.js';
import { InMemoryPolicyStore } from '../src/memory-store.js';
import { role, perm } from '../src/helpers.js';
import { CircularRoleHierarchyError, HierarchyTooDeepError } from '../src/errors.js';

function makeStore(...roles: ReturnType<typeof role>[]): InMemoryPolicyStore {
  const store = new InMemoryPolicyStore({ strictMode: false });
  for (const r of roles) store.addRole(r);
  return store;
}

describe('RoleResolver', () => {
  it('MUST resolve a single role with no inheritance', async () => {
    const store = makeStore(role('user', { permissions: [perm('post', 'read')] }));
    const resolver = new RoleResolver(store);
    const resolved = await resolver.resolve(['user']);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].name).toBe('user');
  });

  it('MUST resolve inherited parent roles', async () => {
    const store = makeStore(
      role('user', { permissions: [perm('post', 'read')] }),
      role('admin', { permissions: [perm('post', 'delete')], inherits: ['user'] }),
    );
    const resolver = new RoleResolver(store);
    const resolved = await resolver.resolve(['admin']);
    expect(resolved).toHaveLength(2);
    expect(resolved.find((r) => r.name === 'admin')).toBeDefined();
    expect(resolved.find((r) => r.name === 'user')).toBeDefined();
  });

  it('MUST resolve transitive inheritance (grandparent)', async () => {
    const store = makeStore(
      role('viewer', { permissions: [perm('post', 'read')] }),
      role('editor', { permissions: [perm('post', 'edit')], inherits: ['viewer'] }),
      role('admin', { permissions: [perm('post', 'delete')], inherits: ['editor'] }),
    );
    const resolver = new RoleResolver(store);
    const resolved = await resolver.resolve(['admin']);
    expect(resolved).toHaveLength(3);
    expect(resolved.find((r) => r.name === 'viewer')).toBeDefined();
    expect(resolved.find((r) => r.name === 'editor')).toBeDefined();
    expect(resolved.find((r) => r.name === 'admin')).toBeDefined();
  });

  it('MUST throw CircularRoleHierarchyError on direct cycle', async () => {
    const store = makeStore(
      role('a', { inherits: ['b'] }),
      role('b', { inherits: ['a'] }),
    );
    const resolver = new RoleResolver(store);
    await expect(resolver.resolve(['a'])).rejects.toThrow(CircularRoleHierarchyError);
  });

  it('MUST throw CircularRoleHierarchyError on self-inheritance', async () => {
    const store = makeStore(
      role('a', { inherits: ['a'] }),
    );
    const resolver = new RoleResolver(store);
    await expect(resolver.resolve(['a'])).rejects.toThrow(CircularRoleHierarchyError);
  });

  it('MUST throw HierarchyTooDeepError on excessive depth', async () => {
    const roles = [];
    for (let i = 0; i < 55; i++) {
      roles.push(role(`r${i}`, { inherits: i > 0 ? [`r${i - 1}`] : undefined }));
    }
    const store = makeStore(...roles);
    const resolver = new RoleResolver(store);
    await expect(resolver.resolve([`r${54}`])).rejects.toThrow(HierarchyTooDeepError);
  });

  it('MUST deduplicate roles when multiple roles share a parent', async () => {
    const store = makeStore(
      role('base', { permissions: [perm('post', 'read')] }),
      role('a', { inherits: ['base'] }),
      role('b', { inherits: ['base'] }),
    );
    const resolver = new RoleResolver(store);
    const resolved = await resolver.resolve(['a', 'b']);
    const baseRoles = resolved.filter((r) => r.name === 'base');
    expect(baseRoles).toHaveLength(1);
  });

  it('MUST skip missing parent roles without throwing', async () => {
    const store = makeStore(
      role('user', { permissions: [perm('post', 'read')], inherits: ['nonexistent'] }),
    );
    const resolver = new RoleResolver(store);
    const resolved = await resolver.resolve(['user']);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].name).toBe('user');
  });

  it('MUST resolve multiple root roles simultaneously', async () => {
    const store = makeStore(
      role('a', { permissions: [perm('post', 'read')] }),
      role('b', { permissions: [perm('post', 'write')] }),
    );
    const resolver = new RoleResolver(store);
    const resolved = await resolver.resolve(['a', 'b']);
    expect(resolved).toHaveLength(2);
  });

  it('MUST return empty array for empty input', async () => {
    const store = makeStore(role('user', { permissions: [perm('post', 'read')] }));
    const resolver = new RoleResolver(store);
    const resolved = await resolver.resolve([]);
    expect(resolved).toHaveLength(0);
  });

  it('MUST preserve all permissions from each role', async () => {
    const store = makeStore(
      role('user', { permissions: [perm('post', 'read'), perm('post', 'list')] }),
      role('admin', { permissions: [perm('post', 'delete')], inherits: ['user'] }),
    );
    const resolver = new RoleResolver(store);
    const resolved = await resolver.resolve(['admin']);
    const allPerms = resolved.flatMap((r) => r.permissions);
    expect(allPerms.map((p) => p.action)).toContain('read');
    expect(allPerms.map((p) => p.action)).toContain('list');
    expect(allPerms.map((p) => p.action)).toContain('delete');
  });
});
