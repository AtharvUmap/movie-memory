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
5. Restart `npm run dev`, then sign in at http://localhost:3000/api/auth/signin.

## Scripts

| Command             | What it does                                |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | Start the dev server                        |
| `npm test`          | Run tests (Vitest)                          |
| `npm run lint`      | ESLint                                      |
| `npm run typecheck` | Generate Next route types, then `tsc`       |
| `npm run format`    | Format with Prettier (`format:check` in CI) |
