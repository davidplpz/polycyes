# v0.1-core Proposal

## Intent

Build polycyes v0.1 — a framework-agnostic TypeScript authorization engine combining RBAC (role-based) and ABAC (attribute-based) access control in a single typed, testable library. Zero runtime dependencies. Policies defined in TypeScript, not config files or DSLs.

## Scope

### In Scope (v0.1)

- Permission model (Permission, Role, User, CheckInput, CheckResult)
- Engine.check() with resource/action matching, scopes (any/own/none + custom), wildcards (*, namespace), deny rules
- Role inheritance (transitive, cycle detection, max 50 depth)
- ABAC conditions (sync/async, AND/OR composition, per-condition timeout, fail-closed)
- PolicyStore interface (PolicyReader + PolicyWriter separation)
- InMemoryPolicyStore for dev/tests
- checkMany() batch evaluation with user-role caching
- filter() for row-level security
- Typed errors (ConditionEvaluationError, CircularRoleHierarchyError, EmptyConditionArrayError, etc.)
- EngineOptions (timeoutMs, failOpen, disableRoleHintWarning)
- Security: auditRole(), sanitizeInput(), deepFreeze(), fail-closed store
- Performance: permission index O(1) matching, checkMany semantics, property-based test invariants
- Types.ts as zero-dependency foundation layer

### Out of Scope (v0.2+)

- Framework adapters (Express, NestJS, Fastify)
- Persistent stores (SQLite, PostgreSQL)
- Serializable conditions
- Resource hierarchies (path-based)
- Field-level permissions
- Role activation conditions

## New Capabilities

| Capability | RFs |
|-----------|-----|
| `permission-model` | RF-01, RF-02, RF-11 — types and interfaces |
| `rbac-engine` | RF-03, RF-04, RF-05, RF-06, RF-07, RF-09 — core evaluation |
| `abac-conditions` | RF-08, RF-10, RF-34 — conditions and timeout |
| `policy-store` | RF-12, RF-13, RF-14, RF-35 — persistence |
| `batch-operations` | RF-15, filter() — batch and row-level |
| `engine-options` | timeoutMs, failOpen, disableRoleHintWarning |
| `security-audit` | RF-17, RF-36, RF-37 — errors, audit, dev warnings |
| `performance` | §7.1.1 budget, §8.1 index, §8.2 batch sem, §13.6 invariants |

## Approach

Single package, 7 source files. types.ts (0 deps) → store.ts → engine.ts → memory-store.ts → errors.ts → helpers.ts → index.ts. Build with tsc, test with vitest, strict TDD mode.

## Affected Areas

| Area | Impact |
|------|--------|
| src/types.ts | New: Permission, Role, User, EvalContext, CheckInput, CheckResult, ResourceInstance |
| src/engine.ts | Rewrite: full check() with RBAC+ABAC, deny, scope, wildcards, inheritance |
| src/store.ts | Rewrite: PolicyReader + PolicyWriter separation, getRolesByNames |
| src/memory-store.ts | Rewrite: InMemoryPolicyStore implements PolicyStore |
| src/errors.ts | Extend: 8 typed error classes |
| src/helpers.ts | Extend: perm() with effect/conditionMode, scope helpers |
| src/index.ts | Extend: new exports |
| test/engine.test.ts | Extend: security tests, property-based, invariants |
