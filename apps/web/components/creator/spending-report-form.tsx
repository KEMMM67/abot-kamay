// apps/web/components/creator/spending-report-form.tsx
'use client';

//
// "Report spending": the creator posts what was bought or paid, how much, when, and the receipts and
// photos. The report joins the campaign's public record: once posted it can't be edited or deleted
// (the database refuses both), and the receipt images appear after trust and safety review, because
// receipts can show names or addresses.
import { CheckCircle2, LoaderCircle, ReceiptText } from 'lucide-react';
import { useId, useState, useTransition, type FormEvent } from 'react';
import { ButtonLink, buttonClasses } from '@/components/ui/button';
import {
  ChoiceCard,
  FieldError,
  FieldHint,
  FieldLabel,
  fieldClasses,
  FormAlert,
  FormSection,
  textareaClasses,
} from '@/components/ui/form';
import { createSpendingReport } from '@/lib/actions/creator';
import { cn } from '@/lib/cn';
import { useCreatorMessages, useMessages } from '@/lib/i18n/client';
import { fmt, rich } from '@/lib/i18n/format';
import { formatPeso, parsePesoAmount } from '@/lib/money';
import type { SpendingProofKind, SpendingReport } from '@/lib/types';
import { uploadErrorMessage, uploadFiles } from '@/lib/uploads';
import { MediaPicker, type PickedMedia } from './media-picker';

const MAX_REPORT_MINOR = 500_000_000n;
const PROOF_KINDS: readonly SpendingProofKind[] = ['RECEIPT', 'ITEM_PHOTO', 'HANDOVER_PHOTO'];

type Errors = Record<string, string>;

