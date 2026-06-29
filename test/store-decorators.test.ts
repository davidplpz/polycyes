import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InMemoryPolicyStore } from '../src/memory-store.js';
import {
  LoggingPolicyStore,
  MetricsPolicyStore,
  FailOpenPolicyStore,
} from '../src/store-decorators.js';
import type { Role } from '../src/types.js';

function makeRoles(): { admin: Role; editor: Role; viewer: Role } {
  return {
    admin: { name: 'admin', permissions: [{ resource: 'post', action: '*' }] },
    editor: { name: 'editor', permissions: [{ resource: 'post', action: 'edit', scope: 'own' as const }] },
    viewer: { name: 'viewer', permissions: [{ resource: 'post', action: 'read' }] },
  };
}

// ============================================================================
// LoggingPolicyStore
// ============================================================================

describe('LoggingPolicyStore', () => {
  let inner: InMemoryPolicyStore;
  let logs: string[];

  beforeEach(async () => {
    inner = new InMemoryPolicyStore({ strictMode: false });
    const roles = makeRoles();
    await inner.addRole(roles.admin);
    await inner.addRole(roles.editor);
    await inner.addRole(roles.viewer);
    logs = [];
  });

  it('MUST delegate getRole with logging', async () => {
    const store = new LoggingPolicyStore(inner, { logger: (m) => logs.push(m) });
    const role = await store.getRole('admin');
    expect(role).not.toBeNull();
    expect(logs.some((l) => l.includes('getRole'))).toBe(true);
  });

  it('MUST delegate getUserRoles with logging', async () => {
    await inner.setUserRoles('u1', ['admin']);
    const store = new LoggingPolicyStore(inner, { logger: (m) => logs.push(m) });
    const roles = await store.getUserRoles('u1');
    expect(roles).toEqual(['admin']);
    expect(logs.some((l) => l.includes('getUserRoles'))).toBe(true);
  });

  it('MUST delegate write operations with logging', async () => {
    const store = new LoggingPolicyStore(inner, { logger: (m) => logs.push(m) });
    await store.addRole({ name: 'new', permissions: [] });
    expect(logs.some((l) => l.includes('addRole'))).toBe(true);

    await store.updateRole({ name: 'new', permissions: [{ resource: 'x', action: 'y' }] });
    expect(logs.some((l) => l.includes('updateRole'))).toBe(true);

    await store.deleteRole('new');
    expect(logs.some((l) => l.includes('deleteRole'))).toBe(true);
  });

  it('MUST include args in log by default', async () => {
    const store = new LoggingPolicyStore(inner, { logger: (m) => logs.push(m) });
    await store.getRole('admin');
    expect(logs.some((l) => l.includes('"admin"'))).toBe(true);
  });

  it('MUST omit args when includeArgs=false', async () => {
    const store = new LoggingPolicyStore(inner, { includeArgs: false, logger: (m) => logs.push(m) });
    await store.getRole('admin');
    expect(logs.some((l) => l.includes('admin'))).toBe(false);
  });

  it('MUST include result when includeResult=true', async () => {
    const store = new LoggingPolicyStore(inner, { includeResult: true, logger: (m) => logs.push(m) });
    await store.getRole('admin');
    expect(logs.some((l) => l.includes('"permissions"'))).toBe(true);
  });

  it('MUST log errors', async () => {
    const store = new LoggingPolicyStore(inner, { logger: (m) => logs.push(m) });
    await expect(store.getRole('ghost')).resolves.toBeNull();
    expect(logs.some((l) => l.includes('getRole'))).toBe(true);
  });

  it('MUST NOT change return values', async () => {
    const store = new LoggingPolicyStore(inner, { logger: (m) => logs.push(m) });
    await inner.setUserRoles('u1', ['viewer']);

    const result = await store.getUserRoles('u1');
    expect(result).toEqual(['viewer']);
  });
});

// ============================================================================
// MetricsPolicyStore
// ============================================================================

