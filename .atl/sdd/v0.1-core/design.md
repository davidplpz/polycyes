# Design: polycyes v0.1 Core Engine

## Technical Approach

Implement polycyes from the inside out: types → store → errors → helpers → engine. All 7 source files modified, zero new files. The engine's `check()` method implements the single-pass algorithm from PRD §8 with permission index (§8.1) for O(1) matching. Strict TDD: all 12 existing tests must pass before new tests added.

## Architecture Decisions

| # | Decision | Options | Choice | Rationale |
|---|----------|---------|--------|-----------|
| 1 | Store split | Single PolicyStore vs PolicyReader+PolicyWriter | PolicyReader+PolicyWriter | ISP: Engine only reads. Separated interfaces prevent misuse, enable read-replica optimization (PRD §12.7) |
| 2 | Permission index | Scan O(n×m) vs Map O(1) | `Map<resource, Map<action, Permission[]>>` | PRD §7.1.1 budget: <50μs for 500 perms. Index built once per check() after resolveRoles. Wildcard fallback: `index.get("*")` when exact not found |
| 3 | checkMany parallelism | Promise.all vs sequential | Sequential with per-user cache | Sequential avoids store contention; cache of getUserRoles+resolveRoles lives within call. PRD §8.2 |
| 4 | Condition pipeline | evaluate then validate vs validate inline | `Promise.all` → `typeof === 'boolean'` check | Must await ALL before checking types. Prevents CRITICAL #1 (Promise truthy bypass). PRD §8 Step 3b |
| 5 | deepFreeze approach | Shallow Object.freeze vs recursive | Recursive on user, attributes, resourceInstance, metadata | Shallow freeze leaves nested objects mutable. PRD §6.3.1 |
| 6 | Empty condition semantics | Coerce undefined to [] vs distinguish | `undefined`=pass, `[]`=throw | Undefined is RBAC basic (common case). `[]` is config error. PRD §6.3 |
| 7 | Deny algorithm | Two-pass (allow first, deny second) vs single-pass tracking | Single-pass with bestAllow/bestDeny | Two-pass contradicts batch-store (needs second round trip). Single-pass with break-on-deny-in-role. PRD §6.1.1 |

## Data Flow

```
CheckInput
  │
  ▼
sanitizeInput()          ← strip __proto__, constructor, prototype (recursive)
  │
  ▼
store.getUserRoles(id)   ← SINGLE source of truth
  ├─ error? → failOpen? → {allowed:true, reason:"SECURITY WARNING"}
  └─ ok → roleNames[]
  │
  ▼
resolveRoles(names, store) ← getRolesByNames(batch) + transitive inheritance
  ├─ cycle → CircularRoleHierarchyError
  ├─ depth>50 → HierarchyTooDeepError
  └─ ok → Role[]
  │
  ▼
buildPermissionIndex     ← Map<resource, Map<action, Permission[]>>
buildEvalContext         ← deepFreeze(user, userAttributes, resourceInstance, metadata)
  ├─ populate timeoutMs from EngineOptions
  └─ freeze entire context
  │
  ▼
for each role → for each perm (via index lookup):
  matchResource → matchAction → matchScope → matchConditions
    │                                        │
    │                                        ├─ undefined → true
    │                                        ├─ [] → EmptyConditionArrayError
    │                                        ├─ await Promise.all → each with Promise.race(timeout)
    │                                        ├─ typeof !== 'boolean' → ConditionEvaluationError
    │                                        └─ mode all/every | any/some
    │
  effect='deny'  → bestDeny={role,perm}, break (short-circuit in role)
  effect='allow' → bestAllow={role,perm}, continue
  │
  ▼
bestDeny  → {allowed:false, deniedBy:{type:'explicit-deny'}}
bestAllow → {allowed:true, matchedRole, matchedPermission, reason}
none      → {allowed:false, deniedBy:{type:'no-match'}}
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/types.ts` | Modify | Add `PermissionEffect`, `ScopeFunction`, `Condition` async+array, `ConditionMode`, `EvalContext.timeoutMs`, `CheckResult.matchedRole/matchedPermission/deniedBy/evaluatedAt`, `DeniedBy` union |
| `src/store.ts` | Modify | Split into `PolicyReader` (getRole, getRolesByNames, getUserRoles) + `PolicyWriter` (addRole, updateRole, deleteRole, setUserRoles) + `PolicyStore extends PolicyReader, PolicyWriter` |
| `src/errors.ts` | Modify | Add: `ConditionEvaluationError`, `DuplicateRoleError`, `HierarchyTooDeepError`, `EmptyConditionArrayError`, `ConditionTimeoutError`, `StoreUnavailableError`, `UnsafeRoleError`, `InvalidEngineOptionError`, `InvalidInputError` |
| `src/helpers.ts` | Modify | `perm()`: add `effect`, `conditionMode` params. `Condition` can be single or array. Export `scopeTeam`, `scopeTenant`, `scopeOrg` |
| `src/memory-store.ts` | Modify | Implement `PolicyStore`. Add `getRolesByNames()` (batch), `auditRole()` call in `addRole()`. `structuredClone` on write. `strictMode` config |
| `src/engine.ts` | Modify | Full `check()` implementation. Add `checkMany()`, `debug()`, `filter()`. Private: `resolveRoles`, `buildPermissionIndex`, `buildEvalContext`, `matchConditions` (with await+timeout), `sanitizeInput`, `deepFreeze`. Constructor: `EngineOptions` with validation |
| `src/index.ts` | Modify | Export new types, errors, helpers. Export `EngineOptions`, `PolicyReader`, `PolicyWriter` |
| `test/engine.test.ts` | Modify | Add security tests (async exploit, empty condition, timeout, prototype pollution, store failure, deepFreeze mutation). Add property-based tests with fast-check |

