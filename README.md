# Movie Memory

Sign in with Google, save your favorite movie, and get a fun AI-generated fact about it.

- Google sign-in (Auth.js v5, database sessions in Postgres)
- First-time onboarding with server-side validation
- Dashboard with profile, favorite movie and a fun fact from OpenAI
- **Variant A (backend):** 60-second fact cache, per-user burst protection with a Postgres advisory lock, graceful OpenAI failure handling, and integration tests on a real database

**Stack:** Next.js 16 (App Router, TypeScript strict) · Tailwind CSS v4 · Prisma 7 + PostgreSQL 16 · Auth.js v5 (Google) · OpenAI SDK · Zod · Vitest

---

## 1. Setup

**Requirements:** Node.js 20.19+, 22.12+ or 24+ (Prisma 7), Docker, a Google account, and an OpenAI API key.

```bash
git clone <repo-url> movie-memory && cd movie-memory
npm install                    # also runs `prisma generate`
cp .env.example .env           # fill in values (see below and section 2)
docker compose up -d --wait    # Postgres 16 on localhost:5432
npx prisma migrate dev         # create the tables
npm run dev                    # http://localhost:3000
npm test                       # 35 tests (needs the Docker Postgres running)
```

### Auth secret

```bash
openssl rand -base64 32        # paste into AUTH_SECRET in .env
```

### Google OAuth client

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (no billing needed).
2. **APIs & Services** → **OAuth consent screen** (may show as **Google Auth Platform** → **Get started**):
   - app name and support email;
   - audience **External**;
   - under **Audience / Test users**, add the Google account(s) you'll sign in with.
3. **Credentials** (or **Clients**) → **Create OAuth client ID** → **Web application**.
4. Add this **Authorized redirect URI** (exactly):
   ```
   http://localhost:3000/api/auth/callback/google
   ```
5. Put the **Client ID** (`…apps.googleusercontent.com`) in `AUTH_GOOGLE_ID` and the **Client secret** (`GOCSPX-…`) in `AUTH_GOOGLE_SECRET`.
6. Restart `npm run dev`, open http://localhost:3000 and click **Sign in with Google**.

Common errors: `redirect_uri_mismatch` (the URI isn't an exact match), "Access blocked" (your account isn't a test user).

### OpenAI

Put an API key in `OPENAI_API_KEY`. Without a working key the app still runs: the fact box shows a friendly "couldn't come up with a fact" message (see section 4).

_Optional, free local alternative:_ any OpenAI-compatible server works through the official SDK's `OPENAI_BASE_URL`. For example, with [Ollama](https://ollama.com):

```bash
ollama pull llama3.1:8b
# .env
OPENAI_BASE_URL="http://localhost:11434/v1"
OPENAI_API_KEY="ollama"        # any non-empty value
OPENAI_MODEL="llama3.1:8b"
```

Small local models are less accurate than `gpt-4o-mini`; use them for development only.

## 2. Environment variables

| Variable             | Required | Example / default                                      | Purpose                                                                                                                            |
| -------------------- | -------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | yes      | `postgresql://movie:movie@localhost:5432/movie_memory` | Postgres connection (matches `docker-compose.yml`)                                                                                 |
| `AUTH_SECRET`        | yes      | output of `openssl rand -base64 32`                    | Signs/encrypts Auth.js cookies and tokens                                                                                          |
| `AUTH_TRUST_HOST`    | local    | `true`                                                 | Lets Auth.js trust the Host header (needed for `next start` locally). In a real deployment set `AUTH_URL` instead (Vercel sets it) |
| `AUTH_GOOGLE_ID`     | yes      | `….apps.googleusercontent.com`                         | Google OAuth client ID                                                                                                             |
| `AUTH_GOOGLE_SECRET` | yes      | `GOCSPX-…`                                             | Google OAuth client secret                                                                                                         |
| `OPENAI_API_KEY`     | yes\*    | `sk-…`                                                 | OpenAI key. \*The app runs without it, but no facts are generated                                                                  |
| `OPENAI_MODEL`       | no       | `gpt-4o-mini`                                          | Model for facts                                                                                                                    |
| `OPENAI_BASE_URL`    | no       | `http://localhost:11434/v1`                            | Optional: point the SDK at an OpenAI-compatible server (e.g. Ollama)                                                               |