describe('MetricsPolicyStore', () => {
  let inner: InMemoryPolicyStore;
  let store: MetricsPolicyStore;

  beforeEach(async () => {
    inner = new InMemoryPolicyStore({ strictMode: false });
    const roles = makeRoles();
    await inner.addRole(roles.admin);
    await inner.addRole(roles.editor);
    store = new MetricsPolicyStore(inner);
  });

  it('MUST start with zero metrics', () => {
    const m = store.getMetrics();
    for (const key of Object.keys(m) as (keyof typeof m)[]) {
      expect(m[key].count).toBe(0);
      expect(m[key].totalMs).toBe(0);
      expect(m[key].errors).toBe(0);
    }
  });

  it('MUST track getRole call count', async () => {
    await store.getRole('admin');
    await store.getRole('editor');
    const m = store.getMetrics();
    expect(m.getRole.count).toBe(2);
  });

  it('MUST track totalMs for getRole', async () => {
    await store.getRole('admin');
    const m = store.getMetrics();
    expect(m.getRole.totalMs).toBeGreaterThan(0);
  });

  it('MUST track all method counts separately', async () => {
    await store.getRole('admin');
    await store.getRolesByNames(['editor', 'viewer']);
    await store.getUserRoles('u1');
    await store.addRole({ name: 'x', permissions: [] });
    await store.updateRole({ name: 'x', permissions: [{ resource: 'y', action: 'z' }] });
    await store.deleteRole('x');
    await store.setUserRoles('u1', ['admin']);

    const m = store.getMetrics();
    expect(m.getRole.count).toBe(1);
    expect(m.getRolesByNames.count).toBe(1);
    expect(m.getUserRoles.count).toBe(1);
    expect(m.addRole.count).toBe(1);
    expect(m.updateRole.count).toBe(1);
    expect(m.deleteRole.count).toBe(1);
    expect(m.setUserRoles.count).toBe(1);
  });

  it('MUST return immutable snapshot from getMetrics', async () => {
    await store.getRole('admin');
    const snapshot = store.getMetrics();
    snapshot.getRole.count = 999;
    const m = store.getMetrics();
    expect(m.getRole.count).toBe(1);
  });

  it('MUST reset metrics on resetMetrics', async () => {
    await store.getRole('admin');
    store.resetMetrics();
    const m = store.getMetrics();
    expect(m.getRole.count).toBe(0);
    expect(m.getRole.totalMs).toBe(0);
    expect(m.getRole.errors).toBe(0);
  });

  it('MUST track errors', async () => {
    const broken = {
      getRole: async () => { throw new Error('fail'); },
      getRolesByNames: async () => { throw new Error('fail'); },
      getUserRoles: async () => { throw new Error('fail'); },
      addRole: async () => { throw new Error('fail'); },
      updateRole: async () => { throw new Error('fail'); },
      deleteRole: async () => { throw new Error('fail'); },
      setUserRoles: async () => { throw new Error('fail'); },
    };
    const ms = new MetricsPolicyStore(broken);
    await expect(ms.getRole('x')).rejects.toThrow('fail');
    const m = ms.getMetrics();
    expect(m.getRole.count).toBe(1);
    expect(m.getRole.errors).toBe(1);
  });

  it('MUST NOT change return values', async () => {
    await inner.setUserRoles('u1', ['admin']);
    const result = await store.getUserRoles('u1');
    expect(result).toEqual(['admin']);
  });
});

// ============================================================================
// FailOpenPolicyStore
// ============================================================================

describe('FailOpenPolicyStore', () => {
  it('MUST return null from getRole when store throws', async () => {
    const broken = {
      getRole: async () => { throw new Error('db down'); },
      getRolesByNames: async () => { throw new Error('db down'); },
      getUserRoles: async () => { throw new Error('db down'); },
    };
    const store = new FailOpenPolicyStore(broken);
    const result = await store.getRole('x');
    expect(result).toBeNull();
  });

  it('MUST return [] from getRolesByNames when store throws', async () => {
    const broken = {
      getRole: async () => { throw new Error('db down'); },
      getRolesByNames: async () => { throw new Error('db down'); },
      getUserRoles: async () => { throw new Error('db down'); },
    };
    const store = new FailOpenPolicyStore(broken);
    const result = await store.getRolesByNames(['a', 'b']);
    expect(result).toEqual([]);
  });

  it('MUST return [] from getUserRoles when store throws', async () => {
    const broken = {
      getRole: async () => { throw new Error('db down'); },
      getRolesByNames: async () => { throw new Error('db down'); },
      getUserRoles: async () => { throw new Error('db down'); },
    };
    const store = new FailOpenPolicyStore(broken);
    const result = await store.getUserRoles('u1');
    expect(result).toEqual([]);
  });

  it('MUST pass through successful reads', async () => {
    const inner = new InMemoryPolicyStore({ strictMode: false });
    await inner.addRole({ name: 'admin', permissions: [] });
    await inner.setUserRoles('u1', ['admin']);

    const store = new FailOpenPolicyStore(inner);
    const role = await store.getRole('admin');
    expect(role).not.toBeNull();
    const roles = await store.getUserRoles('u1');
    expect(roles).toEqual(['admin']);
  });

  it('MUST implement only PolicyReader (no write methods)', () => {
    const inner = new InMemoryPolicyStore({ strictMode: false });
    const store = new FailOpenPolicyStore(inner);
    expect(store).not.toHaveProperty('addRole');
    expect(store).not.toHaveProperty('updateRole');
    expect(store).not.toHaveProperty('deleteRole');
    expect(store).not.toHaveProperty('setUserRoles');
  });
});