## Interfaces / Contracts

```typescript
// PolicyReader (hot path — what Engine needs)
interface PolicyReader {
  getRole(name: string): Promise<Role | null>;
  getRolesByNames(names: string[]): Promise<Role[]>;
  getUserRoles(userId: string): Promise<string[]>;
}

// PolicyWriter (administration)
interface PolicyWriter {
  addRole(role: Role): Promise<void>;
  updateRole(role: Role): Promise<void>;
  deleteRole(name: string): Promise<void>;
  setUserRoles(userId: string, roleNames: string[]): Promise<void>;
}

// Engine receives PolicyReader only
class Engine {
  constructor(store: PolicyReader, options?: EngineOptions);
  async check(input: CheckInput): Promise<CheckResult>;
  async checkMany(inputs: CheckInput[]): Promise<CheckResult[]>;
}

// EngineOptions
interface EngineOptions {
  timeoutMs?: number;          // default 1000
  failOpen?: boolean;           // default false
  disableRoleHintWarning?: boolean; // default false
}

// Condition — sync or async, single or array
type Condition = 
  | ((ctx: EvalContext) => boolean | Promise<boolean>)
  | ((ctx: EvalContext) => boolean | Promise<boolean>)[];
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Existing 12 tests | Green → refactor → add. First make RBAC+scope+inheritance pass, then ABAC, then deny, then errors |
| Unit | Security exploits | New tests: async bypass, empty array, timeout, prototype pollution, store failure, deepFreeze mutation |
| Property | 14 invariants (§13.6) | fast-check: deny>allow, inheritance transitive, cycle detected, scope-idempotent, timeout, input validation, index equivalence |
| Unit | Error classes | Each error: construction, message, instanceof check |
| Unit | Helpers | perm() with all opts combos, role() with inheritance, user() with attributes |

### Implementation order

1. `types.ts` — all interfaces updated first (compiler-enforced)
2. `errors.ts` — error classes (imported by store + engine)
3. `store.ts` — interface split (imported by memory-store + engine)
4. `memory-store.ts` — full implementation with auditRole
5. `helpers.ts` — perm/role/user with new params
6. `engine.ts` — implement check() matching, then conditions, then deny, then index
7. `index.ts` — re-export
8. Verify: 12 original tests pass → add security + property tests

## Open Questions

- None. All design decisions resolved by PRD §12 and adversarial review round 3.
