import { describe, it, expect } from 'vitest';
import { perm, role, user, scopeTeam, scopeTenant, scopeOrg } from '../src/index.js';
import type { EvalContext, ScopeFunction } from '../src/types.js';

describe('perm()', () => {
  it('MUST default effect to allow', () => {
    const p = perm('post', 'edit');
    expect(p.effect).toBe('allow');
  });

  it('MUST accept effect deny', () => {
    const p = perm('post', 'delete', { effect: 'deny' });
    expect(p.effect).toBe('deny');
  });

  it('MUST accept effect allow explicitly', () => {
    const p = perm('post', 'create', { effect: 'allow' });
    expect(p.effect).toBe('allow');
  });

  it('MUST default scope to any', () => {
    const p = perm('post', 'read');
    expect(p.scope).toBe('any');
  });

  it('MUST accept scope own', () => {
    const p = perm('post', 'edit', { scope: 'own' });
    expect(p.scope).toBe('own');
  });

  it('MUST accept scope none', () => {
    const p = perm('billing', 'read', { scope: 'none' });
    expect(p.scope).toBe('none');
  });

  it('MUST accept scope as function', () => {
    const fn: ScopeFunction = () => true;
    const p = perm('project', 'edit', { scope: fn });
    expect(p.scope).toBe(fn);
  });

  it('MUST accept condition as function', () => {
    const cond = () => true;
    const p = perm('post', 'publish', { condition: cond });
    expect(p.condition).toBe(cond);
  });

  it('MUST accept condition as array', () => {
    const c1 = () => true;
    const c2 = () => false;
    const p = perm('post', 'publish', { condition: [c1, c2] });
    expect(Array.isArray(p.condition)).toBe(true);
    expect((p.condition as Array<unknown>)).toHaveLength(2);
  });

  it('MUST default conditionMode to all', () => {
    const p = perm('post', 'publish', { condition: [() => true] });
    expect(p.conditionMode).toBe('all');
  });

  it('MUST accept conditionMode any', () => {
    const p = perm('post', 'publish', {
      condition: [() => true],
      conditionMode: 'any',
    });
    expect(p.conditionMode).toBe('any');
  });

  it('MUST accept conditionMode all explicitly', () => {
    const p = perm('post', 'publish', {
      condition: [() => true],
      conditionMode: 'all',
    });
    expect(p.conditionMode).toBe('all');
  });

  it('MUST support scope and condition together', () => {
    const p = perm('post', 'edit', {
      scope: 'own',
      condition: () => true,
      effect: 'deny',
    });
    expect(p.scope).toBe('own');
    expect(p.effect).toBe('deny');
    expect(typeof p.condition).toBe('function');
  });
});

describe('scope helpers', () => {
  const makeCtx = (overrides: Partial<EvalContext> = {}): EvalContext => ({
    user: { id: 'u1', roles: [], attributes: { teamId: 't1', tenantId: 'org1' } },
    resource: 'post',
    action: 'read',
    get userAttributes() { return this.user.attributes; },
    get resourceAttributes() { return this.resourceInstance?.attributes; },
    ...overrides,
  });

  it('scopeTeam: MUST match on same teamId', () => {
    const ctx = makeCtx({ resourceInstance: { attributes: { teamId: 't1' } } });
    expect(scopeTeam(ctx)).toBe(true);
  });

  it('scopeTeam: MUST deny on different teamId', () => {
    const ctx = makeCtx({ resourceInstance: { attributes: { teamId: 't2' } } });
    expect(scopeTeam(ctx)).toBe(false);
  });

  it('scopeTenant: MUST match on same tenantId', () => {
    const ctx = makeCtx({ resourceInstance: { attributes: { tenantId: 'org1' } } });
    expect(scopeTenant(ctx)).toBe(true);
  });

  it('scopeTenant: MUST deny on different tenantId', () => {
    const ctx = makeCtx({ resourceInstance: { attributes: { tenantId: 'org2' } } });
    expect(scopeTenant(ctx)).toBe(false);
  });

  it('scopeOrg: MUST match on same orgId', () => {
    const ctx = makeCtx({
      user: { id: 'u1', roles: [], attributes: { teamId: 't1', tenantId: 'org1', orgId: 'org1' } },
      resourceInstance: { attributes: { orgId: 'org1' } },
    });
    expect(scopeOrg(ctx)).toBe(true);
  });
});

describe('role()', () => {
  it('MUST create role with name', () => {
    const r = role('admin');
    expect(r.name).toBe('admin');
    expect(r.permissions).toEqual([]);
  });

  it('MUST create role with permissions and inheritance', () => {
    const r = role('editor', {
      permissions: [perm('post', 'edit')],
      inherits: ['viewer'],
    });
    expect(r.permissions).toHaveLength(1);
    expect(r.inherits).toEqual(['viewer']);
  });
});

describe('user()', () => {
  it('MUST create user with id', () => {
    const u = user('usr_1');
    expect(u.id).toBe('usr_1');
    expect(u.roles).toEqual([]);
  });

  it('MUST create user with roles and attributes', () => {
    const u = user('usr_2', {
      roles: ['admin'],
      attributes: { dept: 'eng' },
    });
    expect(u.roles).toEqual(['admin']);
    expect(u.attributes).toEqual({ dept: 'eng' });
  });
});
