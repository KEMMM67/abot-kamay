// apps/web/lib/actions/creator.ts
'use server';

//
// Server Actions for sign-in, ID verification, uploads, posts and receipts.
//
// Every action is a public POST endpoint (Next.js Server Actions), so each one re-reads the session
// from the HttpOnly cookie and lets the API decide who may do what: the API is the authority on the
// KYC front gate, and the database enforces it again. The browser never sees the session token.
// Results are plain objects shaped for the UI: { ok: true, data } or { ok: false, error, issues },
// with `error` in the visitor's language (the ak_lang cookie; Server Actions can't read root params).
import { refresh, revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { api, isApiError, type RequestOptions } from '@/lib/api';
import { getActionMessages } from '@/lib/i18n/action';
import { LOCALES } from '@/lib/i18n/config';
import { fmt } from '@/lib/i18n/format';
import type { Messages } from '@/lib/i18n/messages/fil';
import { normalizePhMobile } from '@/lib/phone';
import { clearSessionCookie, getSessionToken, safeNextPath, setSessionCookie } from '@/lib/session';
import type {
  CreateCampaignRequest,
  CreatedCampaign,
  CreateSpendingReportRequest,
  CreateUploadRequest,
  KycChallenge,
  OtpRequested,
  SpendingReport,
  SubmitKycRequest,
  UploadIntent,
} from '@/lib/types';
import { asVisitor } from '@/lib/visitor';

export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: string; code?: string; issues?: Record<string, string> };

type Failure = { ok: false; error: string; code?: string; issues?: Record<string, string> };

/** The message for an API error code, when the dictionary has one. */
function lookup(table: Record<string, string>, code: string | undefined): string | undefined {
  return code && Object.hasOwn(table, code) ? table[code] : undefined;
}

function failure(error: unknown, t: Messages): Failure {
  if (!isApiError(error)) {
    console.error('[creator action]', error);
    return { ok: false, error: t.actions.unexpected };
  }
  const body = (typeof error.body === 'object' && error.body !== null ? error.body : {}) as {
    code?: unknown;
    attemptsLeft?: unknown;
    issues?: unknown;
  };
  const code = typeof body.code === 'string' ? body.code : undefined;
  let message = lookup(t.actions.codes, code) ?? t.api[error.code];
  if (code === 'OTP_INVALID' && typeof body.attemptsLeft === 'number') {
    message = fmt(t.actions.wrongCodeAttempts, { count: body.attemptsLeft });
  }

  const issues: Record<string, string> = {};
  const rawIssues = Array.isArray(body.issues) ? body.issues : error.issues;
  for (const issue of rawIssues as Array<{ path?: unknown; code?: unknown }>) {
    if (typeof issue.path !== 'string') continue;
    issues[issue.path] =
      lookup(t.actions.issues, typeof issue.code === 'string' ? issue.code : undefined) ??
      t.actions.checkThisPart;
  }
  return { ok: false, error: message, code, ...(Object.keys(issues).length ? { issues } : {}) };
}

async function requireToken(): Promise<string> {
  const token = await getSessionToken();
  if (!token) throw new SignInRequired();
  return token;
}

class SignInRequired extends Error {}

/** Runs a signed-in call. `visitor` carries the visitor's IP address to the API (lib/visitor.ts). */
async function run<T>(
  work: (token: string, visitor: RequestOptions) => Promise<T> | T,
): Promise<ActionResult<T>> {
  const t = await getActionMessages();
  try {
    const token = await requireToken();
    return { ok: true, data: await work(token, await asVisitor()) };
  } catch (error) {
    if (error instanceof SignInRequired) {
      return { ok: false, error: t.actions.codes.SIGN_IN_REQUIRED, code: 'SIGN_IN_REQUIRED' };
    }
    return failure(error, t);
  }
}

// ------------------------------------------------------------------------------------ Sign-in

