// apps/web/components/creator/sign-in-form.tsx
'use client';

//
// Phone sign-in: mobile number, then the 6-digit code sent by SMS. The session is stored by the
// Server Action in an HttpOnly cookie; this component never sees it. After sign-in the page re-renders
// with the next step (or goes to `next`).
import { KeyRound, LoaderCircle, MessageSquareText, Smartphone } from 'lucide-react';
import { useEffect, useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { buttonClasses } from '@/components/ui/button';
import { FieldError, FieldHint, FieldLabel, fieldClasses, FormAlert } from '@/components/ui/form';
import { requestSignInCode, verifySignInCode } from '@/lib/actions/creator';
import { cn } from '@/lib/cn';
import { useCreatorMessages } from '@/lib/i18n/client';
import { fmt, rich } from '@/lib/i18n/format';
import { normalizePhMobile } from '@/lib/phone';
import type { OtpRequested } from '@/lib/types';

const RESEND_AFTER_SECONDS = 30;

export function SignInForm({ next }: { next?: string }) {
  const t = useCreatorMessages().signIn;
  const id = useId();
  const codeRef = useRef<HTMLInputElement>(null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<OtpRequested | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (challenge) codeRef.current?.focus();
  }, [challenge]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  function sendCode() {
    if (!normalizePhMobile(phone)) {
      setPhoneError(t.invalidPhone);
      return;
    }
    setPhoneError(null);
    setError(null);
    startTransition(async () => {
      const result = await requestSignInCode(phone);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setChallenge(result.data);
      setCode('');
      setSecondsLeft(RESEND_AFTER_SECONDS);
    });
  }

  function handlePhoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendCode();
  }

  function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setError(t.invalidCode);
      return;
    }
    setError(null);
    startTransition(async () => {
      // On success the Server Action sets the cookie and the page re-renders in the same response, or
      // it redirects to `next` (then there is no result to read).
      const result = (await verifySignInCode(challenge.challengeId, code.trim(), next)) as
        Awaited<ReturnType<typeof verifySignInCode>> | undefined;
      if (result && !result.ok) {
        setError(result.error);
        if (result.code === 'OTP_EXPIRED') setChallenge(null);
      }
    });
  }

  if (!challenge) {
    return (
      <form noValidate onSubmit={handlePhoneSubmit} className="space-y-5">
        <div>
          <FieldLabel htmlFor={`${id}-phone`} className="text-lg">
            {t.phoneLabel}
          </FieldLabel>
          <div className="relative mt-2">
            <Smartphone
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-500"
            />
            <input
              id={`${id}-phone`}
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              enterKeyHint="send"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              aria-invalid={phoneError ? true : undefined}
              aria-describedby={`${id}-phone-hint${phoneError ? ` ${id}-phone-error` : ''}`}
              placeholder="0917 123 4567"
              className={cn(fieldClasses, 'pl-12 tabular-nums')}
            />
          </div>
          <FieldError id={`${id}-phone-error`} message={phoneError} />
          <FieldHint id={`${id}-phone-hint`}>{t.phoneHint}</FieldHint>
        </div>
        {error && <FormAlert>{error}</FormAlert>}
        <button
          type="submit"
          disabled={pending}
          className={buttonClasses({ size: 'lg', className: 'w-full' })}
        >
          {pending ? (
            <LoaderCircle aria-hidden className="animate-spin" />
          ) : (
            <MessageSquareText aria-hidden />
          )}
          {pending ? t.sending : t.sendCode}
        </button>
      </form>
    );
  }

  return (
    <form noValidate onSubmit={handleCodeSubmit} className="space-y-5">
      <p className="text-lg leading-relaxed text-ink-800">
        {rich(t.codeSent, {
          phone: <strong className="whitespace-nowrap text-ink">{challenge.phoneMasked}</strong>,
        })}
      </p>
      {/* Only a development API returns the code (SMS_PROVIDER=dev); production never does. */}
      {challenge.devCode && (
        <p className="rounded-2xl bg-gold-50 px-4 py-3 text-ink-800 ring-1 ring-inset ring-gold-200">
          <strong>{t.devCodeLabel}</strong>{' '}
          {rich(t.devCode, {
            code: <strong className="font-mono text-lg tracking-widest">{challenge.devCode}</strong>,
          })}
        </p>
      )}
      <div>
        <FieldLabel htmlFor={`${id}-code`} className="text-lg">
          {t.codeLabel}
        </FieldLabel>
        <div className="relative mt-2">
          <KeyRound
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-500"
          />
          <input
            ref={codeRef}
            id={`${id}-code`}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            enterKeyHint="done"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-code-hint`}
            placeholder="••••••"
            className={cn(fieldClasses, 'pl-12 font-mono text-2xl tracking-[0.4em]')}
          />
        </div>
        <FieldHint id={`${id}-code-hint`}>{t.codeHint}</FieldHint>
      </div>
      {error && <FormAlert>{error}</FormAlert>}
      <button type="submit" disabled={pending} className={buttonClasses({ size: 'lg', className: 'w-full' })}>
        {pending && <LoaderCircle aria-hidden className="animate-spin" />}
        {pending ? t.checking : t.submit}
      </button>
      <div className="flex flex-wrap justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            setChallenge(null);
            setError(null);
          }}
          className="inline-flex min-h-11 items-center rounded-xl px-1 font-semibold text-teal-700 underline-offset-4 hover:underline"
        >
          {t.otherNumber}
        </button>
        <button
          type="button"
          disabled={secondsLeft > 0 || pending}
          onClick={sendCode}
          className="inline-flex min-h-11 items-center rounded-xl px-1 font-semibold text-teal-700 underline-offset-4 hover:underline disabled:text-ink-500 disabled:no-underline"
        >
          {secondsLeft > 0 ? fmt(t.resendIn, { seconds: secondsLeft }) : t.resend}
        </button>
      </div>
    </form>
  );
}
