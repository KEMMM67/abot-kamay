# Deploying AbotKamay

The production setup, in the order to do it, and every environment variable with where it goes.

```text
Browser ── pages, Server Actions ────────▶ Vercel: apps/web (Next.js 16, sin1)
Browser ── presigned PUT (files) ────────▶ R2 / S3: quarantine + restricted buckets (private)
Browser ◀─ <img>, <video> ─────────────── media.abotkamay.ph ◀── public bucket

Vercel ─── session + visitor IP ─────────▶ Render: abotkamay-api (NestJS 12, Docker, Singapore)
abotkamay-api ── queries, migrations check ▶ Neon: PostgreSQL 17 + pgvector (ap-southeast-1)
abotkamay-api ── presigns uploads ────────▶ R2 / S3 (files never pass through AbotKamay servers)
abotkamay-media-worker ── same image ─────▶ reads originals, writes cleaned copies to the public bucket
```

| Piece          | Where                                                                  | Defined in                                        |
| -------------- | ---------------------------------------------------------------------- | ------------------------------------------------- |
| Web app        | Vercel, region `sin1`                                                  | `apps/web/vercel.json`, `apps/web/next.config.ts` |
| API            | Render web service (Docker), Singapore                                 | `render.yaml`, `apps/api/Dockerfile`              |
| Media worker   | Render background worker, same image, `node dist/worker.js`            | `render.yaml`                                     |
| Database       | Neon, AWS `ap-southeast-1` (Singapore), PostgreSQL 17                  | `apps/api/prisma/migrations`                      |
| Object storage | Cloudflare R2 (recommended: no egress fees) or AWS S3 `ap-southeast-1` | this guide, section 3                             |
| Media CDN      | R2 custom domain or CloudFront: `https://media.abotkamay.ph`           | this guide, section 3                             |
| Migrations     | GitHub Actions job `migrate-neon` (approval-gated) or by hand          | `.github/workflows/ci.yml`                        |

Domains used as examples below: `abotkamay.ph` (web), `api.abotkamay.ph` (API), `media.abotkamay.ph`
(media). Replace them with yours everywhere, including CORS.

## What works on day one

Be clear with the team about this before announcing anything:

| Area                                                       | Status at launch                                                                                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home, feed, campaign pages, public ledger, language toggle | Work. With no posts yet, the feed shows "Wala pang post. Ikaw na ang mauna!" / "No posts yet. Be the first to share a story!"                                                               |
| Sign-in (SMS code)                                         | **Blocked**: no SMS gateway adapter yet. `SMS_PROVIDER=none` makes sign-in answer 503; the site says sign-in isn't open yet. No sign-in means no creators, no KYC, no posts.                |
| Posting, KYC review, receipts                              | Built and tested, waiting on sign-in. Reviewers use the `/review` API (no staff console yet).                                                                                               |
| Media pipeline                                             | Built: the worker strips EXIF/GPS, re-encodes (JPEG/PNG/WebP, H.264 MP4 + poster), publishes to the public bucket. Media showing a minor is held for a person (no automatic face blur yet). |
| Donations                                                  | **Not built** in the API (`POST /campaigns/{id}/donations`). The donation dialog says online donations aren't open.                                                                         |
| "Legit ba 'to?" checker                                    | **Not built** in the API (`POST /channels/check`). The checker says it isn't open yet.                                                                                                      |

The full list of launch blockers is in section 9.

## 1. Neon (database)

1. Create a Neon project in **AWS Asia Pacific (Singapore) `ap-southeast-1`**, PostgreSQL **17** (the version
   CI tests against). Create a database, e.g. `abotkamay`.
2. Copy two connection strings from **Connect** (both with `?sslmode=require`):
   - **Pooled** (host contains `-pooler`): the API and the worker at runtime (`DATABASE_URL` on Render).
   - **Direct** (no `-pooler`): migrations only. Neon's pooler is PgBouncer in transaction mode, which
     migrations must avoid.
3. Nothing else to enable: the first migration runs `CREATE EXTENSION IF NOT EXISTS vector`.
4. Size: 0.25 to 1 CU is plenty to start. Render checks `/api/v1/health/ready` continuously and that check
   queries the database, so expect the compute to stay awake rather than scale to zero.

