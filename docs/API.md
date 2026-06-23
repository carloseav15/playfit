# API Reference

All endpoints are Next.js Route Handlers under `apps/web/src/app/api/`.

## GET /api/health

Health check endpoint. Returns DB connection status and game count.

**Response** `200`:
```json
{
  "ok": true,
  "app": "playfit",
  "timestamp": "2026-06-13T23:00:00.000Z",
  "checks": {
    "database": "connected (63,682 games)"
  }
}
```

**Response** `500` (when DB is down):
```json
{
  "ok": false,
  "app": "playfit",
  "timestamp": "2026-06-13T23:00:00.000Z",
  "checks": {
    "database": "error: connection refused"
  }
}
```

---

## GET /api/games?q=&page=&pageSize=

Search or paginate the game catalog.

**Query Parameters:**

| Param | Type | Default | Description |
|---|---|---|---|
| `q` | `string` | `""` (empty = paginate all) | Search query |
| `page` | `number` | `1` | Page number (1-indexed) |
| `pageSize` | `number` | `50` (list) / `12` (search) | Results per page (max 100) |

**Search Strategy** (when `q` is provided):
1. Full-text search on `games.search_document` (tsvector: title + aliases + series + genre)
2. ILIKE on title
3. ILIKE on game_aliases
4. ILIKE on series name
5. Results merged, scored, quality-penalized, sorted, and top 12 returned

**Quality Penalty**: games with unwanted terms (demo, soundtrack, etc.), no tags, no genre, or no cover get penalty points.

**Response** `200` (paginated):
```json
{
  "games": [
    {
      "gameId": "rawg_zelda_breath_of_the_wild",
      "title": "The Legend of Zelda: Breath of the Wild",
      "aliases": ["BotW", "Zelda BOTW"],
      "series": "The Legend of Zelda",
      "primaryGenre": "Action-adventure",
      "tags": ["open_world", "puzzle", "story_rich"],
      "coverPath": "/covers/games/zelda_breath_of_the_wild.jpg",
      "releaseYear": "2017",
      "availablePlatformIds": ["nintendo_switch", "wii_u"],
      "availablePlatformNames": ["Nintendo Switch", "Wii U"],
      "releaseState": "released",
      "source": "catalog"
    }
  ],
  "total": 5234,
  "page": 1,
  "pageSize": 50
}
```

**Response** `200` (search, no results):
```json
{
  "games": [],
  "total": 0,
  "page": 1,
  "pageSize": 12
}
```

**Error** `500`:
```json
{ "error": "Failed to load games: <message>" }
```

---

## GET /api/games/:gameId

Get single game detail. Resolves game redirects (canonical IDs).

**Response** `200`:
```json
{
  "gameId": "rawg_zelda_breath_of_the_wild",
  "title": "The Legend of Zelda: Breath of the Wild",
  "aliases": ["BotW"],
  "series": "The Legend of Zelda",
  "seriesId": "the_legend_of_zelda",
  "primaryGenre": "Action-adventure",
  "genreId": "action_adventure",
  "tags": ["open_world", "puzzle"],
  "notes": "",
  "coverPath": "/covers/games/zelda_breath_of_the_wild.jpg",
  "releaseYear": "2017",
  "availablePlatformIds": ["nintendo_switch"],
  "availablePlatformNames": ["Nintendo Switch"],
  "releaseState": "released",
  "source": "catalog"
}
```

**Error** `404`:
```json
{ "error": "Game not found" }
```

**Error** `500`:
```json
{ "error": "<message>" }
```

---

## POST /api/games/batch

Batch lookup games by IDs. Resolves redirects.

**Request**:
```json
{
  "gameIds": ["rawg_zelda_botw", "rawg_mario_odyssey", "..." ]
}
```

**Constraints**: max 500 game IDs.

**Response** `200`:
```json
{
  "games": [ /* SeedGame[] */ ]
}
```

**Error** `400` (too many IDs):
```json
{ "error": "Too many game IDs (max 500)" }
```

---

## GET /api/profile?device_id=

Read user profile.

**Auth (resolution order):**
1. SSR cookie via `auth.getUser()`
2. `Authorization: Bearer <jwt>` header
3. `device_id` query parameter (UUID v4)

**Rate limiting**: 30 req/min per IP.

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `device_id` | `string` (UUID v4) | only if no auth | Device identifier for anonymous mode |

**Response** `200` (profile found):
```json
{
  "state": {
    "version": 2,
    "user": {
      "onboarding": {
        "step": "platforms",
        "platforms": [{"platformId": "nintendo_switch", "status": "available"}],
        "likedGameIds": [],
        "dislikedGameIds": []
      },
      "onboardingCompletedAt": null,
      "profile": null,
      "gameStates": {},
      "lastUpdatedAt": null
    }
  }
}
```

**Response** `200` (no profile):
```json
{ "state": null }
```

**Error** `400` (invalid device ID):
```json
{ "error": "Invalid device identifier" }
```

**Error** `429` (rate limited):
```json
{ "error": "Too many requests" }
```

---

## POST /api/profile

Save user profile.

**Auth**: Same as GET (cookie → bearer → deviceId).
**Rate limiting**: 30 req/min per IP.

