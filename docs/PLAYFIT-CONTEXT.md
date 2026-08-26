# PlayfitContext — Frontend State Management

PlayfitContext is the **central state manager** for the Playfit app shell (`(play)` route
group, promoted to the root `/` entry point). It handles auth, profile persistence, game
state, UI state, and search. This file was rewritten from the current source
(`apps/web/src/components/playfit/`) on 2026-08-25 — it previously described a multi-tab
model (`library`/`finder`/`upcoming`/`profile`) that no longer exists.

## Architecture

```
PlayLayoutClient (apps/web/src/app/(play)/layout-client.tsx)
  └── PlayfitProvider (playfit-context.tsx)
        ├── usePlayfitAuth()        — session/anonymous auth
        ├── usePlayfitBoot()        — loads persisted state, builds a profile if missing
        ├── useQueuedProfileSave()  — debounced, sequenced saves to the server
        └── useProductTabNavigation() — syncs activeTab with the URL hash
              └── PlayfitContext.Provider (state context + ui context)
                    └── usePlayfit() hook (consumer API)
```

State is split into two React contexts — `PlayfitStateContextValue` (persisted product state
and mutators) and `PlayfitUiContextValue` (ephemeral UI state) — both defined in
`playfit-context-types.ts`, which is the authoritative source for the shapes below.

## Boot Sequence

```
PlayfitProvider mounts
  ├── usePlayfitAuth()
  │     ├── Check existing Supabase session
  │     ├── If none and localFirst: try anonymous sign-in, else fall back to local profile
  │     └── Subscribe to onAuthStateChange
  │
  ├── If authBusy → show <Spinner />
  ├── If !authUser && !useLocalProfile → show <AuthPanel />
  │
  └── If authUser || useLocalProfile → usePlayfitBoot()
        ├── loadProductState() from @playfit/core/store, apply default platform selection
        │   if onboarding hasn't started (withDefaultPlatforms)
        ├── If the loaded state has no data but the browser previously had some
        │   (localStorage "playfit_had_data" flag): clear the game cache and use the
        │   fresh empty state as-is — this is the boot path for a signed-out/reset device
        ├── Otherwise, prefetch cached games for onboarding + game-state IDs
        ├── If onboarding is complete but there's no profile yet:
        │     ├── Try POST /api/recommendations/profile (server build)
        │     └── Fallback: buildAdaptiveProfileFromCache() (local build)
        │     └── enqueueSave({ profile }) either way
        └── setState(loadedState) + setUi(initialUi(loadedState))
```

`initialUi()` (in `playfit-provider-helpers.ts`) also resolves the initial tab from the URL
hash: `onboarding` if onboarding isn't complete yet, otherwise whatever valid tab the hash
names, defaulting to `today`.

## State Shape

### `ProductState` (persisted — unchanged shape, see `@playfit/core/types`)

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

### `ProductUiState` (ephemeral, not persisted — current shape, 6 fields)

| Field | Type | Purpose |
|---|---|---|
| `activeTab` | `"today" \| "onboarding"` | The only two tabs the app shell has today |
| `onboardingQuery` | `string` | Current onboarding search query |
| `statusMessage` | `string \| null` | Toast message |
| `saveStatus` | `"idle" \| "saving" \| "saved" \| "error"` | Profile save state |
| `onboardingCompletionPhase` | `"idle" \| "finding"` | Short-lived handoff between finishing onboarding and the first Play Next result |
| `undoAction` | `(() => void) \| null` | When set, the status toast shows an "Undo" action that runs this and clears itself |

There is no `library`/`finder`/`upcoming`/`profile` tab, no `libraryTab`/`librarySort`, no
`profileMode`, no `upcomingPlatformFilters`, no `startBannerDismissed`. That entire surface
was removed in a product simplification that predates this rewrite.

## Context API (`usePlayfit()`)

Full surface from `playfit-context-types.ts` — treat this file, not this table, as the source
of truth if they ever diverge again.

### State readers / mutators (`PlayfitStateContextValue`)

