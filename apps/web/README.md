# AbotKamay web (`apps/web`)

The public site: a media-first feed of creator posts (autoplaying muted videos, photo collages), campaign
pages with the creator's receipts and the public ledger, the "Create post & verify ID" flow, the creator's
account page, and the "Legit ba 'to?" checker. Conversational Filipino by default, formal English through
the FIL | EN toggle in the navbar. Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS 4, Motion,
TypeScript (strict).

Every page reads the AbotKamay API. There is no sample-data mode: with no posts, the feed and the home
page show an invitation to share the first story.

## Run it

From the repository root:

1. `npm install` (npm workspaces install the web app too)
2. `npm run dev` (the API) and `npm run dev:web`, then open http://localhost:3000

Or inside `apps/web`: `npm run dev`.

## Configuration

Next.js reads env files from `apps/web`, not the repository root. Copy `.env.example` to `.env.local`.
Production values and the Vercel setup are in [DEPLOYMENT.md](../../DEPLOYMENT.md).

- `NEXT_PUBLIC_API_BASE_URL`: the API, including `/api/v1`. Default `http://localhost:4000/api/v1`.
- `NEXT_PUBLIC_SITE_URL`: this site's public origin, for canonical URLs, share links and `/c/{slug}` short
  links. On Vercel it falls back to the production domain.
- `NEXT_PUBLIC_MEDIA_BASE_URL`: the media CDN (moderated post photos, videos and posters). Added to the
  Content Security Policy (`img-src`, `media-src`) and to `next/image` remote patterns.
- `NEXT_PUBLIC_UPLOAD_ORIGINS`: storage origins browsers upload to with presigned URLs (CSP `connect-src`).
- `FORWARDED_IP_SECRET` (server-only): the same value as the API's. Server Actions report each visitor's
  IP address to the API with it (`lib/visitor.ts`), so per-IP sign-in limits and audit records see the
  visitor, not this server. Empty in development.

`NEXT_PUBLIC_*` values are inlined at build time: change them, then redeploy. A Vercel production build
fails when one of these is missing (`checkDeploymentEnv` in `next.config.ts`); a preview build warns.

## Languages

