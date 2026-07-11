import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';

import { Engine, InMemoryPolicyStore, perm, role, user } from '../src/index.js';
import { PolycyesModule, PolycyesGuard, Permissions } from '../src/nestjs/index.js';
import { POLYCYES_PERMISSIONS } from '../src/nestjs/polycyes.constants.js';

// ---------------------------------------------------------------------------
// Permissions decorator
// ---------------------------------------------------------------------------

describe('Permissions decorator', () => {
  it('MUST set metadata with resource and action', () => {
    const handler = () => {};
    Permissions('post', 'edit')(handler, 'use', { value: handler } as PropertyDescriptor);

    const meta = Reflect.getMetadata(POLYCYES_PERMISSIONS, handler);
    expect(meta).toEqual({ resource: 'post', action: 'edit' });
  });

  it('MUST NOT interfere with other metadata keys', () => {
    const handler = () => {};
    Reflect.defineMetadata('custom', { foo: 'bar' }, handler);
    Permissions('post', 'read')(handler, 'use', { value: handler } as PropertyDescriptor);

    const custom = Reflect.getMetadata('custom', handler);
    expect(custom).toEqual({ foo: 'bar' });
  });
});

// ---------------------------------------------------------------------------
// PolycyesGuard
// ---------------------------------------------------------------------------

describe('PolycyesGuard', () => {
  let engine: Engine;
  let store: InMemoryPolicyStore;

  beforeEach(async () => {
    store = new InMemoryPolicyStore({ strictMode: false });
    await store.addRole({ name: 'admin', permissions: [{ resource: 'post', action: '*' }] });
    await store.addRole({ name: 'viewer', permissions: [{ resource: 'post', action: 'read' }] });
    engine = new Engine(store);
  });

  it('MUST allow access when permission is granted', async () => {
    await store.setUserRoles('usr_1', ['admin']);

    const mod = await Test.createTestingModule({
      imports: [PolycyesModule.forRoot(engine)],
    }).compile();

    const guard = mod.get(PolycyesGuard);
    const handler = () => {};
    Permissions('post', 'edit')(handler, 'use', { value: handler } as PropertyDescriptor);

    const ctx = {
      getType: () => 'http',
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({ user: user('usr_1') }),
      }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('MUST deny access with ForbiddenException when permission is denied', async () => {
    await store.setUserRoles('usr_1', ['viewer']);

    const mod = await Test.createTestingModule({
      imports: [PolycyesModule.forRoot(engine)],
    }).compile();

    const guard = mod.get(PolycyesGuard);
    const handler = () => {};
    Permissions('post', 'delete')(handler, 'use', { value: handler } as PropertyDescriptor);

    const ctx = {
      getType: () => 'http',
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({ user: user('usr_1') }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('MUST allow access when no Permissions metadata is set (passthrough)', async () => {
    const mod = await Test.createTestingModule({
      imports: [PolycyesModule.forRoot(engine)],
    }).compile();

    const guard = mod.get(PolycyesGuard);
    const handler = () => {};

    const ctx = {
      getType: () => 'http',
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({ user: user('usr_1') }),
      }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('MUST throw ForbiddenException when user is missing from request', async () => {
    const mod = await Test.createTestingModule({
      imports: [PolycyesModule.forRoot(engine)],
    }).compile();

    const guard = mod.get(PolycyesGuard);
    const handler = () => {};
    Permissions('post', 'read')(handler, 'use', { value: handler } as PropertyDescriptor);

    const ctx = {
      getType: () => 'http',
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({}),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('MUST use custom getUser extractor from module options', async () => {
    await store.setUserRoles('usr_2', ['admin']);

    const mod = await Test.createTestingModule({
      imports: [
        PolycyesModule.forRoot(engine, {
          getUser: (req: any) => user(req.myUser),
        }),
      ],
    }).compile();

    const guard = mod.get(PolycyesGuard);
    const handler = () => {};
    Permissions('post', 'edit')(handler, 'use', { value: handler } as PropertyDescriptor);

    const ctx = {
      getType: () => 'http',
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({ myUser: 'usr_2' }),
      }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('MUST passthrough for non-HTTP contexts (GraphQL, WS, RPC)', async () => {
    const mod = await Test.createTestingModule({
      imports: [PolycyesModule.forRoot(engine)],
    }).compile();

    const guard = mod.get(PolycyesGuard);
    const handler = () => {};
    Permissions('post', 'delete')(handler, 'use', { value: handler } as PropertyDescriptor);

    const ctx = {
      getType: () => 'graphql',
      getHandler: () => handler,
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('MUST pass resourceInstance and metadata when extractors are provided', async () => {
    await store.setUserRoles('usr_1', ['admin']);

    const getResourceInstance = vi.fn().mockReturnValue({ id: 'post_1', ownerId: 'usr_1' });
    const getMetadata = vi.fn().mockReturnValue({ ip: '127.0.0.1' });

    const mod = await Test.createTestingModule({
      imports: [
        PolycyesModule.forRoot(engine, {
          getResourceInstance,
          getMetadata,
        }),
      ],
    }).compile();

    const guard = mod.get(PolycyesGuard);
    const handler = () => {};
    Permissions('post', 'edit')(handler, 'use', { value: handler } as PropertyDescriptor);

    const ctx = {
      getType: () => 'http',
      getHandler: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({ user: user('usr_1'), params: { id: 'post_1' } }),
      }),
    } as unknown as ExecutionContext;

    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
    expect(getResourceInstance).toHaveBeenCalled();
    expect(getMetadata).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PolycyesModule
// ---------------------------------------------------------------------------

describe('PolycyesModule', () => {
  it('MUST provide PolycyesGuard', async () => {
    const engine = new Engine(new InMemoryPolicyStore({ strictMode: false }));
    const mod = await Test.createTestingModule({
      imports: [PolycyesModule.forRoot(engine)],
    }).compile();

    const guard = mod.get(PolycyesGuard);
    expect(guard).toBeInstanceOf(PolycyesGuard);
  });

  it('MUST be global (no need to re-import)', async () => {
    const engine = new Engine(new InMemoryPolicyStore({ strictMode: false }));
    const mod = await Test.createTestingModule({
      imports: [PolycyesModule.forRoot(engine)],
    }).compile();

    expect(mod.get(PolycyesGuard)).toBeDefined();
  });
});
