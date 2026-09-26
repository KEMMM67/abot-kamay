// apps/web/components/creator/verify-id-form.tsx
'use client';

//
// The KYC front gate, creator side: public name, government ID type, a one-time code written on paper,
// photos of the ID and a selfie holding both, and consent under the Data Privacy Act (RA 10173).
// IDs and selfies go to restricted storage that only trust and safety reviewers can open; they are
// never public and are deleted after the review period.
import { Copy, IdCard, LoaderCircle, Lock, RefreshCw, ShieldCheck } from 'lucide-react';
import { useId, useState, useTransition, type FormEvent } from 'react';
import { buttonClasses } from '@/components/ui/button';
import {
  ChoiceCard,
  FieldError,
  FieldHint,
  FieldLabel,
  fieldClasses,
  FormAlert,
  FormSection,
} from '@/components/ui/form';
import { startKycChallenge, submitKyc } from '@/lib/actions/creator';
import { formatDateTime } from '@/lib/format';
import { useCreatorMessages, useLocale, useMessages } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n/format';
import type { CreatorMessages } from '@/lib/i18n/client-messages';
import type { GovernmentIdType, KycChallenge, Viewer } from '@/lib/types';
import { UploadError, uploadErrorMessage, uploadFiles } from '@/lib/uploads';
import { PhotoField, type PickedMedia } from './media-picker';

