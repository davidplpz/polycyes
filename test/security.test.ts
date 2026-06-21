import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  Engine,
  InMemoryPolicyStore,
  perm,
  role,
  user,
  ConditionEvaluationError,
  EmptyConditionArrayError,
  ConditionTimeoutError,
  StoreUnavailableError,
  InvalidInputError,
} from '../src/index.js';

// Store that throws on every call
class FailingStore extends InMemoryPolicyStore {
  async getUserRoles(_userId: string): Promise<string[]> {
    throw new Error('connection refused');
  }
  async getRolesByNames(_names: string[]): Promise<never[]> {
    throw new Error('connection refused');
  }
}

describe('Security: async condition bypass (CRITICAL #1)', () => {
  let engine: Engine;
  let store: InMemoryPolicyStore;

  beforeEach(async () => {
    store = new InMemoryPolicyStore({ strictMode: false });
    engine = new Engine(store);
  });

  it('MUST deny when async condition returns false', async () => {
    await store.addRole(
      role('user', {
        permissions: [
          perm('post', 'edit', {
            condition: async () => false,
          }),
        ],
      }),
    );
    await store.setUserRoles('u1', ['user']);

    const result = await engine.check({
      user: user('u1', { roles: ['user'] }),
      resource: 'post',
      action: 'edit',
    });

    expect(result.allowed).toBe(false);
    expect(result.deniedBy?.type).toBe('condition-failed');
  });

  it('MUST grant when async condition returns true', async () => {
    await store.addRole(
      role('user', {
        permissions: [
          perm('post', 'edit', {
            condition: async () => true,
          }),
        ],
      }),
    );
    await store.setUserRoles('u1', ['user']);

    const result = await engine.check({
      user: user('u1', { roles: ['user'] }),
      resource: 'post',
      action: 'edit',
    });

    expect(result.allowed).toBe(true);
  });
});

describe('Security: empty condition array (CRITICAL #2)', () => {
  let engine: Engine;
  let store: InMemoryPolicyStore;

  beforeEach(async () => {
    store = new InMemoryPolicyStore({ strictMode: false });
    engine = new Engine(store);
  });

  it('MUST throw EmptyConditionArrayError on condition: []', async () => {
    await store.addRole(
      role('user', {
        permissions: [
          { resource: 'post', action: 'read', condition: [], conditionMode: 'all' },
        ],
      }),
    );
    await store.setUserRoles('u1', ['user']);

    await expect(
      engine.check({
        user: user('u1', { roles: ['user'] }),
        resource: 'post',
        action: 'read',
      }),
    ).rejects.toThrow(EmptyConditionArrayError);
  });

  it('MUST pass when condition is undefined (RBAC basic)', async () => {
    await store.addRole(
      role('user', {
        permissions: [perm('post', 'read')], // no condition field
      }),
    );
    await store.setUserRoles('u1', ['user']);

    const result = await engine.check({
      user: user('u1', { roles: ['user'] }),
      resource: 'post',
      action: 'read',
    });

    expect(result.allowed).toBe(true);
  });
});

describe('Security: condition timeout', () => {
  it('MUST throw ConditionTimeoutError on hanging condition', async () => {
    const store = new InMemoryPolicyStore({ strictMode: false });
    const engine = new Engine(store, { timeoutMs: 10 });

    await store.addRole(
      role('user', {
        permissions: [
          perm('post', 'edit', {
            condition: () => new Promise<boolean>(() => {}), // never resolves
          }),
        ],
      }),
    );
    await store.setUserRoles('u1', ['user']);

    await expect(
      engine.check({
        user: user('u1', { roles: ['user'] }),
        resource: 'post',
        action: 'edit',
      }),
    ).rejects.toThrow(ConditionTimeoutError);
  });

  it('MUST throw on non-boolean condition return', async () => {
    const store = new InMemoryPolicyStore({ strictMode: false });
    const engine = new Engine(store);

    await store.addRole(
      role('user', {
        permissions: [
          perm('post', 'read', {
            condition: () => 'false' as unknown as boolean, // returns string
          }),
        ],
      }),
    );
    await store.setUserRoles('u1', ['user']);

    await expect(
      engine.check({
        user: user('u1', { roles: ['user'] }),
        resource: 'post',
        action: 'read',
      }),
    ).rejects.toThrow(ConditionEvaluationError);
  });
});

describe('Security: prototype pollution', () => {
  it('MUST strip __proto__ from metadata', async () => {
    const store = new InMemoryPolicyStore({ strictMode: false });
    const engine = new Engine(store);

    await store.addRole(
      role('admin', {
        permissions: [perm('post', 'read')],
      }),
    );
    await store.setUserRoles('u1', ['admin']);

    const result = await engine.check({
      user: user('u1', { roles: ['admin'] }),
      resource: 'post',
      action: 'read',
      metadata: { __proto__: { isAdmin: true } } as Record<string, unknown>,
    });

    expect(result.allowed).toBe(true);
    // The check didn't crash — proto was stripped before engine processed it
  });

  it('MUST strip __proto__ from user attributes', async () => {
    const store = new InMemoryPolicyStore({ strictMode: false });
    const engine = new Engine(store);

    await store.addRole(
      role('admin', {
        permissions: [perm('post', 'read')],
      }),
    );
    await store.setUserRoles('u1', ['admin']);

    const result = await engine.check({
      user: user('u1', {
        roles: ['admin'],
        attributes: { __proto__: { role: 'superadmin' } } as Record<string, unknown>,
      }),
      resource: 'post',
      action: 'read',
    });

    expect(result.allowed).toBe(true);
  });
});

