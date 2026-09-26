// apps/web/lib/api.ts
//
// Typed HTTP client for the AbotKamay API (NestJS + Fastify, http://localhost:4000/api/v1 by default).
//
// - One place for the base URL, headers, timeouts, retries and error mapping.
// - Interceptors run around every attempt: request (add headers or auth), response (inspect or replace)
//   and error (report). Register with http.interceptors.<kind>.use(fn); use() returns an unsubscribe.
// - Every failure becomes an ApiError with a stable `code`; the UI shows the message for that code in
//   the visitor's language (lib/i18n/messages, `api`). Raw server text goes to logs, never to the screen.
// - Only the real API: there is no sample-data mode anywhere in the web app.
// - Retries only when repeating is safe: GET, or a POST that carries an Idempotency-Key (the API
//   replays the stored response for a repeated key). Backoff is exponential with jitter and honors
//   Retry-After.
// - Money stays a string. The API sends BigInt as decimal strings; nothing here turns it into a Number.
// - Works in Server Components (Node fetch with Next.js cache options) and in the browser. It sends only
//   the headers the API's CORS policy allows (apps/api/src/main.ts): Content-Type, Authorization,
//   Idempotency-Key and X-Request-Id. Browsers can read Retry-After and X-Request-Id on cross-origin
//   responses only if the API lists them in Access-Control-Expose-Headers. Server code adds the
//   visitor's address on per-visitor calls (lib/visitor.ts); browsers never send those headers.
import { API_BASE_URL } from './config';
import type { Locale } from './i18n/config';
import type {
  CampaignDetail,
  CampaignSummary,
  ChannelCheckRequest,
  ChannelCheckResult,
  CreateCampaignRequest,
  CreateDonationRequest,
  CreateDonationResponse,
  CreatedCampaign,
  CreateSpendingReportRequest,
  CreateUploadRequest,
  HealthLive,
  HealthReady,
  KycChallenge,
  LedgerVerification,
  MyCampaign,
  OtpRequested,
  Page,
  PublicLedgerEntry,
  SignInResponse,
  SpendingReport,
  SubmitKycRequest,
  UploadIntent,
  Viewer,
} from './types';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: QueryParams;
  headers?: HeadersInit;
  /** Per-attempt timeout in milliseconds. Default 10 s: many donors are on 4G inside TikTok. */
  timeoutMs?: number;
  /** Extra attempts after the first. Default: 2 for GET and for POSTs with an idempotencyKey, else 0. */
  retries?: number;
  /** Sent as the Idempotency-Key header. Required by money endpoints, and makes a retry safe. */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** Next.js data cache, Server Components only: { revalidate: seconds, tags: [...] }. */
  next?: NextFetchRequestConfig;
  cache?: RequestCache;
  credentials?: RequestCredentials;
}

interface FullRequestOptions extends RequestOptions {
  method: HttpMethod;
  body?: unknown;
}

/** What request interceptors may change before an attempt is sent. */
export interface RequestContext {
  readonly method: HttpMethod;
  readonly path: string;
  url: string;
  headers: Headers;
  body: string | undefined;
  /** 1 for the first try, 2 for the first retry, and so on. */
  readonly attempt: number;
  /** Same for every attempt of one logical request, so retries can be correlated in logs. */
  readonly requestId: string;
  readonly startedAt: number;
}

export type RequestInterceptor = (context: RequestContext) => void | Promise<void>;
/** Return a Response to replace the one received, or nothing to keep it. */
export type ResponseInterceptor = (
  response: Response,
  context: RequestContext,
) => Response | void | Promise<Response | void>;
export type ErrorInterceptor = (error: ApiError, context: RequestContext) => void | Promise<void>;

// ------------------------------------------------------------------------------------------ Errors

export type ApiErrorCode =
  | 'NETWORK' // no response: offline, DNS, CORS, connection reset
  | 'TIMEOUT'
  | 'ABORTED' // cancelled by the caller
  | 'BAD_REQUEST'
  | 'VALIDATION' // 400 with field issues (ZodValidationPipe) or 422
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'SERVER'
  | 'UNAVAILABLE' // 502, 503, 504: worth retrying
  | 'INVALID_RESPONSE';

export interface ValidationIssue {
  path: string;
  message: string;
}