- Pages live under `app/[lang]` (`fil`, `en`), but no public URL carries the language: `/campaigns/lolo-ben`
  is one link for everyone. `proxy.ts` (Next.js 16's middleware) rewrites each request to the visitor's
  language, read from the `ak_lang` cookie (Filipino when there is none; `Accept-Language` is ignored,
  because most Philippine phones report English).
- The toggle links to the same page with `?lang=en` or `?lang=fil`. The proxy stores the choice (HttpOnly
  cookie, one year) and redirects to the clean URL. `/en/...` and `/fil/...` links work the same way.
- Static and ISR pages are cached per language (`/fil/campaigns` and `/en/campaigns` are two cache
  entries), so switching never serves the wrong language from a cache. `revalidatePath` runs for both.
- Every word is in `lib/i18n/messages/fil.ts` (the source of truth) and `en.ts` (TypeScript refuses a
  missing key). Server Components use `getMessages()`; Client Components get only the slices they need
  through `LanguageProvider` (every page) and `CreatorMessagesProvider` (creator routes only), so a donor
  never downloads the forms' copy. Server Actions read the cookie (`lib/i18n/action.ts`).
- The API writes some text itself (verification checks, timeline, excess-funds policy); campaign reads ask
  for it with `?lang=`. What creators write (captions, photo descriptions) stays as written.
- `<html lang>` is `fil-PH` or `en-PH`, so screen readers pick the right pronunciation.

## The feed

- A post whose first item is a video plays like TikTok: muted autoplay when at least 60% of it is on
  screen, one video at a time, loop, tap for sound (one sound setting for the whole feed), a visible pause
  button (WCAG 2.2.2), and a poster until it plays. It never autoplays with "reduce motion" or Data Saver,
  and it only downloads when near the screen (`preload="none"` until then).
- Photos show like Facebook and Instagram: one photo at its own shape (4:5 to 1.91:1), two side by side,
  three as one large and two small, four as a grid, "+N" when there are more. Posts without public media
  yet show an illustration of the need, never a stock face.
- The feed and home page are ISR (30 s). An empty result shows `EmptyFeed` ("Wala pang post. Ikaw na ang
  mauna!" / "No posts yet. Be the first to share a story!").

## Where things are

```text
apps/web/
├── proxy.ts                        language routing (?lang=, /en/ and /fil/ prefixes, ak_lang cookie)
├── next.config.ts                  CSP and security headers, /c/:slug short links, deployment env checks
├── vercel.json                     Vercel: workspace install from the repo root, Singapore, skip API-only commits
├── app/
│   ├── global-error.tsx            last-resort page when the root layout fails (both languages)
│   ├── globals.css                 Tailwind entry, base styles, dialog, animation utilities
│   └── [lang]/
│       ├── layout.tsx              root layout: font, metadata, <html lang>, navbar, footer, LanguageProvider
│       ├── page.tsx                home: hero, newest posts (or the empty state), how it works, checker teaser
│       ├── campaigns/
│       │   ├── (feed)/page.tsx     /campaigns: the media-first feed (+ loading.tsx skeleton)
│       │   └── [slug]/
│       │       ├── page.tsx        campaign page (ISR, 30 s): media, creator badge, plan, receipts, donate
│       │       ├── not-found.tsx
│       │       ├── ledger/page.tsx full public ledger and every receipt (#resibo)
│       │       └── mag-ulat/page.tsx the creator's receipt form (signed in, own campaign only)
│       ├── mag-post/               "Create post & verify ID": sign in, verify the ID, create the post
│       ├── mag-sign-in/page.tsx    sign-in for the account pages (?next= limited to same-site account paths)
│       ├── ako/page.tsx            the creator's account: KYC status, posts (incl. in review), receipts
│       ├── verify/page.tsx         "Legit ba 'to?" checker
│       ├── [...missing]/page.tsx   unknown paths answer the localized 404
│       ├── error.tsx, not-found.tsx
├── components/
│   ├── layout/                     navbar, language toggle, footer
│   ├── feed/                       post (video or collage), autoplay video, byline, funding, empty state, sidebar
│   ├── home/                       hero, how it works, funding types, creator invitation, checker teaser
│   ├── campaigns/                  creator badge, media, gallery, plan, receipts, timeline, ledger preview, donate
│   ├── creator/                    sign-in, verify-ID, create-post and receipt forms, media picker, steps
│   ├── verify/                     trust checker
│   ├── ledger/                     ledger entry row
│   ├── brand/                      logo and animated mark
│   └── ui/                         buttons, form fields, chips, progress bar, notices, link pending bar
└── lib/
    ├── api.ts                      typed fetch client: interceptors, timeouts, retries, ApiError
    ├── types.ts                    API contract (mirrors apps/api campaign.dto.ts and viewer.service.ts)
    ├── i18n/                       config, dictionaries (fil, en), server/client/action helpers, fmt/rich/plural
    ├── data/                       campaign, account, channel and donation reads
    ├── actions/creator.ts          Server Actions: sign-in, KYC, uploads, posts, receipts
    ├── session.ts                  the HttpOnly session cookie and the signed-in viewer (server only)
    ├── visitor.ts                  the visitor's IP address for per-visitor API calls (server only)
    ├── uploads.ts                  browser uploads: SHA-256, presigned PUT straight to storage, progress
    ├── money.ts                    BigInt peso formatting and amount parsing (never floats)
    └── format.ts                   dates, time ago, status tones; phone.ts, config.ts, cn.ts
```

## How sign-in and the KYC front gate work here

- The API's session token is stored by a Server Action in an `HttpOnly`, `SameSite=Lax` cookie
  (`ak_session`) on this site. Browser JavaScript never sees it; Server Components and Server Actions
  forward it to the API as a Bearer token, with the visitor's IP address (`lib/visitor.ts`). The API never
  reads cookies, so it has no CSRF surface, and Next.js checks the `Origin` of every Server Action.
- Only the account routes read the cookie (`/mag-post`, `/mag-sign-in`, `/ako`, `/campaigns/[slug]/mag-ulat`).
  The home page, the feed and campaign pages stay static and cached, identical for everyone.
- Every Server Action re-reads the session and lets the API decide (it enforces the KYC gate, and the
  database enforces it again). What the page shows is guidance, not a security boundary.
- Uploads go straight from the browser to storage with presigned PUTs. The browser hashes each file first,
  and storage rejects bytes that don't match the hash the API recorded. `crypto.subtle` needs https (or
  localhost); on plain http from a phone on the LAN, the forms ask to use https.

## API contract used

- `GET /campaigns?limit=` and `GET /campaigns/{slug}?lang=`: posts, the creator badge, plan, timeline, ledger
  summary, the newest receipts
- `GET /campaigns/{slug}/ledger?cursor=` and `GET /campaigns/{slug}/spending-reports?cursor=`
- `POST /auth/otp`, `POST /auth/otp/verify`, `POST /auth/logout`, `GET /me`, `GET /me/campaigns`
- `POST /kyc/challenge`, `POST /kyc/verifications`, `POST /uploads`
- `POST /campaigns` (KYC VERIFIED only), `POST /campaigns/{slug}/spending-reports` (the creator only)
- `POST /campaigns/{id}/donations` with an `Idempotency-Key` header: returns the provider's `checkoutUrl`.
  Not built in the API yet; until then the donation dialog says online donations aren't open.
- `POST /channels/check` with `{ kind: "EWALLET_NUMBER", value: "+639..." }`: `VERIFIED`, `REPORTED` or
  `NOT_FOUND`. Not built in the API yet; until then the checker says it isn't open.

Money is always a string of centavos, as the API serializes BigInt. For browsers to read `Retry-After`
and `X-Request-Id`, the API lists them in `Access-Control-Expose-Headers`.

## Contracts other code relies on

- QA page objects (`qa/e2e-selenium`) find elements by `data-testid`: `campaign-title`,
  `verification-badge`, `verification-timeline`, `public-ledger-link`, `donate-button`, `donation-modal`,
  `amount-input`, `method-gcash|maya|card`, `anonymous-toggle`, `email-input`, `fee-breakdown`,
  `amount-error`, `pay-button`, `channel-input`, `check-result-*`. They open campaigns through `/c/{slug}`.
  Text checks are in Filipino (the default language): the badge contains "verified" ("ID-verified ang
  nag-post"), the fee breakdown "mapupunta sa kampanya", and amount errors "pinakamababa" and "tamang
  halaga". The future donation result page must say "tinanggihan" for a declined payment (scenario DON-003).
- Campaign pages have no `loading.tsx` above them, so a missing campaign answers with a real HTTP 404.
  Posts still in review answer 404 too, like posts that don't exist.
- Campaign reads throw when the API fails. On a production server that keeps pages up: a failed
  background refresh leaves the last good copy in the ISR cache. Home and `/campaigns` show a friendly
  notice only when the API is unreachable at build time or in development. A campaign that has never
  rendered cannot fall back: Next.js answers that request with a 500 (`next start`: plain text; Vercel:
  Next.js's built-in 500 page), until the API is back.
- Posting a receipt expires the campaign's cached API reads (`updateTag`) and cached pages
  (`revalidatePath`, both languages), so the creator sees it at once. A post published by a reviewer
  appears in the feed within the 30-second revalidation window.
- Brand colors in custom CSS use `theme(colors.teal.600)`. A JS Tailwind config emits no `--color-*`
  variables, so `var(--color-teal-600)` would silently resolve to nothing.

## Accessibility and motion

- Body text 16 to 18px, every tap target at least 44px, visible focus rings, a skip link, and zoom allowed.
  Forms label every field, describe errors in text next to the field (`role="alert"`), and never rely on
  color alone.
- Feed videos: muted autoplay only when allowed (not with "reduce motion" or Data Saver), a pause button,
  and the post's description as the text alternative. Creator videos have no captions yet: the media
  pipeline is to add WebVTT from speech-to-text.
- Entrance animations are pure CSS, so pages never wait for JavaScript to become visible. Page changes use
  React `<ViewTransition>` (the browser's View Transitions API). Everything respects "reduce motion".

## Scripts

`dev`, `build`, `start`, `lint` (oxlint), `typecheck` (`next typegen` + `tsc`), `format`, `format:check`.
