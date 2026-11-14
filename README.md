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
- `npm run lint`, `npm run typecheck` and `npm test` pass.
- `npm audit --omit=dev`: 0 vulnerabilities. There are 7 moderate advisories in dev-only ESLint tooling (`@typescript-eslint` → `minimatch`). `npm audit fix` can't resolve them within `eslint-config-next`'s version range, and none of that code ships to production.
