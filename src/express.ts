import type { Engine, CheckInput } from './index.js';

// ============================================================================
// Express Adapter
//
// Conecta polycyes con Express en una línea de middleware.
// ============================================================================

/**
 * Traduce un Express Request a CheckInput.
 * Personalizala si tu auth middleware usa otra estructura.
 *
 * @example
 * ```ts
 * const mapper: ExpressAuthzMapper = (req) => ({
 *   user: req.user!,
 *   resource: req.params.resource ?? req.baseUrl,
 *   action: req.method.toLowerCase(),
 *   resourceInstance: req.params.id ? { id: req.params.id } : undefined,
 * })
 * ```
 */
export type ExpressAuthzMapper = (req: ExpressRequest) => CheckInput;

/** Interfaz mínima de Express Request que necesita el adapter. */
export interface ExpressRequest {
  user?: CheckInput['user'];
  method: string;
  params: Record<string, string>;
  baseUrl: string;
  body?: Record<string, unknown>;
}

/**
 * Middleware de autorización para Express.
 * Usa el mapper para construir CheckInput, evalúa con el engine,
 * y responde 403 si el permiso es denegado.
 *
 * @example
 * ```ts
 * import { authz, defaultMapper } from 'polycyes/express';
 *
 * app.put('/posts/:id', authz(engine, defaultMapper), handler);
 * ```
 */
export function authz(
  engine: Engine,
  mapper: ExpressAuthzMapper,
): (req: ExpressRequest, res: ExpressResponse, next: ExpressNext) => void {
  return (req, res, next) => {
    const input = mapper(req);
    engine.check(input).then((result) => {
      if (result.allowed) return next();
      res.status(403).json({ error: result.reason });
    }).catch(next);
  };
}

/** Mapper por defecto: método HTTP → action, baseUrl → resource. */
export const defaultMapper: ExpressAuthzMapper = (req) => ({
  user: req.user!,
  resource: req.baseUrl.replace(/^\//, '') || 'unknown',
  action: req.method.toLowerCase(),
  resourceInstance: req.params.id ? { id: req.params.id } : undefined,
});

interface ExpressResponse {
  status(code: number): { json(body: unknown): void };
}

type ExpressNext = (err?: unknown) => void;