All are server-only: none use the `NEXT_PUBLIC_` prefix, so none reach the browser. `.env` is git-ignored. Tests use `.env.test` (committed; only the local test-database URL).

## 3. Database & migrations

- Schema: `prisma/schema.prisma`. Migrations: `prisma/migrations/` (committed). Prisma CLI config: `prisma.config.ts` (loads `.env`).
- The generated client lives in `lib/generated/prisma` (git-ignored). `npm install` regenerates it via `postinstall`.

| Task                       | Command                                                              |
| -------------------------- | -------------------------------------------------------------------- |
| Apply migrations (dev)     | `npx prisma migrate dev`                                             |
| Apply migrations (prod/CI) | `npx prisma migrate deploy`                                          |
| After changing the schema  | `npx prisma migrate dev --name <change>` then `npx prisma generate`  |
| Check status               | `npx prisma migrate status`                                          |
| Browse data                | `npx prisma studio`                                                  |
| Test database              | Reset and migrated automatically by `npm test` (`movie_memory_test`) |

Prisma 7's `migrate dev` no longer runs `generate` automatically, hence the explicit step.

### Scripts

| Command             | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `npm run dev`       | Start the dev server                            |
| `npm run build`     | Production build                                |
| `npm test`          | Run all tests (Vitest)                          |
| `npm run lint`      | ESLint                                          |
| `npm run typecheck` | Generate Next route types, then `tsc --noEmit`  |
| `npm run format`    | Format with Prettier (`format:check` to verify) |

## 4. Architecture

### Request flow: loading the dashboard

```mermaid
sequenceDiagram
    participant B as Browser
    participant P as proxy.ts
    participant D as /dashboard (server component)
    participant F as lib/facts.ts
    participant DB as Postgres
    participant AI as OpenAI

    B->>P: GET /dashboard (session cookie)
    P-->>B: 307 → / (only if no session cookie at all)
    P->>D: has a cookie
    D->>DB: getCurrentUser(): Session → User (incl. favoriteMovie)
    D-->>B: no valid session → /, no movie → /onboarding
    D-->>B: profile card + fact skeleton (streamed immediately)
    D->>F: <Suspense> MovieFact → getOrCreateFact(user.id)
    F->>DB: newest fact for (user, movie)
    alt younger than 60s
        F-->>D: cached fact
    else stale or none
        F->>DB: BEGIN; pg_advisory_xact_lock(1, hashtext(userId)); re-check
        F->>AI: generate (10s timeout, 1 retry)
        alt success
            F->>DB: INSERT fact; COMMIT
        else failure
            F->>DB: latest older fact for this movie (stale) or FactUnavailableError
        end
    end
    D-->>B: fact streamed into place (or stale note / "Try again")
```

Other flows:

- **Sign in:** `/` → server action `signIn("google", { redirectTo: "/" })` → Google → `/api/auth/callback/google` → the Prisma adapter writes `User`/`Account`/`Session` → `/` decides: no movie → `/onboarding`, otherwise `/dashboard`.
- **Onboarding:** form (`useActionState`) → server action `saveFavoriteMovie`: `auth()` → Zod `movieSchema` → `user.update` scoped to `session.user.id` → `/dashboard`.
- **`GET /api/fact`:** `auth()` (401 if none) → `getOrCreateFact(session.user.id)` → `{ id, movie, content, createdAt, source }` with `Cache-Control: no-store`. Stale → 200, unavailable → 502, unexpected → 500.

### Folder structure