| Member | Purpose |
|---|---|
| `seedData`, `state`, `isSaving`, `authUser`, `useLocalProfile` | Read-only state |
| `setUseLocalProfile` | Switch to local-only profile mode |
| `updateState` / `updateStateAndSave` | Mutate persisted state; the latter also awaits the save and returns its `SaveStateResult` |
| `getSeedGame`, `getOrCreateGameState` | Catalog/game-state lookups |
| `buildProfileFromCurrentData`, `refreshAdaptiveProfile` | Rebuild the taste profile from current data |
| `toggleFlag`, `setPlayStatus`, `setRating` | Direct game-state mutators |
| `applyDecisionFeedback(gameId, feedback, onUndo?)` | Server-authoritative decision — returns `Promise<ProductTasteActionClientResult>`, not a synchronous local update. See `docs/CANONICAL_TASTE_FEEDBACK.md` for the full contract (conflict handling, undo, offline retry) instead of duplicating it here |
| `setPlayfitPick`, `startPlayfitPick`, `removeTasteSignal`, `excludeGame` | Pick and taste-signal mutators |
| `resetLocalState`, `resetTasteProfile`, `deleteAccount`, `signOut`, `linkGoogleAccount` | Account-level actions |

### UI state (`PlayfitUiContextValue`)

| Member | Purpose |
|---|---|
| `ui`, `setUi` | Ephemeral UI state (see `ProductUiState` above) |
| `setStatusMessage` | Show/hide the status toast |
| `onboardingSearchError`, `onboardingSearchPending`, `retryOnboardingSearch` | Onboarding search request state |
| `searchGames(query)` | Cached search results for the onboarding query |
| `flushSave`, `retrySave` | Force a pending save now / retry after a failure |

## Tab Navigation

`useProductTabNavigation()` (new since the previous version of this doc) keeps `activeTab` in
sync with the URL hash on the `/play` route: `today` maps to no hash, any other tab maps to
`#<tab>`. On `/` it strips any hash instead. A `sessionStorage` marker
(`LANDING_REDIRECT_MARKER`) suppresses this when the user just arrived from the marketing
landing page or Settings, so the redirect itself doesn't fight with the hash sync.

## Save Queue

`useQueuedProfileSave()` debounces and sequences saves against the single authoritative
source of truth (read fresh at save time, not at call time):

1. Each call increments a sequence counter and chains onto `saveQueueRef`, so a save only
   starts once any prior in-flight save has fully resolved — nothing is dropped or reordered.
2. A failed save's data is never rolled back locally; it rides along in whatever state the
   *next* successful save submits.
3. `describeSaveFailure()` maps failure reasons (`network_error`, `auth_expired`, `conflict`,
   `rate_limited`, `invalid_state`) to user-facing copy — only `network_error` uses
   connectivity language, since it's the one case where whether the write persisted is
   genuinely unknown.

## Auth Flow

```
usePlayfitAuth(localFirst)
  ├── On mount: supabase.auth.getSession()
  ├── If a session exists: setCachedAuth(), setAuthUser()
  ├── Else if localFirst: try supabase.auth.signInAnonymously()
  │     ├── Success → setAuthUser() (isAnonymous: true)
  │     └── Failure → useLocalProfile = true, authUser stays null
  ├── Subscribe to onAuthStateChange (session refresh, sign out)
  └── authUser.email is "Guest profile" for anonymous sessions, the real email otherwise
```

## Persistence

| Layer | Storage | When |
|---|---|---|
| IndexedDB (local) | `@playfit/core/store` (`loadProductState`/`saveProductState`) | On every `updateState()` |
| Supabase (server) | `POST /api/profile` via the save queue | Debounced, sequenced |
| Auth session | Supabase SSR cookie | Read by client/provider and API routes |

## Error States

| State | UI |
|---|---|
| `authBusy` | Full-screen `<Spinner />` |
| No auth + no local | `<AuthPanel />` (sign in / continue locally) |
| `bootError` | Error card with message |
| `saveStatus === "error"` | StatusDot shows warning + retry option (`retrySave`) |
