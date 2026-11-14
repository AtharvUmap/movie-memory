# Movie Memory — Implementation Tickets

Implemented one ticket at a time with Claude Code. After each ticket: run it, review the diff, commit.

Do T0–T8 (base), then **either** the A-tickets **or** the B-tickets, then T-FINAL.

**Recommendation:** Variant A. It's self-contained (one service + tests), easy to test deterministically, and exercises caching and concurrency correctness. Pick B for a stronger React-state focus.

---

## T0 — Project conventions (CLAUDE.md)

**Goal:** Give Claude Code persistent context before writing code.

Create `CLAUDE.md` with:
- Stack: Next.js (App Router) + TypeScript (strict) + Tailwind + Prisma + Postgres + Auth.js (NextAuth v5) Google provider + OpenAI SDK.
- Rules: server-only code (Prisma, OpenAI, secrets) never imported from client components; use `import "server-only"` in those modules. All DB queries scoped by `session.user.id` — never by an ID from the request body/query. Validate input with Zod on the server. No `any`.
- Folder layout: `app/` routes, `lib/` server utilities (`lib/db.ts`, `lib/auth.ts`, `lib/openai.ts`, `lib/validation.ts`), `components/` UI, `tests/`.
- Keep it simple; no over-engineering.
- Documentation rule: after every ticket, write/update the notes in `notes/` (git-ignored) as described in CLAUDE.md. Never commit `notes/`.

**Done when:** file exists and is committed; `notes/` is in `.gitignore`.

---

## T1 — Scaffold the app

**Goal:** Running Next.js app with tooling.

- `create-next-app` with TypeScript, Tailwind, App Router, ESLint, `src/` optional (pick one and stick to it).
- Add Prettier, `tsconfig` strict mode.
- Add Vitest for tests (`npm test`).
- Add `.env.example` listing: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-4o-mini`).
- Add `docker-compose.yml` with a Postgres 16 service for local dev.
- `.gitignore` includes `.env`.

**Done when:** `docker compose up -d && npm run dev` serves the default page; `npm test` runs (even with zero tests).

---

## T2 — Prisma schema & migration

**Goal:** Data model for users, auth, movies, facts.

Schema:
- Auth.js Prisma adapter models: `User`, `Account`, `Session`, `VerificationToken` (standard shape).
- On `User` add `favoriteMovie String?` (nullable = onboarding not done). *Alternative: separate `FavoriteMovie` table — pick the simple one and note the tradeoff in README.*
- `Fact` model: `id`, `userId` (FK → User, `onDelete: Cascade`), `movie String` (title the fact was generated for — so changing movie doesn't serve stale facts), `content String`, `createdAt DateTime @default(now())`.
- Index: `@@index([userId, movie, createdAt(sort: Desc)])` for "latest fact for user+movie".
- `lib/db.ts`: Prisma client singleton (avoid hot-reload connection leaks).

**Done when:** `npx prisma migrate dev --name init` succeeds; `npx prisma studio` shows tables.

---

## T3 — Google OAuth with Auth.js

**Goal:** Sign in/out with Google, sessions stored in Postgres.

- Install `next-auth@beta` + `@auth/prisma-adapter`.
- `lib/auth.ts` exporting `{ handlers, auth, signIn, signOut }` with Google provider and Prisma adapter, **database session strategy**.
- `app/api/auth/[...nextauth]/route.ts` exports handlers.
- Session callback exposes `user.id` (typed via module augmentation in `types/next-auth.d.ts`).
- Google Cloud console: authorized redirect URI `http://localhost:3000/api/auth/callback/google` (document in README).

**Done when:** you can sign in with Google and a `User` + `Account` row appears in DB.

---

## T4 — Landing page & routing logic

**Goal:** Correct redirects for every auth state.

- `/` (server component):
  - Unauthenticated → landing page with app name, short tagline, "Sign in with Google" button (server action calling `signIn("google")`).
  - Authenticated + `favoriteMovie` null → redirect `/onboarding`.
  - Authenticated + has movie → redirect `/dashboard`.
- Post-login `redirectTo: "/"` so the above logic decides first-time vs returning.
- `/dashboard` and `/onboarding`: if no session → `redirect("/")`. Do this check in the server component (and optionally `middleware.ts`), not client-side.
- `/onboarding` when movie already set → redirect `/dashboard` (first-time only).

**Done when:** all 5 state/route combos behave correctly (manually verified; list them in a checklist in the PR/commit).

---

## T5 — Onboarding: favorite movie

**Goal:** Capture and store favorite movie with server-side validation.

- `lib/validation.ts`: Zod schema `movieSchema = z.string().trim().min(1).max(100)` (also collapse internal whitespace; reject control characters). Export it — reused by Variant B.
- `/onboarding` page: form with input + submit, using a **server action** (`useActionState` for errors).
- Server action: get session (reject if none) → validate → `prisma.user.update({ where: { id: session.user.id }, data: { favoriteMovie } })` → redirect `/dashboard`.
- Show validation errors inline; disable button while pending.

