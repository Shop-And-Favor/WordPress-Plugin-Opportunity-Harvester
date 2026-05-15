# WordPress Plugin Opportunity Harvester

Next.js + Prisma app to discover and rank plugin opportunities from WordPress.org.

## Implemented in this phase

- OpenRouter query generation (Gemini primary, OpenAI fallback)
- Query deduplication by normalized text
- WordPress plugin query fetch (top N up to 10) with conservative delay and retries
- Plugin + query opportunity scoring
- MySQL persistence via Prisma
- Manual Start/Continue workflow with progress dashboard
- Runtime DB credential loading from AWS Secrets Manager

## Testing

Comprehensive test suite with **40 tests** across **5 modules** (all passing):

| Module | Tests | Coverage |
|--------|-------|----------|
| `normalize.ts` | 11 | Query text normalization, deduplication, clamping |
| `scoring.ts` | 10 | Opportunity scoring, demand detection, tier classification |
| `openrouter.ts` | 5 | LLM query generation, deduplication, fallback behavior |
| `wordpress.ts` | 6 | Plugin API fetch, rate limiting, rating conversion, data validation |
| `throttle.ts` | 8 | Rate limiting, retry logic, exponential backoff |

**Run tests:**
```bash
npm run test          # Run once
npm run test:watch   # Watch mode
npm run test:ui      # Visual UI dashboard
```

## Environment

Copy `.env.example` to `.env.local` and set values:

```bash
OPENROUTER_API_KEY=...
DB_SECRET_ARN=arn:aws:secretsmanager:eu-west-2:...
AWS_REGION=eu-west-2
DB_PORT=3306
APP_USER_AGENT=WP-Opportunity-Harvester/1.0 (respectful crawler)
```

Optional fallback if you do not want AWS secret fetch in runtime:

```bash
DATABASE_URL=mysql://user:password@host:3306/database
```

## Install and run

```bash
npm install
npm run prisma:generate
npm run prisma:push
npm run dev
```

Then open http://localhost:3000 in your browser.

**Quick start (Windows PowerShell — opens browser automatically):**
```powershell
npm run dev; Start-Process http://localhost:3000
```

## Flow

1. Click `Start` to generate and insert distinct queries for a run.
2. Click `Continue` to process next pending batch and store plugins/results.
3. Repeat `Continue` until pending reaches 0.

The app does not restart old queries because normalized query text is unique in DB.

## Scripts

- `npm run dev` — Start Next.js dev server
- `npm run lint` — Run ESLint
- `npm run typecheck` — Run TypeScript type check
- `npm run test` — Run Vitest suite (40 tests across 5 modules)
- `npm run test:watch` — Run tests in watch mode
- `npm run test:ui` — Run tests with Vitest UI
- `npm run prisma:generate` — Generate Prisma client
- `npm run prisma:push` — Push schema to database

## Current limitations

- No background worker yet (manual Continue only)
- No historical snapshot tables yet
