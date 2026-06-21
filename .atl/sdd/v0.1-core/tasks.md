# Tasks: polycyes v0.1 Core Engine

## Phase 1: Foundation — Types & Contracts

- [x] 1.1 `src/types.ts`: Add `PermissionEffect`, `ScopeFunction` union, `Condition` async+array type, `ConditionMode`, `EvalContext.timeoutMs`, `CheckResult.matchedRole/matchedPermission/deniedBy/evaluatedAt`, `DeniedBy` union, `EngineOptions`, `FilterInput`, `FilterResult`
- [x] 1.2 `src/errors.ts`: Add `ConditionEvaluationError`, `DuplicateRoleError`, `HierarchyTooDeepError`, `EmptyConditionArrayError`, `ConditionTimeoutError`, `StoreUnavailableError`, `UnsafeRoleError`, `InvalidEngineOptionError`, `InvalidInputError`
- [x] 1.3 `src/store.ts`: Split into `PolicyReader` (getRole, getRolesByNames, getUserRoles) + `PolicyWriter` (addRole, updateRole, deleteRole, setUserRoles) + `PolicyStore extends PolicyReader, PolicyWriter`
- [x] 1.4 Verify: `npx tsc --noEmit` passes on foundation types (types+errors+store compile; memory-store.ts expected error → task 2.1)

## Phase 2: Infrastructure — Store & Helpers

- [x] 2.1 `src/memory-store.ts`: Implement `PolicyStore` interface. Add `getRolesByNames()` batch, `auditRole()` in `addRole()` with WILDCARD_GOD_MODE + EMPTY_ROLE_INHERITS_HIGH_TRUST detection. `strictMode` option. `structuredClone` on write → `cloneRole()` (functions can't be cloned). `DuplicateRoleError` on duplicate add. `clear()` utility
- [x] 2.2 `src/helpers.ts`: Add `effect`, `conditionMode` params to `perm()`. Accept single condition or array. Export `scopeTeam`, `scopeTenant`, `scopeOrg` helpers
- [x] 2.3 Verify: `npx tsc --noEmit` passes, store unit: addRole/getRole/getRolesByNames/getUserRoles/duplicate detection. All 69 new tests green. 12 engine tests failing (expected)

## Phase 3: Core — Engine Implementation

- [x] 3.1 `src/engine.ts` — RBAC basics: full `check()` with store.getUserRoles → resolveRoles (batch+lazy-load) → iterate permissions → match → CheckResult structured output. 9/9 RBAC/scope/inheritance/wildcard tests pass
- [x] 3.2 `src/engine.ts` — Deny rules: bestAllow/bestDeny tracking, effect precedence, short-circuit break on deny within role. deniedBy.type='explicit-deny'
- [x] 3.3 `src/engine.ts` — ABAC conditions: buildEvalContext(deepFreeze) once per check. matchConditions() with await Promise.all + typeof==='boolean' + Promise.race(timeout). undefined→pass, []=>EmptyConditionArrayError. AND/OR modes. 2/2 ABAC tests pass
- [x] 3.4 `src/engine.ts` — Security: sanitizeInput() stripping proto/constructor/prototype recursively. StoreUnavailableError on store failure. Fail-open opt-in. Dev-mode user.roles hint warning
- [x] 3.5 `src/engine.ts` — Batch: checkMany() with error isolation. filter() basic implementation
- [ ] 3.6 `src/engine.ts` — Performance: buildPermissionIndex(), debug() trace method (deferred for Phase 4+)
- [x] 3.7 `src/index.ts`: Export all new types, errors, helpers, EngineOptions, PolicyReader, PolicyWriter

## Phase 4: Verification

- [x] 4.1 Make all 12 existing tests pass: `npm test` green
- [x] 4.2 Add security tests: async condition bypass (CRITICAL #1), empty array open-access (CRITICAL #2), condition timeout, prototype pollution, store failure fail-closed, deepFreeze mutation attempt, input validation, checkMany error isolation
- [x] 4.3 Add property-based tests with fast-check: deny>allow, inheritance transitive, cycle detection, no side effects, empty input fast-fail, scope own without ownerId, non-boolean reject, empty array error
- [x] 4.4 Final verification: `npx tsc --noEmit` + `npm test` all green. All spec scenarios covered by ≥1 test
