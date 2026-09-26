# AbotKamay

Tulong na abot-kamay: verified, transparent help, within reach.

AbotKamay is a social feed of verified help. Creators post photos or videos of a person in need (a neighbor, a family member, or themselves) with a caption and a plan for the money, like on social media. Three things make it trustworthy:

- **KYC front gate.** Only users who pass a government ID and selfie check (reviewed by a person) can post or receive funds. Everyone else can browse and donate. The API and the database both enforce it.
- **Flexible funding.** A post has an exact goal (`FIXED`, e.g. a hospital bill) or none (`OPEN_ENDED`, e.g. groceries).
- **Creator-led transparency.** Creators post their own receipts and item photos. Reports are hash-chained and can never be edited or deleted, next to a public, double-entry, hash-chained money ledger.

The web app speaks conversational Filipino by default and formal English on request (the FIL | EN toggle in the navbar). The full architecture and delivery plan is in [TECHNICAL_PLAN.md](TECHNICAL_PLAN.md); the creator-post pivot is described below.

## What is in this repository

- `apps/api`: NestJS 12 (ESM, Fastify) + Prisma ORM 7 + PostgreSQL (Neon). It contains:
  - the core schema (34 models), including KYC, sessions, post media and creator spending reports
  - phone sign-in (SMS one-time code) with server-side sessions
  - the KYC front gate: ID and selfie submission, reviewer decisions, revocation
  - creator posts (campaigns) with fixed or open-ended funding, the public feed and campaign pages, moderation
  - presigned direct-to-storage uploads (S3 or S3-compatible), with the file's SHA-256 enforced by storage
  - an append-only, double-entry, hash-chained ledger, and hash-chained creator spending reports
  - payment webhooks for PayMongo, Xendit and Stripe, safe against duplicate deliveries
  - an AI gateway (Claude) with submission screening
- `apps/web`: Next.js 16 (App Router) + Tailwind CSS 4 site in conversational Filipino: landing page, the feed, campaign pages (creator badge, plan, receipts, timeline, ledger, donation dialog), the "Create post & verify ID" flow, the creator account page, the receipt form, and the "Legit ba 'to?" checker. Filipino by default, English through the navbar toggle; every page reads the API (there is no sample-data mode). See [apps/web/README.md](apps/web/README.md).
- `qa/e2e-selenium`: Selenium 4 + Java 21 + JUnit 5. It uses a WebDriver factory (local browser or Selenium Grid) and page objects. A reviewed, AI-generated scenario catalog drives `DonationFlowTest`.
- Deployment: `render.yaml` (Render Blueprint: API + media worker, Docker), `apps/api/Dockerfile`, `apps/web/vercel.json` (Vercel), and [DEPLOYMENT.md](DEPLOYMENT.md): the step-by-step guide and every production environment variable.
- `.github/workflows/ci.yml`: build, lint, typecheck, migrations against real PostgreSQL + pgvector, drift detection, ledger-guarantee guard, unit and integration tests, QA suite, optional E2E and Neon migration deploy.
- `brand/`: logo SVGs, app icon, palette, typography, and image-generation prompts.

## Prerequisites