const DISPLAY_NAME_PATTERN = /^\p{L}[\p{L}\p{M} .'-]*$/u;

type KycRejectionCode = keyof CreatorMessages['labels']['kycRejection'];

type Errors = Partial<
  Record<'displayName' | 'idType' | 'challenge' | 'idFront' | 'idBack' | 'selfie' | 'consent', string>
>;

export function VerifyIdForm({ viewer }: { viewer: Viewer }) {
  const { verifyId: t, forms, labels } = useCreatorMessages();
  const { common } = useMessages();
  const locale = useLocale();
  const idTypes = Object.keys(labels.idTypes) as GovernmentIdType[];
  const id = useId();
  const [displayName, setDisplayName] = useState(viewer.displayName ?? '');
  const [idType, setIdType] = useState<GovernmentIdType | null>(null);
  const [challenge, setChallenge] = useState<KycChallenge | null>(null);
  const [idFront, setIdFront] = useState<PickedMedia | null>(null);
  const [idBack, setIdBack] = useState<PickedMedia | null>(null);
  const [selfie, setSelfie] = useState<PickedMedia | null>(null);
  const [consentData, setConsentData] = useState(false);
  const [consentTruth, setConsentTruth] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const needsBack = idType !== 'PASSPORT';
  // The API sends the reviewer's reason code; an unknown code reads as the generic one.
  const lastRejection =
    viewer.latestVerification?.status === 'REJECTED'
      ? (labels.kycRejection[viewer.latestVerification.rejectionReason as KycRejectionCode] ??
        labels.kycRejection.OTHER)
      : null;

  function getCode() {
    setErrors((current) => ({ ...current, challenge: undefined }));
    startTransition(async () => {
      const result = await startKycChallenge();
      if (!result.ok) {
        setFormError(result.error);
        return;
      }
      setChallenge(result.data);
      // A new code makes an old selfie useless: it would show the wrong code.
      setSelfie(null);
    });
  }

  function validate(): Errors {
    const found: Errors = {};
    const name = displayName.trim();
    if (name.length < 2 || name.length > 40 || !DISPLAY_NAME_PATTERN.test(name)) {
      found.displayName = t.errors.displayName;
    }
    if (!idType) found.idType = t.errors.idType;
    if (!challenge) found.challenge = t.errors.challengeMissing;
    else if (Date.parse(challenge.expiresAt) < Date.now()) found.challenge = t.errors.challengeExpired;
    if (!idFront) found.idFront = t.errors.idFront;
    if (needsBack && !idBack) found.idBack = t.errors.idBack;
    if (!selfie) found.selfie = t.errors.selfie;
    if (!consentData || !consentTruth) found.consent = t.errors.consent;
    return found;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0 || !idType || !challenge || !idFront || !selfie) {
      setFormError(t.errors.incomplete);
      return;
    }

    startTransition(async () => {
      try {
        setProgress(0);
        const files = [idFront, ...(needsBack && idBack ? [idBack] : []), selfie];
        const ids = await uploadFiles(
          files.map((item) => ({ file: item.file, purpose: 'KYC_DOCUMENT' as const })),
          setProgress,
        );
        const [frontId, ...rest] = ids;
        const selfieId = rest.at(-1);
        const backId = needsBack ? rest[0] : undefined;
        if (!frontId || !selfieId) throw new UploadError('INCOMPLETE', 'INCOMPLETE');

        const result = await submitKyc({
          idType,
          displayName: displayName.trim(),
          challengeToken: challenge.challengeToken,
          documents: { idFront: frontId, ...(backId ? { idBack: backId } : {}), selfieWithId: selfieId },
          consent: { dataProcessing: true, truthful: true },
        });
        if (!result.ok) {
          setFormError(result.error);
          if (result.code === 'KYC_CHALLENGE_EXPIRED' || result.code === 'KYC_CHALLENGE_INVALID')
            setChallenge(null);
        }
        // On success the action re-renders the page: this form gives way to the review screen.
      } catch (error) {
        setFormError(uploadErrorMessage(error, forms.upload, common.genericError));
      } finally {
        setProgress(null);
      }
    });
  }

  async function copyCode() {
    if (!challenge) return;
    try {
      await navigator.clipboard.writeText(challenge.challengeCode);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-6">
      {lastRejection && (
        <FormAlert>
          {t.lastRejected} {lastRejection}
        </FormAlert>
      )}

      <FormSection number={1} id={`${id}-who`} title={t.whoTitle} description={t.whoDescription}>
        <div>
          <FieldLabel htmlFor={`${id}-name`}>{t.nameLabel}</FieldLabel>
          <input
            id={`${id}-name`}
            type="text"
            autoComplete="off"
            maxLength={40}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            aria-invalid={errors.displayName ? true : undefined}
            aria-describedby={`${id}-name-hint${errors.displayName ? ` ${id}-name-error` : ''}`}
            placeholder="Ana R."
            className={`${fieldClasses} mt-2`}
          />
          <FieldError id={`${id}-name-error`} message={errors.displayName} />
          <FieldHint id={`${id}-name-hint`}>{t.nameHint}</FieldHint>
        </div>

        <fieldset>
          <legend className="font-semibold text-ink">{t.idLegend}</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {idTypes.map((type) => (
              <ChoiceCard
                key={type}
                type="radio"
                name={`${id}-id-type`}
                value={type}
                checked={idType === type}
                onChange={() => setIdType(type)}
                title={labels.idTypes[type]}
              />
            ))}
          </div>
          <FieldError id={`${id}-id-type-error`} message={errors.idType} />
          <p className="mt-2 text-ink-600">{t.idHint}</p>
        </fieldset>
      </FormSection>

      <FormSection number={2} id={`${id}-code`} title={t.codeTitle} description={t.codeDescription}>
        {challenge ? (
          <div className="surface-dark rounded-3xl bg-ink p-6 text-center text-cream">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-300">{t.writeThis}</p>
            <p className="mt-2 font-mono text-4xl font-extrabold tracking-[0.12em] sm:text-5xl">
              {challenge.challengeCode}
            </p>
            <p className="mt-3 text-ink-200">
              {fmt(t.validUntil, { date: formatDateTime(challenge.expiresAt, locale) })}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={copyCode} className={buttonClasses({ variant: 'light' })}>
                <Copy aria-hidden />
                {copied ? common.copied : t.copy}
              </button>
              <button
                type="button"
                onClick={getCode}
                disabled={pending}
                className={buttonClasses({ variant: 'light' })}
              >
                <RefreshCw aria-hidden />
                {t.newCode}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={getCode}
            disabled={pending}
            className={buttonClasses({ size: 'lg' })}
          >
            {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <IdCard aria-hidden />}
            {t.getCode}
          </button>
        )}
        <FieldError id={`${id}-challenge-error`} message={errors.challenge} />
      </FormSection>

      <FormSection number={3} id={`${id}-photos`} title={t.photosTitle} description={t.photosDescription}>
        <PhotoField
          label={t.idFront}
          hint={t.idFrontHint}
          value={idFront}
          onChange={setIdFront}
          capture="environment"
          error={errors.idFront}
        />
        {needsBack && (
          <PhotoField
            label={t.idBack}
            hint={t.idBackHint}
            value={idBack}
            onChange={setIdBack}
            capture="environment"
            error={errors.idBack}
          />
        )}
        <PhotoField
          label={t.selfie}
          hint={challenge ? fmt(t.selfieHint, { code: challenge.challengeCode }) : t.selfieNeedsCode}
          value={selfie}
          onChange={setSelfie}
          capture="user"
          error={errors.selfie}
        />
      </FormSection>

      <FormSection number={4} id={`${id}-consent`} title={t.consentTitle}>
        <ChoiceCard
          type="checkbox"
          name={`${id}-consent-data`}
          value="data"
          checked={consentData}
          onChange={setConsentData}
          title={t.consentData}
          description={t.consentDataHelp}
        />
        <ChoiceCard
          type="checkbox"
          name={`${id}-consent-truth`}
          value="truth"
          checked={consentTruth}
          onChange={setConsentTruth}
          title={t.consentTruth}
          description={t.consentTruthHelp}
        />
        <FieldError id={`${id}-consent-error`} message={errors.consent} />
      </FormSection>

      <div className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-7">
        {formError && <FormAlert className="mb-4">{formError}</FormAlert>}
        <button
          type="submit"
          disabled={pending}
          className={buttonClasses({ size: 'lg', className: 'w-full' })}
        >
          {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <ShieldCheck aria-hidden />}
          {progress !== null
            ? fmt(forms.uploading, { percent: Math.round(progress * 100) })
            : pending
              ? forms.submitting
              : t.submit}
        </button>
        <p className="mt-3 flex items-start justify-center gap-2 text-center text-sm text-ink-600">
          <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t.storageNote}
        </p>
      </div>
    </form>
  );
}
