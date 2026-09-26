// apps/web/components/verify/trust-checker.tsx
'use client';

//
// "Legit ba 'to?" Paste a GCash or Maya number seen in comments and learn whether it is a verified
// payout channel, a reported scam, or unknown. One field, one button, one clear answer. While the API
// has no checker yet, it says so plainly instead of guessing.
import {
  Check,
  CircleAlert,
  Info,
  LoaderCircle,
  OctagonAlert,
  RotateCcw,
  ScanSearch,
  Search,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Button, ButtonLink, buttonClasses } from '@/components/ui/button';
import { isApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { checkEwalletNumber } from '@/lib/data/channels';
import { formatDate } from '@/lib/format';
import { useLocale, useMessages } from '@/lib/i18n/client';
import { fmt, plural, rich } from '@/lib/i18n/format';
import { formatPhMobile, normalizePhMobile } from '@/lib/phone';
import type { ChannelCheckResult } from '@/lib/types';

type CheckState =
  | { status: 'idle' }
  | { status: 'checking'; number: string }
  | { status: 'done'; result: ChannelCheckResult }
  | { status: 'failed'; message: string };

const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
/** Keep the "checking" state on screen long enough to read, so the answer doesn't flash in. */
const MIN_CHECK_MS = 650;

const PROVIDER_NAMES = { GCASH: 'GCash', MAYA: 'Maya' } as const;

/** Resolves with `work`'s result, but never sooner than `ms` after the call. */
async function atLeast<T>(ms: number, work: Promise<T>): Promise<T> {
  const [result] = await Promise.all([work, new Promise((resolve) => setTimeout(resolve, ms))]);
  return result;
}

export function TrustChecker() {
  const { checker: t, api: apiMessages, common } = useMessages();
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const [value, setValue] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [state, setState] = useState<CheckState>({ status: 'idle' });

  const normalized = normalizePhMobile(value);
  const checking = state.status === 'checking';

  useEffect(() => () => controllerRef.current?.abort(), []);

  // Bring the answer into view on small screens, where it may be below the keyboard.
  useEffect(() => {
    if (state.status !== 'done' && state.status !== 'failed') return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resultsRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
  }, [state.status]);

  async function runCheck(number: string) {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: 'checking', number });

    try {
      const result = await atLeast(MIN_CHECK_MS, checkEwalletNumber(number, controller.signal));
      if (controller.signal.aborted) return;
      setState(
        result === 'UNAVAILABLE' ? { status: 'failed', message: t.unavailable } : { status: 'done', result },
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      setState({
        status: 'failed',
        message: isApiError(error) ? apiMessages[error.code] : common.genericError,
      });
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalized) {
      setFieldError(value.trim() === '' ? t.empty : t.invalid);
      inputRef.current?.focus();
      return;
    }
    setFieldError(null);
    void runCheck(normalized);
  }

  function checkAnother() {
    controllerRef.current?.abort();
    setState({ status: 'idle' });
    setValue('');
    inputRef.current?.focus();
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      <form
        noValidate
        onSubmit={handleSubmit}
        className="animate-fade-up animation-delay-150 rounded-3xl border border-ink-100 bg-white p-6 shadow-card sm:p-8"
      >
        <label htmlFor={`${id}-number`} className="block text-xl font-bold text-ink">
          {t.label}
        </label>
        <p id={`${id}-help`} className="mt-1 text-ink-600">
          {t.help}
        </p>
        <div className="relative mt-4">
          <Smartphone
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 size-6 -translate-y-1/2 text-ink-500"
          />
          <input
            ref={inputRef}
            id={`${id}-number`}
            data-testid="channel-input"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={20}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (fieldError) setFieldError(null);
            }}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? `${id}-error ${id}-help` : `${id}-help`}
            placeholder="09XX XXX XXXX"
            className={cn(
              'h-16 w-full rounded-2xl border-2 border-ink-400 bg-white pl-14 pr-4 text-2xl font-semibold tracking-wide text-ink tabular-nums',
              'transition-[border-color,box-shadow] placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-500',
              'focus:border-teal-600 focus:shadow-[0_0_0_4px_rgb(14_124_107/0.15)] focus:outline-none',
              fieldError && 'border-coral-600',
            )}
          />
        </div>

        <div aria-live="polite" className="min-h-7">
          {fieldError ? (
            <p id={`${id}-error`} className="mt-2 flex items-start gap-2 font-semibold text-coral-800">
              <CircleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
              {fieldError}
            </p>
          ) : (
            normalized && (
              <p className="mt-2 text-ink-700">
                {rich(t.willCheck, {
                  number: <strong className="text-ink">{formatPhMobile(normalized)}</strong>,
                })}
              </p>
            )
          )}
        </div>

        <button
          type="submit"
          disabled={checking}
          className={buttonClasses({ size: 'lg', className: 'mt-4 w-full' })}
        >
          {checking ? (
            <>
              <LoaderCircle aria-hidden className="animate-spin" />
              {t.checking}
            </>
          ) : (
            <>
              <Search aria-hidden />
              {t.submit}
            </>
          )}
        </button>
      </form>

      <div ref={resultsRef} aria-live="polite" className="mt-6 scroll-mb-6">
        <AnimatePresence mode="wait" initial={false}>
          {state.status === 'checking' && (
            <m.div
              key="checking"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            >
              <CheckingCard number={state.number} />
            </m.div>
          )}
          {state.status === 'done' && (
            <m.div
              key={`${state.result.verdict}-${state.result.checkedValue}`}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
            >
              <ResultCard result={state.result} onCheckAnother={checkAnother} />
            </m.div>
          )}
          {state.status === 'failed' && (
            <m.div
              key="failed"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            >
              <div className="rounded-3xl border-2 border-ink-200 bg-white p-6">
                <div className="flex items-start gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-700">
                    <Info aria-hidden className="size-6" />
                  </span>
                  <div>
                    <h2 className="text-xl font-bold text-ink">{t.failedTitle}</h2>
                    <p className="mt-1 text-ink-700">{state.message}</p>
                    <p className="mt-1 text-ink-700">{t.failedNote}</p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  className="mt-5"
                  onClick={() => normalized && void runCheck(normalized)}
                >
                  <RotateCcw aria-hidden />
                  {common.tryAgain}
                </Button>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CheckingCard({ number }: { number: string }) {
  const t = useMessages().checker;
  return (
    <div className="relative overflow-hidden rounded-3xl border border-ink-100 bg-white p-6 shadow-card">
      <span
        aria-hidden
        className="animate-scan pointer-events-none absolute inset-x-0 top-0 h-16 bg-linear-to-b from-transparent via-teal-400/15 to-transparent"
      />
      <div className="relative flex items-center gap-4">
        <span className="relative grid size-12 shrink-0 place-items-center rounded-full bg-teal-50 text-teal-700">
          <span aria-hidden className="animate-pulse-ring absolute inset-0 rounded-full bg-teal-300" />
          <ScanSearch aria-hidden className="relative size-6" />
        </span>
        <div>
          <p className="font-bold text-ink">{fmt(t.checkingNumber, { number: formatPhMobile(number) })}</p>
          <p className="text-ink-600">{t.checkingNote}</p>
        </div>
      </div>
      <div aria-hidden className="relative mt-6 space-y-3">
        <div className="skeleton animate-shimmer h-3.5 w-11/12 rounded-full" />
        <div className="skeleton animate-shimmer h-3.5 w-8/12 rounded-full" />
        <div className="skeleton animate-shimmer h-3.5 w-9/12 rounded-full" />
      </div>
    </div>
  );
}

function ResultCard({ result, onCheckAnother }: { result: ChannelCheckResult; onCheckAnother: () => void }) {
  const { checker: t, common } = useMessages();
  const locale = useLocale();
  const number = <strong className="text-ink">{formatPhMobile(result.checkedValue)}</strong>;
  const again = (
    <button
      type="button"
      onClick={onCheckAnother}
      className="inline-flex min-h-12 items-center gap-2 font-semibold text-teal-700 underline-offset-4 hover:underline"
    >
      <RotateCcw aria-hidden className="size-4" />
      {t.checkAnother}
    </button>
  );

  if (result.verdict === 'VERIFIED') {
    const provider = result.provider ? PROVIDER_NAMES[result.provider] : t.ewallet;
    const alias = result.campaign.beneficiaryAlias;
    return (
      <article
        data-testid="check-result-verified"
        className="overflow-hidden rounded-3xl border-2 border-teal-600 bg-white shadow-lift"
      >
        <header className="flex items-center gap-4 bg-teal-600 px-6 py-5 text-white">
          <span className="animate-pop grid size-12 shrink-0 place-items-center rounded-full bg-white text-teal-700">
            <Check aria-hidden className="size-7" strokeWidth={3} />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-teal-50">{t.result}</p>
            <h2 className="text-2xl font-extrabold">{t.verifiedTitle}</h2>
          </div>
        </header>
        <div className="space-y-4 p-6">
          <p className="text-lg leading-relaxed text-ink-800">
            {rich(t.verifiedBody, {
              number,
              provider,
              alias: <strong className="text-ink">{alias}</strong>,
              date: formatDate(result.verifiedAt, locale),
            })}
          </p>
          {result.accountNameMasked && (
            <p className="text-ink-700">
              {rich(t.verifiedName, {
                provider,
                name: <strong className="font-mono text-ink">{result.accountNameMasked}</strong>,
              })}
            </p>
          )}
          <p className="flex items-start gap-3 rounded-2xl bg-teal-50 p-4 text-ink-800">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-teal-700" />
            {t.safest}
          </p>
          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <ButtonLink href={`/campaigns/${result.campaign.slug}`} size="lg">
              {fmt(t.goToCampaign, { alias })}
            </ButtonLink>
            {again}
          </div>
        </div>
      </article>
    );
  }

  if (result.verdict === 'REPORTED') {
    return (
      <article
        data-testid="check-result-reported"
        className="overflow-hidden rounded-3xl border-2 border-coral-500 bg-white shadow-lift"
      >
        <header className="flex items-center gap-4 bg-coral-50 px-6 py-5">
          <span className="animate-pop grid size-12 shrink-0 place-items-center rounded-full bg-coral-500 text-white">
            <OctagonAlert aria-hidden className="size-7" />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-coral-800">{t.warning}</p>
            <h2 className="text-2xl font-extrabold text-ink">{t.reportedTitle}</h2>
          </div>
        </header>
        <div className="space-y-4 p-6">
          <p className="text-lg leading-relaxed text-ink-800">
            {rich(t.reportedBody, {
              number,
              count: <strong className="text-ink">{plural(t.reportedTimes, result.reportCount)}</strong>,
              date: formatDate(result.lastReportedAt, locale),
            })}
          </p>
          <ul className="space-y-2 rounded-2xl bg-cream-100 p-4 text-ink-800">
            {t.reportedSteps.map((step) => (
              <li key={step} className="flex gap-3">
                <Check aria-hidden className="mt-1 size-4 shrink-0 text-ink-600" strokeWidth={3} />
                {step}
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
            <ButtonLink href="/campaigns" size="lg">
              {t.viewVerifiedFeed}
            </ButtonLink>
            {again}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      data-testid="check-result-not-found"
      className="overflow-hidden rounded-3xl border-2 border-gold-400 bg-white shadow-lift"
    >
      <header className="flex items-center gap-4 bg-gold-50 px-6 py-5">
        <span className="animate-pop grid size-12 shrink-0 place-items-center rounded-full bg-gold-400 text-ink">
          <Info aria-hidden className="size-7" />
        </span>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-gold-800">{t.notFoundEyebrow}</p>
          <h2 className="text-2xl font-extrabold text-ink">{t.notFoundTitle}</h2>
        </div>
      </header>
      <div className="space-y-4 p-6">
        <p className="text-lg leading-relaxed text-ink-800">{rich(t.notFoundBody, { number })}</p>
        <p className="flex items-start gap-3 rounded-2xl bg-cream-100 p-4 text-ink-800">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-teal-700" />
          {t.notFoundAdvice}
        </p>
        <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <ButtonLink href="/campaigns" size="lg">
            {common.viewFeed}
          </ButtonLink>
          {again}
        </div>
      </div>
    </article>
  );
}