```
app/
  page.tsx                  landing + routing by auth state + sign-in action
  onboarding/               page (guards) + actions.ts (saveFavoriteMovie)
  dashboard/                page (guards, profile, <Suspense> fact, logout) + error.tsx
  api/auth/[...nextauth]/   Auth.js handlers
  api/fact/route.ts         GET /api/fact
  error.tsx, not-found.tsx  error boundary, 404
components/                 onboarding-form, movie-fact, user-avatar, retry-button, error-view
lib/                        server code (all `server-only` except validation/display)
  auth.ts                   Auth.js config (Google, Prisma adapter, DB sessions)
  current-user.ts           getCurrentUser(): session → user (data access layer)
  db.ts                     Prisma client singleton (adapter-pg)
  facts.ts                  getOrCreateFact: cache, lock, fallback
  openai.ts                 generateMovieFact (prompt, timeout, retry)
  validation.ts             movieSchema (Zod)
  display.ts                display-name / initials fallbacks
proxy.ts                    optimistic auth redirect for /dashboard, /onboarding
prisma/                     schema + migrations
tests/                      Vitest (unit + DB integration) and test support
```

### Schema (and why)

| Model / field                                     | Why                                                                                                                                                                                                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `User`, `Account`, `Session`, `VerificationToken` | Standard Auth.js Prisma adapter shape. `Session` rows back database sessions.                                                                                                                                                                                |
| `User.favoriteMovie String?`                      | One favorite per user, so a column is simplest: no join, one update. `null` doubles as "onboarding not done". **Alternative:** a `FavoriteMovie`/`Movie` table, which I'd switch to for movie history or metadata (year, poster) via a `favoriteMovieId` FK. |
| `User.name`, `User.image` nullable                | Google may omit them; the dashboard falls back to email prefix / "Movie fan" and an initials avatar.                                                                                                                                                         |
| `Fact.userId` → `User` (`onDelete: Cascade`)      | Facts belong to one user; deleting a user removes them.                                                                                                                                                                                                      |
| `Fact.movie`                                      | The title the fact was generated for. Lookups filter by the user's _current_ movie, so changing the favorite never serves stale facts about the old one, with no cleanup job.                                                                                |
| `Fact.createdAt`                                  | Drives the 60-second cache. Written by the app's clock (the same clock as the age check).                                                                                                                                                                    |
| `@@index([userId, movie, createdAt(sort: Desc)])` | Matches the hot query exactly ("newest fact for this user + movie"): equality columns first, then the sort column. `EXPLAIN` shows an index scan with no sort step. It also serves queries by `userId` alone.                                                |

### Authentication & authorization

- **Auth.js v5 with database sessions.** The cookie holds only a random token, and the session lives in `Session`. The session callback returns an explicit allow-list (`id`, `name`, `email`, `image`), so the session token is never exposed via `/api/auth/session`.
- **Every query is scoped to the session user.** `getCurrentUser()` and `auth()` are the only sources of a user id. No page, route or action accepts a user id from the request.
- **Two layers:** `proxy.ts` gives signed-out visitors a real 307 (cookie-presence check only); each page and server action verifies the session against the database (the real boundary). Server actions re-check `auth()` because they're public POST endpoints.
- **Input validation** with Zod on the server (`movieSchema`: normalize whitespace and Unicode, 1–100 chars, no control characters).
- **Server-only code** (`import "server-only"`) for anything touching the DB or secrets.

## 5. Variant chosen: A (backend)

I chose **Variant A** (caching + correctness) over Variant B (client orchestration) because:

