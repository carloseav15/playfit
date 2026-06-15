# PlayfitContext — Frontend State Management

PlayfitContext is the **central state manager** for the Playfit app shell (`/app/*` routes). It handles auth, profile persistence, game state, UI state, and search.

## Architecture

```
PlayfitRouteProvider (apps/web/src/components/playfit/playfit-route-provider.tsx)
  └── PlayfitProvider (playfit-context.tsx)
        └── PlayfitContext.Provider
              └── usePlayfit() hook (consumer API)
```

## Provider Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `platforms` | `ProductPlatformOption[]` | required | Available platforms from Supabase |
| `localFirst` | `boolean` | `false` | Skip auth, use device ID immediately |
| `children` | `ReactNode` | required | App content |

## Boot Sequence

```
PlayfitProvider mounts
  ├── usePlayfitAuth()
  │     ├── Check existing Supabase session
  │     ├── Subscribe to onAuthStateChange
  │     └── Returns { authUser, authBusy, useLocalProfile, ... }
  │
  ├── If authBusy → show <Spinner />
  │
  ├── If !authUser && !useLocalProfile → show <AuthPanel />
  │
  └── If authUser || useLocalProfile → boot()
        ├── loadProductState() from @playfit/core/store (IndexedDB)
        ├── ensureGamesCached() — prefetch game IDs from user state
        ├── If onboarding complete but no profile:
        │     ├── Try POST /api/recommendations/profile (server build)
        │     └── Fallback: buildAdaptiveProfile() (local build)
        ├── setState() + setUi(initialUi())
        └── enqueueSave() (persist to server)
```

## State Shape

### `ProductState` (persisted)

```typescript
interface ProductState {
  version: number;
  user: {
    onboarding: ProductOnboardingDraft;
    onboardingCompletedAt: string | null;
    profile: ProductProfile | null;
    gameStates: Record<string, ProductGameState>;
    lastUpdatedAt: string | null;
  };
}
```

### `ProductUiState` (ephemeral, not persisted)

| Field | Type | Purpose |
|---|---|---|
| `activeTab` | `ProductTab` | Current tab: today, library, finder, upcoming, profile, onboarding |
| `onboardingQuery` | `string` | Current onboarding search query |
| `finderQuery` | `string` | Current finder/discover search query |
| `libraryQuery` | `string` | Current library search query |
| `libraryTab` | `"all" \| "backlog" \| "wishlist"` | Library sub-filter |
| `librarySort` | `"title" \| "rating-desc" \| "rating-asc" \| "status"` | Library sort order |
| `profileMode` | `"overview" \| "edit"` | Profile view mode |
| `statusMessage` | `string \| null` | Toast message |
| `saveStatus` | `"idle" \| "saving" \| "saved" \| "error"` | Profile save state |
| `upcomingPlatformFilters` | `Set<string>` | Active platform filters for upcoming view |
| `startBannerDismissed` | `boolean` | Whether start banner was dismissed |

## Context API (`usePlayfit()`)

### State Readers

| Method | Returns | Description |
|---|---|---|
| `seedData` | `ProductSeedData` | Seed data (platforms, games) |
| `state` | `ProductState` | Full persisted state |
| `ui` | `ProductUiState` | Ephemeral UI state |
| `isPending` | `boolean` | Whether initial load is in progress |
| `isSaving` | `boolean` | Whether profile save is in flight |

### State Mutators

| Method | Signature | Description |
|---|---|---|
| `setUi` | `(updater: SetStateAction<ProductUiState>) => void` | Update UI state |
| `updateState` | `(updater: (draft: ProductState) => void) => void` | Mutate persisted state (auto-saves) |
| `toggleFlag` | `(gameId: string, flag: "inBacklog" \| "inWishlist") => void` | Toggle backlog/wishlist flag |
| `setPlayStatus` | `(gameId: string, status?: ProductGameState["status"]) => void` | Set play status (undefined = remove) |
| `setRating` | `(gameId: string, rating?: ProductRating) => void` | Set rating (0/undefined = remove) |
| `applyDecisionFeedback` | `(gameId: string, feedback: ProductDecisionFeedback) => void` | Apply decision feedback + rebuild profile |
| `excludeGame` | `(gameId: string) => void` | Exclude game from recommendations |
| `setStatusMessage` | `(message: string \| null) => void` | Show/hide status toast |
| `retrySave` | `() => Promise<void>` | Retry failed profile save |
| `resetLocalState` | `() => void` | Reset all local state to initial |
| `signOut` | `() => Promise<void>` | Sign out + clear state |

### Helper Methods

| Method | Signature | Description |
|---|---|---|
| `getSeedGame` | `(gameId: string) => SeedGame \| null` | Lookup game in local cache |
| `searchGames` | `(query: string) => SeedGame[]` | Return cached search results for query |
| `buildProfileFromCurrentData` | `() => ProductProfile` | Build profile from current state (non-destructive) |
| `refreshAdaptiveProfile` | `() => void` | Rebuild profile + show status message |
| `getOrCreateGameState` | `(gameId: string, source?) => ProductGameState \| null` | Get existing state or create default |
| `openDossier` | `(gameId: string) => void` | Navigate to game dossier page |
| `closeDossier` | `() => void` | Navigate back to app shell |

## Save Queue

Profile saves are **debounced and queued** via `useQueuedProfileSave()`:

1. Each `updateState()` call increments a sequence counter
2. Saves run sequentially (promise chain)
3. If a newer save is queued, stale results are discarded
4. On auth expiry, local state is silently cleared
5. On network error, UI shows `saveStatus: "error"` with retry option

### Decision Feedback Flow

```
applyDecisionFeedback(gameId, feedback)
  ├── "play"      → set status="playing", clear backlog, clear excluded
  ├── "later"     → set status="shelved", set inBacklog=true, clear excluded
  ├── "loved"     → set rating=5, rebuild profile
  ├── "liked"     → set rating=4, rebuild profile
  ├── "mixed"     → set rating=3, rebuild profile
  └── "not_for_me" → set rating=2, set excluded=true, rebuild profile
```

## Auth Flow

```
usePlayfitAuth()
  ├── On mount: check supabase.auth.getSession()
  ├── Subscribe to onAuthStateChange (session refresh, sign out)
  ├── If authenticated:
  │     ├── setCachedAuth(access_token, user.id)
  │     ├── setAuthUser({ id, email })
  │     └── useLocalProfile = false
  └── If not authenticated:
        ├── AuthPanel shown to user
        ├── "Continue locally" → useLocalProfile = true
        └── "Sign in" → handleAuth(userId, email)
```

## Persistence

State is persisted to two layers:

| Layer | Storage | When |
|---|---|---|
| IndexedDB (local) | `@playfit/core/store` | On every `updateState()` |
| Supabase (server) | `POST /api/profile` | Via `enqueueSave()` in save queue |
| Auth session | Supabase SSR cookie | Handled by middleware |

## Error States

| State | UI |
|---|---|
| `authBusy` | Full-screen `<Spinner />` |
| No auth + no local | `<AuthPanel />` (sign in / continue locally) |
| `bootError` | Error card with message |
| `value === null` | Loading spinner + "Loading Playfit" |
| `saveStatus === "error"` | StatusDot shows warning + retry option |
