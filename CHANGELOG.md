# Changelog

## Unreleased

### Added

- **`CachedPolicyStore`** — TTL-based cache wrapper for any `PolicyStore` with configurable TTL per type (role vs userRoles), automatic invalidation on writes, inflight request deduplication, and `clearCache()` + `cacheStats()` for monitoring. Export: `polycyes/cached-store`
- **Store decorators** — Composable wrappers: `LoggingPolicyStore` (configurable logging with timing), `MetricsPolicyStore` (call count + totalMs + errors per method), `FailOpenPolicyStore` (returns null/[] on store errors). Export: `polycyes/store-decorators`
- **Batch resolveRoles** — 2-phase algorithm eliminates N+1 on role inheritance. Phase 1 discovers all parent roles via iterative `getRolesByNames` (batched), Phase 2 resolves synchronously. Zero individual `getRole()` calls during resolution.
- **`timeoutMs: 0`** — Engine now accepts `timeoutMs: 0` as "no timeout". Conditions execute without `Promise.race` overhead. Negative values throw `InvalidEngineOptionError`.
- **Spanish docs** — `README.es.md` + `CHANGELOG.es.md` with full documentation in Spanish

### Changed

- Engine constructor now throws `InvalidEngineOptionError` instead of bare `Error` for invalid options

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