const RETRYABLE_CODES: ReadonlySet<ApiErrorCode> = new Set([
  'NETWORK',
  'TIMEOUT',
  'RATE_LIMITED',
  'UNAVAILABLE',
]);

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly code: ApiErrorCode;
  /** HTTP status, or 0 when no response arrived. */
  readonly status: number;
  readonly method: HttpMethod;
  readonly url: string;
  readonly requestId: string;
  readonly issues: readonly ValidationIssue[];
  readonly retryAfterMs: number | null;
  /** Parsed error body, for logging. Never render it. */
  readonly body: unknown;

  constructor(init: {
    code: ApiErrorCode;
    message: string;
    status?: number;
    method: HttpMethod;
    url: string;
    requestId: string;
    issues?: readonly ValidationIssue[];
    retryAfterMs?: number | null;
    body?: unknown;
    cause?: unknown;
  }) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.code = init.code;
    this.status = init.status ?? 0;
    this.method = init.method;
    this.url = init.url;
    this.requestId = init.requestId;
    this.issues = init.issues ?? [];
    this.retryAfterMs = init.retryAfterMs ?? null;
    this.body = init.body;
  }

  get retryable(): boolean {
    return RETRYABLE_CODES.has(this.code);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

// -------------------------------------------------------------------------------------- The client

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;
const RETRY_MAX_DELAY_MS = 4_000;
/** Longer server-requested waits fail fast instead: a donor should not stare at a spinner. */
const MAX_RETRY_AFTER_MS = 5_000;

type Attempt<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export interface ApiClient {
  request<T>(path: string, options: FullRequestOptions): Promise<T>;
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>;
  delete<T>(path: string, options?: RequestOptions): Promise<T>;
  readonly interceptors: {
    request: { use(interceptor: RequestInterceptor): () => void };
    response: { use(interceptor: ResponseInterceptor): () => void };
    error: { use(interceptor: ErrorInterceptor): () => void };
  };
}

/** use(fn) for an interceptor set; the returned function removes fn again. */
function register<T>(set: Set<T>) {
  return (interceptor: T): (() => void) => {
    set.add(interceptor);
    return () => {
      set.delete(interceptor);
    };
  };
}

export function createApiClient({ baseUrl }: { baseUrl: string }): ApiClient {
  const requestInterceptors = new Set<RequestInterceptor>();
  const responseInterceptors = new Set<ResponseInterceptor>();
  const errorInterceptors = new Set<ErrorInterceptor>();

  async function runAttempt<T>(context: RequestContext, options: FullRequestOptions): Promise<Attempt<T>> {
    const { signal, next, cache, credentials } = options;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const forwardAbort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener('abort', forwardAbort, { once: true });

    try {
      for (const interceptor of requestInterceptors) await interceptor(context);

      const init: RequestInit = {
        method: context.method,
        headers: context.headers,
        body: context.body,
        signal: controller.signal,
      };
      if (next) init.next = next;
      if (cache) init.cache = cache;
      if (credentials) init.credentials = credentials;

      let response = await fetch(context.url, init);
      for (const interceptor of responseInterceptors) {
        response = (await interceptor(response, context)) ?? response;
      }

      if (!response.ok) return { ok: false, error: await errorFromResponse(response, context) };
      return { ok: true, data: (await readJson(response, context)) as T };
    } catch (caught) {
      if (caught instanceof ApiError) return { ok: false, error: caught };
      const code: ApiErrorCode = timedOut ? 'TIMEOUT' : signal?.aborted ? 'ABORTED' : 'NETWORK';
      return {
        ok: false,
        error: new ApiError({
          code,
          message: `${context.method} ${context.path}: ${code === 'NETWORK' ? describe(caught) : code.toLowerCase()}`,
          method: context.method,
          url: context.url,
          requestId: context.requestId,
          cause: caught,
        }),
      };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forwardAbort);
    }
  }

  async function request<T>(path: string, options: FullRequestOptions): Promise<T> {
    const { method, body, query, idempotencyKey, signal } = options;
    const safeToRepeat = method === 'GET' || idempotencyKey !== undefined;
    const maxRetries = options.retries ?? (safeToRepeat ? DEFAULT_RETRIES : 0);
    const requestId = randomId();

    const headers = new Headers(options.headers);
    headers.set('Accept', 'application/json');
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
    // Next.js keys its data cache on request headers, so a unique id would make every cached read
    // a cache miss. Cached reads go without it.
    const cacheable = options.next !== undefined || options.cache === 'force-cache';
    if (!cacheable) headers.set('X-Request-Id', requestId);

    const url = buildUrl(baseUrl, path, query);
    const encodedBody = body === undefined ? undefined : JSON.stringify(body);

    for (let attempt = 1; ; attempt++) {
      const context: RequestContext = {
        method,
        path,
        url,
        headers: new Headers(headers),
        body: encodedBody,
        attempt,
        requestId,
        startedAt: Date.now(),
      };
      const result = await runAttempt<T>(context, options);
      if (result.ok) return result.data;

      const { error } = result;
      const waitMs = error.retryAfterMs ?? backoffDelay(attempt);
      if (attempt <= maxRetries && error.retryable && waitMs <= MAX_RETRY_AFTER_MS && !signal?.aborted) {
        const slept = await sleep(waitMs, signal);
        if (slept) continue;
      }

      for (const interceptor of errorInterceptors) {
        try {
          await interceptor(error, context);
        } catch {
          // Reporting must never replace the original error.
        }
      }
      throw error;
    }
  }

  return {
    request,
    get: (path, options) => request(path, { ...options, method: 'GET' }),
    post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
    patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
    delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
    interceptors: {
      request: { use: register(requestInterceptors) },
      response: { use: register(responseInterceptors) },
      error: { use: register(errorInterceptors) },
    },
  };
}

