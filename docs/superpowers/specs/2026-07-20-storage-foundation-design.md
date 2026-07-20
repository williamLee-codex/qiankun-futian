# Storage Foundation Design

**Status:** Approved design

**Date:** 2026-07-20

**Repository:** `williamLee-codex/qiankun-futian`

**Application root:** `artifacts/qiankun-farm`

## 1. Goal

Introduce a storage abstraction for the current Qiankun Futian application without changing gameplay, UI, balance, or player-visible behavior.

After this work, the application must no longer depend directly on browser `localStorage` for its primary game-state persistence. Storage access must flow through a repository and a storage adapter.

```text
Farm module
  -> FarmStateRepository
  -> StorageAdapter
  -> LocalStorageAdapter
  -> browser localStorage
```

## 2. Scope

### In scope

- `StorageAdapter`
- `LocalStorageAdapter`
- versioned `StorageEnvelope`
- centralized `StorageKeys`
- `FarmStateRepository`
- legacy-key lookup
- one-way legacy migration into the new envelope format
- tests for adapter, repository, and migration
- replacement of direct storage access for primary game state and platform-friend mock data

### Out of scope

- Supabase or Firebase
- authentication
- People
- Wallet
- Mission
- Achievement
- Notification
- AI
- EventBus
- a new state-management library
- automatic backups
- cross-tab synchronization
- encryption
- UI changes
- gameplay changes
- balance changes
- broad project-directory restructuring

## 3. File layout

Create the infrastructure layer under the existing application root:

```text
artifacts/qiankun-farm/src/infrastructure/storage/
  StorageAdapter.ts
  LocalStorageAdapter.ts
  StorageEnvelope.ts
  StorageKeys.ts
  index.ts
```

Create application-specific persistence code here:

```text
artifacts/qiankun-farm/src/apps/qiankun-farm/storage/
  FarmStateRepository.ts
  FarmStateMigration.ts
  legacyStorageKeys.ts
```

Existing application paths may require adjustment during implementation. The implementation plan must identify the exact existing files that currently perform direct storage access before any code is changed.

## 4. Storage adapter contract

The adapter must use asynchronous signatures so future IndexedDB, Supabase, or remote persistence can be introduced without changing consumers.

```ts
export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}
```

Only `LocalStorageAdapter.ts` may call browser `localStorage` directly.

## 5. Storage envelope

All newly written persistent records must use a versioned envelope.

```ts
export interface StorageEnvelope<T> {
  schemaVersion: number;
  savedAt: string;
  data: T;
}
```

Example:

```json
{
  "schemaVersion": 1,
  "savedAt": "2026-07-20T12:00:00.000Z",
  "data": {
    "coins": 20,
    "crystals": 0
  }
}
```

The current schema version for this sprint is `1`.

## 6. Storage keys

Use centralized, namespaced keys.

```ts
export const STORAGE_KEYS = {
  FARM_STATE: "imperial_compass.app.qiankun_farm.state",
  PLATFORM_FRIENDS: "imperial_compass.platform.friends",
  PLATFORM_PROFILE: "imperial_compass.platform.profile"
} as const;
```

No new unqualified keys such as `gameState`, `friends`, `wallet`, or `profile` may be introduced.

## 7. Migration behavior

Load order is fixed:

1. Read the new namespaced key.
2. If a valid envelope exists, return its data.
3. If it does not exist, search the documented legacy keys.
4. Parse and validate the legacy value.
5. Convert it into schema version `1`.
6. Write the new envelope.
7. Return migrated data.
8. Preserve the legacy key during this sprint.

Migration must be idempotent. Re-running it must not duplicate, mutate, or corrupt data.

A failed migration must not overwrite or delete legacy data.

## 8. Repository contract

The game must consume persistence through a farm-state repository.

```ts
export interface FarmStateRepository {
  load(): Promise<FarmState | null>;
  save(state: FarmState): Promise<void>;
  clear(): Promise<void>;
}
```

The concrete implementation may depend on `StorageAdapter`, `STORAGE_KEYS`, and the farm-state migration function. UI components and application services must not call `localStorage`, `JSON.parse`, or `JSON.stringify` for primary game-state persistence.

## 9. Error handling

Storage failures must not crash the application.

Required behavior:

- read failure: log the failure and return `null` so the existing default-state path can run;
- write failure: reject or return a typed failure according to the current application error-handling pattern, but do not corrupt existing data;
- migration failure: retain the legacy value untouched and fall back to the existing default-state behavior;
- malformed envelopes: treat as unreadable data, log the reason, and do not overwrite automatically.

The implementation plan must follow the repository's existing logging and test conventions rather than introducing a new logging framework.

## 10. Testing requirements

At minimum, tests must cover:

### LocalStorageAdapter

- stores a value;
- loads a value;
- returns `null` for a missing key;
- removes a value;
- handles malformed serialized data according to the chosen adapter boundary.

### Migration

- migrates a valid legacy state into schema version `1`;
- preserves the legacy key;
- is idempotent;
- does not overwrite legacy data when conversion fails;
- prefers an existing valid new-format record over legacy data.

### FarmStateRepository

- loads valid new-format data;
- saves an envelope with version and timestamp;
- clears only the new farm-state key;
- falls back to migration when the new key is missing;
- returns `null` on an unrecoverable read failure.

## 11. Acceptance criteria

The sprint is complete only when all conditions below are true:

1. Existing player saves remain readable.
2. New saves use the official namespace and envelope format.
3. Primary game-state access flows through `FarmStateRepository` and `StorageAdapter`.
4. New code outside `LocalStorageAdapter.ts` does not call browser `localStorage` directly.
5. Migration is repeatable and non-destructive.
6. Planting, harvesting, selling, pets, weather, friend borrowing, and friend harvest behavior remain unchanged.
7. No intentional UI change is introduced.
8. Adapter, repository, and migration tests pass.
9. No new TypeScript, lint, or build errors are introduced.
10. Architecture and migration documentation are updated with the final legacy-key mapping.

## 12. Definition of done

This sprint has one primary objective: storage abstraction and compatibility migration.

It is not complete merely because the new files exist. Completion requires verified behavioral equivalence, passing tests, preserved legacy data, and removal of direct primary-state storage access from current application code.

## 13. Engineering rule

Each platform sprint must have one primary architectural objective.

- Sprint 1: Storage
- Sprint 2: People
- Sprint 3: Wallet
- Sprint 4: EventBus

A later sprint may depend on earlier foundations, but it must not silently expand the current sprint into additional platform-core work.