export function SpendingReportForm({
  slug,
  milestones,
  today,
  earliest,
}: {
  slug: string;
  milestones: Array<{ id: string; title: string }>;
  /** Today's date in the Philippines (from the server, so the page renders the same everywhere). */
  today: string;
  earliest: string;
}) {
  const { report: t, forms, labels } = useCreatorMessages();
  const { common } = useMessages();
  const id = useId();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [spentOn, setSpentOn] = useState(today);
  const [merchantName, setMerchantName] = useState('');
  const [milestoneId, setMilestoneId] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<PickedMedia[]>([]);
  const [kinds, setKinds] = useState<Record<string, SpendingProofKind>>({});
  const [attested, setAttested] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [posted, setPosted] = useState<SpendingReport | null>(null);
  const [pending, startTransition] = useTransition();

  const parsedAmount = parsePesoAmount(amount, { min: 100n, max: MAX_REPORT_MINOR });
  const kindOf = (item: PickedMedia, index: number): SpendingProofKind =>
    kinds[item.key] ?? (index === 0 ? 'RECEIPT' : 'ITEM_PHOTO');

  function validate(): Errors {
    const found: Errors = {};
    if (title.trim().length < 3) found.title = t.errors.title;
    if (!parsedAmount.ok) found.amountMinor = t.errors.amount;
    if (!spentOn || spentOn > today || spentOn < earliest) found.spentOn = t.errors.date;
    if (files.length === 0) found.media = t.errors.media;
    if (!attested) found.attestation = t.errors.attestation;
    return found;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0 || !parsedAmount.ok) {
      setFormError(forms.fixHighlighted);
      return;
    }

    startTransition(async () => {
      try {
        setProgress(0);
        const ids = await uploadFiles(
          files.map((item) => ({ file: item.file, purpose: 'SPENDING_PROOF' as const })),
          setProgress,
        );
        const result = await createSpendingReport(slug, {
          title: title.trim(),
          ...(note.trim() ? { note: note.trim() } : {}),
          amountMinor: parsedAmount.minor.toString(),
          spentOn,
          ...(merchantName.trim() ? { merchantName: merchantName.trim() } : {}),
          ...(milestoneId ? { milestoneId } : {}),
          media: files.map((item, index) => ({ mediaId: ids[index] ?? '', kind: kindOf(item, index) })),
          attestation: true,
        });
        if (!result.ok) {
          setFormError(result.error);
          if (result.issues) setErrors(result.issues);
          return;
        }
        setPosted(result.data);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error) {
        setFormError(uploadErrorMessage(error, forms.upload, common.genericError));
      } finally {
        setProgress(null);
      }
    });
  }

  if (posted) {
    return (
      <div className="animate-fade-in rounded-3xl border border-teal-200 bg-white p-6 text-center shadow-card sm:p-10">
        <span className="animate-pop mx-auto grid size-16 place-items-center rounded-full bg-teal-600 text-white shadow-cta">
          <CheckCircle2 aria-hidden className="size-9" />
        </span>
        <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-ink">{t.posted.title}</h2>
        <p className="mx-auto mt-3 max-w-lg text-lg leading-relaxed text-ink-700">
          {rich(t.posted.body, {
            amount: (
              <strong className="text-ink">{formatPeso(posted.amountMinor, { cents: 'always' })}</strong>
            ),
            title: posted.title,
          })}
        </p>
        <p className="mx-auto mt-3 max-w-lg break-all font-mono text-sm text-ink-600">
          #{posted.hash.slice(0, 16)}
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href={`/campaigns/${slug}`} size="lg">
            {t.posted.viewCampaign}
          </ButtonLink>
          <button
            type="button"
            onClick={() => {
              setPosted(null);
              setTitle('');
              setAmount('');
              setNote('');
              setMerchantName('');
              setFiles([]);
              setKinds({});
              setAttested(false);
            }}
            className={buttonClasses({ size: 'lg', variant: 'secondary' })}
          >
            {t.posted.another}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-6">
      <FormSection number={1} id={`${id}-what`} title={t.whatTitle}>
        <div>
          <FieldLabel htmlFor={`${id}-title`}>{t.titleLabel}</FieldLabel>
          <input
            id={`${id}-title`}
            type="text"
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={errors.title ? true : undefined}
            placeholder={t.titlePlaceholder}
            className={cn(fieldClasses, 'mt-2')}
          />
          <FieldError id={`${id}-title-error`} message={errors.title} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor={`${id}-amount`}>{t.amountLabel}</FieldLabel>
            <div className="relative mt-2">
              <span
                aria-hidden
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-ink-600"
              >
                ₱
              </span>
              <input
                id={`${id}-amount`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-invalid={errors.amountMinor ? true : undefined}
                placeholder="0.00"
                className={cn(fieldClasses, 'pl-10 tabular-nums')}
              />
            </div>
            <FieldError id={`${id}-amount-error`} message={errors.amountMinor} />
          </div>
          <div>
            <FieldLabel htmlFor={`${id}-date`}>{t.dateLabel}</FieldLabel>
            <input
              id={`${id}-date`}
              type="date"
              min={earliest}
              max={today}
              value={spentOn}
              onChange={(event) => setSpentOn(event.target.value)}
              aria-invalid={errors.spentOn ? true : undefined}
              className={cn(fieldClasses, 'mt-2')}
            />
            <FieldError id={`${id}-date-error`} message={errors.spentOn} />
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor={`${id}-merchant`} optional>
              {t.merchantLabel}
            </FieldLabel>
            <input
              id={`${id}-merchant`}
              type="text"
              maxLength={120}
              value={merchantName}
              onChange={(event) => setMerchantName(event.target.value)}
              placeholder={t.merchantPlaceholder}
              className={cn(fieldClasses, 'mt-2')}
            />
          </div>
          {milestones.length > 0 && (
            <div>
              <FieldLabel htmlFor={`${id}-milestone`} optional>
                {t.milestoneLabel}
              </FieldLabel>
              <select
                id={`${id}-milestone`}
                value={milestoneId}
                onChange={(event) => setMilestoneId(event.target.value)}
                className={cn(fieldClasses, 'mt-2')}
              >
                <option value="">{t.milestoneNone}</option>
                {milestones.map((milestone) => (
                  <option key={milestone.id} value={milestone.id}>
                    {milestone.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-note`} optional>
            {t.noteLabel}
          </FieldLabel>
          <textarea
            id={`${id}-note`}
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            aria-describedby={`${id}-note-hint`}
            placeholder={t.notePlaceholder}
            className={cn(textareaClasses, 'mt-2 min-h-28')}
          />
          <FieldHint id={`${id}-note-hint`}>{t.noteHint}</FieldHint>
        </div>
      </FormSection>

      <FormSection number={2} id={`${id}-proof`} title={t.proofTitle} description={t.proofDescription}>
        <MediaPicker
          label={t.filesLabel}
          hint={t.filesHint}
          items={files}
          onChange={setFiles}
          max={5}
          allowVideo={false}
          error={errors.media}
          renderDetails={(item) => {
            const index = files.findIndex((candidate) => candidate.key === item.key);
            return (
              <div>
                <label htmlFor={`${id}-kind-${item.key}`} className="text-sm font-semibold text-ink-700">
                  {t.kindLabel}
                </label>
                <select
                  id={`${id}-kind-${item.key}`}
                  value={kindOf(item, index)}
                  onChange={(event) =>
                    setKinds((current) => ({
                      ...current,
                      [item.key]: event.target.value as SpendingProofKind,
                    }))
                  }
                  className={cn(fieldClasses, 'mt-1 min-h-12 text-base')}
                >
                  {PROOF_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {labels.proofKind[kind]}
                    </option>
                  ))}
                </select>
              </div>
            );
          }}
        />
      </FormSection>

      <div className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-7">
        <ChoiceCard
          type="checkbox"
          name={`${id}-attestation`}
          value="true"
          checked={attested}
          onChange={setAttested}
          title={t.attestation}
          description={t.attestationHelp}
        />
        <FieldError id={`${id}-attestation-error`} message={errors.attestation} />
        {formError && <FormAlert className="mt-4">{formError}</FormAlert>}
        <button
          type="submit"
          disabled={pending}
          className={buttonClasses({ size: 'lg', className: 'mt-5 w-full' })}
        >
          {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <ReceiptText aria-hidden />}
          {progress !== null && progress < 1
            ? fmt(forms.uploading, { percent: Math.round(progress * 100) })
            : pending
              ? forms.sending
              : t.submit}
        </button>
      </div>
    </form>
  );
}
