import { describe, it, expect } from 'vitest';
import { Engine, InMemoryPolicyStore, perm, role, user } from '../src/index.js';
import { CachedPolicyStore } from '../src/cached-store.js';
import { MetricsPolicyStore } from '../src/store-decorators.js';

describe('Integration: decorator chain', () => {
  it('MUST produce correct results through InMemory → Cached → Metrics chain', async () => {
    const memory = new InMemoryPolicyStore({ strictMode: false });
    const cached = new CachedPolicyStore({ store: memory, ttl: 0 });
    const metrics = new MetricsPolicyStore(cached);

    await metrics.addRole(role('viewer', {
      permissions: [perm('post', 'read')],
    }));
    await metrics.setUserRoles('usr_1', ['viewer']);

    const engine = new Engine(metrics);

    const result = await engine.check({
      user: user('usr_1'),
      resource: 'post',
      action: 'read',
    });

    expect(result.allowed).toBe(true);

    const m = metrics.getMetrics();
    expect(m.getRolesByNames.count).toBeGreaterThan(0);
    expect(m.setUserRoles.count).toBe(1);
    expect(m.getUserRoles.count).toBeGreaterThan(0);
  });

  it('MUST support addUserRole / removeUserRole through chain', async () => {
    const memory = new InMemoryPolicyStore({ strictMode: false });
    const cached = new CachedPolicyStore({ store: memory, ttl: 0 });
    const metrics = new MetricsPolicyStore(cached);

    await metrics.addRole(role('editor', {
      permissions: [perm('post', 'edit')],
    }));
    await metrics.setUserRoles('usr_2', []);

    const engine = new Engine(metrics, { resolvedCacheTTL: 0 });

    let result = await engine.check({
      user: user('usr_2'),
      resource: 'post',
      action: 'edit',
    });
    expect(result.allowed).toBe(false);

    await metrics.addUserRole('usr_2', 'editor');

    result = await engine.check({
      user: user('usr_2'),
      resource: 'post',
      action: 'edit',
    });
    expect(result.allowed).toBe(true);

    await metrics.removeUserRole('usr_2', 'editor');

    result = await engine.check({
      user: user('usr_2'),
      resource: 'post',
      action: 'edit',
    });
    expect(result.allowed).toBe(false);

    const m = metrics.getMetrics();
    expect(m.addUserRole.count).toBe(1);
    expect(m.removeUserRole.count).toBe(1);
  });

  it('MUST support checkMany through decorator chain', async () => {
    const memory = new InMemoryPolicyStore({ strictMode: false });
    const cached = new CachedPolicyStore({ store: memory, ttl: 0 });
    const metrics = new MetricsPolicyStore(cached);

    await metrics.addRole(role('viewer', {
      permissions: [perm('post', 'read')],
    }));
    await metrics.setUserRoles('usr_1', ['viewer']);

    const engine = new Engine(metrics);
    const results = await engine.checkMany([
      { user: user('usr_1'), resource: 'post', action: 'read' },
      { user: user('usr_1'), resource: 'post', action: 'delete' },
      { user: user('usr_2'), resource: 'post', action: 'read' },
    ]);

    expect(results[0].allowed).toBe(true);
    expect(results[1].allowed).toBe(false);
    expect(results[2].allowed).toBe(false);
  });

  it('MUST support filter through decorator chain', async () => {
    const memory = new InMemoryPolicyStore({ strictMode: false });
    const cached = new CachedPolicyStore({ store: memory, ttl: 0 });
    const metrics = new MetricsPolicyStore(cached);

    await metrics.addRole(role('editor', {
      permissions: [perm('post', 'edit', { scope: 'own' })],
    }));
    await metrics.setUserRoles('usr_1', ['editor']);

    const engine = new Engine(metrics);
    const result = await engine.filter({
      user: user('usr_1'),
      action: 'edit',
      resourceType: 'post',
      resources: [
        { id: 'p1', ownerId: 'usr_1' },
        { id: 'p2', ownerId: 'usr_2' },
        { id: 'p3', ownerId: 'usr_1' },
      ],
    });

    expect(result.allowed).toHaveLength(2);
    expect(result.denied).toHaveLength(1);
    expect(result.allowed.map((r) => r.id)).toEqual(['p1', 'p3']);
    expect(result.denied[0].id).toBe('p2');
  });
});
