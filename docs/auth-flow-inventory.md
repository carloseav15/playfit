# Web authentication and logout flow inventory

This is the current navigation inventory for the web app. The executable checks live in `apps/web/e2e/playfit.spec.ts` under `auth and logout navigation inventory`.

## State matrix

| Initial state | Action | Observed destination/state | Evidence |
| --- | --- | --- | --- |
| Cold visitor, no cookies | Open `/` | Marketing landing | `src/app/(play)/page.tsx` checks `pf_returning`; `landing-page.tsx` renders the landing view |
| Cold visitor | Open sign-in and close | Marketing landing at `/` | `landing-page.tsx` passes `onClose={() => setView("landing")}` |
| Cold visitor | Start “Find what to play” | In-page onboarding at `/#onboarding` | `landing-page.tsx` switches to calibration and mounts `PlayLayoutClient` |
| Cold visitor | Continue as guest | Anonymous Supabase session plus onboarding | `use-playfit-auth.ts` calls `signInAnonymously()` when `localFirst` is enabled |
| Returning visitor (`pf_returning=1`) | Open `/` | App shell / onboarding gate, not marketing landing | `src/app/(play)/page.tsx` and `(play)/layout.tsx` |
| Authenticated profile | Sign out in Settings | Session and local auth state clear, then redirect to marketing landing | `settings-shell.tsx` awaits `signOut()` and navigates to `/` |
| Authenticated profile | Sign out | `pf_returning` is cleared through `DELETE /api/auth/mark-returning` | `playfit-context.tsx` performs cookie cleanup after Supabase logout |
| Auth panel rendered by the provider | Close | Returns to `/` | Provider passes an explicit `onClose`; guest mode remains behind “Continue as Guest” |
| Legacy `/app` route | Open `/app` | `/` | `next.config.ts` redirect |
| Legacy `/app/settings` route | Open `/app/settings` | `/settings` | `next.config.ts` redirect |

## Current risk points

1. Supabase auth state, local profile state, and `pf_returning` are independent, so logout must clear all three transition markers together.
2. There are two visually different pre-profile experiences: the marketing landing and the app's onboarding/decision shell. Their selection depends on the cookie, not only on auth state.
3. The same “Close” control now has an explicit context: the provider-level auth panel returns to `/`, while modal auth panels can still close back to their parent app view.

## Verification command

```bash
npm run test:e2e -w apps/web -- --project=chromium -g "auth and logout navigation inventory"
```
