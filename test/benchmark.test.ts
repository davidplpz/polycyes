import { describe, it, expect } from 'vitest';
import { Engine, InMemoryPolicyStore, perm, role, user } from '../src/index.js';
import { CachedPolicyStore } from '../src/cached-store.js';

describe('Benchmarks', () => {
  it('check() throughput', async () => {
    const store = new InMemoryPolicyStore({ strictMode: false });
    const engine = new Engine(store);

    await store.addRole(role('viewer', {
      permissions: [perm('post', 'read')],
    }));
    await store.setUserRoles('usr_1', ['viewer']);

    const N = 500;
    const start = performance.now();
    for (let i = 0; i < N; i++) {
      await engine.check({
        user: user('usr_1'),
        resource: 'post',
        action: 'read',
      });
    }
    const elapsed = performance.now() - start;

    console.log(`\n  check() × ${N}: ${elapsed.toFixed(1)}ms (${(elapsed / N).toFixed(3)}ms/op)`);

    const result = await engine.check({
      user: user('usr_1'),
      resource: 'post',
      action: 'read',
    });
    expect(result.allowed).toBe(true);
  });

  it('checkMany() vs N×check()', async () => {
    const store = new InMemoryPolicyStore({ strictMode: false });
    const engine = new Engine(store, { resolvedCacheTTL: 0 });

    await store.addRole(role('viewer', {
      permissions: [perm('post', 'read')],
    }));
    await store.setUserRoles('usr_1', ['viewer']);

    const inputs = Array.from({ length: 50 }, () => ({
      user: user('usr_1'),
      resource: 'post',
      action: 'read',
    }));

    const startBatch = performance.now();
    const batchResult = await engine.checkMany(inputs);
    const batchTime = performance.now() - startBatch;

    engine.clearCache();
    const startIndividual = performance.now();
    for (const input of inputs) {
      await engine.check(input);
    }
    const individualTime = performance.now() - startIndividual;

    console.log(`\n  checkMany(${inputs.length}): ${batchTime.toFixed(1)}ms`);
    console.log(`  N×check(${inputs.length}): ${individualTime.toFixed(1)}ms`);

    expect(batchResult.every((r) => r.allowed)).toBe(true);
  });

  it('CachedPolicyStore vs plain store', async () => {
    const plain = new InMemoryPolicyStore({ strictMode: false });
    await plain.addRole(role('viewer', { permissions: [perm('post', 'read')] }));
    await plain.setUserRoles('usr_1', ['viewer']);

    const cachedInner = new InMemoryPolicyStore({ strictMode: false });
    await cachedInner.addRole(role('viewer', { permissions: [perm('post', 'read')] }));
    await cachedInner.setUserRoles('usr_1', ['viewer']);
    const cached = new CachedPolicyStore({ store: cachedInner, ttl: 30_000 });

    const enginePlain = new Engine(plain, { resolvedCacheTTL: 0 });
    const engineCached = new Engine(cached, { resolvedCacheTTL: 0 });

    // Warm up caches
    await enginePlain.check({ user: user('usr_1'), resource: 'post', action: 'read' });
    await engineCached.check({ user: user('usr_1'), resource: 'post', action: 'read' });

    const N = 200;
    const startPlain = performance.now();
    for (let i = 0; i < N; i++) {
      await enginePlain.check({ user: user('usr_1'), resource: 'post', action: 'read' });
    }
    const plainTime = performance.now() - startPlain;

    const startCached = performance.now();
    for (let i = 0; i < N; i++) {
      await engineCached.check({ user: user('usr_1'), resource: 'post', action: 'read' });
    }
    const cachedTime = performance.now() - startCached;

    console.log(`\n  Plain store ${N}×check: ${plainTime.toFixed(1)}ms`);
    console.log(`  Cached store ${N}×check: ${cachedTime.toFixed(1)}ms`);

    expect(true).toBe(true);
  });
});