## 2. Migrations (before the first API deploy)

The API's readiness check (`/api/v1/health/ready`) answers 503 while any migration shipped in the image is
missing from the database, so Render never sends traffic to an instance running against an older schema.
Apply the migrations **before** creating the Render services, or the first deploy never turns healthy.

**First time, by hand**, from a trusted machine with the repository installed (`npm ci`):

```bash
# PowerShell: $env:DIRECT_DATABASE_URL = "postgresql://...@ep-xxxx.ap-southeast-1.aws.neon.tech/abotkamay?sslmode=require"
export DIRECT_DATABASE_URL='postgresql://USER:PASSWORD@ep-xxxx.ap-southeast-1.aws.neon.tech/abotkamay?sslmode=require'
npm run db:migrate:status
npm run db:migrate:deploy
```

`prisma.config.ts` also reads the repository's `.env`; a variable set in the shell wins.

**From then on, in CI** (the `migrate-neon` job runs on pushes to `main` after every other job passes):

1. GitHub → Settings → Environments → **New environment** `production`. Add **required reviewers**, so a
   person approves every schema change.
2. In that environment add the secrets `NEON_DIRECT_DATABASE_URL` (direct) and `NEON_DATABASE_URL` (pooled).
3. Settings → Secrets and variables → Actions → Variables: `NEON_MIGRATIONS_ENABLED` = `true`.

Migrations are forward-only. Rolling the API back to an older image is safe: the database then has more
migrations than the image knows, which the readiness check accepts.

## 3. Object storage

Three buckets. Names are examples; bucket names must be globally unique on S3.

| Bucket                 | Access                      | Holds                                                       | Who writes               | Who reads                            |
| ---------------------- | --------------------------- | ----------------------------------------------------------- | ------------------------ | ------------------------------------ |
| `abotkamay-quarantine` | private                     | post photos/videos, consent evidence, receipts, as uploaded | browsers (presigned PUT) | worker; reviewers via 5-minute links |
| `abotkamay-restricted` | private, encrypted          | government IDs and selfies                                  | browsers (presigned PUT) | reviewers via 5-minute links         |
| `abotkamay-public`     | public through the CDN only | the worker's cleaned copies                                 | the worker               | everyone, via `media.abotkamay.ph`   |

Browsers upload straight to the first two with presigned `PUT` URLs (valid 15 minutes). Each URL signs the
file's `Content-Type`, `Content-Length` and SHA-256 (`x-amz-checksum-sha256`), so storage refuses any other
bytes. Public copies are written with `Cache-Control: public, max-age=31536000, immutable` (every key is
unique). The public bucket needs no CORS: pages load media with plain `<img>` and `<video>`.

### Option A: Cloudflare R2 (recommended)

