# Changelog

## 0.3.0 (2026-07-11)

### Added

- **NestJS adapter** — `polycyes/nestjs` con `PolycyesModule` (global, `forRoot`), `PolycyesGuard` (lee metadata de `@Permissions`, passthrough si no hay decorator o contexto no-HTTP), decorator `@Permissions(resource, action)`, y extractores custom (`getUser`, `getResourceInstance`, `getMetadata`). Peer deps: `@nestjs/common` y `@nestjs/core` (opcionales).
- **Tipo `NestjsRequest`** — exportado desde `polycyes/nestjs` para tipear extractores custom.

### Changed

- Guard usa `Reflect.getMetadata` directo en vez de inyectar `Reflector` (más simple, funciona en `Test.createTestingModule` sin providers extra).
- Decorator `@Permissions` usa `Reflect.defineMetadata` directo en vez de `SetMetadata` de `@nestjs/common` (evita edge cases de reflect-metadata en vitest).

## 0.2.0 (2026-07-11)

### Added

- **`CachedPolicyStore`** — Wrapper con caché TTL para cualquier `PolicyStore`. TTL configurable por tipo (role vs userRoles), invalidación automática en writes, dedup de requests concurrentes, y `clearCache()` + `cacheStats()`. Export: `polycyes/cached-store`
- **Decoradores de Store** — `LoggingPolicyStore` (logging configurable con timing), `MetricsPolicyStore` (contador de llamadas + totalMs + errores por método), `FailOpenPolicyStore` (retorna null/[] en errores). Export: `polycyes/store-decorators`
- **`resolveRoles()` batch** — Algoritmo en 2 fases que elimina N+1 en herencia de roles. Fase 1 descubre roles padres mediante `getRolesByNames` (batch), Fase 2 resuelve sincrónicamente. Zero llamadas individuales a `getRole()`.
- **`timeoutMs: 0`** — Engine acepta `timeoutMs: 0` como "sin timeout". Condiciones se ejecutan sin overhead de `Promise.race`. Valores negativos lanzan `InvalidEngineOptionError`.
- **Refactor SRP** — `RoleResolver` (resolución batch con detección de ciclos) y `ConditionEvaluator` (timeout, modo, error wrapping) extraídos de `Engine`. Separación de responsabilidades más limpia.
- **Factory `createEngine()`** — `createEngine(store, opts?)` exportada desde `polycyes`. Equivalente a `new Engine(store, opts)`.
- **API de monitoreo** — `getStore()` retorna el `PolicyReader` subyacente, `getCacheStats()` retorna estadísticas de cache, `clearCache()` limpia la cache de roles resueltos en Engine.
- **`EngineOptions.resolvedCacheTTL`** — Cache de roles resueltos a nivel Engine. TTL en ms (default 1000, `0` desactiva). Evita re-resolver herencia en llamadas consecutivas a `check()` para el mismo usuario.
- **`addUserRole()` / `removeUserRole()`** — Manejo incremental de roles en `PolicyWriter`. Agrega/remueve un rol sin reemplazar todos los roles del usuario. Implementado en `InMemoryPolicyStore`, `CachedPolicyStore` y todos los decoradores.
- **`engine.filter()` via `checkMany()`** — `filter()` delega a `checkMany()` internamente = 1 fetch al store para todos los recursos, no N.
- **`matchScope()` con resultado estructurado** — Retorna `{ passed: boolean, reason?: string }` con mensajes de error específicos.
- **Documentación en español** — `README.es.md` + `CHANGELOG.es.md` con documentación completa.

### Changed

- Engine constructor ahora lanza `InvalidEngineOptionError` en vez de `Error` genérico para opciones inválidas
- **Cache-antes-store en `evaluate()`** — la cache de roles se verifica ANTES de `getUserRoles()`. Cache hit elimina la llamada al store por completo.
- **Shallow freeze reemplaza deepFreeze** — `Object.freeze` solo en `user`, `user.attributes`, `resourceInstance`, `resourceInstance.attributes`. Misma protección, sin alocación en hot path.
- **`debug()` evaluación única** — llama a `evaluate()` una vez y reusa el resultado. No más evaluación doble de condiciones.
- **Express adapter async** — middleware `authz()` ahora es `async` con `try/catch`. Compatible con Express 4 + 5.
- **FailOpenPolicyStore implementa PolicyStore completo** — ahora implementa la interfaz `PolicyStore` completa (incluyendo métodos de escritura), corrigiendo violación LSP.
- **Imports directos en Express adapter** — `express.ts` importa desde archivos fuente, no desde barrel. Sin circular deps.

### Fixed

- Violación LSP en `FailOpenPolicyStore` — ahora implementa `PolicyStore` completo
- `CachedPolicyStore` cacheStats ahora incluye `addUserRole` y `removeUserRole`
- `debug()` ya no evalúa condiciones dos veces
- `resolvedCacheTTL` validado para `NaN` y valores negativos via `InvalidEngineOptionError`

## 0.1.3 (2026-06-21)

### Added

- **Adapter Express** — `polycyes/express` con middleware `authz(engine, mapper)`, `defaultMapper`, y tipos `ExpressAuthzMapper`
- **CI/CD** — GitHub Actions: test + tsc + build en Node 18, 20, 22

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
