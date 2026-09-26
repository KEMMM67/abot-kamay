// apps/web/components/campaigns/donation-dialog.tsx
'use client';

//
// Donation form in a native <dialog>: a bottom sheet on phones, a centered card on larger screens.
//
// Built around the QA contract in qa/e2e-selenium (DonationModal page object): data-testids on every
// control, validation when the amount field loses focus, fees shown before payment, and a Pay button
// that stays disabled while the amount is invalid. The Filipino texts the suite matches
// ("pinakamababa", "tamang halaga", "mapupunta sa kampanya") live in lib/i18n/messages/fil.ts.
//
// Money safety:
// - The amount is parsed as exact centavos (lib/money.ts). "1e3" or "19.99" is rejected, never guessed.
// - One idempotency key per attempt. A double tap or a retry after a network error reuses it, so the
//   server creates one checkout, not two (QA scenario DON-007).
// - Card and wallet details are entered on the provider's hosted page, never here.
import { Check, CreditCard, LoaderCircle, Lock, Smartphone, Wallet, X, type LucideIcon } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { buttonClasses } from '@/components/ui/button';
import { isApiError, randomId } from '@/lib/api';
import { cn } from '@/lib/cn';
import { startDonation } from '@/lib/data/donations';
import { useMessages } from '@/lib/i18n/client';
import { fmt, rich } from '@/lib/i18n/format';
import { formatPeso, MAX_DONATION_MINOR, MIN_DONATION_MINOR, parsePesoInput } from '@/lib/money';
import type { CreateDonationRequest, PaymentMethod } from '@/lib/types';

const PRESET_PESOS = [100, 250, 500, 1000] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const fieldClasses =
  'h-14 w-full rounded-2xl border-2 border-ink-400 bg-white px-4 text-lg text-ink transition-[border-color,box-shadow] ' +
  'placeholder:text-ink-500 focus:border-teal-600 focus:shadow-[0_0_0_4px_rgb(14_124_107/0.15)] focus:outline-none ' +
  'aria-[invalid=true]:border-coral-600 aria-[invalid=true]:focus:shadow-[0_0_0_4px_rgb(224_96_58/0.18)]';

export interface DonationDialogCampaign {
  id: string;
  beneficiaryAlias: string;
}

