import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConditionEvaluator } from '../src/conditions.js';
import type { Permission, EvalContext } from '../src/types.js';
import { EmptyConditionArrayError, ConditionEvaluationError, ConditionTimeoutError } from '../src/errors.js';

function makeCtx(overrides: Partial<EvalContext> = {}): EvalContext {
  return {
    user: { id: 'u1', roles: [] },
    resource: 'post',
    action: 'read',
    timeoutMs: 5000,
    get userAttributes() { return this.user.attributes; },
    get resourceAttributes() { return undefined; },
    ...overrides,
  };
}

function makePerm(overrides: Partial<Permission> = {}): Permission {
  return {
    resource: 'post',
    action: 'read',
    ...overrides,
  };
}

describe('ConditionEvaluator', () => {
  let evaluator: ConditionEvaluator;

  beforeEach(() => {
    evaluator = new ConditionEvaluator();
  });

  it('MUST return true when no condition is set', async () => {
    const perm = makePerm({ condition: undefined });
    await expect(evaluator.evaluate(makeCtx(), perm)).resolves.toBe(true);
  });

  it('MUST return true when a single condition passes', async () => {
    const perm = makePerm({ condition: [() => true] });
    await expect(evaluator.evaluate(makeCtx(), perm)).resolves.toBe(true);
  });

  it('MUST return false when a single condition fails', async () => {
    const perm = makePerm({ condition: [() => false] });
    await expect(evaluator.evaluate(makeCtx(), perm)).resolves.toBe(false);
  });

  it('MUST support async conditions', async () => {
    const perm = makePerm({ condition: [async () => true] });
    await expect(evaluator.evaluate(makeCtx(), perm)).resolves.toBe(true);
  });

  it('MUST return true when all conditions pass (default mode all)', async () => {
    const perm = makePerm({
      condition: [() => true, () => true, () => true],
    });
    await expect(evaluator.evaluate(makeCtx(), perm)).resolves.toBe(true);
  });

  it('MUST return false when any condition fails in mode all', async () => {
    const perm = makePerm({
      condition: [() => true, () => false, () => true],
    });
    await expect(evaluator.evaluate(makeCtx(), perm)).resolves.toBe(false);
  });

  it('MUST return true when any condition passes in mode any', async () => {
    const perm = makePerm({
      condition: [() => false, () => true, () => false],
      conditionMode: 'any',
    });
    await expect(evaluator.evaluate(makeCtx(), perm)).resolves.toBe(true);
  });

  it('MUST return false when all conditions fail in mode any', async () => {
    const perm = makePerm({
      condition: [() => false, () => false],
      conditionMode: 'any',
    });
    await expect(evaluator.evaluate(makeCtx(), perm)).resolves.toBe(false);
  });

  it('MUST throw EmptyConditionArrayError on empty array', async () => {
    const perm = makePerm({ condition: [] });
    await expect(evaluator.evaluate(makeCtx(), perm)).rejects.toThrow(EmptyConditionArrayError);
  });

  it('MUST throw ConditionEvaluationError on non-boolean return', async () => {
    const perm = makePerm({ condition: [() => 'not boolean' as unknown as boolean] });
    await expect(evaluator.evaluate(makeCtx(), perm)).rejects.toThrow(ConditionEvaluationError);
  });

  it('MUST throw ConditionEvaluationError on object return', async () => {
    const perm = makePerm({ condition: [() => ({}) as unknown as boolean] });
    await expect(evaluator.evaluate(makeCtx(), perm)).rejects.toThrow(ConditionEvaluationError);
  });

  it('MUST throw ConditionTimeoutError when condition exceeds timeout', async () => {
    vi.useFakeTimers();
    const perm = makePerm({
      condition: [() => new Promise<boolean>(() => { /* never resolves */ })],
    });
    const ctx = makeCtx({ timeoutMs: 100 });

    const evalPromise = evaluator.evaluate(ctx, perm);
    vi.advanceTimersByTime(150);
    await expect(evalPromise).rejects.toThrow(ConditionTimeoutError);
    vi.useRealTimers();
  });

  it('MUST NOT timeout when timeoutMs is 0', async () => {
    const perm = makePerm({ condition: [() => true] });
    const ctx = makeCtx({ timeoutMs: 0 });
    await expect(evaluator.evaluate(ctx, perm)).resolves.toBe(true);
  });

  it('MUST pass the eval context to the condition', async () => {
    let capturedCtx: unknown = null;
    const perm = makePerm({
      condition: [(ctx) => { capturedCtx = ctx; return true; }],
    });
    const ctx = makeCtx({ resource: 'custom-resource' });
    await evaluator.evaluate(ctx, perm);
    expect((capturedCtx as EvalContext).resource).toBe('custom-resource');
  });
});