- the core risks in this app are server-side: OpenAI cost and latency, duplicate generation under concurrency, and failure handling;
- it's self-contained (one service, `lib/facts.ts`) and **testable deterministically** against a real database, with an injected clock and generator;
- the concurrency problem (and proving it's fixed) is the most interesting correctness work in the project.

### Fact caching & concurrency

- **60-second cache:** `getOrCreateFact` reuses the newest fact for the user's current movie if it's younger than `FACT_TTL_MS` (60s). The `Fact` table _is_ the cache: one indexed lookup, no extra infrastructure, shared by every server instance.
- **Burst protection (Postgres advisory lock):** on a cache miss, generation runs in a transaction that first takes `pg_advisory_xact_lock(1, hashtext(userId))`. Concurrent requests for the _same user_ queue on the lock, re-check the cache once they get it, and reuse the fact the first request stored. Other users have different lock keys and are unaffected. The lock is released automatically on commit or rollback, even on crash.
  - Measured with 10 parallel requests and a 2s fake generator: without the lock, **10** OpenAI calls and 10 rows. With the lock, **1** call and **1** row (30 parallel: also 1 and 1). Two different users at once finish in ~2s, not ~4s.
  - **Why not a `FactGeneration` row** with a unique `(userId, windowStart)` and polling? The lock needs no schema change and no polling loop, works across server instances, and can't leave a stuck "in progress" row if a request crashes.
- **Failure handling:** if generation fails (bad key, 5xx, timeout), return the newest earlier fact for the same movie as `source: "stale"` (UI shows a subtle note), or throw `FactUnavailableError` (UI shows a friendly message and **Try again**). OpenAI error messages never reach users. Logs record only `{ status, code }` for OpenAI errors, because a 401 message echoes a partially masked key.

### Tests

```bash
docker compose up -d --wait   # tests need the local Postgres
npm test
```

- **Real database, no Prisma mocks.** Tests run against `movie_memory_test` (`.env.test`). A Vitest global setup runs `prisma migrate reset --force` once per run and **refuses any database whose name doesn't end in `_test`**. Each test empties the tables first, and test files run sequentially because they share the database.
- **Only the generator is faked** (injected via `{ now, generate }`), with a fixed clock, so there's no network and no sleeps.
- `server-only` is aliased to an empty module in tests only.

| #   | Test (`tests/facts.test.ts`, `tests/api-fact.test.ts`)                                                                  | Proves                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | No fact → generates and stores one                                                                                      | basic path; row has `userId`, `movie`, `createdAt = now` |
| 2   | Fact 30s old → cached, generator not called                                                                             | 60s cache hit                                            |
| 3   | Fact 61s old → new fact (plus: exactly 60s counts as expired)                                                           | cache expiry boundary                                    |
| 4   | Recent fact for a different movie → new fact                                                                            | changing movie invalidates                               |
| 5   | Generator throws + old fact → newest old fact as `stale`                                                                | graceful degradation, nothing written                    |
| 6   | Generator throws + no fact (other movie's fact ignored) → `FactUnavailableError`                                        | typed failure                                            |
| 7   | 5 parallel calls → generator called once, 1 row, 1 `fresh` + 4 `cache`                                                  | advisory lock works (**fails if the lock is removed**)   |
| 8   | User B never gets user A's fact (fresh or stale); `GET /api/fact` without session → 401; signed in as B → B's fact only | authorization / data isolation                           |
| —   | API: stale → 200; unavailable → 502 with a generic message (no upstream text)                                           | error mapping, no leaks                                  |

Plus unit tests for the movie-title schema and display fallbacks: **35 tests total**.

## 6. Key tradeoffs

| Decision                                                  | Benefit                                                                                    | Cost / risk                                                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI call runs while holding the per-user lock**      | Exactly one generation per burst; simple, correct                                          | Same-user requests wait for the call (tx timeout 30s, above the ~21s worst case); each waiter holds a DB connection; other users are unaffected |
| **Database sessions** instead of JWT                      | Instant revocation (logout deletes the row); no user data in the cookie; always fresh data | One DB lookup per request; needs the Node runtime                                                                                               |
| **One fact per 60s per user + movie** (generated on load) | Bounded OpenAI cost (at most ~1 call/min/user) and latency; variety on revisits            | Rendering the dashboard can trigger a paid call (side effect of a GET); still unbounded across many users without rate limiting                 |
| **Cache in Postgres** (the `Fact` table)                  | No Redis; survives restarts; works across instances                                        | One indexed query per load                                                                                                                      |
| **Stale fallback** on generation failure                  | Users keep seeing a (true) fact during OpenAI outages                                      | Each request still waits for OpenAI to fail first (no negative caching); while failing, waiters retry one after another                         |
| **Next 16 Cache Components + `proxy.ts`**                 | Profile streams instantly; fact streams in behind `<Suspense>`                             | In-page `redirect()` arrives client-side (200 shell), so real 307s come from `proxy.ts` (cookie check only; pages remain the real guard)        |
| **Server actions** for sign-in, onboarding, logout        | Less code, typed, works without JavaScript                                                 | Public POST endpoints: each must re-check auth (they do)                                                                                        |

### Known limitations

- Movie titles compare exactly after normalization: "heat" and "Heat" are different cache keys.
- A database outage makes signed-in users look signed out (Auth.js returns no session on adapter errors). It fails closed, but the UX is confusing.
- Prompt injection through the movie title is reduced (the title is JSON-quoted and treated as data), not eliminated. The impact is low: output goes only to the same user, as escaped text, and the model has no tools.
- A broken or expired Google photo URL shows a broken image (no initials fallback on load error).
- 7 moderate `npm audit` advisories in dev-only ESLint tooling (production dependencies: 0); no fix within `eslint-config-next`'s range yet.

## Security & correctness audit

| Code                                              | Query                                      | Scoped by                                     |
| ------------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| `lib/current-user.ts` → `getCurrentUser()`        | `user.findUnique`                          | `session.user.id` from `auth()`               |
| `app/onboarding/actions.ts` → `saveFavoriteMovie` | `user.update`                              | `session.user.id` (action re-checks `auth()`) |
| `lib/facts.ts` → `getOrCreateFact(userId)`        | `user.findUnique`, `fact.findFirst/create` | `userId` from `getCurrentUser()` / `auth()`   |
| `lib/auth.ts` (Auth.js Prisma adapter)            | User / Account / Session                   | Auth.js internals (session token cookie)      |

- **Inputs:** the only user input is the onboarding `movie` field, validated server-side (verified by POSTing directly to the action, bypassing browser validation).
- **Secrets:** verified by building with a sentinel `OPENAI_API_KEY` and grepping `.next/static` for the key, `OPENAI_API_KEY`, `DATABASE_URL`, `AUTH_SECRET` and `chat/completions`: 0 matches.
- **Errors:** `app/error.tsx` and `app/dashboard/error.tsx` show a friendly message, **Try again** and only the error `digest` (verified with a forced error: the message stays in server logs). `app/not-found.tsx` returns 404. Expected OpenAI failures are handled in the fact box; unexpected errors go to the error boundary.
- **XSS:** names, titles and AI output are rendered as escaped text (verified with `<script>` and `onerror` payloads).
- **Images:** `next/image` only fetches from `lh3.googleusercontent.com` (others get 400).
- **Checks:** `npm run lint`, `npm run typecheck` and `npm test` (35 tests) pass. `npm audit --omit=dev`: 0 vulnerabilities.

## 7. With 2 more hours

- **Rate limiting** on fact generation and `/api/fact` (per user and per IP), to cap OpenAI cost beyond the 60s cache.
- **Negative caching:** remember a recent OpenAI failure for ~30s and serve the stale fact immediately, instead of waiting for each retry.
- **E2E tests (Playwright):** sign-in with a seeded session, onboarding, cache behavior, the **Try again** button, and the error boundary UI.
- **Streaming facts:** stream tokens from OpenAI into the fact box for faster perceived load.
- **Movie autocomplete via TMDB:** canonical titles and IDs, which fixes "heat" vs "Heat" and enables posters and metadata (move to a `Movie` table).
- **Observability:** structured logs with request IDs, metrics for cache hit rate, lock wait time and OpenAI latency/errors, and error tracking (e.g. Sentry) keyed by the error digest.
- **Edit favorite movie** on the dashboard, and a "New fact" button that respects the cache.