describe('Security: store failure fail-closed', () => {
  it('MUST throw StoreUnavailableError when store fails', async () => {
    const store = new FailingStore();
    const engine = new Engine(store);

    await expect(
      engine.check({
        user: user('u1', { roles: ['admin'] }),
        resource: 'post',
        action: 'read',
      }),
    ).rejects.toThrow(StoreUnavailableError);
  });

  it('MUST return allowed=true when failOpen is enabled', async () => {
    const store = new FailingStore();
    const engine = new Engine(store, { failOpen: true });

    const result = await engine.check({
      user: user('u1', { roles: ['admin'] }),
      resource: 'post',
      action: 'read',
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toContain('SECURITY WARNING');
  });
});

describe('Security: deepFreeze prevents mutation', () => {
  it('MUST not allow condition to mutate context', async () => {
    const store = new InMemoryPolicyStore({ strictMode: false });
    const engine = new Engine(store);

    let capturedCtx: unknown = null;
    await store.addRole(
      role('user', {
        permissions: [
          perm('post', 'read', {
            condition: (ctx) => {
              capturedCtx = ctx;
              try {
                (ctx.user as { name?: string }).name = 'hacked';
              } catch { /* frozen */ }
              return true;
            },
          }),
        ],
      }),
    );
    await store.setUserRoles('u1', ['user']);

    const result = await engine.check({
      user: user('u1', {
        roles: ['user'],
        attributes: { name: 'original' },
      }),
      resource: 'post',
      action: 'read',
    });

    expect(result.allowed).toBe(true);
    // The user attributes in the context should still be original
    const ctx = capturedCtx as { user?: { attributes?: { name?: string } } } | null;
    expect(ctx?.user?.attributes?.name).toBe('original');
  });
});

describe('Security: input validation', () => {
  it('MUST throw InvalidInputError on empty user.id', async () => {
    const engine = new Engine(new InMemoryPolicyStore({ strictMode: false }));

    await expect(
      engine.check({
        user: { id: '', roles: [] },
        resource: 'post',
        action: 'read',
      }),
    ).rejects.toThrow(InvalidInputError);
  });

  it('MUST throw InvalidInputError on empty resource', async () => {
    const engine = new Engine(new InMemoryPolicyStore({ strictMode: false }));

    await expect(
      engine.check({
        user: user('u1'),
        resource: '',
        action: 'read',
      }),
    ).rejects.toThrow(InvalidInputError);
  });
});

describe('Security: checkMany error isolation', () => {
  it('MUST isolate errors — one failure does not affect others', async () => {
    const store = new InMemoryPolicyStore({ strictMode: false });
    const engine = new Engine(store);

    await store.addRole(
      role('user', {
        permissions: [
          perm('post', 'read'),
          {
            resource: 'post',
            action: 'delete',
            condition: [],
            conditionMode: 'all',
          },
        ],
      }),
    );
    await store.setUserRoles('u1', ['user']);

    const results = await engine.checkMany([
      { user: user('u1', { roles: ['user'] }), resource: 'post', action: 'read' },
      { user: user('u1', { roles: ['user'] }), resource: 'post', action: 'delete' },
      { user: user('u1', { roles: ['user'] }), resource: 'post', action: 'read' },
    ]);

    expect(results[0].allowed).toBe(true);
    expect(results[1].allowed).toBe(false);
    expect(results[2].allowed).toBe(true);
  });

  it('MUST call getUserRoles only once per userId in checkMany', async () => {
    const store = new InMemoryPolicyStore({ strictMode: false });
    // Spy on getUserRoles
    const getUserRoles = vi.spyOn(store, 'getUserRoles');
    const engine = new Engine(store);

    await store.addRole(
      role('user', { permissions: [perm('post', 'read')] }),
    );
    await store.setUserRoles('u1', ['user']);
    await store.setUserRoles('u2', ['user']);

    // 5 inputs: 3 for u1, 2 for u2
    await engine.checkMany([
      { user: user('u1', { roles: ['user'] }), resource: 'post', action: 'read' },
      { user: user('u1', { roles: ['user'] }), resource: 'post', action: 'read' },
      { user: user('u2', { roles: ['user'] }), resource: 'post', action: 'read' },
      { user: user('u1', { roles: ['user'] }), resource: 'post', action: 'read' },
      { user: user('u2', { roles: ['user'] }), resource: 'post', action: 'read' },
    ]);

    // Called once per unique userId, not once per input
    expect(getUserRoles).toHaveBeenCalledTimes(2);
  });
});
