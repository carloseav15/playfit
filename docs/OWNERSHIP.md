# Ownership

Who implements, who reviews, and who has final say on each surface — for humans and agents
alike. This doesn't assign work; it settles authority when it's ambiguous.

| Surface | Implements | Reviews | Decides |
|---|---|---|---|
| Web UI (`apps/web/src/app`, `components/`) | Web/Product agent | QA | Product (you) |
| API / Route Handlers | Web/Product agent | QA | Tech lead (you) |
| `packages/core` (domain, schemas, store) | Web/Product agent | QA + mobile, if the contract changes | Tech lead (you) |
| `supabase/` (migrations, RLS, functions) | Web/Product agent, proposal only | Independent review before any apply | **You, always** — see `supabase/AGENTS.md` |
| `scripts/` (catalog, backup, restore) | Web/Product agent | QA before anything that writes data | You, for anything touching remote/production |
| iOS (`ios-swiftui/`) | Mobile agent | QA | Product (you) |
| Android (`android-compose/`) | Mobile agent | QA | Product (you) |
| Recommendation research (`intelligence-lab/`) | Data/AI agent | Web/Product agent, before anything ships to `packages/core` | Product (you) |
| Releases / deploys | QA signs off first | — | **You, always** |

Rule of thumb: anything that touches real user data, production infrastructure, or ships
externally-visible copy needs a human decision. Everything else can move at agent speed with
independent review, not self-review.
