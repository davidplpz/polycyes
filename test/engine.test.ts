import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Engine, InMemoryPolicyStore, role, perm, user } from '../src/index.js';
import { InvalidEngineOptionError } from '../src/errors.js';

// ============================================================================
// Tests del Engine — lista para completar cuando se implemente
// ============================================================================

describe('Engine', () => {
  let store: InMemoryPolicyStore;
  let engine: Engine;

  beforeEach(async () => {
    store = new InMemoryPolicyStore();
    engine = new Engine(store);
  });

  // -----------------------------------------------------------------------
  // RBAC básico
  // -----------------------------------------------------------------------

  describe('RBAC básico', () => {
    it('should grant permission when user has matching role', async () => {
      const admin = role('admin', {
        permissions: [perm('post', '*', { scope: 'any' })],
      });
      await store.addRole(admin);
      await store.setUserRoles('usr_1', ['admin']);

      const result = await engine.check({
        user: user('usr_1', { roles: ['admin'] }),
        resource: 'post',
        action: 'delete',
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('admin');
    });

    it('should deny permission when user has no matching role', async () => {
      await store.addRole(
        role('viewer', {
          permissions: [perm('post', 'read')],
        }),
      );
      await store.setUserRoles('usr_1', ['viewer']);

      const result = await engine.check({
        user: user('usr_1', { roles: ['viewer'] }),
        resource: 'post',
        action: 'delete',
      });

      expect(result.allowed).toBe(false);
    });

    it('should deny when user has no roles at all', async () => {
      const result = await engine.check({
        user: user('usr_1'),
        resource: 'post',
        action: 'read',
      });

      expect(result.allowed).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Scope: own
  // -----------------------------------------------------------------------

  describe('scope own', () => {
    it('should grant when resource owner matches user', async () => {
      await store.addRole(
        role('editor', {
          permissions: [perm('post', 'edit', { scope: 'own' })],
        }),
      );
      await store.setUserRoles('usr_1', ['editor']);

      const result = await engine.check({
        user: user('usr_1', { roles: ['editor'] }),
        resource: 'post',
        action: 'edit',
        resourceInstance: { id: 'post_1', ownerId: 'usr_1' },
      });

      expect(result.allowed).toBe(true);
    });

    it('should deny when resource owner is different', async () => {
      await store.addRole(
        role('editor', {
          permissions: [perm('post', 'edit', { scope: 'own' })],
        }),
      );
      await store.setUserRoles('usr_1', ['editor']);

      const result = await engine.check({
        user: user('usr_1', { roles: ['editor'] }),
        resource: 'post',
        action: 'edit',
        resourceInstance: { id: 'post_2', ownerId: 'usr_2' },
      });

      expect(result.allowed).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Herencia de roles
  // -----------------------------------------------------------------------

  describe('herencia de roles', () => {
    it('should inherit permissions from parent roles', async () => {
      const viewer = role('viewer', {
        permissions: [perm('post', 'read')],
      });
      const editor = role('editor', {
        permissions: [perm('post', 'edit', { scope: 'own' })],
        inherits: ['viewer'],
      });
      await store.addRole(viewer);
      await store.addRole(editor);
      await store.setUserRoles('usr_1', ['editor']);

      const readResult = await engine.check({
        user: user('usr_1', { roles: ['editor'] }),
        resource: 'post',
        action: 'read',
      });

      expect(readResult.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // ABAC: condiciones
  // -----------------------------------------------------------------------

  describe('condiciones ABAC', () => {
    it('should grant when condition is met', async () => {
      await store.addRole(
        role('editor', {
          permissions: [
            perm('post', 'publish', {
              condition: (ctx) =>
                ctx.userAttributes?.department ===
                ctx.resourceAttributes?.department,
            }),
          ],
        }),
      );
      await store.setUserRoles('usr_1', ['editor']);

      const result = await engine.check({
        user: user('usr_1', {
          roles: ['editor'],
          attributes: { department: 'engineering' },
        }),
        resource: 'post',
        action: 'publish',
        resourceInstance: {
          id: 'post_1',
          attributes: { department: 'engineering' },
        },
      });

      expect(result.allowed).toBe(true);
    });

    it('should deny when condition is not met', async () => {
      await store.addRole(
        role('editor', {
          permissions: [
            perm('post', 'publish', {
              condition: (ctx) =>
                ctx.userAttributes?.department ===
                ctx.resourceAttributes?.department,
            }),
          ],
        }),
      );
      await store.setUserRoles('usr_1', ['editor']);

      const result = await engine.check({
        user: user('usr_1', {
          roles: ['editor'],
          attributes: { department: 'engineering' },
        }),
        resource: 'post',
        action: 'publish',
        resourceInstance: {
          id: 'post_1',
          attributes: { department: 'marketing' },
        },
      });

      expect(result.allowed).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Wildcards
  // -----------------------------------------------------------------------

  describe('wildcards', () => {
    it('should match any resource with wildcard', async () => {
      const store = new InMemoryPolicyStore({ strictMode: false });
      const engine = new Engine(store);
      await store.addRole(
        role('super-admin', {
          permissions: [perm('*', '*')],
        }),
      );
      await store.setUserRoles('usr_1', ['super-admin']);

      const result = await engine.check({
        user: user('usr_1', { roles: ['super-admin'] }),
        resource: 'whatever',
        action: 'anything',
      });

      expect(result.allowed).toBe(true);
    });

    it('should match any action with wildcard', async () => {
      await store.addRole(
        role('admin', {
          permissions: [perm('post', '*')],
        }),
      );
      await store.setUserRoles('usr_1', ['admin']);

      const result = await engine.check({
        user: user('usr_1', { roles: ['admin'] }),
        resource: 'post',
        action: 'archive',
      });

      expect(result.allowed).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Detección de ciclos en herencia
  // -----------------------------------------------------------------------

  describe('detección de ciclos', () => {
    it('should throw on circular inheritance', async () => {
      const a = role('a', { inherits: ['b'] });
      const b = role('b', { inherits: ['c'] });
      const c = role('c', { inherits: ['a'] });

      await store.addRole(a);
      await store.addRole(b);
      await store.addRole(c);
      await store.setUserRoles('usr_1', ['a']);

      await expect(
        engine.check({
          user: user('usr_1', { roles: ['a'] }),
          resource: 'post',
          action: 'read',
        }),
      ).rejects.toThrow(/circular/i);
    });
  });

  // -----------------------------------------------------------------------
  // Razón en el resultado
  // -----------------------------------------------------------------------

  describe('reason en CheckResult', () => {
    it('should include the role name that granted permission', async () => {
      await store.addRole(
        role('admin', {
          permissions: [perm('post', '*')],
        }),
      );
      await store.setUserRoles('usr_1', ['admin']);

      const result = await engine.check({
        user: user('usr_1', { roles: ['admin'] }),
        resource: 'post',
        action: 'read',
      });

      expect(result.reason).toContain('admin');
    });
  });

  // -----------------------------------------------------------------------
  // timeoutMs
  // -----------------------------------------------------------------------

  describe('timeoutMs=0 (no timeout)', () => {
    it('MUST allow timeoutMs: 0 without throwing', () => {
      const e = new Engine(store, { timeoutMs: 0 });
      expect(e).toBeInstanceOf(Engine);
    });

    it('MUST throw InvalidEngineOptionError for negative timeoutMs', () => {
      expect(() => new Engine(store, { timeoutMs: -1 })).toThrow(InvalidEngineOptionError);
    });

    it('MUST reject NaN timeoutMs', () => {
      expect(() => new Engine(store, { timeoutMs: NaN })).toThrow(InvalidEngineOptionError);
    });

    it('MUST default to 1000ms when timeoutMs is undefined', () => {
      const e = new Engine(store);
      expect(e).toBeInstanceOf(Engine);
    });

    it('MUST evaluate slow conditions when timeoutMs=0 (no timeout)', async () => {
      const slowEngine = new Engine(store, { timeoutMs: 0 });
      const slow: (ctx: { userAttributes?: Record<string, unknown> }) => boolean | Promise<boolean> =
        async () => {
          await new Promise((r) => setTimeout(r, 30));
          return true;
        };

      await store.addRole(
        role('slow', {
          permissions: [perm('post', 'read', { condition: slow })],
        }),
      );
      await store.setUserRoles('usr_1', ['slow']);

      const result = await slowEngine.check({
        user: user('usr_1', { roles: ['slow'] }),
        resource: 'post',
        action: 'read',
      });

      expect(result.allowed).toBe(true);
    });

    it('MUST timeout when timeoutMs is set and condition is slow', async () => {
      const fastEngine = new Engine(store, { timeoutMs: 10 });
      const slow: (ctx: { userAttributes?: Record<string, unknown> }) => boolean | Promise<boolean> =
        async () => {
          await new Promise((r) => setTimeout(r, 100));
          return true;
        };

      await store.addRole(
        role('slow', {
          permissions: [perm('post', 'read', { condition: slow })],
        }),
      );
      await store.setUserRoles('usr_1', ['slow']);

      await expect(
        fastEngine.check({
          user: user('usr_1', { roles: ['slow'] }),
          resource: 'post',
          action: 'read',
        }),
      ).rejects.toThrow(/timeout/i);
    });
  });

  // -----------------------------------------------------------------------
  // resolveRoles batch — N+1 prevention
  // -----------------------------------------------------------------------

  describe('resolveRoles batch (N+1 prevention)', () => {
    it('MUST NOT call getRole during resolveRoles (zero N+1)', async () => {
      const spyGetRole = vi.spyOn(store, 'getRole');
      const spyGetRolesByNames = vi.spyOn(store, 'getRolesByNames');

      const viewer = role('viewer', { permissions: [perm('post', 'read')] });
      const editor = role('editor', {
        permissions: [perm('post', 'edit', { scope: 'own' })],
        inherits: ['viewer'],
      });
      const admin = role('admin', {
        permissions: [perm('post', 'read')],
        inherits: ['editor'],
      });

      await store.addRole(viewer);
      await store.addRole(editor);
      await store.addRole(admin);
      await store.setUserRoles('usr_1', ['admin']);

      await engine.check({
        user: user('usr_1', { roles: ['admin'] }),
        resource: 'post',
        action: 'read',
      });

      expect(spyGetRole).not.toHaveBeenCalled();
      expect(spyGetRolesByNames).toHaveBeenCalled();
    });

    it('MUST call getRolesByNames once per level of inheritance depth', async () => {
      const spyGetRolesByNames = vi.spyOn(store, 'getRolesByNames');

      const a = role('a', { permissions: [] });
      const b = role('b', { permissions: [], inherits: ['a'] });
      const c = role('c', { permissions: [], inherits: ['b'] });
      const d = role('d', { permissions: [], inherits: ['c'] });

      await store.addRole(a);
      await store.addRole(b);
      await store.addRole(c);
      await store.addRole(d);
      await store.setUserRoles('usr_1', ['d']);

      await engine.check({
        user: user('usr_1', { roles: ['d'] }),
        resource: 'post',
        action: 'read',
      });

      // 4 levels → 4 calls: d → c → b → a
      expect(spyGetRolesByNames).toHaveBeenCalledTimes(4);
    });

    it('MUST handle roles that inherit from same parent (fan-in)', async () => {
      const spyGetRolesByNames = vi.spyOn(store, 'getRolesByNames');

      const base = role('base', { permissions: [perm('post', 'read')] });
      const a = role('a', { permissions: [], inherits: ['base'] });
      const b = role('b', { permissions: [], inherits: ['base'] });

      await store.addRole(base);
      await store.addRole(a);
      await store.addRole(b);
      await store.setUserRoles('usr_1', ['a', 'b']);

      await engine.check({
        user: user('usr_1', { roles: ['a', 'b'] }),
        resource: 'post',
        action: 'read',
      });

      // Level 0: a,b → Level 1: base = 2 calls (base fetched once via dedup Set)
      expect(spyGetRolesByNames).toHaveBeenCalledTimes(2);
    });
  });
});
