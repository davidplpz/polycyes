import type { Permission, EvalContext } from './types.js';
import {
  ConditionEvaluationError,
  EmptyConditionArrayError,
  ConditionTimeoutError,
} from './errors.js';

declare function setTimeout(cb: () => void, ms: number): number;

export class ConditionEvaluator {
  async evaluate(ctx: EvalContext, permission: Permission): Promise<boolean> {
    if (permission.condition === undefined) return true;

    const conditions = Array.isArray(permission.condition)
      ? permission.condition
      : [permission.condition];

    if (conditions.length === 0) {
      throw new EmptyConditionArrayError(permission);
    }

    const mode = permission.conditionMode ?? 'all';
    const timeoutMs = ctx.timeoutMs;

    try {
      const results = await Promise.all(
        conditions.map(async (c) => {
          const raw = timeoutMs && timeoutMs > 0
            ? await Promise.race([
                Promise.resolve(c(ctx)),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new ConditionTimeoutError(permission, timeoutMs)), timeoutMs),
                ),
              ])
            : await c(ctx);
          if (typeof raw !== 'boolean') {
            throw new ConditionEvaluationError(
              permission,
              new TypeError(`Condition returned ${typeof raw}, expected boolean`),
            );
          }
          return raw;
        }),
      );
      return mode === 'all' ? results.every(Boolean) : results.some(Boolean);
    } catch (err) {
      if (err instanceof ConditionTimeoutError) throw err;
      if (err instanceof EmptyConditionArrayError) throw err;
      if (err instanceof ConditionEvaluationError) throw err;
      throw new ConditionEvaluationError(permission, err);
    }
  }
}
