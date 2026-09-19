# Web navigation and asynchronous UX

Implementation verified locally: 2026-09-19. No deployment performed.

## Changes

- The app route group owns one AppEntry and one PlayfitProvider. The landing starts
  the app through a lightweight entry context instead of mounting a second provider
  and forcing document reloads on outgoing links.
- A cold landing renders without fetching platforms or starting anonymous auth.
  Catalog loading begins on app entry; timeout and retry states retain navigation.
- Platform metadata stays in the route-group owner across client navigation.
- Picks caches results only for a resolved user and the exact profile state version.
  Same-identity background refreshes retain cards; refresh errors expose local retry.
- The recommendation handoff waits for the received model to enter the visible pool
  before showing an empty state.
- Empty Taste offers one action to rate a game. Later metadata hydration does not
  repeatedly replace the entire screen once initial hydration has completed.

- Search belongs to the persistent app route group while direct visits remain public.
  Filter metadata loads separately with an eight-second timeout, cache and local retry.
- Search query updates use browser history without a server navigation per keystroke.
  The input becomes interactive after hydration, independently of network metadata.
- Missing platform metadata cannot silently broaden a filtered query. Genre query
  failures return a retryable 503 rather than a cached successful empty list.
- Search retries preserve the query and filters and suppress duplicate rapid retries.

## Verification

- 386 web tests passed with two workers; 170 core tests passed.
- TypeScript, Biome and production build passed. Web coverage execution passed.
- Dependency audit reports zero vulnerabilities after compatible updates, including
  Vitest 4.1.11. The coverage provider lives with the shared root test tooling.
- Chromium: 22 app/accessibility checks passed; the five existing Search checks passed
  after fixing the pre-hydration input race. An additional slow-filter/retry check
  verifies query retention, focus, URL updates and no anonymous session creation.
- Live local Docker requests returned catalog filters and Hades search results.
  Browser tests use response fixtures; they do not prove production behavior.
- SQL fixture parity passed for six profiles; migration validation reported zero errors.
- Independent QA found the swallowed genre-query error, now fixed with a regression test.
- Tests cover cold landing without catalog requests, deferred/failed platform loading
  with navigation, shell identity across route changes, cache identity/version isolation,
  and retained data plus retry after a failed background refresh.
- Browser: Picks to Taste rendered the compact empty state. Real catalog failures left
  navigation visible and retry transitioned locally back to loading.
- The unrestricted test run hit five-second timeouts under local load; the bounded
  rerun passed. No timeout settings were relaxed.

## Scope still to address

Pending writes are not yet a durable offline queue across reloads or tab closure.
Populated Taste and Play Next hierarchy, landing visual variants, and a controlled
slow-network production-browser matrix remain separate follow-ups.
