import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  Engine,
  InMemoryPolicyStore,
  perm,
  role,
  user,
  InvalidInputError,
  ConditionEvaluationError,
  EmptyConditionArrayError,
  UnsafeRoleError,
} from '../src/index.js';

const storeWithStrictMode = (strict: boolean) =>
  new InMemoryPolicyStore({ strictMode: strict });

describe('Property: deny always wins over allow', () => {
  it('MUST return denied when deny and allow both match', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('read', 'write', 'delete'),
        async (action) => {
          const store = storeWithStrictMode(false);
          const engine = new Engine(store);

          await store.addRole(
            role('test-role', {
              permissions: [
                perm('post', action, { effect: 'deny' }),
                perm('post', action, { effect: 'allow' }),
              ],
            }),
          );
          await store.setUserRoles('u1', ['test-role']);

          const result = await engine.check({
            user: user('u1', { roles: ['test-role'] }),
            resource: 'post',
            action,
          });

          expect(result.allowed).toBe(false);
        },
      ),
    );
  });
});

describe('Property: inheritance is transitive', () => {
  it('MUST inherit permission from grandparent role', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('read', 'write'),
        async (action) => {
          const store = storeWithStrictMode(false);
          const engine = new Engine(store);

          await store.addRole(
            role('grandparent', {
              permissions: [perm('post', action)],
            }),
          );
          await store.addRole(
            role('parent', { inherits: ['grandparent'] }),
          );
          await store.addRole(
            role('child', { inherits: ['parent'] }),
          );
          await store.setUserRoles('u1', ['child']);

          const result = await engine.check({
            user: user('u1', { roles: ['child'] }),
            resource: 'post',
            action,
          });

          expect(result.allowed).toBe(true);
        },
      ),
    );
  });
});

describe('Property: cycle detection', () => {
  it('MUST throw on A→B→A cycle', async () => {
    const store = storeWithStrictMode(false);
    const engine = new Engine(store);

    await store.addRole(role('a', { inherits: ['b'] }));
    await store.addRole(role('b', { inherits: ['a'] }));
    await store.setUserRoles('u1', ['a']);

    await expect(
      engine.check({
        user: user('u1', { roles: ['a'] }),
        resource: 'post',
        action: 'read',
      }),
    ).rejects.toThrow(/circular/i);
  });
});

describe('Property: no side effects from conditions', () => {
  it('MUST not mutate eval context via condition', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('engineering', 'marketing'),
        async (dept) => {
          const store = storeWithStrictMode(false);
          const engine = new Engine(store);

          let ctxAfter: unknown = null;
          await store.addRole(
            role('user', {
              permissions: [
                perm('post', 'read', {
                  condition: (ctx) => {
                    try {
                      (ctx.user.attributes as Record<string, unknown>).department = 'hacked';
                    } catch { /* frozen */ }
                    ctxAfter = ctx;
                    return true;
                  },
                }),
              ],
            }),
          );
          await store.setUserRoles('u1', ['user']);

          await engine.check({
            user: user('u1', {
              roles: ['user'],
              attributes: { department: dept },
            }),
            resource: 'post',
            action: 'read',
          });

          const attrs = (ctxAfter as { user?: { attributes?: Record<string, unknown> } })?.user?.attributes;
          expect(attrs?.department).toBe(dept); // NOT 'hacked'
        },
      ),
    );
  });
});

describe('Property: empty input fast-fail', () => {
  it('MUST throw InvalidInputError on empty user id', async () => {
    const engine = new Engine(storeWithStrictMode(false));

    await expect(
      engine.check({
        user: user('', { roles: [] }),
        resource: 'post',
        action: 'read',
      }),
    ).rejects.toThrow(InvalidInputError);
  });

  it('MUST throw InvalidInputError on empty resource', async () => {
    const engine = new Engine(storeWithStrictMode(false));

    await expect(
      engine.check({
        user: user('u1'),
        resource: '',
        action: 'read',
      }),
    ).rejects.toThrow(InvalidInputError);
  });
});

describe('Property: scope own without resourceInstance', () => {
  it('MUST deny when scope=own and no resourceInstance', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('edit', 'delete'),
        async (action) => {
          const store = storeWithStrictMode(false);
          const engine = new Engine(store);

          await store.addRole(
            role('editor', {
              permissions: [perm('post', action, { scope: 'own' })],
            }),
          );
          await store.setUserRoles('u1', ['editor']);

          const result = await engine.check({
            user: user('u1', { roles: ['editor'] }),
            resource: 'post',
            action,
            // no resourceInstance
          });

          expect(result.allowed).toBe(false);
          expect(result.deniedBy?.type).toBe('scope-failed');
        },
      ),
    );
  });
});

describe('Property: non-boolean condition returns error', () => {
  it('MUST throw when condition returns string', async () => {
    const store = storeWithStrictMode(false);
    const engine = new Engine(store);

    await store.addRole(
      role('user', {
        permissions: [
          {
            resource: 'post',
            action: 'read',
            condition: () => 'yes' as unknown as boolean,
          },
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

describe('Property: empty condition array throws', () => {
  it('MUST throw EmptyConditionArrayError', async () => {
    const store = storeWithStrictMode(false);
    const engine = new Engine(store);

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
});

describe('Property: permission index vs linear scan equivalence', () => {
  it('MUST produce same result with and without index', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('post', 'comment', 'user'),
        fc.constantFrom('read', 'write', 'delete'),
        fc.constantFrom('any', 'own', 'none'),
        fc.boolean(),
        async (resource, action, scope, hasCondition) => {
          const store = storeWithStrictMode(false);
          const engineIndex = new Engine(store, { useIndex: true });
          const engineScan = new Engine(store, { useIndex: false });

          const permOpts: Record<string, unknown> = { scope };
          if (hasCondition) permOpts.condition = () => true;

          await store.addRole(
            role('test', { permissions: [perm(resource, action, permOpts as Parameters<typeof perm>[2])] }),
          );
          await store.setUserRoles('u1', ['test']);

          const ownerId = scope === 'own' ? 'u1' : 'u2';
          const r1 = await engineIndex.check({
            user: user('u1', { roles: ['test'] }),
            resource,
            action,
            resourceInstance: { id: 'r1', ownerId },
          });

          const r2 = await engineScan.check({
            user: user('u1', { roles: ['test'] }),
            resource,
            action,
            resourceInstance: { id: 'r1', ownerId },
          });

          expect(r1.allowed).toBe(r2.allowed);
          expect(r1.reason).toBe(r2.reason);
        },
      ),
    );
  });
});