export function DonationDialog({
  open,
  onClose,
  campaign,
}: {
  open: boolean;
  onClose: () => void;
  campaign: DonationDialogCampaign;
}) {
  const messages = useMessages();
  const t = messages.donate.dialog;
  const methods: ReadonlyArray<{ id: PaymentMethod; label: string; note: string; icon: LucideIcon }> = [
    { id: 'GCASH', label: 'GCash', note: t.methodEwallet, icon: Smartphone },
    { id: 'MAYA', label: 'Maya', note: t.methodEwallet, icon: Wallet },
    { id: 'CARD', label: t.methodCard, note: t.methodCardNote, icon: CreditCard },
  ];

  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstPresetRef = useRef<HTMLButtonElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const pressStartedOnBackdrop = useRef(false);
  const inFlight = useRef(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

  const id = useId();
  const ids = {
    title: `${id}-title`,
    amount: `${id}-amount`,
    amountHelp: `${id}-amount-help`,
    amountError: `${id}-amount-error`,
    email: `${id}-email`,
    emailHelp: `${id}-email-help`,
    emailError: `${id}-email-error`,
    anonymous: `${id}-anonymous`,
    anonymousHelp: `${id}-anonymous-help`,
    payHelp: `${id}-pay-help`,
  };

  const [amountText, setAmountText] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [anonymous, setAnonymous] = useState(false);
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const amount = parsePesoInput(amountText);
  const amountError =
    amountTouched && !amount.ok
      ? fmt(messages.money.amountErrors[amount.reason], {
          min: formatPeso(MIN_DONATION_MINOR, { cents: 'always' }),
          max: formatPeso(MAX_DONATION_MINOR, { cents: 'always' }),
        })
      : null;
  const emailValid = EMAIL_PATTERN.test(email.trim());
  const emailError = emailTouched && !emailValid ? t.emailError : null;
  const methodLabel = methods.find((option) => option.id === method)?.label;
  const canPay = amount.ok && method !== null && emailValid && !submitting;

  const missing = [
    !amount.ok && t.missingAmount,
    !method && t.missingMethod,
    !emailValid && t.missingEmail,
  ].filter(Boolean);

  // Keep the native dialog in step with `open`.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      // Start on the amount choices: focusing the text field would pop up the phone keyboard at once.
      firstPresetRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function requestClose() {
    if (!submitting) dialogRef.current?.close();
  }

  // Tapping the dimmed backdrop closes the dialog, but only when the press started there too, so a
  // text selection that ends outside the sheet doesn't close it by accident.
  function handlePointerDown(event: PointerEvent<HTMLDialogElement>) {
    pressStartedOnBackdrop.current = event.target === event.currentTarget;
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (pressStartedOnBackdrop.current && event.target === event.currentTarget) requestClose();
  }

  function choosePreset(pesos: number) {
    setAmountText(String(pesos));
    setAmountTouched(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAmountTouched(true);
    setEmailTouched(true);
    if (!amount.ok) {
      amountRef.current?.focus();
      return;
    }
    if (!method || !emailValid || inFlight.current) return;

    inFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);

    const request: CreateDonationRequest = {
      amountMinor: amount.minor.toString(),
      paymentMethod: method,
      anonymous,
      email: email.trim(),
    };
    // Same details, same key: the server treats a repeat as the same checkout.
    const fingerprint = JSON.stringify(request);
    if (attempt.current?.fingerprint !== fingerprint) attempt.current = { fingerprint, key: randomId() };

    try {
      const started = await startDonation(campaign.id, request, attempt.current.key);
      if (started.kind === 'redirect') {
        // Stay busy while the browser leaves for the provider's checkout page.
        window.location.assign(started.checkoutUrl);
        return;
      }
      setSubmitError(t.unavailable);
    } catch (error) {
      setSubmitError(isApiError(error) ? messages.api[error.code] : messages.common.genericError);
    }
    inFlight.current = false;
    setSubmitting(false);
  }

  const payLabel =
    amount.ok && methodLabel
      ? fmt(t.payWithMethod, { amount: formatPeso(amount.minor), method: methodLabel })
      : t.payContinue;

  return (
    // Keyboard users close with Escape (the native cancel event); the backdrop click is a pointer shortcut.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialogRef}
      data-testid="donation-modal"
      aria-labelledby={ids.title}
      className="ak-dialog"
      onClose={onClose}
      onCancel={(event) => {
        if (submitting) event.preventDefault();
      }}
      onPointerDown={handlePointerDown}
      onClick={handleBackdropClick}
    >
      <div className="flex max-h-[inherit] flex-col">
        <div aria-hidden className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-ink-200 sm:hidden" />

        <header className="flex shrink-0 items-start justify-between gap-4 px-6 pb-4 pt-4 sm:pt-7">
          <div>
            <p className="text-sm font-semibold text-teal-700">{t.verified}</p>
            <h2 id={ids.title} className="mt-1 text-2xl font-extrabold tracking-tight text-ink">
              {fmt(messages.donate.heading, { alias: campaign.beneficiaryAlias })}
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={submitting}
            className="-mr-2 -mt-1 grid size-12 shrink-0 place-items-center rounded-xl text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink disabled:opacity-40"
          >
            <X aria-hidden className="size-6" />
            <span className="sr-only">{t.close}</span>
          </button>
        </header>

        <form noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="scroll-shadows min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-contain px-6 pb-6">
            {/* Amount */}
            <fieldset>
              <legend className="text-lg font-bold text-ink">{t.amountLegend}</legend>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PRESET_PESOS.map((pesos, index) => {
                  const selected = amount.ok && amount.minor === BigInt(pesos) * 100n;
                  return (
                    <button
                      key={pesos}
                      ref={index === 0 ? firstPresetRef : undefined}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => choosePreset(pesos)}
                      className={cn(
                        'pressable h-14 rounded-2xl border-2 text-lg font-bold',
                        selected
                          ? 'border-teal-600 bg-teal-600 text-white shadow-cta'
                          : 'border-ink-300 bg-white text-ink hover:border-teal-600',
                      )}
                    >
                      {formatPeso(BigInt(pesos) * 100n)}
                    </button>
                  );
                })}
              </div>

              <label htmlFor={ids.amount} className="mt-5 block font-semibold text-ink">
                {t.amountLabel}
              </label>
              <div className="relative mt-2">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-ink-600"
                >
                  ₱
                </span>
                <input
                  ref={amountRef}
                  id={ids.amount}
                  data-testid="amount-input"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  enterKeyHint="next"
                  value={amountText}
                  onChange={(event) => setAmountText(event.target.value)}
                  onBlur={() => setAmountTouched(true)}
                  aria-invalid={amountError ? true : undefined}
                  aria-describedby={amountError ? `${ids.amountError} ${ids.amountHelp}` : ids.amountHelp}
                  placeholder="0.00"
                  className={cn(fieldClasses, 'pl-10 font-semibold tabular-nums')}
                />
              </div>
              {amountError && (
                <p
                  id={ids.amountError}
                  data-testid="amount-error"
                  role="alert"
                  className="mt-2 font-semibold text-coral-800"
                >
                  {amountError}
                </p>
              )}
              <p id={ids.amountHelp} className="mt-2 text-ink-600">
                {t.amountHelp}
              </p>
            </fieldset>

            {/* Payment method */}
            <fieldset>
              <legend className="text-lg font-bold text-ink">{t.methodLegend}</legend>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {methods.map((option) => {
                  const Icon = option.icon;
                  return (
                    <label
                      key={option.id}
                      data-testid={`method-${option.id.toLowerCase()}`}
                      className={cn(
                        'pressable relative flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 px-2 py-3 text-center',
                        'border-ink-300 bg-white hover:border-teal-600',
                        'has-checked:border-teal-600 has-checked:bg-teal-50 has-checked:shadow-card',
                        'has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-teal-600',
                      )}
                    >
                      <input
                        type="radio"
                        name={`${id}-method`}
                        value={option.id}
                        checked={method === option.id}
                        onChange={() => setMethod(option.id)}
                        className="peer sr-only"
                      />
                      <Icon aria-hidden className="size-6 text-ink-700 peer-checked:text-teal-700" />
                      <span className="font-bold text-ink">{option.label}</span>
                      <span className="text-sm text-ink-600">{option.note}</span>
                      <Check
                        aria-hidden
                        className="absolute right-2 top-2 size-4 text-teal-700 opacity-0 transition-opacity peer-checked:opacity-100"
                        strokeWidth={3}
                      />
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {/* Anonymous */}
            <div className="flex items-start gap-3 rounded-2xl border-2 border-ink-100 bg-cream-50 p-4">
              <input
                id={ids.anonymous}
                data-testid="anonymous-toggle"
                type="checkbox"
                checked={anonymous}
                onChange={(event) => setAnonymous(event.target.checked)}
                aria-describedby={ids.anonymousHelp}
                className="mt-0.5 size-6 shrink-0 cursor-pointer accent-teal-600"
              />
              <div>
                <label htmlFor={ids.anonymous} className="cursor-pointer font-semibold text-ink">
                  {t.anonymousLabel}
                </label>
                <p id={ids.anonymousHelp} className="text-ink-600">
                  {t.anonymousHelp}
                </p>
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor={ids.email} className="block text-lg font-bold text-ink">
                {t.emailLabel}
              </label>
              <input
                id={ids.email}
                data-testid="email-input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setEmailTouched(true)}
                aria-invalid={emailError ? true : undefined}
                aria-describedby={emailError ? `${ids.emailError} ${ids.emailHelp}` : ids.emailHelp}
                placeholder="name@example.com"
                className={cn(fieldClasses, 'mt-2')}
              />
              {emailError && (
                <p id={ids.emailError} role="alert" className="mt-2 font-semibold text-coral-800">
                  {emailError}
                </p>
              )}
              <p id={ids.emailHelp} className="mt-2 text-ink-600">
                {t.emailHelp}
              </p>
            </div>

            {/* Fees, before payment (AK-DON-003) */}
            {amount.ok && (
              <div
                data-testid="fee-breakdown"
                className="animate-fade-in rounded-2xl bg-teal-50 p-4 ring-1 ring-inset ring-teal-100"
              >
                <p className="text-lg font-bold text-ink">
                  {rich(t.feeGoesToCampaign, {
                    amount: (
                      <span className="text-teal-800">{formatPeso(amount.minor, { cents: 'always' })}</span>
                    ),
                  })}
                </p>
                <p className="mt-1 text-ink-700">
                  {fmt(t.feeYouPay, {
                    amount: formatPeso(amount.minor, { cents: 'always' }),
                    method: methodLabel ?? t.feeMethodFallback,
                  })}
                </p>
              </div>
            )}
          </div>

          <footer className="shrink-0 border-t border-ink-100 bg-white px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
            {submitError && (
              <p role="alert" className="mb-3 rounded-2xl bg-coral-50 px-4 py-3 font-semibold text-coral-800">
                {submitError}
              </p>
            )}
            <button
              type="submit"
              data-testid="pay-button"
              disabled={!canPay}
              aria-describedby={ids.payHelp}
              className={buttonClasses({ size: 'lg', className: 'w-full' })}
            >
              {submitting ? (
                <>
                  <LoaderCircle aria-hidden className="animate-spin" />
                  {t.opening}
                </>
              ) : (
                <>
                  <Lock aria-hidden />
                  {payLabel}
                </>
              )}
            </button>
            <p id={ids.payHelp} className="mt-3 text-center text-sm text-ink-600">
              {canPay || submitting ? t.payHelpReady : fmt(t.payHelpMissing, { missing: missing.join(', ') })}
            </p>
          </footer>
        </form>
      </div>
    </dialog>
  );
}