export async function requestSignInCode(rawPhone: string): Promise<ActionResult<OtpRequested>> {
  const t = await getActionMessages();
  const phone = normalizePhMobile(String(rawPhone));
  if (!phone) {
    return {
      ok: false,
      error: t.actions.codes.INVALID_PHONE,
      code: 'INVALID_PHONE',
      issues: { phone: 'invalid' },
    };
  }
  try {
    return { ok: true, data: await api.auth.requestOtp(phone, await asVisitor()) };
  } catch (error) {
    return failure(error, t);
  }
}

/**
 * Signs in and stores the session cookie. Setting the cookie re-renders the current page, so on
 * /mag-post the next step appears in place; with `next`, the browser is sent there instead.
 */
export async function verifySignInCode(
  challengeId: string,
  code: string,
  next?: string,
): Promise<ActionResult<{ signedIn: true }>> {
  const t = await getActionMessages();
  if (!/^\d{6}$/.test(String(code).trim())) {
    return { ok: false, error: t.signIn.invalidCode, issues: { code: 'invalid' } };
  }
  try {
    const signedIn = await api.auth.verifyOtp(String(challengeId), String(code).trim(), await asVisitor());
    await setSessionCookie(signedIn.token, signedIn.expiresAt);
  } catch (error) {
    return failure(error, t);
  }
  if (next !== undefined) redirect(safeNextPath(next));
  return { ok: true, data: { signedIn: true } };
}

export async function signOut(): Promise<void> {
  const token = await getSessionToken();
  if (token) {
    try {
      await api.auth.logout(token, await asVisitor());
    } catch (error) {
      // The cookie is cleared either way; a failed revoke only leaves an unused server session.
      console.warn('[signOut] Could not revoke the API session', error);
    }
  }
  await clearSessionCookie();
  redirect('/');
}

// ----------------------------------------------------------------------------------------- KYC

export async function startKycChallenge(): Promise<ActionResult<KycChallenge>> {
  return run((token, visitor) => api.kyc.challenge(token, visitor));
}

export async function submitKyc(request: SubmitKycRequest): Promise<ActionResult<{ submitted: true }>> {
  const result = await run(async (token, visitor) => {
    await api.kyc.submit(token, request, visitor);
    return { submitted: true as const };
  });
  // Re-render the page in the same response: the form gives way to the "being reviewed" screen.
  if (result.ok) refresh();
  return result;
}

// ------------------------------------------------------------------------------------- Uploads

const MAX_FILES_PER_CALL = 12;

/**
 * Presigned upload slots for several files at once. Server Actions run one at a time per browser tab,
 * so one call per file would upload a 10-photo post very slowly. The files themselves go from the
 * browser straight to storage; they never pass through this server or the API.
 */
export async function prepareUploads(files: CreateUploadRequest[]): Promise<ActionResult<UploadIntent[]>> {
  if (!Array.isArray(files) || files.length === 0 || files.length > MAX_FILES_PER_CALL) {
    const t = await getActionMessages();
    return { ok: false, error: t.actions.fileCount };
  }
  return run((token, visitor) => Promise.all(files.map((file) => api.uploads.create(token, file, visitor))));
}

// --------------------------------------------------------------------------------------- Posts

export async function createPost(request: CreateCampaignRequest): Promise<ActionResult<CreatedCampaign>> {
  return run((token, visitor) => api.campaigns.create(token, request, visitor));
}

export async function createSpendingReport(
  slug: string,
  request: CreateSpendingReportRequest,
): Promise<ActionResult<SpendingReport>> {
  const result = await run((token, visitor) =>
    api.campaigns.createSpendingReport(token, slug, request, visitor),
  );
  if (result.ok) {
    // Read-your-own-writes: the campaign page and ledger show the new receipt on the next visit.
    // Tags expire the cached API reads; paths expire the cached pages themselves (including copies the
    // browser prefetched), in every language.
    updateTag(`campaign:${slug}`);
    updateTag(`campaign:${slug}:spending`);
    for (const locale of LOCALES) {
      revalidatePath(`/${locale}/campaigns/${slug}`);
      revalidatePath(`/${locale}/campaigns/${slug}/ledger`);
    }
  }
  return result;
}
