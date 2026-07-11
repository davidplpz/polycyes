# Changelog

## 0.2.0 (2026-07-11)

### Added

- **`CachedPolicyStore`** — TTL-based cache wrapper for any `PolicyStore` with configurable TTL per type (role vs userRoles), automatic invalidation on writes, inflight request deduplication, and `clearCache()` + `cacheStats()` for monitoring. Export: `polycyes/cached-store`
- **Store decorators** — Composable wrappers: `LoggingPolicyStore` (configurable logging with timing), `MetricsPolicyStore` (call count + totalMs + errors per method), `FailOpenPolicyStore` (returns null/[] on store errors). Export: `polycyes/store-decorators`
- **Batch resolveRoles** — 2-phase algorithm eliminates N+1 on role inheritance. Phase 1 discovers all parent roles via iterative `getRolesByNames` (batched), Phase 2 resolves synchronously. Zero individual `getRole()` calls during resolution.
- **`timeoutMs: 0`** — Engine now accepts `timeoutMs: 0` as "no timeout". Conditions execute without `Promise.race` overhead. Negative values throw `InvalidEngineOptionError`.
- **`addUserRole` / `removeUserRole`** — incremental role management on `PolicyWriter`. `addUserRole(userId, roleName)` appends a role, `removeUserRole(userId, roleName)` removes it. All 5 store implementations support it.
- **`createEngine()` factory** — one-liner: `const engine = createEngine(store, options?)`. Convenience wrapper around `new Engine(store, options)`.
- **Resolved cache** — `EngineOptions.resolvedCacheTTL` (default 0). Caches resolved role chains per userId to avoid repeated `getRolesByNames` + inheritance resolution on consecutive `check()` calls for the same user.
- **`engine.getStore()`** — exposes the underlying `PolicyReader` for diagnostic access.
- **Express async middleware** — `polycyes/express` `authz()` now supports async resource/action/resourceInstance mappers.
- **Integration tests** — `test/integration.test.ts`: decorator chain (InMemory→Cached→Metrics), addUserRole/removeUserRole flow, checkMany, filter.
- **Benchmark tests** — `test/benchmark.test.ts`: `check()` throughput (500 ops), `checkMany` vs N×`check` (50 inputs), CachedPolicyStore vs plain store comparison.
- **Property tests** — 8 new invariants: `checkMany` equivalence, `addUserRole`/`removeUserRole` idempotent/reversible/safe, resolved cache on/off equivalence.
- **Spanish docs** — `README.es.md` + `CHANGELOG.es.md` with full documentation in Spanish.
- **`engines` field** — `"node": ">=20"` in `package.json`.

### Changed

- Engine constructor now throws `InvalidEngineOptionError` instead of bare `Error` for invalid options.
- CI matrix: dropped Node 18 (EOL, incompatible with rolldown in Vitest 3.x), now runs on Node 20 and 22.
- **Cache-before-store in `evaluate()`** — resolved cache checked BEFORE `getUserRoles()`. Cache hit eliminates the store call entirely.
- **Shallow freeze replaces deepFreeze** — `Object.freeze` on `user`, `user.attributes`, `resourceInstance`, `resourceInstance.attributes` only. Same protection, no hot-path allocation.
- **`debug()` single evaluation** — calls `evaluate()` once and reuses the result. No more double condition evaluation.
- **Express adapter async** — `authz()` middleware is now `async` with `try/catch`. Compatible with Express 4 + 5.
- **FailOpenPolicyStore full PolicyStore** — Now implements the complete `PolicyStore` interface (including write methods), fixing LSP violation.
- **Direct imports in Express adapter** — `express.ts` imports from source files, not barrel. No circular deps.

### Fixed

- LSP violation in `FailOpenPolicyStore` — now implements full `PolicyStore` interface
- `CachedPolicyStore` cacheStats now tracks `addUserRole` and `removeUserRole`
- `debug()` no longer evaluates conditions twice
- Engine `resolvedCacheTTL` validated for `NaN` and negative values via `InvalidEngineOptionError`

## 0.1.3 (2026-06-21)

### Added

- **Express adapter** — `polycyes/express` with `authz(engine, mapper)` middleware, `defaultMapper` (method → action), and `ExpressAuthzMapper` type
- **CI/CD** — GitHub Actions workflow: test + tsc + build on Node 18, 20, 22

## 0.1.1 (2026-06-21)

### Added

- **Permission index** — `Map<resource, Map<action, Permission[]>>` with wildcard fallback chain. O(1) matching instead of O(n×m). `EngineOptions.useIndex` flag (default `true`)
- **`debug()`** — returns `DebugTrace` with steps per phase (role-resolution, resource-match, action-match, scope, condition, result)
- **`checkMany()` real cache** — `getUserRoles()` called once per userId, not once per input. Each result isolated (error in one doesn't affect others)
- **Tree-shaking** — `"sideEffects": false` + 6 subpath exports (`polycyes/engine`, `/store`, `/types`, `/errors`, `/helpers`, `/memory-store`)
- **Branded types** — `UserId`, `RoleName`, `ResourceName`, `ActionName` via `Brand<T, N>`
- **`deniedReason` tracking** — `deniedBy.type` distinguishes `scope-failed` and `condition-failed` from `no-match`

### Changed

- Engine `check()` refactored — extracted shared `evaluate()` used by `checkMany()`
- `resolveRoles()` lazy-loads inherited roles from store
- `matchCondition()` uses `await Promise.all()` + `typeof === 'boolean'` validation + `Promise.race(timeout)`

### Fixed

- Wildcard test uses `{ strictMode: false }` store (default strictMode blocks `perm("*","*")` in tests)
- Scope function tests preserve getters via factory (object spread destroys them)
- `console` and `setTimeout` declared manually (ES2022 lib without DOM)

## 0.1.0 (2026-06-18)

### Initial Release

- RBAC engine with transitive inheritance, cycle detection, wildcards
- Sync/async ABAC conditions with timeout, type validation, try/catch
- Built-in scopes (`any`, `own`, `none`) + custom (`(ctx) => boolean`)
- Deny rules with precedence and short-circuit
- `InMemoryPolicyStore` with `auditRole()`, `strictMode`, `cloneRole`
- `PolicyReader` / `PolicyWriter` separation (ISP)
- `checkMany()` and `filter()` operations
- 8 typed errors: `ConditionEvaluationError`, `DuplicateRoleError`, `HierarchyTooDeepError`, `EmptyConditionArrayError`, `ConditionTimeoutError`, `StoreUnavailableError`, `UnsafeRoleError`, `InvalidInputError`
- `EngineOptions` — `timeoutMs`, `failOpen`, `disableRoleHintWarning`
- Defense-in-depth: `deepFreeze()`, `sanitizeInput()`, fail-closed store
- Scope helpers: `scopeTeam`, `scopeTenant`, `scopeOrg`
- Property-based testing with fast-check (10 invariants)