**Request**:
```json
{
  "deviceId": "uuid-v4-here",
  "gameStates": {
    "rawg_zelda_botw": {
      "gameId": "rawg_zelda_botw",
      "title": "The Legend of Zelda: Breath of the Wild",
      "status": "playing",
      "rating": 4.5,
      "inBacklog": false,
      "inWishlist": false,
      "source": "manual",
      "createdAt": "2026-06-13T12:00:00.000Z",
      "updatedAt": "2026-06-13T12:00:00.000Z"
    }
  },
  "profile": { /* ProductProfile or null */ },
  "onboarding": { /* ProductOnboardingDraft */ }
}
```

**Special behavior** (device → auth migration):
- If authenticated AND `deviceId` is provided AND profile is empty AND device has data: triggers `migrate-profile` Edge Function (async, best-effort).

**Protection A** (empty overwrite prevention):
- If body has empty gameStates + null profile AND user has existing data → returns 400.

**Response** `200` (normal save):
```json
{ "ok": true }
```

**Response** `200` (with migration):
```json
{ "ok": true, "migrated": true }
```

**Error** `400`:
```json
{ "error": "Invalid profile payload", "issues": [...] }
```
```json
{ "error": "Cannot overwrite non-empty profile with empty data" }
```

**Error** `429`:
```json
{ "error": "Too many requests" }
```

---

## DELETE /api/profile?device_id=

Reset/delete user profile.

**Auth**: Same as GET.
**Rate limiting**: 30 req/min per IP.

**Response** `200`:
```json
{ "ok": true }
```

---

## PATCH /api/profile/games/:gameId

Update game state for a single game.

**Auth**: Cookie → Bearer → deviceId (query param).
**Rate limiting**: 60 req/min per IP.

**Query Parameters:**

| Param | Type | Required | Description |
|---|---|---|---|
| `device_id` | `string` (UUID v4) | only if no auth | Device identifier |

**Request** (all fields optional):
```json
{
  "status": "playing",
  "rating": 4.0,
  "inBacklog": false,
  "inWishlist": true,
  "excluded": false,
  "source": "manual"
}
```

**Status values**: `playing`, `on_hold`, `shelved`, `beaten`, `completed`, `abandoned`, `want_to_play`
**Rating**: 0.0–5.0 (in 0.5 increments)

**Response** `200`:
```json
{ "ok": true }
```

---

## DELETE /api/profile/games/:gameId

Delete game state for a single game.

**Auth**: Cookie → Bearer → deviceId (query param).
**Rate limiting**: 60 req/min per IP.

**Response** `200`:
```json
{ "ok": true }
```

---

## POST /api/recommendations/today

Get today's recommendation model. The route is session-scoped: it resolves the caller from a
Supabase cookie, bearer token, or `device_id`, loads the persisted profile with `get_profile()`, and
scores recommendations with the `score_today_recommendations()` RPC. Cached recommendation models use
the `api_cache` table.

**Auth (resolution order):**
1. SSR cookie via `auth.getUser()`
2. `Authorization: Bearer <jwt>` header
3. `device_id` query parameter (UUID v4)

**Request body**:

No body is required. Legacy payloads containing `profile`, `onboarding`, or `gameStates` are
rejected because recommendation state must come from the persisted profile.

**Response** `200` (no persisted session state):
```json
{ "needsResync": true }
```

**Response** `200` (scored model):
```json
{
  "primary": { /* RankedSeedGame — main play-next recommendation */ },
  "alternatives": [ /* RankedSeedGame[] */ ],
  "currentRun": [ /* RankedSeedGame[] */ ],
  "nextUp": [ /* RankedSeedGame[] */ ],
  "resume": [ /* RankedSeedGame[] */ ],
  "picks": [ /* RankedSeedGame[] */ ]
}
```

**Error** `400` (legacy client payload):
```json
{ "error": "Recommendations are session-scoped; do not send profile state." }
```

**Error** `401`:
```json
{ "error": "Recommendation session required" }
```

Each `RankedSeedGame`:
```json
{
  "game": { /* SeedGame */ },
  "affinityScore": 78,
  "riskScore": 12,
  "confidence": "medium",
  "fitReasons": ["Strong history with story_rich", "Strong history with open_world"],
  "cautionReasons": ["Emerging watch-out around souls_like"],
  "platformAvailability": "available",
  "accessStatus": "playable",
  "inBacklog": false,
  "inWishlist": false,
  "inPlayfitPicks": false,
  "similarGames": [{"gameId": "...", "title": "...", "similarity": 0.85}]
}
```

---

## POST /api/recommendations/similar

Get similar games + series games for a given game ID.

**Request**:
```json
{ "gameId": "rawg_zelda_botw" }
```

**Response** `200`:
```json
{
  "similar": [ /* RankedSeedGame[] — top 5 by tag/genre similarity */ ],
  "series": [ /* RankedSeedGame[] — up to 10 in same series */ ]
}
```

**Error** `400`:
```json
{ "error": "gameId is required" }
```

---

## POST /api/recommendations/profile

Build adaptive profile from onboarding data and game states.

**Request**:
```json
{
  "onboarding": { /* ProductOnboardingDraft */ },
  "gameStates": { /* Record<string, ProductGameState> */ }
}
```

**Response** `200`:
```json
{
  "profile": {
    "summary": "You seem to enjoy story-rich...",
    "likedGenres": ["action_adventure", "role_playing"],
    "avoidedGenres": [],
    "likedTags": { "story_rich": 3, "open_world": 2 },
    "dislikedTags": { "horror": 1 },
    "ratedCount": 12,
    "signals": [
      { "id": "...", "tone": "positive", "label": "Story-rich", "reason": "Strong history" }
    ]
  }
}
```