// ----------------------------------------------------------------------------------------- Helpers

function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${url}?${search}` : url;
}

async function readJson(response: Response, context: RequestContext): Promise<unknown> {
  if (response.status === 204 || response.status === 205) return undefined;
  const text = await response.text();
  if (text === '') return undefined;
  const contentType = response.headers.get('content-type') ?? '';
  const invalid = (message: string, cause?: unknown) =>
    new ApiError({
      code: 'INVALID_RESPONSE',
      message: `${context.method} ${context.path}: ${message}`,
      status: response.status,
      method: context.method,
      url: context.url,
      requestId: context.requestId,
      cause,
    });
  if (!contentType.includes('json'))
    throw invalid(`expected JSON, got "${contentType || 'no content type'}"`);
  try {
    return JSON.parse(text);
  } catch (cause) {
    throw invalid('response body is not valid JSON', cause);
  }
}

/** Maps NestJS error bodies: { statusCode, message, error } and { message, issues: [{ path, message }] }. */
async function errorFromResponse(response: Response, context: RequestContext): Promise<ApiError> {
  let body: unknown;
  try {
    const text = await response.text();
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }

  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const issues = Array.isArray(record.issues)
    ? record.issues.filter(
        (issue): issue is ValidationIssue =>
          typeof issue === 'object' &&
          issue !== null &&
          typeof (issue as ValidationIssue).path === 'string' &&
          typeof (issue as ValidationIssue).message === 'string',
      )
    : [];
  const serverMessage = Array.isArray(record.message)
    ? record.message.join('; ')
    : typeof record.message === 'string'
      ? record.message
      : response.statusText;

  return new ApiError({
    code: codeForStatus(response.status, issues.length > 0),
    message: `${context.method} ${context.path} failed with ${response.status}: ${serverMessage}`,
    status: response.status,
    method: context.method,
    url: context.url,
    requestId: response.headers.get('x-request-id') ?? context.requestId,
    issues,
    retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
    body,
  });
}

function codeForStatus(status: number, hasIssues: boolean): ApiErrorCode {
  if (status === 400) return hasIssues ? 'VALIDATION' : 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 422) return 'VALIDATION';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 502 || status === 503 || status === 504) return 'UNAVAILABLE';
  if (status >= 500) return 'SERVER';
  return 'BAD_REQUEST';
}

/** Retry-After is either seconds or an HTTP date. */
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1000;
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}

/** Exponential backoff with jitter: about 300 ms, 600 ms, 1.2 s ... capped at 4 s. */
function backoffDelay(attempt: number): number {
  const ceiling = Math.min(RETRY_MAX_DELAY_MS, RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  return Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
}

/** Resolves true after `ms`, or false as soon as `signal` aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Random UUID v4. crypto.randomUUID only exists in secure contexts; testing on a phone over the LAN
 * (http://192.168.x.x:3000) is not one, so fall back to getRandomValues, which works everywhere.
 */
export function randomId(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ----------------------------------------------------------------------------- AbotKamay endpoints

export const http = createApiClient({ baseUrl: API_BASE_URL });

if (process.env.NODE_ENV === 'development') {
  http.interceptors.error.use((error, context) => {
    if (error.code === 'ABORTED') return;
    console.warn(
      `[api] ${context.method} ${context.path} failed after ${context.attempt} attempt(s): ` +
        `${error.code} ${error.status || ''} (request ${error.requestId})\n  ${error.message}`,
    );
  });
}

const segment = encodeURIComponent;

/** Reads that render pages on the server: at most two 6-second tries, so a stalled API can't hold a page open. */
const PAGE_READ = { timeoutMs: 6_000, retries: 1 } as const;

/**
 * Signed-in calls. The session token lives in an HttpOnly cookie on the web origin; only server code
 * (Server Actions and Server Components) reads it and forwards it here. Never cached.
 */
function authed(token: string, options?: RequestOptions): RequestOptions {
  const headers = new Headers(options?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return { cache: 'no-store', ...options, headers };
}

/**
 * Public API (TECHNICAL_PLAN.md, section 2.8). Campaign reads are cached by Next.js for a short time
 * and revalidated in the background, like the CDN in front of them.
 */
export const api = {
  health: {
    live: (options?: RequestOptions) => http.get<HealthLive>('/health/live', options),
    ready: (options?: RequestOptions) => http.get<HealthReady>('/health/ready', options),
  },
  campaigns: {
    list: (query: { cursor?: string; limit?: number } = {}, options?: RequestOptions) =>
      http.get<Page<CampaignSummary>>('/campaigns', {
        next: { revalidate: 30, tags: ['campaigns'] },
        ...PAGE_READ,
        ...options,
        query,
      }),
    /** `lang` picks the language of the text the API writes (timeline, checks, excess-funds policy). */
    get: (slug: string, lang: Locale, options?: RequestOptions) =>
      http.get<CampaignDetail>(`/campaigns/${segment(slug)}`, {
        next: { revalidate: 30, tags: [`campaign:${slug}`] },
        ...PAGE_READ,
        ...options,
        query: { lang },
      }),
    ledger: (slug: string, query: { cursor?: string; limit?: number } = {}, options?: RequestOptions) =>
      http.get<Page<PublicLedgerEntry>>(`/campaigns/${segment(slug)}/ledger`, {
        next: { revalidate: 15, tags: [`campaign:${slug}:ledger`] },
        ...PAGE_READ,
        ...options,
        query,
      }),
    /** Creates a checkout with the payment provider. The server decides amounts and fees. */
    createDonation: (
      campaignId: string,
      body: CreateDonationRequest,
      options: RequestOptions & { idempotencyKey: string },
    ) => http.post<CreateDonationResponse>(`/campaigns/${segment(campaignId)}/donations`, body, options),
    spendingReports: (
      slug: string,
      query: { cursor?: string; limit?: number } = {},
      options?: RequestOptions,
    ) =>
      http.get<Page<SpendingReport>>(`/campaigns/${segment(slug)}/spending-reports`, {
        next: { revalidate: 15, tags: [`campaign:${slug}:spending`] },
        ...PAGE_READ,
        ...options,
        query,
      }),
    /** A KYC-verified creator's new post. It waits for review before it appears in the feed. */
    create: (token: string, body: CreateCampaignRequest, options?: RequestOptions) =>
      http.post<CreatedCampaign>('/campaigns', body, authed(token, { timeoutMs: 20_000, ...options })),
    /** A receipt or proof of spending, from the campaign's own creator. */
    createSpendingReport: (
      token: string,
      slug: string,
      body: CreateSpendingReportRequest,
      options?: RequestOptions,
    ) =>
      http.post<SpendingReport>(
        `/campaigns/${segment(slug)}/spending-reports`,
        body,
        authed(token, { timeoutMs: 20_000, ...options }),
      ),
  },
  // The per-visitor calls below take `options` so server code can pass asVisitor() (lib/visitor.ts):
  // the visitor's IP address for the API's sign-in limits and audit records.
  auth: {
    requestOtp: (phone: string, options?: RequestOptions) =>
      http.post<OtpRequested>('/auth/otp', { phone }, { cache: 'no-store', ...options }),
    verifyOtp: (challengeId: string, code: string, options?: RequestOptions) =>
      http.post<SignInResponse>('/auth/otp/verify', { challengeId, code }, { cache: 'no-store', ...options }),
    logout: (token: string, options?: RequestOptions) =>
      http.post<void>('/auth/logout', undefined, authed(token, options)),
  },
  me: {
    get: (token: string, options?: RequestOptions) =>
      http.get<Viewer>('/me', authed(token, { retries: 1, ...options })),
    campaigns: (token: string, options?: RequestOptions) =>
      http.get<MyCampaign[]>('/me/campaigns', authed(token, { retries: 1, ...options })),
  },
  kyc: {
    challenge: (token: string, options?: RequestOptions) =>
      http.post<KycChallenge>('/kyc/challenge', undefined, authed(token, options)),
    submit: (token: string, body: SubmitKycRequest, options?: RequestOptions) =>
      http.post<{ verificationId: string; viewer: Viewer }>(
        '/kyc/verifications',
        body,
        authed(token, { timeoutMs: 20_000, ...options }),
      ),
  },
  uploads: {
    /** A presigned upload slot; the browser then PUTs the file straight to storage. */
    create: (token: string, body: CreateUploadRequest, options?: RequestOptions) =>
      http.post<UploadIntent>('/uploads', body, authed(token, options)),
  },
  channels: {
    /** "Is this legit?" lookup. Read-only, so one retry is safe even without an idempotency key. */
    check: (body: ChannelCheckRequest, options?: RequestOptions) =>
      http.post<ChannelCheckResult>('/channels/check', body, { retries: 1, ...options }),
  },
  ledger: {
    verify: (receiptRef: string, options?: RequestOptions) =>
      http.get<LedgerVerification>(`/ledger/verify/${segment(receiptRef)}`, options),
  },
};
