# Movie Memory

Sign in with Google, save your favorite movie, and get a fun fact about it.

## Setup

Requires Node 20+ and Docker.

```bash
npm install                 # also runs `prisma generate`
cp .env.example .env        # then fill in the values (see below)
docker compose up -d --wait # Postgres 16 on localhost:5432
npx prisma migrate dev      # create the tables
npm run dev                 # http://localhost:3000
```

### Auth secret

```bash
openssl rand -base64 32     # paste into AUTH_SECRET in .env
```

### Google OAuth client

1. Open [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** → **OAuth consent screen**. Configure it as **External**, and add your Google account as a **test user** while the app is in testing mode.
2. **APIs & Services** → **Credentials** → **Create credentials** → **OAuth client ID** → **Web application**.
3. Add an **Authorized redirect URI**:
   ```
   http://localhost:3000/api/auth/callback/google
   ```
4. Copy the client ID and secret into `.env` as `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
5. Restart `npm run dev`, open http://localhost:3000 and click **Sign in with Google**.

## Scripts

| Command             | What it does                                |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | Start the dev server                        |
| `npm test`          | Run tests (Vitest)                          |
| `npm run lint`      | ESLint                                      |
| `npm run typecheck` | Generate Next route types, then `tsc`       |
| `npm run format`    | Format with Prettier (`format:check` in CI) |

## Fact caching & concurrency

- **60-second cache:** `getOrCreateFact` (`lib/facts.ts`) reuses the newest fact for the user's current movie if it's younger than `FACT_TTL_MS` (60s). The `Fact` table is the cache: one indexed lookup, no extra infrastructure, shared by every server instance.
- **Burst protection (Postgres advisory lock):** on a cache miss, generation runs in a transaction that first takes `pg_advisory_xact_lock(1, hashtext(userId))`. Concurrent requests for the _same user_ queue on the lock, re-check the cache once they get it, and reuse the fact the first request stored. Other users have different lock keys and are unaffected. The lock is released automatically on commit or rollback.
  - Measured with 10 parallel requests and a 2s fake generator: without the lock, **10** OpenAI calls and 10 rows. With the lock, **1** call and **1** row (30 parallel: also 1 and 1). Two different users at once finish in ~2s, not ~4s.
  - **Why this over the alternative** (a `FactGeneration` row with a unique `(userId, windowStart)` and polling for the winner): the lock needs no schema change and no polling loop, works across server instances because Postgres coordinates it, and can't leave a stuck "in progress" row behind if a request crashes.
  - **Tradeoffs:** the OpenAI call runs while the lock is held, so same-user requests wait for it (transaction timeout 30s, above the ~21s worst case of 10s × 2 attempts). Each waiting request holds a DB connection while blocked. When OpenAI is failing, waiters don't benefit (each retries in turn).

## Tests

```bash
docker compose up -d --wait   # tests need the local Postgres
npm test
```

- **Real database, no Prisma mocks.** Tests run against a separate database, `movie_memory_test` (`.env.test`, committed because it holds only local Docker credentials). A Vitest global setup (`tests/support/global-setup.ts`) runs `prisma migrate reset --force` once per run, and refuses any database whose name doesn't end in `_test`, so it can never wipe the dev DB. Each test empties the tables first. Test files run one at a time because they share the database.
- **Only the generator is faked.** `getOrCreateFact` takes `{ now, generate }`, so tests pass a fixed clock and a fake generator instead of calling OpenAI.
- `server-only` is aliased to an empty module in tests only (it throws outside Next's server environment).

| #   | Test (`tests/facts.test.ts`, `tests/api-fact.test.ts`)                                                                  | Proves                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | No fact → generates and stores one                                                                                      | basic path; row has `userId`, `movie`, `createdAt = now` |
| 2   | Fact 30s old → cached, generator not called                                                                             | 60s cache hit                                            |
| 3   | Fact 61s old → new fact (plus: exactly 60s counts as expired)                                                           | cache expiry boundary                                    |
| 4   | Recent fact for a different movie → new fact                                                                            | changing movie invalidates                               |
| 5   | Generator throws + old fact → newest old fact as `stale`                                                                | graceful degradation, nothing written                    |
| 6   | Generator throws + no fact (other movie's fact ignored) → `FactUnavailableError`                                        | typed failure                                            |
| 7   | 5 parallel calls → generator called once, 1 row, 1 `fresh` + 4 `cache`                                                  | advisory lock works (fails if the lock is removed)       |
| 8   | User B never gets user A's fact (fresh or stale); `GET /api/fact` without session → 401; signed in as B → B's fact only | authorization / data isolation                           |
| —   | API: stale → 200; unavailable → 502 with a generic message (no upstream text)                                           | error mapping, no leaks                                  |

Plus unit tests for the movie-title schema (`tests/validation.test.ts`) and display fallbacks (`tests/display.test.ts`): **35 tests total**.

## Security & correctness audit

_Draft, written during the T8 hardening pass._

**Authorization: every query is scoped to the session user.** No route, action or page takes a user id from the URL, query string or body.

| Code                                              | Query                            | Scoped by                                     |
| ------------------------------------------------- | -------------------------------- | --------------------------------------------- |
| `lib/current-user.ts` → `getCurrentUser()`        | `user.findUnique`                | `session.user.id` from `auth()`               |
| `app/onboarding/actions.ts` → `saveFavoriteMovie` | `user.update`                    | `session.user.id` (action re-checks `auth()`) |
| `lib/facts.ts` → `getFactForUser(userId)`         | `user.findUnique`, `fact.create` | `userId` passed from `getCurrentUser()`       |
| `lib/auth.ts` (Auth.js Prisma adapter)            | User / Account / Session         | Auth.js internals (session token cookie)      |

- **Request inputs:** the only user input is the onboarding `movie` field. It's validated on the server with Zod (`lib/validation.ts`) and tested by POSTing directly to the action, which skips browser validation.
- **Server actions** (sign in, sign out, save movie) are public POST endpoints. Each authorizes itself: sign-in and sign-out take no input, and `saveFavoriteMovie` calls `auth()` before writing.
- **Pages** check the session against the database (`getCurrentUser()`). `proxy.ts` is only an optimistic cookie-presence redirect, not the security boundary.
- **Database outage fails closed:** if Postgres is down, `auth()` returns no session, so users are treated as signed out and redirected. No data or error details are exposed.

**Secrets stay on the server.**

- Modules that touch secrets or the DB import `server-only` (`lib/db.ts`, `lib/auth.ts`, `lib/openai.ts`, `lib/facts.ts`, `lib/current-user.ts`).
- No `NEXT_PUBLIC_` variables exist. `.env` is git-ignored; only `.env.example` (no values) is committed.
- Verified by building with a sentinel `OPENAI_API_KEY` and grepping `.next/static` for the key, `OPENAI_API_KEY`, `DATABASE_URL`, `AUTH_SECRET` and `chat/completions`. 0 matches.
- `/api/auth/session` returns only `{ id, name, email, image }`. The session token is never sent to client JavaScript.

**Errors never leak internals.**

- `app/error.tsx` (all pages) and `app/dashboard/error.tsx` show a friendly message, **Try again**, and only the error `digest`. The digest matches the server log entry, and the raw message stays on the server (verified with a forced error).
- `app/not-found.tsx` handles unknown URLs (HTTP 404).
- OpenAI failures (no key, 5xx, timeout) are caught in the fact box. The rest of the dashboard still renders, and nothing is written.

**Other checks.**

- User-provided text (names, movie titles, AI output) is rendered by React as escaped text. Verified with `<script>` and `onerror` payloads.
- `next/image` only fetches from `lh3.googleusercontent.com`; other hosts get a 400.
- `npm run lint`, `npm run typecheck` and `npm test` (35 tests) pass.
- `npm audit --omit=dev`: 0 vulnerabilities. There are 7 moderate advisories in dev-only ESLint tooling (`@typescript-eslint` → `minimatch`). `npm audit fix` can't resolve them within `eslint-config-next`'s version range, and none of that code ships to production.