**Done when:** empty/whitespace/101-char input is rejected server-side (verify by bypassing client with curl or disabling HTML `required`); valid input saves and redirects.

---

## T6 — Dashboard

**Goal:** Show user info and movie.

- `/dashboard` server component reads session + user from DB.
- Display: name, email, photo, favorite movie, Logout button (server action `signOut({ redirectTo: "/" })`).
- **Graceful fallbacks:** no photo → initials avatar (or generic icon); no name → use email prefix or "Movie fan".
- Use `next/image` with `lh3.googleusercontent.com` allowed in `next.config` (or plain `<img>`; note why).
- Clean Tailwind card layout, responsive.

**Done when:** dashboard renders with real Google data; manually test with name/image nulled in DB.

---

## T7 — OpenAI fact generation (base)

**Goal:** Show a fun fact about the user's movie, stored in DB.

- `lib/openai.ts` (`server-only`): `generateMovieFact(movie: string): Promise<string>`.
  - Use official `openai` SDK, model from env, short system prompt ("one fun, accurate, 1–2 sentence fact; if unsure about the film, say something general and true").
  - Timeout (e.g. 10s via SDK `timeout`), `maxRetries: 1`, cap `max_tokens`.
  - Treat movie title as data in the prompt (quoted), not instructions.
- `lib/facts.ts` (`server-only`): `getFactForUser(userId)` → loads user's movie, generates fact, inserts `Fact` row, returns it.
- Dashboard shows the fact in a `<Suspense>` boundary with a loading skeleton, and an error state if generation fails.

**Done when:** each dashboard load shows a fact; rows accumulate in `Fact` table; `OPENAI_API_KEY` never appears in client bundle (`grep` the `.next/static` output).

---

## T8 — Base hardening pass

**Goal:** Meet "Security & Correctness" section.

- Audit: every Prisma query is filtered by session user id; no route accepts a userId param.
- Error boundaries: `app/error.tsx`, `app/dashboard/error.tsx`, `not-found.tsx`.
- Confirm no secrets in client code (`NEXT_PUBLIC_` used for nothing sensitive).
- Lint + typecheck pass (`npm run lint && npx tsc --noEmit`).

**Done when:** audit notes added to README draft; lint/typecheck clean.

---

# Variant A — Backend (caching + correctness)

## A1 — 60-second cache window

**Goal:** Reuse a fact younger than 60s.

- Refactor `lib/facts.ts` → `getOrCreateFact(userId, { now = new Date(), generate = generateMovieFact } = {})` (inject clock + generator for testability).
- Logic: find latest `Fact` where `userId` + `movie = user.favoriteMovie`; if `now - createdAt < 60s` → return it (`source: "cache"`); else generate, insert, return (`source: "fresh"`).
- Constant `FACT_TTL_MS = 60_000` in one place.
- Optional: expose via `GET /api/fact` route handler (session-scoped) so it's testable and refreshable.

**Done when:** refreshing within 60s shows same fact; after 60s a new one.

## A2 — Burst / idempotency protection

**Goal:** Concurrent requests (multi-tab, rapid refresh) generate at most one fact per window.

Recommended approach: **Postgres advisory lock in a transaction** (works across multiple server instances, no schema change):
- In `getOrCreateFact`: `prisma.$transaction(async tx => { await tx.$executeRaw\`SELECT pg_advisory_xact_lock(hashtext(${userId}))\`; re-check cache inside lock; if still stale → generate + insert })`.
- Caveat: OpenAI call happens while holding the lock → set transaction `timeout` > OpenAI timeout (e.g. 15s), and document that other requests for the *same user* wait (other users are unaffected).
- *Alternative if you prefer:* a `FactGeneration` row with unique `(userId, windowStart)`; on unique violation, wait/poll for the winner. Pick one; README explains why.

**Done when:** firing 10 parallel requests (`for i in {1..10}; do curl ... & done` with session cookie, or a test) creates exactly 1 new `Fact` row.

## A3 — OpenAI failure handling

**Goal:** Degrade gracefully.

- Wrap generate call: on error/timeout → return most recent fact for user+movie regardless of age (`source: "stale"`), else throw a typed `FactUnavailableError`.
- UI: stale → show fact with subtle "couldn't fetch a new fact, showing a previous one" note; no fact → friendly message + "Try again" button. Never surface raw OpenAI error text.
- Log errors server-side (no secrets in logs).

**Done when:** setting an invalid `OPENAI_API_KEY` shows a previous fact if one exists, otherwise the friendly error.

## A4 — Backend tests

**Goal:** Required tests.

