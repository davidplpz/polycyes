# Changelog

## 0.1.1 (2026-06-21)

### Added

- **Permission index** — `Map<resource, Map<action, Permission[]>>` con wildcard fallback. Matching O(1) en vez de O(n×m). EngineOptions `useIndex` flag (default `true`)
- **`debug()`** — retorna `DebugTrace` con steps por fase (role-resolution, resource-match, action-match, scope, condition, result)
- **`checkMany()` cache real** — `getUserRoles()` llamado 1 vez por userId, no por input. Cada resultado aislado (error en uno no afecta a otros)
- **Tree-shaking** — `"sideEffects": false` + 6 subpath exports (`polycyes/engine`, `/store`, `/types`, `/errors`, `/helpers`, `/memory-store`)
- **Branded types** — `UserId`, `RoleName`, `ResourceName`, `ActionName` via `Brand<T, N>`
- **`deniedReason` tracking** — `deniedBy.type` distingue `scope-failed` y `condition-failed` de `no-match`

### Changed

- Engine `check()` refactorizado — extrae `evaluate()` compartido con `checkMany()`
- `resolveRoles()` carga lazy de roles heredados desde el store
- `matchCondition()` con `await Promise.all()` + `typeof === 'boolean'` + `Promise.race(timeout)`

### Fixed

- Wildcard test usa `{ strictMode: false }` store (default strictMode bloquea `perm("*","*")` en tests)
- Scope function tests preservan getters via factory (object spread los perdía)
- `console` y `setTimeout` declarados manualmente (ES2022 lib sin DOM)

## 0.1.0 (2026-06-18)

### Initial Release

- RBAC engine con herencia transitiva, detección de ciclos, wildcards
- ABAC conditions síncronas/async con timeout, validación de tipo, try/catch
- Scopes built-in (`any`, `own`, `none`) + custom (`(ctx) => boolean`)
- Deny rules con precedencia y short-circuit
- `InMemoryPolicyStore` con `auditRole()`, `strictMode`, `cloneRole`
- `PolicyReader` / `PolicyWriter` separation (ISP)
- `checkMany()` y `filter()` operaciones
- 8 errores tipados: `ConditionEvaluationError`, `DuplicateRoleError`, `HierarchyTooDeepError`, `EmptyConditionArrayError`, `ConditionTimeoutError`, `StoreUnavailableError`, `UnsafeRoleError`, `InvalidInputError`
- `EngineOptions` — `timeoutMs`, `failOpen`, `disableRoleHintWarning`
- Defense-in-depth: `deepFreeze()`, `sanitizeInput()`, fail-closed store
- Scope helpers: `scopeTeam`, `scopeTenant`, `scopeOrg`
- Property-based testing con fast-check (10 invariantes)