1. R2 → **Create bucket** three times, location hint **Asia-Pacific (APAC)**.
2. R2 → **Manage R2 API Tokens** → **Create API token**: permission **Object Read & Write**, applied to the
   three buckets only. Keep the **Access Key ID** and **Secret Access Key** (they go to Render as
   `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`). The S3 endpoint is
   `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
   - Tighter: two tokens. The API's token needs quarantine + restricted; the worker's needs quarantine
     (read) + public (write). Then set the worker's `AWS_*` by hand instead of copying the API's.
3. `abotkamay-public` → Settings → **Custom Domains** → connect `media.abotkamay.ph` (the domain's DNS must be
   on Cloudflare). Leave the `r2.dev` URL disabled: it is rate-limited and not meant for production.
4. `abotkamay-quarantine` **and** `abotkamay-restricted` → Settings → **CORS policy** → paste:

   ```json
   [
     {
       "AllowedOrigins": ["https://abotkamay.ph", "https://www.abotkamay.ph"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type", "x-amz-checksum-sha256"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Add a staging or preview origin here only if that deployment should accept uploads.

5. Values for Render and Vercel: `MEDIA_S3_REGION=auto`, `MEDIA_S3_FORCE_PATH_STYLE=true`,
   `MEDIA_S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, and on Vercel
   `NEXT_PUBLIC_UPLOAD_ORIGINS=https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (path-style addressing puts
   every bucket on that one origin).

### Option B: AWS S3 + CloudFront

1. Create the three buckets in `ap-southeast-1` with **Block Public Access on for all three** (including
   `abotkamay-public`: CloudFront reads it through Origin Access Control).
2. Default encryption: SSE-S3 for quarantine and public; **SSE-KMS** (with a bucket key) for restricted.
3. CORS on quarantine and restricted: the same JSON as above (S3 console → Permissions → CORS).
4. CloudFront distribution: origin `abotkamay-public` with **Origin Access Control**, alternate domain
   `media.abotkamay.ph`, an ACM certificate in `us-east-1`, cache policy `CachingOptimized`.
5. An IAM user for Render (Render has no AWS roles) with this policy, then an access key:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Sid": "UploadedMedia",
         "Effect": "Allow",
         "Action": ["s3:PutObject", "s3:GetObject"],
         "Resource": [
           "arn:aws:s3:::abotkamay-quarantine/*",
           "arn:aws:s3:::abotkamay-restricted/*"
         ]
       },
       {
         "Sid": "PublicCopies",
         "Effect": "Allow",
         "Action": ["s3:PutObject"],
         "Resource": ["arn:aws:s3:::abotkamay-public/*"]
       },
       {
         "Sid": "MissingObjectsAnswer404",
         "Effect": "Allow",
         "Action": ["s3:ListBucket"],
         "Resource": [
           "arn:aws:s3:::abotkamay-quarantine",
           "arn:aws:s3:::abotkamay-restricted"
         ]
       },
       {
         "Sid": "RestrictedBucketKey",
         "Effect": "Allow",
         "Action": ["kms:GenerateDataKey", "kms:Decrypt"],
         "Resource": [
           "arn:aws:kms:ap-southeast-1:<AWS_ACCOUNT_ID>:key/<KMS_KEY_ID>"
         ]
       }
     ]
   }
   ```

6. Values: `MEDIA_S3_REGION=ap-southeast-1`, `MEDIA_S3_ENDPOINT` empty, `MEDIA_S3_FORCE_PATH_STYLE=false`
   (change the two group values in `render.yaml`), and on Vercel
   `NEXT_PUBLIC_UPLOAD_ORIGINS=https://abotkamay-quarantine.s3.ap-southeast-1.amazonaws.com https://abotkamay-restricted.s3.ap-southeast-1.amazonaws.com`.
7. Optional: GuardDuty Malware Protection for S3 on `abotkamay-quarantine` (see section 9).

### Until the ID-image purge job exists

Each ID decision records `media_purge_after` (30 days after the decision by default), and the ID form tells
people their photos are deleted then, but nothing deletes them yet. Until that job is built, add a
lifecycle rule on the **restricted** bucket that deletes objects **45 days** after upload (R2: bucket →
Settings → Object lifecycle rules; S3: Management → Lifecycle rules → expire current versions). Reviews
normally finish within a day, so this deletes every ID image no later than the promise allows plus a margin.

## 4. Render (API and media worker)

1. Push the repository to GitHub. CI must be on (`.github/workflows/ci.yml`): the services deploy only after
   the checks pass (`autoDeployTrigger: checksPass`).
2. Render → **New** → **Blueprint** → pick the repository. Render reads `render.yaml` and proposes:
   - env group `abotkamay-backend` (shared settings),
   - web service `abotkamay-api` (`apps/api/Dockerfile`, health check `/api/v1/health/ready`),
   - background worker `abotkamay-media-worker` (same image, `node dist/worker.js`).
3. Render asks once for every `sync: false` value (table in section 6). `AUTH_SECRET` and
   `FORWARDED_IP_SECRET` are generated. The worker copies the API's database and storage values.
4. For AWS S3 instead of R2, change `MEDIA_S3_REGION` and `MEDIA_S3_FORCE_PATH_STYLE` in the env group.
5. Plans: both services start on `1c-2g`. Video encoding is CPU-bound; `2c-4g` for the worker roughly halves
   the wait for each video. The API is stateless and can scale out; several workers can run side by side
   (jobs are claimed with `FOR UPDATE SKIP LOCKED`).