- Vitest with a **real test Postgres DB** (separate `DATABASE_URL` in `.env.test`, `prisma migrate reset --force` in global setup) — more convincing than mocking Prisma. Mock only the generator (injected).
- Tests:
  1. No fact → generates and stores one.
  2. Fact 30s old → returns cached, generator not called.
  3. Fact 61s old → generates new.
  4. Fact for a *different movie* → generates new (movie change invalidates).
  5. Generator throws + old fact exists → returns stale fact.
  6. Generator throws + no fact → throws `FactUnavailableError`.
  7. Concurrency: 5 parallel `getOrCreateFact` calls → generator called once, one row.
  8. **Authorization:** user B's call never returns user A's fact; `GET /api/fact` without session → 401 (test route handler with mocked `auth()`).

**Done when:** `npm test` green; tests documented in README.

---

# Variant B — Frontend/API (client orchestration)

## B1 — API routes with typed contracts

**Goal:** JSON API with shared types.

- `lib/api-types.ts`: shared types — `Me { id, name: string|null, email, image: string|null, favoriteMovie: string|null }`, `Fact { id, movie, content, createdAt: string }`, `ApiError { error: { code: "UNAUTHORIZED"|"VALIDATION"|"NOT_FOUND"|"UPSTREAM"|"INTERNAL", message: string } }`.
- `GET /api/me` → `Me` (401 if no session).
- `PUT /api/me/movie` body `{ movie }` → validates with shared Zod schema → returns updated `Me` (400 on validation with message).
- `GET /api/fact` → `Fact` (generates via `lib/facts.ts`; 502 `UPSTREAM` on OpenAI failure). Optional `?fresh=1`.
- All scoped to session user; consistent error envelope via a small `jsonError()` helper.

**Done when:** each endpoint verified with curl incl. 401/400 cases.

## B2 — Typed client wrapper

**Goal:** `lib/api.ts` for all client calls.

- `ApiClientError extends Error { status, code }`.
- Internal `request<T>(path, init)`: sets JSON headers, `credentials: "same-origin"`, parses JSON, maps non-2xx to `ApiClientError` (handles non-JSON bodies & network failures → `code: "NETWORK"`).
- Exports: `api.getMe()`, `api.updateMovie(movie)`, `api.getFact({ fresh?: boolean })`.
- Optional: runtime-validate responses with Zod.

**Done when:** dashboard uses only this module for client data fetching.

## B3 — Inline movie edit with optimistic UI

**Goal:** Edit movie on dashboard.

- Client component `<FavoriteMovie>`: view mode (title + Edit) / edit mode (input + Save + Cancel; Enter saves, Esc cancels).
- On Save: trim client-side, set optimistic value immediately, call `api.updateMovie`; on error revert to previous value and show inline error; disable Save while pending.
- Cancel restores previous value, no request.
- On success: trigger fact cache invalidation (B4).

**Done when:** forcing the API to 500 (e.g. temporary throw) shows optimistic value then reverts with error.

## B4 — Client-side fact cache

**Goal:** 30s client cache with invalidation.

- Choose approach and justify in README. Suggested: small custom hook `useFact(movie)` with state `{ fact, fetchedAt, status }` (or React Query with `staleTime: 30_000` and query key `["fact", movie]` — key-by-movie gives invalidation for free).
- Reuse fact if `< 30s` old; "New fact" button bypasses cache (`fresh: true`).
- Movie change invalidates cache and fetches a new fact.
- Show loading skeleton, error with retry, and empty state.

**Done when:** remount/navigate within 30s doesn't refetch (check Network tab); "New fact" always refetches; editing movie refetches.

## B5 — Frontend/API tests

**Goal:** Required tests.

- Vitest + React Testing Library + `jsdom`; mock `fetch` (or MSW).
- API client: 200 parses; 401 → `ApiClientError` with `code: "UNAUTHORIZED"`; 500 → `INTERNAL`; non-JSON body; network failure.
- Movie edit: optimistic value shown immediately; success keeps value; failure reverts + shows error; Cancel restores without request.
- Cache: within 30s no refetch; explicit refresh refetches; movie change invalidates (use fake timers).

**Done when:** `npm test` green.

---

## T-FINAL — README, AI note, polish

**Goal:** Deliverables.

README sections:
1. Setup (clone, `npm i`, `docker compose up -d`, copy `.env.example`, Google OAuth client setup steps, `npx prisma migrate dev`, `npm run dev`, `npm test`).
2. Environment variables table.
3. Database migration steps.
4. Architecture overview (1–2 pages): request flow diagram (text or Mermaid), folder structure, schema with *why* (nullable movie vs table, `Fact.movie` column, index choice), auth/authorization approach.
5. Variant chosen + why.
6. Key tradeoffs (e.g. lock held during OpenAI call; DB sessions vs JWT; fact-per-request cost).
7. With 2 more hours: rate limiting, E2E tests (Playwright), streaming facts, movie autocomplete via TMDB, observability.
8. **AI usage note** (bullets): used Claude Code to implement tickets I wrote/planned; reviewed every diff; manually tested each flow; wrote/edited tests; what I changed from AI output.

Final checks: fresh clone → follow README exactly → works. Lint, typecheck, tests green. Optional: record 3–5 min walkthrough.