- Node.js 24 LTS (24.15 or newer recommended; the Nest CLI's Angular devkit dependency warns on 24.14).
- A Neon project (PostgreSQL 17) with the `vector` extension available (Neon supports pgvector natively).
- JDK 21 for the QA suite. Your machine has several JDKs, but `java` on PATH is Java 8, so point `JAVA_HOME` at a JDK 21, for example:
  - PowerShell: `$env:JAVA_HOME = "$HOME\.jdks\ms-21.0.11"`
  - Git Bash: `export JAVA_HOME="$HOME/.jdks/ms-21.0.11"`
- No Maven install is needed: the suite ships the Maven Wrapper (`./mvnw`, Maven 3.9.16).

## First run

1. Configure the environment. Copy `.env.example` to `.env` in the repo root. Your existing `.env` already has `DATABASE_URL`; add the rest:
   - `DATABASE_URL`: Neon POOLED connection string (host contains `-pooler`). Used by the running API.
   - `DIRECT_DATABASE_URL`: Neon DIRECT connection string. Used by Prisma migrations (Neon's pooler runs in transaction mode, which migrations must avoid).
   - `PAYMONGO_WEBHOOK_SECRET`, `XENDIT_CALLBACK_TOKEN`, `STRIPE_WEBHOOK_SECRET`: sandbox values. A provider's webhook route answers 404 until its secret is set.
   - `ANTHROPIC_API_KEY`: optional. Without it, AI screening is disabled and every submission goes to human review.
   - `AUTH_SECRET`: 32+ random characters (required in staging and production). Local sign-in also needs `SMS_PROVIDER=log`, which prints one-time codes to the API log instead of sending SMS.
   - `MEDIA_QUARANTINE_BUCKET`, `MEDIA_RESTRICTED_BUCKET`, `MEDIA_PUBLIC_BASE_URL`: optional locally. Until the buckets are set, uploads answer 503 (see "Creator posts" below for the bucket setup).
2. Install: `npm install` (also generates the Prisma client).
3. Apply the migrations to Neon: `npm run db:migrate:deploy`
4. Start the API: `npm run dev`, then open `http://localhost:4000/api/v1/health/ready`

## Commands

- `npm run dev`: API in watch mode.
- `npm run dev:web`: web app at `http://localhost:3000`. It reads the API, so run `npm run dev` too; with an empty database the feed shows its empty state (see `apps/web/.env.example`).
- `npm run dev:worker`: the media worker in watch mode (needs ffmpeg, ffprobe and heif-convert on PATH, or `FFMPEG_PATH` etc.).
- `npm run build:web`, `npm run start:web`, `npm run lint:web`, `npm run typecheck:web`, `npm run format:check:web`
- `npm run build` then `npm start`: production build and run (`node dist/main.js`).
- `npm run lint`, `npm run format:check`, `npm run typecheck`
- `npm test`: unit tests (Vitest, no database needed).
- `npm run test:integration`: DB integration tests. `DATABASE_URL` must point at a migrated, disposable database. Use a Neon branch, never production, because ledger rows are append-only and cannot be deleted.
- `npm run db:migrate:dev`: create a new migration during development. Review the generated SQL; CI fails if a migration drops a ledger guarantee.
- `npm run db:migrate:status`, `npm run db:validate`
- `npm run qa:compile`: compile the QA suite and run the scenario-catalog gate.
- `cd qa/e2e-selenium && ./mvnw verify -Pe2e -Dbase.url=... -Dapi.url=... -Dseed.token=...`: browser E2E tests against a deployed environment.

## Try the duplicate-safe webhook locally

With `PAYMONGO_WEBHOOK_SECRET=whsk_local_test` in `.env` and the API running, send the same signed event three times. The first returns `"duplicate": false` and the next two return `"duplicate": true`. Exactly one row is stored, and one outbox event is created.

```js
// scripts: node sign-paymongo.mjs evt_demo_1  (prints a curl command)
import { createHmac } from 'node:crypto';
const id = process.argv[2] ?? 'evt_demo_1';
const body = JSON.stringify({ data: { id, type: 'event', attributes: { type: 'payment.paid', livemode: false, data: { id: 'pay_demo', type: 'payment', attributes: { amount: 50000, metadata: { campaign_id: 'cmp_demo' } } } } } });
const t = Math.floor(Date.now() / 1000);
const te = createHmac('sha256', 'whsk_local_test').update(`${t}.${body}`).digest('hex');
console.log(`curl -X POST http://localhost:4000/api/v1/webhooks/paymongo -H "Content-Type: application/json" -H "Paymongo-Signature: t=${t},te=${te},li=" --data-raw '${body}'`);
```

## Creator posts, the KYC front gate and receipts

How a post happens:

1. **Sign in** with a Philippine mobile number and a 6-digit SMS code (`POST /auth/otp`, `POST /auth/otp/verify`). The web app keeps the session token in an HttpOnly cookie and forwards it server-side; browser JavaScript never sees it.
2. **Verify the ID** (`kyc_status`: `UNVERIFIED` → `PENDING_ID` → `VERIFIED`, or `REJECTED`, `EXPIRED`, `REVOKED`). The creator picks an accepted government ID, gets a one-time code (`POST /kyc/challenge`), uploads the ID front and back and a selfie holding the ID and the handwritten code to the restricted bucket, and submits (`POST /kyc/verifications`). A reviewer approves or rejects (`POST /review/kyc/:id/decision`). Verification lasts `KYC_REVERIFY_MONTHS` or until the ID expires, whichever comes first. Each decision records when the ID images must be deleted (`media_purge_after`, `KYC_MEDIA_RETENTION_DAYS` after the decision); the job that deletes them is not built yet (see DEPLOYMENT.md, launch blockers).
3. **Post** (`POST /campaigns`, KYC VERIFIED only): photos/videos, the person's alias, age band and city, the creator's relationship to them, their consent (video or signed form; a guardian for minors, whose faces are blurred), a caption, and the plan for the money. `FIXED`: every item has an amount and the goal is exactly their sum. `OPEN_ENDED`: no goal. The post waits in `PENDING_REVIEW` until a reviewer publishes it (`POST /review/campaigns/:id/decision`).
4. **Report spending** (`POST /campaigns/:slug/spending-reports`, the campaign's creator only): what was bought, amount, date, store, and receipts. Reports appear on the campaign page and public ledger at once; receipt images appear after review (`POST /review/spending-reports/:id/decision`), because receipts can show names or addresses.

Guarantees in the database (migration `20260925000200_creator_posts_kyc`, integration-tested):

- A campaign can only be inserted, or set `ACTIVE`, by a creator whose account is active and whose KYC is `VERIFIED` and not expired; its creator never changes.
- `CREATOR_PAYOUT` disbursements go only to the campaign's own creator, and can only be approved or paid while that creator is verified.
- `FIXED` campaigns have a goal greater than zero; `OPEN_ENDED` campaigns have none.
- Spending reports: written only by the campaign's creator, facts immutable (only the review columns change), never deleted, receipt links append-only, one hash chain per campaign (`UNIQUE(campaign_id, prev_hash)`).
- At most one ID check waiting for review per user; a reviewer never decides their own; every decision is recorded.

Other endpoints: `GET /me`, `GET /me/campaigns`, `POST /auth/logout`, `POST /uploads` (presigned PUT), `GET /campaigns`, `GET /campaigns/:slug`, `GET /campaigns/:slug/ledger`, `GET /campaigns/:slug/spending-reports`, and the reviewer queues `GET /review/kyc`, `GET /review/kyc/:id`, `POST /review/kyc/users/:userId/revoke`, `GET /review/campaigns`, `GET /review/spending-reports` (`REVIEWER` role; media links expire in 5 minutes and every view is audit-logged).

Storage setup: a quarantine bucket (posts, consent evidence, receipts) and a restricted bucket (IDs and selfies, default SSE-KMS encryption, never public), plus a public bucket or CDN behind `MEDIA_PUBLIC_BASE_URL` that holds the moderated copies. Browsers upload directly with presigned PUTs, so both buckets need CORS for the web origin allowing `PUT` with the `Content-Type` and `x-amz-checksum-sha256` headers. Put the bucket origins in the web app's `NEXT_PUBLIC_UPLOAD_ORIGINS` and the CDN in `NEXT_PUBLIC_MEDIA_BASE_URL` (Content Security Policy).

## Project structure

```text
.
├── .github/
│   ├── dependabot.yml                      weekly updates: pinned actions, npm, Maven
│   └── workflows/ci.yml                    CI: api, qa-suite, e2e (opt-in), migrate-neon (opt-in)
├── apps/
│   ├── api/                                NestJS 12 + Prisma 7 API (ESM)
│   │   ├── prisma.config.ts                Prisma 7 CLI config: schema, migrations, datasource URL
│   │   ├── prisma/
│   │   │   ├── schema.prisma               34 models, snake_case tables, BigInt money, UUIDv7
│   │   │   └── migrations/
│   │   │       ├── 20260925000000_init/                  tables + pgvector extension
│   │   │       ├── 20260925000100_ledger_guarantees/     append-only, balanced, four-eyes, maker-checker
│   │   │       └── 20260925000200_creator_posts_kyc/     KYC gate, funding types, immutable receipts
│   │   ├── src/
│   │   │   ├── main.ts                     Fastify bootstrap, raw body, BigInt-safe JSON, helmet, CORS
│   │   │   ├── app.module.ts               root module (config validation + bounded contexts)
│   │   │   ├── config/env.schema.ts        Zod-validated environment contract
│   │   │   ├── common/                     constant-time compare, BigInt JSON, Zod validation pipe
│   │   │   ├── prisma/                     PrismaService with @prisma/adapter-pg (Neon pooled)
│   │   │   ├── health/                     /health/live, /health/ready
│   │   │   ├── ledger/                     hash chain (pure, unit-tested) + posting service
│   │   │   ├── auth/                       phone sign-in, sessions, SessionGuard / KycVerifiedGuard / RolesGuard
│   │   │   ├── kyc/                        ID checks, challenge codes, reviewer decisions, revocation
│   │   │   ├── media/                      upload rules, presigned S3 uploads, attachment checks
│   │   │   │   └── worker/                 media worker: EXIF/GPS strip, H.264 re-encode, posters, public copies
│   │   │   ├── campaigns/                  posts, feed and campaign reads, moderation, Filipino copy
│   │   │   │   └── spending/               creator spending reports (hash chain + review)
│   │   │   ├── payments/webhooks/          payment.webhook.controller.ts, intake service, verifiers
│   │   │   │   └── verifiers/              PayMongo (HMAC), Xendit (token), Stripe (official SDK)
│   │   │   ├── ai/                         AI integration module
│   │   │   │   ├── ai-gateway.service.ts   structured outputs, refusal fallbacks, audit log, kill switch
│   │   │   │   ├── anthropic.provider.ts   single Claude client (null when not configured)
│   │   │   │   ├── redaction.ts            PH phone / email / account-number redaction before AI
│   │   │   │   └── screening/              versioned prompt, Zod schema, screening service
│   │   │   └── generated/prisma/           Prisma client (generated, git-ignored)
│   │   └── test/                           DB integration tests + helpers
│   └── web/                                Next.js 16 donor site (see apps/web/README.md)
│       ├── app/                            routes: /, /campaigns, /campaigns/[slug] (+ /ledger, /mag-ulat), /mag-post, /mag-sign-in, /ako, /verify
│       ├── components/                     layout, home, feed, campaigns, creator, verify, ledger, ui
│       ├── lib/                            api.ts client, contract types, Server Actions, session, uploads, i18n (fil, en)
│       ├── tailwind.config.ts              brand tokens (loaded by app/globals.css via @config)
│       ├── proxy.ts                        language routing: ?lang= and the ak_lang cookie, public URLs stay the same
│       ├── vercel.json                     Vercel: workspace install, Singapore region, skip API-only commits
│       └── next.config.ts                  /c/:slug short links, security headers, CSP, deployment env checks
├── brand/                                  logo, dark logo, mark, app icon, BRAND.md
├── qa/
│   └── e2e-selenium/                       Selenium 4 + Java 21 + JUnit 5 (Maven Wrapper)
│       ├── ai/generate-scenarios.prompt.md AI scenario generator prompt + JSON schema + review checklist
│       ├── docker-compose.grid.yml         Selenium Grid 4.49 (hub, Chrome, Firefox)
│       └── src/test/
│           ├── java/ph/abotkamay/qa/
│           │   ├── config/TestConfig.java          -D properties / E2E_* env vars
│           │   ├── driver/DriverFactory.java       local or Grid; mobile emulation; BiDi enabled
│           │   ├── pages/                          page objects (data-testid locators only)
│           │   ├── scenarios/                      scenario model + catalog loader/validator
│           │   ├── support/                        base test, failure evidence, API seeding
│           │   └── tests/DonationFlowTest.java     runs every APPROVED scenario (+ axe WCAG check)
│           └── resources/scenarios/donation-flow.scenarios.json
├── .env.example                            every setting, documented
├── DEPLOYMENT.md                           Vercel + Render + Neon + R2/S3: steps, env checklist, launch blockers
├── render.yaml                             Render Blueprint (API web service + media worker)
├── package.json                            npm workspaces + security overrides
└── TECHNICAL_PLAN.md                       architecture and delivery plan
```

Planned next: an SMS gateway adapter (sign-in answers 503 in production until one is configured), the KYC image purge job (`media_purge_after`), malware scanning and face blur for minors in the media worker (media showing a minor is held for a person until then), the outbox relay, donations (checkout + payment processor consuming the outbox), the "Legit ba 'to?" lookup (`POST /channels/check`), disbursements (separate payout service, creator payouts), the staff console for the `/review` endpoints (with WebAuthn), AI pre-screening of posts and receipts, a KYC vendor adapter, and the Expo field app. DEPLOYMENT.md lists what is live on day one.

## CI setup on GitHub

1. Push this repository to GitHub. On Windows, mark the wrapper executable first: `git update-index --chmod=+x qa/e2e-selenium/mvnw` (CI also runs `chmod +x`).
2. The `api` and `qa-suite` jobs run on every pull request with no configuration.
3. E2E (once a preview or staging environment exists): set the repository variables `E2E_BASE_URL` and `E2E_API_URL` (optionally `E2E_SCENARIO_TAGS`), and the secret `E2E_SEED_TOKEN`.
4. Neon migrations on `main`: create a `production` environment with required reviewers, add the secrets `NEON_DIRECT_DATABASE_URL` and `NEON_DATABASE_URL`, then set the variable `NEON_MIGRATIONS_ENABLED=true`.

## Notes and decisions

- Prisma 7: the CLI reads the database URL from `prisma.config.ts`. At runtime, PrismaClient gets a driver adapter (`@prisma/adapter-pg`). The URL is not in `schema.prisma`.
- The pgvector HNSW indexes are partial (`WHERE embedding IS NOT NULL`). Prisma has no HNSW index type and reports plain HNSW indexes as drift; partial indexes are left alone. Similarity queries must include `WHERE embedding IS NOT NULL`.
- The root `package.json` overrides `mysql2` and `deepmerge-ts` to patched versions. Prisma 7.10's CLI pins vulnerable versions (npm's only suggested fix is downgrading to Prisma 6). The Prisma CLI was re-verified with the overrides. Remove them once Prisma ships fixed pins.
- `claude-opus-5` is the code's default model (`AI_MODEL`); `render.yaml` sets `claude-opus-5-5`. Server-side refusal fallbacks are enabled (`fallbacks: "default"`), and any final refusal goes to human review.
- The `kyc_status` values were renamed in place (`NOT_STARTED` → `UNVERIFIED`, `PENDING` → `PENDING_ID`, plus `REVOKED`), so existing rows keep their meaning. Coordinator campaigns created before the pivot became posts by the coordinator's own account, with `funding_type = FIXED`.
- ID images are stored in our restricted bucket for manual review (`provider = MANUAL_REVIEW`), which departs from TECHNICAL_PLAN.md's "raw ID images stay with the vendor". They must be deleted after the retention period (the purge job is not built yet); a KYC vendor can take over through `identity_verifications.provider` / `provider_ref`. Run a DPIA before launch (Data Privacy Act, RA 10173).
- Local database tests: without Docker, the integration tests can run against an in-process PGlite with all migrations applied. PGlite's socket server mishandles errors in the extended query protocol, so use a driver adapter rather than the socket for anything that expects database errors.
Trigger Vercel build