6. **Custom domain**: `abotkamay-api` → Settings → Custom Domains → `api.abotkamay.ph` (a CNAME to
   `abotkamay-api.onrender.com`). Render issues the certificate.
7. Copy `FORWARDED_IP_SECRET` from `abotkamay-api` → Environment into Vercel (section 5).
8. Check it: `curl https://api.abotkamay.ph/api/v1/health/ready` → `{"status":"ok","database":"up"}`. The
   worker's logs show it polling.

## 5. Vercel (web app)

1. Vercel → **Add New Project** → import the repository.
2. **Root Directory**: `apps/web`. Framework preset: Next.js (detected). Keep **"Include files outside the
   root directory in the Build Step"** enabled: `apps/web/vercel.json` installs from the repository root
   (`cd ../.. && npm ci --workspace @abotkamay/web`, the same command CI uses), because the lockfile and the
   npm workspace live there.
3. Node.js version: **24.x** (Settings → General).
4. Environment variables (section 6) for **Production**, and for **Preview** if you use previews. Mark
   `FORWARDED_IP_SECRET` as **Sensitive**.
5. Deploy. A production build fails on purpose when a required variable is missing or malformed
   (`checkDeploymentEnv` in `apps/web/next.config.ts`), instead of shipping a site that calls localhost.
6. Domains: `abotkamay.ph` (primary) and `www.abotkamay.ph` (redirect to the primary). If the domain's DNS is
   on Cloudflare (needed for the R2 media domain), keep the Vercel and Render records **DNS only** (grey
   cloud).
7. `vercel.json` also pins functions to `sin1` (next to Render and Neon) and skips builds for commits that
   touch neither `apps/web` nor the root `package.json`/lockfile.

`NEXT_PUBLIC_*` values are inlined at build time: after changing one, redeploy.

Preview deployments call the API from the server, so their pages work. Uploads, the checker and donations
run in the browser and need the preview's origin in the API's `CORS_ORIGINS` and the bucket CORS rules;
production lists only the production origins. For a real staging environment, point Preview at a staging
API (its own Render services and a Neon branch).

## 6. Environment variable checklist

### Vercel: project `apps/web` (Production; Preview as needed)

| Variable                     | Value                                                                         | Notes                                                           |
| ---------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `NEXT_PUBLIC_API_BASE_URL`   | `https://api.abotkamay.ph/api/v1`                                             | https and ending in `/api/v1`, or the build fails               |
| `NEXT_PUBLIC_SITE_URL`       | `https://abotkamay.ph`                                                        | canonical URLs, share links, `/c/{slug}` short links            |
| `NEXT_PUBLIC_MEDIA_BASE_URL` | `https://media.abotkamay.ph`                                                  | same as the API's `MEDIA_PUBLIC_BASE_URL`; CSP and `next/image` |
| `NEXT_PUBLIC_UPLOAD_ORIGINS` | R2: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` · S3: both bucket origins | CSP `connect-src` for presigned uploads                         |
| `FORWARDED_IP_SECRET`        | copied from Render's `abotkamay-api`                                          | server-only, Sensitive; 32+ characters                          |

### Render: env group `abotkamay-backend` (API and worker), set by `render.yaml`

| Variable                    | Value                               | Notes                                                                                   |
| --------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| `NODE_ENV`                  | `production`                        |                                                                                         |
| `APP_NAME`                  | `AbotKamay`                         |                                                                                         |
| `MEDIA_S3_REGION`           | `auto` (R2) · `ap-southeast-1` (S3) |                                                                                         |
| `MEDIA_S3_FORCE_PATH_STYLE` | `true` (R2) · `false` (S3)          |                                                                                         |
| `SMS_PROVIDER`              | `none`                              | sign-in answers 503 until an SMS gateway adapter exists; `log` is refused in production |
| `AI_SCREENING_ENABLED`      | `true`                              | `false` sends every submission to people                                                |
| `AI_MODEL`                  | `claude-opus-5-5`                   | any model your Anthropic account can call                                               |

### Render: web service `abotkamay-api`

| Variable                                      | Value                                           | Required | Notes                                                                 |
| --------------------------------------------- | ----------------------------------------------- | -------- | --------------------------------------------------------------------- |
| `DATABASE_URL`                                | Neon **pooled** URL, `?sslmode=require`         | yes      |                                                                       |
| `DATABASE_POOL_MAX`                           | `10`                                            |          | per instance; keep instances × pool under Neon's pooler limits        |
| `AUTH_SECRET`                                 | generated by Render                             | yes      | keys sign-in codes and KYC challenges; changing it signs everyone out |
| `FORWARDED_IP_SECRET`                         | generated by Render                             | yes      | copy to Vercel; without it the API refuses to start in production     |
| `CORS_ORIGINS`                                | `https://abotkamay.ph,https://www.abotkamay.ph` | yes      | comma-separated, exact origins                                        |
| `MEDIA_S3_ENDPOINT`                           | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | R2 only  | empty for AWS                                                         |
| `AWS_ACCESS_KEY_ID`                           | R2 token key · IAM access key                   | yes      |                                                                       |
| `AWS_SECRET_ACCESS_KEY`                       | R2 token secret · IAM secret                    | yes      |                                                                       |
| `MEDIA_QUARANTINE_BUCKET`                     | `abotkamay-quarantine`                          | yes      | uploads answer 503 until both buckets are set                         |
| `MEDIA_RESTRICTED_BUCKET`                     | `abotkamay-restricted`                          | yes      |                                                                       |
| `MEDIA_PUBLIC_BASE_URL`                       | `https://media.abotkamay.ph`                    | yes      | without it posts are served without media                             |
| `ANTHROPIC_API_KEY`                           | from console.anthropic.com                      | no       | without it every submission goes to people                            |
| `PAYMONGO_WEBHOOK_SECRET`                     | `whsk_...`                                      | no       | each webhook route answers 404 until its secret is set                |
| `XENDIT_CALLBACK_TOKEN`                       | from Xendit                                     | no       |                                                                       |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | `sk_...` / `whsec_...`                          | no       |                                                                       |
| `PORT`                                        | set by Render                                   |          | do not set; the image listens on Render's `PORT` (default 10000)      |

