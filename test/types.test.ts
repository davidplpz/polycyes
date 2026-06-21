import { describe, it, expect } from 'vitest';
import type {
  PermissionEffect,
  ScopeFunction,
  Condition,
  ConditionMode,
  EvalContext,
  CheckResult,
  DeniedBy,
  EngineOptions,
  FilterInput,
  FilterResult,
  Permission,
  Role,
  User,
  ResourceInstance,
  CheckInput,
} from '../src/types.js';
import { perm, role, user } from '../src/helpers.js';

describe('Permission model types', () => {
  describe('Permission', () => {
    it('MUST support effect field', () => {
      const p = perm('post', 'edit', { effect: 'deny' });
      expect(p.effect).toBe('deny');
    });

    it('MUST default effect to allow', () => {
      const p = perm('post', 'edit');
      expect(p.effect).toBe('allow');
    });

    it('MUST support conditionMode field', () => {
      const p = perm('post', 'edit', { conditionMode: 'any' });
      expect(p.conditionMode).toBe('any');
    });

    it('MUST support condition as array', () => {
      const conds: Condition = [() => true, () => false];
      const p: Permission = {
        resource: 'post',
        action: 'edit',
        condition: conds,
        conditionMode: 'all',
      };
      expect(Array.isArray(p.condition)).toBe(true);
    });

    it('MUST support condition as async function', () => {
      const asyncCond: Condition = async () => true;
      const p: Permission = {
        resource: 'post',
        action: 'edit',
        condition: asyncCond,
      };
      expect(typeof p.condition).toBe('function');
    });

    it('MUST support scope as function', () => {
      const teamScope: ScopeFunction = (ctx) =>
        ctx.userAttributes?.teamId === ctx.resourceAttributes?.teamId;
      const p: Permission = {
        resource: 'project',
        action: 'edit',
        scope: teamScope,
      };
      expect(typeof p.scope).toBe('function');
    });
  });

  describe('EvalContext', () => {
    it('MUST have timeoutMs field', () => {
      const ctx: EvalContext = {
        user: { id: 'u1', roles: [] },
        resource: 'post',
        action: 'read',
        timeoutMs: 1000,
      };
      expect(ctx.timeoutMs).toBe(1000);
    });

    it('MUST allow getUserAttributes getter', () => {
      const ctx: EvalContext = {
        user: { id: 'u1', roles: [], attributes: { dept: 'eng' } },
        resource: 'post',
        action: 'read',
        get userAttributes() {
          return this.user.attributes;
        },
        get resourceAttributes() {
          return this.resourceInstance?.attributes;
        },
      };
      expect(ctx.userAttributes).toEqual({ dept: 'eng' });
    });
  });

  describe('CheckResult', () => {
    it('MUST have matchedRole and matchedPermission when allowed', () => {
      const r: CheckResult = {
        allowed: true,
        reason: 'granted by role admin',
        matchedRole: 'admin',
        matchedPermission: { resource: 'post', action: 'read' },
        evaluatedAt: new Date(),
      };
      expect(r.matchedRole).toBe('admin');
      expect(r.matchedPermission?.resource).toBe('post');
      expect(r.evaluatedAt).toBeInstanceOf(Date);
    });

    it('MUST have deniedBy when denied', () => {
      const denied: DeniedBy = { type: 'no-match', detail: 'none matched' };
      const r: CheckResult = {
        allowed: false,
        reason: 'denied',
        deniedBy: denied,
        evaluatedAt: new Date(),
      };
      expect(r.deniedBy?.type).toBe('no-match');
    });

    it('MUST support all DeniedBy types', () => {
      const types: DeniedBy['type'][] = [
        'no-roles',
        'no-match',
        'scope-failed',
        'condition-failed',
        'explicit-deny',
      ];
      expect(types).toHaveLength(5);
    });
  });

  describe('EngineOptions', () => {
    it('MUST define timeoutMs, failOpen, disableRoleHintWarning', () => {
      const opts: EngineOptions = {
        timeoutMs: 500,
        failOpen: false,
        disableRoleHintWarning: true,
      };
      expect(opts.timeoutMs).toBe(500);
      expect(opts.failOpen).toBe(false);
      expect(opts.disableRoleHintWarning).toBe(true);
    });
  });

  describe('FilterInput / FilterResult', () => {
    it('MUST define FilterInput shape', () => {
      const input: FilterInput = {
        user: user('u1'),
        action: 'read',
        resources: [{ id: 'r1' }],
        resourceType: 'post',
      };
      expect(input.resources).toHaveLength(1);
    });

    it('MUST define FilterResult shape', () => {
      const result: FilterResult = {
        allowed: [{ id: 'r1' }],
        denied: [{ id: 'r2', reason: 'forbidden' }],
      };
      expect(result.allowed).toHaveLength(1);
      expect(result.denied[0].reason).toBe('forbidden');
    });
  });

  describe('Branded types', () => {
    it('UserId MUST be assignable via cast', () => {
      const uid = 'usr_1' as import('../src/types.js').UserId;
      expect(uid).toBe('usr_1');
    });

    it('RoleName MUST be assignable via cast', () => {
      const name = 'admin' as import('../src/types.js').RoleName;
      expect(name).toBe('admin');
    });

    it('ResourceName MUST be assignable via cast', () => {
      const name = 'post' as import('../src/types.js').ResourceName;
      expect(name).toBe('post');
    });

    it('ActionName MUST be assignable via cast', () => {
      const name = 'create' as import('../src/types.js').ActionName;
      expect(name).toBe('create');
    });
  });
});
