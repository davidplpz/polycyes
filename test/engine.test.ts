import { describe, it, expect, beforeEach } from 'vitest';
import { Engine, InMemoryPolicyStore, role, perm, user } from '../src/index.js';

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
});