Optional, with their defaults: `SESSION_TTL_DAYS=30`, `OTP_TTL_SECONDS=300`, `KYC_REVERIFY_MONTHS=24`,
`KYC_MEDIA_RETENTION_DAYS=30`, `CREATOR_MAX_OPEN_CAMPAIGNS=3`, `WEBHOOK_TOLERANCE_SECONDS=300`.

### Render: background worker `abotkamay-media-worker`

| Variable                                                                                                                                | Value                       | Notes                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`, `MEDIA_S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `MEDIA_QUARANTINE_BUCKET`, `MEDIA_RESTRICTED_BUCKET` | copied from `abotkamay-api` | `fromService` in `render.yaml`                                             |
| `DATABASE_POOL_MAX`                                                                                                                     | `3`                         |                                                                            |
| `MEDIA_PUBLIC_BUCKET`                                                                                                                   | `abotkamay-public`          | the only service that writes there; the worker refuses to start without it |

Optional, with their defaults: `MEDIA_WORKER_POLL_SECONDS=5`, `MEDIA_WORKER_MAX_ATTEMPTS=6` (a failing file
is retried 2, 8, 26, 80 and 242 minutes after it was queued, then held for a person and audit-logged as
`MEDIA_HELD`),
`MEDIA_WORKER_FFMPEG_TIMEOUT_SECONDS=900`. `FFMPEG_PATH`, `FFPROBE_PATH` and `HEIF_CONVERT_PATH` default to
the tools the image installs.

### GitHub Actions

| Where                                 | Name                                               | Value                                   |
| ------------------------------------- | -------------------------------------------------- | --------------------------------------- |
| Environment `production` → secret     | `NEON_DIRECT_DATABASE_URL`                         | Neon direct URL                         |
| Environment `production` → secret     | `NEON_DATABASE_URL`                                | Neon pooled URL                         |
| Repository variable                   | `NEON_MIGRATIONS_ENABLED`                          | `true`                                  |
| Repository variables (later, for E2E) | `E2E_BASE_URL`, `E2E_API_URL`, `E2E_SCENARIO_TAGS` | a staging environment, never production |
| Repository secret (later, for E2E)    | `E2E_SEED_TOKEN`                                   |                                         |

