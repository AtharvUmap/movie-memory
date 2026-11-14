# Movie Memory — Project Conventions

Users sign in with Google, save their favorite movie, and see a fun AI-generated fact about it.
The plan lives in `TICKETS.md`. Work **one ticket at a time** and don't work ahead.

## Stack

- Next.js 16 (App Router, Cache Components enabled) + TypeScript (`strict: true`).
  APIs differ from older Next versions: check `node_modules/next/dist/docs/` (see `AGENTS.md`).
- Vitest (`npm test`), ESLint + Prettier, Postgres 16 via `docker-compose.yml`
- Tailwind CSS
- Prisma 7 ORM + PostgreSQL (driver adapter `@prisma/adapter-pg`). Import the client from
  `@/lib/generated/prisma/client` (git-ignored, built by `postinstall`). Use `prisma` from
  `lib/db.ts`, never `new PrismaClient()`. After schema changes: `npx prisma migrate dev`, then
  `npx prisma generate` (Prisma 7's `migrate dev` no longer generates the client).
- Auth.js (NextAuth v5) with the Google provider and the Prisma adapter
- OpenAI SDK (`openai` package) for fact generation

## Rules

1. **Server-only code stays on the server.** Prisma, OpenAI, and anything that reads a secret
   must never be imported from a client component. Put `import "server-only"` at the top of
   those modules so a mistaken import fails the build.
2. **Scope every DB query to the signed-in user.** Use `session.user.id`. Never trust a user ID
   from the request body, query string, or URL params.
3. **Validate all input on the server with Zod.** Client-side checks are only for UX.
4. **No `any`.** Use real types, `unknown` + narrowing, or Zod-inferred types.
5. **Secrets never go in `NEXT_PUBLIC_*` variables.**
6. **Keep it simple.** No over-engineering, no speculative abstractions. Short comments only
   where the reasoning isn't obvious.
7. Ask before making any choice that changes the plan in `TICKETS.md`.

## Folder layout

```
app/          routes (pages, layouts, route handlers, server actions)
lib/          server utilities
  db.ts         Prisma client singleton
  auth.ts       Auth.js config: { handlers, auth, signIn, signOut }
  openai.ts     OpenAI client + generateMovieFact()
  validation.ts Zod schemas (shared by server actions / API routes)
components/   UI components
tests/        Vitest tests
```

## Documentation rule

After every ticket, write or update the private study notes in `notes/`:

- `notes/<ticket-id>-<short-name>.md`: what was built, files changed, how it works, decisions &
  tradeoffs, security/correctness notes, likely interview questions, how to verify, key terms.
- `notes/00-overview.md`: running architecture summary, schema reasoning, decision table,
  known limitations.
- `notes/glossary.md`: every technical term introduced so far.

`notes/` is git-ignored. **Never commit `notes/`** and never remove it from `.gitignore`.
Don't commit anything unless the user asks; suggest a commit message instead.
