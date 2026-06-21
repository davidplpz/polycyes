# polycyes v0.1 — Specifications

## Permission Model

### Requirement: Typed permission model

The system MUST define Permission, Role, User, EvalContext, CheckInput, CheckResult, ResourceInstance as TypeScript interfaces in types.ts with zero runtime dependencies.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Permission has defaults | perm("post","edit") | scope inspected | scope is "any", effect is "allow", condition is undefined |
| Permission with opts | perm("post","edit", {scope:"own",condition:fn}) | fields inspected | all fields set as provided |
| Role with inheritance | role("editor", {inherits:["viewer"]}) | inherits inspected | array contains "viewer" |
| CheckResult structured | engine.check() returns | result inspected | has allowed, reason, matchedRole, matchedPermission, deniedBy, evaluatedAt |

## RBAC Engine

### Requirement: Core authorization check

`Engine.check(input)` MUST evaluate permissions and return CheckResult. Matching MUST support exact resource/action AND wildcards "*".

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Exact match grant | user has role with perm("post","edit") | check(post, edit) | allowed=true, reason contains role name |
| No match deny | user has role with perm("post","read") | check(post, delete) | allowed=false, deniedBy.type="no-match" |
| Wildcard resource | perm("*","read") | check(anything, read) | allowed=true |
| Wildcard action | perm("post","*") | check(post, archive) | allowed=true |
| Scope own grant | perm("post","edit",{scope:"own"}), ownerId matches | check with matching ownerId | allowed=true |
| Scope own deny | same perm, different ownerId | check | allowed=false, deniedBy.type="scope-failed" |
| Deny over allow | role has deny+allow matching | check | allowed=false, deniedBy.type="explicit-deny" |
| Deny short-circuit | deny matches in role | remaining perms in same role | NOT evaluated (break) |
| No roles | user has empty roleNames | check | allowed=false, deniedBy.type="no-roles" |

### Requirement: Role inheritance

The system MUST resolve transitive inheritance with cycle detection and max 50 depth.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Inherited grant | editor inherits viewer (has "post:read") | editor checks(post,read) | allowed=true |
| Diamond inheritance | A inherits B,C; both B,C inherit D | resolveRoles(["A"]) | D appears once (Set dedup) |
| Cycle detected | A→B→C→A | resolveRoles | throws CircularRoleHierarchyError with chain |
| Depth limit | 51-level chain | resolveRoles | throws HierarchyTooDeepError |

## ABAC Conditions

### Requirement: Conditional access

Conditions MUST be `(ctx: EvalContext) => boolean | Promise<boolean>`. System MUST await promises and validate return type.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Sync condition met | condition: ctx => ctx.user.id === "usr_1" | check with matching user | allowed=true |
| Sync condition not met | same condition | check with different user | allowed=false, deniedBy.type="condition-failed" |
| Async condition | condition: async ctx => await db.check(ctx) | check | awaited, result validated |
| Non-boolean return | condition returns "false" (string) | check | throws ConditionEvaluationError |
| Condition throws | condition: () => { throw new Error() } | check | caught, deniedBy.type="condition-failed" |
| Empty array error | condition: [] with mode 'all' | check | throws EmptyConditionArrayError |
| No condition (undefined) | perm without condition field | check | passes (short-circuits to true) |

### Requirement: Condition timeout

Each condition MUST be wrapped with Promise.race against configurable timeout (default 1000ms).

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Timeout exceeded | condition: () => new Promise(()=>{}) | check with timeoutMs=10 | throws ConditionTimeoutError |
| Within timeout | fast condition | check | normal evaluation |
| Condition AND mode | [condA, condB], mode='all' | both true | allowed=true |
| Condition OR mode | [condA, condB], mode='any' | one true, one false | allowed=true |

## Policy Store

### Requirement: Store contract

PolicyReader MUST define getRole, getRolesByNames, getUserRoles. PolicyWriter MUST define addRole, updateRole, deleteRole, setUserRoles. PolicyStore MUST extend both.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Batch loading | 5 inherited roles | getRolesByNames(["a","b","c","d","e"]) | single call, returns 5 roles |
| Store failure fail-closed | store.getUserRoles throws | check | throws StoreUnavailableError |
| Store failure fail-open | store throws, failOpen=true | check | allowed=true, reason contains "SECURITY WARNING" |
| Add duplicate role | role "admin" already exists | addRole(admin) | throws DuplicateRoleError |
| InMemory copy | addRole(role) | mutate original role | store unchanged (shallow copy) |

### Requirement: Roles source of truth

`store.getUserRoles(userId)` MUST be the single source. `input.user.roles` SHALL NOT be used for authorization.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Store authoritative | input.user.roles=["admin"], store returns ["viewer"] | check | uses ["viewer"] from store |
| Dev warning | input.roles differ from store, NODE_ENV≠production | check | console.warn emitted |
| Warning silenced | disableRoleHintWarning: true | check | no warning |

## Batch & Filter

### Requirement: checkMany

`engine.checkMany(inputs)` MUST evaluate N inputs with user-role caching. Each result MUST be independent.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Same user cached | 100 inputs, same userId | checkMany | getUserRoles called ONCE |
| Isolated failure | input #5 condition throws | checkMany | only result[4] is error, others intact |
| Mixed users | 2 users, 5 inputs each | checkMany | getUserRoles called twice (once per user) |

## Engine Options

### Requirement: Engine configuration

Engine constructor MUST accept EngineOptions: {timeoutMs, failOpen, disableRoleHintWarning}.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Default timeout | no options passed | engine constructed | timeoutMs defaults to 1000 |
| Invalid timeout | timeoutMs: 0 or "abc" | constructor | throws InvalidEngineOptionError |
| Options propagated | timeoutMs: 500 | buildEvalContext | ctx.timeoutMs is 500 |

## Security & Audit

### Requirement: Input sanitization

buildEvalContext MUST strip __proto__, constructor, prototype from all nested objects.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Prototype pollution stripped | metadata: { __proto__: { isAdmin: true } } | buildEvalContext | __proto__ key deleted |
| Nested strip | attributes: { nested: { constructor: x } } | sanitizeInput | constructor deleted recursively |

### Requirement: Context immutability

EvalContext MUST be deep-frozen before passing to conditions.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Deep freeze | ctx passed to condition | condition mutates ctx.user.name | mutation ignored (frozen) |
| Built once | check() called | EvalContext constructed | built ONCE, reused across permissions |

### Requirement: Role auditing

addRole() MUST run auditRole() and emit warnings for perm("*","*") without condition.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| God-mode warning | role has perm("*","*") no condition | addRole | audit warning with WILDCARD_GOD_MODE |
| Strict mode throw | strictMode: true, god-mode perm | addRole | throws UnsafeRoleError |

## Performance

### Requirement: Permission index

Engine MUST pre-index permissions by resource+action for O(1) matching.

| Scenario | GIVEN | WHEN | THEN |
|----------|-------|------|------|
| Index equivalence | roles built | check via index vs scan | same result for all inputs |
| Wildcard fallback | index.get("post") has no "delete" | lookup | falls back to index.get("*") |

### Requirement: Type safety

The system MUST compile with strict:true. types.ts SHALL have zero dependencies. No reliance on any additional runtime library.

### Requirement: Property-based invariants

The engine SHALL pass fast-check invariants: deny>allow, inheritance transitive, cycle detected, no side effects, timeout fail-closed, empty input fast-fail, scope own without ownerId, non-boolean condition reject, checkMany independence.