## 7. After the first deploy

```bash
# API
curl -s https://api.abotkamay.ph/api/v1/health/live
curl -s https://api.abotkamay.ph/api/v1/health/ready                      # {"status":"ok","database":"up"}
curl -s "https://api.abotkamay.ph/api/v1/campaigns?limit=1"              # {"items":[],"nextCursor":null} at first

# Web: pages, language switch, 404
curl -sI https://abotkamay.ph/campaigns | grep -iE "^HTTP|content-security-policy"
curl -sI "https://abotkamay.ph/campaigns?lang=en" | grep -iE "^HTTP|^location|^set-cookie"   # 307, ak_lang=en
curl -s -o /dev/null -w "%{http_code}\n" https://abotkamay.ph/does-not-exist                   # 404

# Upload CORS (R2 shown; for S3 use the bucket's own origin)
curl -si -X OPTIONS "https://<ACCOUNT_ID>.r2.cloudflarestorage.com/abotkamay-quarantine/cors-check" \
  -H "Origin: https://abotkamay.ph" -H "Access-Control-Request-Method: PUT" \
  -H "Access-Control-Request-Headers: content-type,x-amz-checksum-sha256" | grep -i "^access-control"
```

In a browser: the home page and the feed show the empty state; FIL | EN switches the whole site and the
choice survives a reload; the checker page loads and says it isn't open yet.

**Making someone a reviewer** (they must have signed in once, which needs the SMS adapter):

```sql
UPDATE users SET roles = array_append(roles, 'REVIEWER'::role)
WHERE phone_e164 = '+639171234567' AND NOT ('REVIEWER'::role = ANY (roles));
```

## 8. Operating notes

- **API outage**: pages already in the cache keep being served (a failed background refresh keeps the last
  good copy). A campaign page never rendered before answers 500 until the API is back.
- **Stuck media**: a file that fails `MEDIA_WORKER_MAX_ATTEMPTS` times is marked `NEEDS_HUMAN` and audit-logged
  (`MEDIA_HELD`); the post stays without it until a reviewer acts.
- **Logs**: the web app sends an `X-Request-Id` with every uncached API call and logs it when the call fails;
  the API stores it on audit rows, so one id links both sides.
- **Secrets rotation**: `AUTH_SECRET` signs everyone out when changed. `FORWARDED_IP_SECRET` must change on
  Render and Vercel together (redeploy both).
- **Junk URLs**: paths like `/wp-login.php` answer a cached 404. If bots hammer random paths, turn on
  Vercel's Firewall bot protection.
- **Image optimization**: `next/image` resizes CDN photos for each screen on Vercel (billed per source
  image). The worker already caps photos at 2048 px.

## 9. Launch blockers and known gaps

In order of importance:

1. **SMS gateway adapter**: without it no one can sign in in production, so there are no creators, no
   reviewers and no posts. The launch is read-only until this ships.
2. **ID-image purge job**: the consent text promises deletion 30 days after the decision (Data Privacy Act,
   RA 10173), and `media_purge_after` is recorded, but no job deletes the images. Use the lifecycle rule in
   section 3 now; build the job next. Run a DPIA before launch.
3. **Donations** (`POST /campaigns/{id}/donations`, checkout and the payment processor) are not built.
4. **"Legit ba 'to?"** lookup (`POST /channels/check`) is not built.
5. **Staff console**: reviewers can only use the `/review` API endpoints.
6. **Minors**: no automatic face blur; media showing a minor is held for a person and never published
   automatically.
7. **Malware scanning**: uploads are type- and size-checked, hash-verified, and every published file is a
   re-encoded copy (not the original), but originals are not scanned. Consider GuardDuty Malware Protection
   for S3 or a scanning step in the worker before reviewers download originals.
8. **Direct API calls and IP limits**: the per-IP sign-in limit trusts `X-Forwarded-For` for callers other
   than the web server, and a caller can put its own address first. The per-phone limit (3 codes per 15
   minutes) still holds. Add an edge rate limit on `POST /api/v1/auth/otp` (Cloudflare WAF or similar) when
   SMS goes live, since each code costs money.
9. **Previews**: CORS lists production origins only (section 5).
