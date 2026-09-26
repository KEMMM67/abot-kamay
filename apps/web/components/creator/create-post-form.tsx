// apps/web/components/creator/create-post-form.tsx
'use client';

//
// "Create a post": a KYC-verified creator posts photos or videos of a person in need with a caption,
// says how the money will be used, and attaches that person's consent.
//
// Funding is FIXED (every item has an amount and the goal is exactly their sum, e.g. a hospital bill)
// or OPEN_ENDED (no goal, e.g. groceries; amounts are optional). The same rules run again on the API
// and in the database, so this form is for guidance, not trust.
import {
  CheckCircle2,
  HandCoins,
  LoaderCircle,
  Plus,
  Send,
  Target,
  Trash2,
  Infinity as InfinityIcon,
} from 'lucide-react';
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
import { createPost } from '@/lib/actions/creator';
import { cn } from '@/lib/cn';
import { useCreatorMessages, useMessages } from '@/lib/i18n/client';
import { fmt, rich } from '@/lib/i18n/format';
import { formatPeso, parsePesoAmount } from '@/lib/money';
import {
  NEED_CATEGORIES,
  type ConsentMethod,
  type CreateCampaignRequest,
  type CreatedCampaign,
  type CreatorRelationship,
  type FundingType,
  type NeedCategory,
  type PayoutChoice,
} from '@/lib/types';
import { isVideo, uploadErrorMessage, uploadFiles } from '@/lib/uploads';
import { MediaPicker, type PickedMedia } from './media-picker';

/** Age ranges instead of exact ages; the ends get words ("Minor (0–17)", "90 and over"). */
const AGE_BANDS = ['0-17', '18-29', '30-39', '40-49', '50-59', '60-69', '70-79', '80-89', '90+'] as const;

const MIN_ITEM_MINOR = 100n; // ₱1
const MIN_GOAL_MINOR = 50_000n; // ₱500
const MAX_GOAL_MINOR = 500_000_000n; // ₱5,000,000
const MAX_ITEMS = 6;
const MAX_MEDIA = 10;
const CAPTION_MIN = 40;
const CAPTION_MAX = 5000;

interface PlanItem {
  key: string;
  title: string;
  description: string;
  amount: string;
  payout: PayoutChoice;
}

let planSequence = 0;
function newItem(): PlanItem {
  planSequence += 1;
  return { key: `p${planSequence}`, title: '', description: '', amount: '', payout: 'CREATOR' };
}

type Errors = Record<string, string>;

export function CreatePostForm({ creatorName }: { creatorName: string }) {
  const { createPost: t, forms, labels } = useCreatorMessages();
  const { common } = useMessages();
  const relationships = Object.keys(labels.relationships) as CreatorRelationship[];
  const id = useId();
  const [media, setMedia] = useState<PickedMedia[]>([]);
  const [alias, setAlias] = useState('');
  const [ageBand, setAgeBand] = useState('');
  const [region, setRegion] = useState('');
  const [needs, setNeeds] = useState<NeedCategory[]>([]);
  const [isMinor, setIsMinor] = useState(false);
  const [relationship, setRelationship] = useState<CreatorRelationship | null>(null);
  const [consentMethod, setConsentMethod] = useState<ConsentMethod | null>(null);
  const [evidence, setEvidence] = useState<PickedMedia[]>([]);
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [fundingType, setFundingType] = useState<FundingType>('FIXED');
  const [plan, setPlan] = useState<PlanItem[]>(() => [newItem()]);
  const [attested, setAttested] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [created, setCreated] = useState<CreatedCampaign | null>(null);
  const [pending, startTransition] = useTransition();

  const isSelf = relationship === 'SELF';
  const effectiveConsent: ConsentMethod | null = isSelf ? 'SELF' : isMinor ? 'GUARDIAN' : consentMethod;
  const parsedAmounts = plan.map((item) =>
    item.amount.trim() === ''
      ? null
      : parsePesoAmount(item.amount, { min: MIN_ITEM_MINOR, max: MAX_GOAL_MINOR }),
  );
  const fixedTotal = parsedAmounts.reduce((sum, parsed) => (parsed?.ok ? sum + parsed.minor : sum), 0n);

  function updateItem(key: string, patch: Partial<PlanItem>) {
    setPlan((items) => items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function toggleNeed(need: NeedCategory, on: boolean) {
    setNeeds((current) => (on ? [...current, need].slice(0, 3) : current.filter((value) => value !== need)));
  }

  function ageBandLabel(band: (typeof AGE_BANDS)[number]): string {
    return band === '0-17' || band === '90+' ? t.ageBands[band] : band.replace('-', '–');
  }

  function validate(): Errors {
    const found: Errors = {};
    if (media.length === 0) found.media = t.errors.media;
    if (isMinor && !media.some((item) => item.showsMinor)) found.media = t.errors.minorMedia;
    if (alias.trim().length < 2) found['beneficiary.alias'] = t.errors.alias;
    if (region.trim().length < 2) found['beneficiary.region'] = t.errors.region;
    if (needs.length === 0) found['beneficiary.needCategories'] = t.errors.needs;
    if (!relationship) found.relationship = t.errors.relationship;
    if (relationship === 'SELF' && isMinor) found.relationship = t.errors.selfMinor;
    if (isMinor && relationship === 'PASSERBY') found.relationship = t.errors.minorPasserby;
    if (!isSelf) {
      if (!effectiveConsent || effectiveConsent === 'SELF') found['consent.method'] = t.errors.consentMethod;
      if (evidence.length === 0) found['consent.evidenceMediaId'] = t.errors.consentEvidence;
    }
    if (title.trim().length < 8) found.title = t.errors.title;
    const captionLength = caption.trim().length;
    if (captionLength < CAPTION_MIN) found.caption = fmt(t.errors.captionShort, { min: CAPTION_MIN });
    if (captionLength > CAPTION_MAX) found.caption = fmt(t.errors.captionLong, { max: CAPTION_MAX });

    plan.forEach((item, index) => {
      if (item.title.trim().length < 3) found[`plan.${index}.title`] = t.errors.planTitle;
      const parsed = parsedAmounts[index];
      if (fundingType === 'FIXED' && parsed === null) {
        found[`plan.${index}.amountMinor`] = t.errors.planAmountRequired;
      } else if (parsed && !parsed.ok) {
        found[`plan.${index}.amountMinor`] = t.errors.planAmountInvalid;
      }
    });
    if (fundingType === 'FIXED' && !Object.keys(found).some((key) => key.startsWith('plan.'))) {
      if (fixedTotal < MIN_GOAL_MINOR || fixedTotal > MAX_GOAL_MINOR) {
        found.plan = fmt(t.errors.goalRange, {
          min: formatPeso(MIN_GOAL_MINOR),
          max: formatPeso(MAX_GOAL_MINOR),
        });
      }
    }
    if (!attested) found.attestation = t.errors.attestation;
    return found;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0 || !relationship || !effectiveConsent) {
      setFormError(forms.fixHighlighted);
      return;
    }

    startTransition(async () => {
      try {
        setProgress(0);
        const uploads = [
          ...media.map((item) => ({ file: item.file, purpose: 'POST_MEDIA' as const })),
          ...(isSelf
            ? []
            : evidence.map((item) => ({ file: item.file, purpose: 'CONSENT_EVIDENCE' as const }))),
        ];
        const ids = await uploadFiles(uploads, setProgress);
        const mediaIds = ids.slice(0, media.length);
        const evidenceId = isSelf ? undefined : ids[media.length];

        const request: CreateCampaignRequest = {
          title: title.trim(),
          caption: caption.trim(),
          fundingType,
          plan: plan.map((item, index) => {
            const parsed = parsedAmounts[index];
            return {
              title: item.title.trim(),
              ...(item.description.trim() ? { description: item.description.trim() } : {}),
              ...(parsed?.ok ? { amountMinor: parsed.minor.toString() } : {}),
              payout: item.payout,
            };
          }),
          relationship,
          beneficiary: {
            alias: alias.trim(),
            ...(ageBand ? { ageBand } : {}),
            region: region.trim(),
            needCategories: needs,
            isMinor,
          },
          media: media.map((item, index) => ({
            mediaId: mediaIds[index] ?? '',
            ...(item.altText.trim() ? { altText: item.altText.trim() } : {}),
            showsMinor: item.showsMinor,
          })),
          consent: { method: effectiveConsent, ...(evidenceId ? { evidenceMediaId: evidenceId } : {}) },
          attestation: true,
        };

        const result = await createPost(request);
        if (!result.ok) {
          setFormError(result.error);
          if (result.issues) setErrors(result.issues);
          return;
        }
        setCreated(result.data);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error) {
        setFormError(uploadErrorMessage(error, forms.upload, common.genericError));
      } finally {
        setProgress(null);
      }
    });
  }

  if (created) {
    return (
      <div className="animate-fade-in rounded-3xl border border-teal-200 bg-white p-6 text-center shadow-card sm:p-10">
        <span className="animate-pop mx-auto grid size-16 place-items-center rounded-full bg-teal-600 text-white shadow-cta">
          <CheckCircle2 aria-hidden className="size-9" />
        </span>
        <h2 className="mt-5 text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          {t.created.title}
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-lg leading-relaxed text-ink-700">{t.created.body}</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <ButtonLink href="/ako" size="lg">
            {t.created.myPosts}
          </ButtonLink>
          <ButtonLink href="/campaigns" size="lg" variant="secondary">
            {t.created.backToFeed}
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-6">
      {/* 1. Photos and videos */}
      <FormSection number={1} id={`${id}-media`} title={t.media.title} description={t.media.description}>
        <MediaPicker
          label={t.media.label}
          hint={t.media.hint}
          items={media}
          onChange={setMedia}
          max={MAX_MEDIA}
          allowVideo
          error={errors.media}
          renderDetails={(item, update) => (
            <>
              <div>
                <label htmlFor={`${id}-alt-${item.key}`} className="text-sm font-semibold text-ink-700">
                  {isVideo(item.file) ? t.media.describeVideo : t.media.describePhoto}
                </label>
                <input
                  id={`${id}-alt-${item.key}`}
                  type="text"
                  maxLength={200}
                  value={item.altText}
                  onChange={(event) => update({ altText: event.target.value })}
                  placeholder={t.media.describePlaceholder}
                  className={cn(fieldClasses, 'mt-1 min-h-12 text-base')}
                />
              </div>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-ink-800">
                <input
                  type="checkbox"
                  checked={item.showsMinor}
                  onChange={(event) => update({ showsMinor: event.target.checked })}
                  className="size-5 accent-teal-600"
                />
                {t.media.hasMinor}
              </label>
            </>
          )}
        />
      </FormSection>

      {/* 2. The person being helped */}
      <FormSection number={2} id={`${id}-person`} title={t.person.title} description={t.person.description}>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor={`${id}-alias`}>{t.person.aliasLabel}</FieldLabel>
            <input
              id={`${id}-alias`}
              type="text"
              maxLength={40}
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              aria-invalid={errors['beneficiary.alias'] ? true : undefined}
              aria-describedby={`${id}-alias-hint`}
              placeholder={t.person.aliasPlaceholder}
              className={cn(fieldClasses, 'mt-2')}
            />
            <FieldError id={`${id}-alias-error`} message={errors['beneficiary.alias']} />
            <FieldHint id={`${id}-alias-hint`}>{t.person.aliasHint}</FieldHint>
          </div>
          <div>
            <FieldLabel htmlFor={`${id}-region`}>{t.person.regionLabel}</FieldLabel>
            <input
              id={`${id}-region`}
              type="text"
              maxLength={60}
              value={region}
              onChange={(event) => setRegion(event.target.value)}
              aria-invalid={errors['beneficiary.region'] ? true : undefined}
              aria-describedby={`${id}-region-hint`}
              placeholder={t.person.regionPlaceholder}
              className={cn(fieldClasses, 'mt-2')}
            />
            <FieldError id={`${id}-region-error`} message={errors['beneficiary.region']} />
            <FieldHint id={`${id}-region-hint`}>{t.person.regionHint}</FieldHint>
          </div>
        </div>

        <div>
          <FieldLabel htmlFor={`${id}-age`} optional>
            {t.person.ageLabel}
          </FieldLabel>
          <select
            id={`${id}-age`}
            value={ageBand}
            onChange={(event) => {
              setAgeBand(event.target.value);
              if (event.target.value === '0-17') setIsMinor(true);
            }}
            className={cn(fieldClasses, 'mt-2 sm:max-w-xs')}
          >
            <option value="">{t.person.ageNotSaid}</option>
            {AGE_BANDS.map((band) => (
              <option key={band} value={band}>
                {ageBandLabel(band)}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="font-semibold text-ink">{t.person.needsLegend}</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {NEED_CATEGORIES.map((need) => {
              const selected = needs.includes(need);
              return (
                <label
                  key={need}
                  className={cn(
                    'pressable inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full border-2 px-4 font-semibold',
                    'has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-teal-600',
                    selected
                      ? 'border-teal-600 bg-teal-600 text-white'
                      : 'border-ink-200 bg-white text-ink hover:border-teal-600',
                    !selected && needs.length >= 3 && 'opacity-50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!selected && needs.length >= 3}
                    onChange={(event) => toggleNeed(need, event.target.checked)}
                    className="sr-only"
                  />
                  {labels.needs[need]}
                </label>
              );
            })}
          </div>
          <FieldError id={`${id}-needs-error`} message={errors['beneficiary.needCategories']} />
        </fieldset>

        <ChoiceCard
          type="checkbox"
          name={`${id}-minor`}
          value="minor"
          checked={isMinor}
          disabled={isSelf}
          onChange={(checked) => {
            setIsMinor(checked);
            if (!checked && ageBand === '0-17') setAgeBand('');
          }}
          title={t.person.minorTitle}
          description={t.person.minorDescription}
        />
      </FormSection>

      {/* 3. Relationship and consent */}
      <FormSection
        number={3}
        id={`${id}-consent`}
        title={t.consent.title}
        description={t.consent.description}
      >
        <fieldset>
          <legend className="font-semibold text-ink">{t.consent.relationshipLegend}</legend>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {relationships.map((value) => (
              <ChoiceCard
                key={value}
                type="radio"
                name={`${id}-relationship`}
                value={value}
                checked={relationship === value}
                onChange={() => {
                  setRelationship(value);
                  if (value === 'SELF') setIsMinor(false);
                }}
                title={labels.relationships[value].name}
              />
            ))}
          </div>
          <FieldError id={`${id}-relationship-error`} message={errors.relationship} />
        </fieldset>

        {isSelf ? (
          <p className="rounded-2xl bg-teal-50 px-4 py-3 text-ink-800 ring-1 ring-inset ring-teal-100">
            {labels.consent.SELF.help}
          </p>
        ) : (
          <>
            <fieldset>
              <legend className="font-semibold text-ink">{t.consent.methodLegend}</legend>
              <div className="mt-3 grid gap-2">
                {(['VIDEO', 'SIGNED_FORM', 'GUARDIAN'] as const).map((method) => (
                  <ChoiceCard
                    key={method}
                    type="radio"
                    name={`${id}-consent-method`}
                    value={method}
                    checked={effectiveConsent === method}
                    disabled={isMinor && method !== 'GUARDIAN'}
                    onChange={() => setConsentMethod(method)}
                    title={labels.consent[method].name}
                    description={labels.consent[method].help}
                  />
                ))}
              </div>
              <FieldError id={`${id}-consent-method-error`} message={errors['consent.method']} />
            </fieldset>
            <MediaPicker
              label={t.consent.evidenceLabel}
              hint={t.consent.evidenceHint}
              items={evidence}
              onChange={setEvidence}
              max={1}
              allowVideo
              error={errors['consent.evidenceMediaId']}
            />
          </>
        )}
      </FormSection>

      {/* 4. The story */}
      <FormSection number={4} id={`${id}-story`} title={t.story.title} description={t.story.description}>
        <div>
          <FieldLabel htmlFor={`${id}-title`}>{t.story.titleLabel}</FieldLabel>
          <input
            id={`${id}-title`}
            type="text"
            maxLength={120}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-invalid={errors.title ? true : undefined}
            placeholder={t.story.titlePlaceholder}
            className={cn(fieldClasses, 'mt-2')}
          />
          <FieldError id={`${id}-title-error`} message={errors.title} />
        </div>
        <div>
          <FieldLabel htmlFor={`${id}-caption`}>{t.story.captionLabel}</FieldLabel>
          <textarea
            id={`${id}-caption`}
            rows={7}
            maxLength={CAPTION_MAX}
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            aria-invalid={errors.caption ? true : undefined}
            aria-describedby={`${id}-caption-hint`}
            placeholder={t.story.captionPlaceholder}
            className={cn(textareaClasses, 'mt-2')}
          />
          <FieldError id={`${id}-caption-error`} message={errors.caption} />
          <FieldHint id={`${id}-caption-hint`}>
            {fmt(t.story.captionHint, { count: caption.trim().length, max: CAPTION_MAX })}
          </FieldHint>
        </div>
      </FormSection>

      {/* 5. Funding */}
      <FormSection
        number={5}
        id={`${id}-funding`}
        title={t.funding.title}
        description={t.funding.description}
      >
        <fieldset>
          <legend className="font-semibold text-ink">{t.funding.typeLegend}</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(['FIXED', 'OPEN_ENDED'] as const).map((type) => {
              const Icon = type === 'FIXED' ? Target : InfinityIcon;
              return (
                <label
                  key={type}
                  className={cn(
                    'pressable flex cursor-pointer flex-col gap-2 rounded-2xl border-2 bg-white p-5',
                    'border-ink-200 hover:border-teal-600 has-checked:border-teal-600 has-checked:bg-teal-50',
                    'has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-teal-600',
                  )}
                >
                  <input
                    type="radio"
                    name={`${id}-funding-type`}
                    value={type}
                    checked={fundingType === type}
                    onChange={() => setFundingType(type)}
                    className="sr-only"
                  />
                  <span className="flex items-center gap-2 text-lg font-bold text-ink">
                    <Icon aria-hidden className="size-6 text-teal-700" />
                    {labels.funding[type].name}
                  </span>
                  <span className="text-ink-700">{labels.funding[type].meaning}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div>
          <p className="font-semibold text-ink">{t.funding.planTitle}</p>
          <p className="mt-1 text-ink-600">
            {fundingType === 'FIXED' ? t.funding.planFixedHint : t.funding.planOpenHint}
          </p>
          <ol className="mt-4 space-y-4">
            {plan.map((item, index) => (
              <li key={item.key} className="rounded-2xl border border-ink-100 bg-cream-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-bold text-ink">{fmt(t.funding.item, { number: index + 1 })}</p>
                  {plan.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPlan((items) => items.filter((other) => other.key !== item.key))}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 font-semibold text-ink-700 hover:text-coral-800"
                    >
                      <Trash2 aria-hidden className="size-4" />
                      {common.remove}
                    </button>
                  )}
                </div>
                <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
                  <div>
                    <FieldLabel htmlFor={`${id}-plan-${item.key}-title`}>{t.funding.itemTitle}</FieldLabel>
                    <input
                      id={`${id}-plan-${item.key}-title`}
                      type="text"
                      maxLength={80}
                      value={item.title}
                      onChange={(event) => updateItem(item.key, { title: event.target.value })}
                      aria-invalid={errors[`plan.${index}.title`] ? true : undefined}
                      placeholder={
                        fundingType === 'FIXED'
                          ? t.funding.itemTitleFixedPlaceholder
                          : t.funding.itemTitleOpenPlaceholder
                      }
                      className={cn(fieldClasses, 'mt-2')}
                    />
                    <FieldError
                      id={`${id}-plan-${item.key}-title-error`}
                      message={errors[`plan.${index}.title`]}
                    />
                  </div>
                  <div>
                    <FieldLabel
                      htmlFor={`${id}-plan-${item.key}-amount`}
                      optional={fundingType === 'OPEN_ENDED'}
                    >
                      {t.funding.itemAmount}
                    </FieldLabel>
                    <div className="relative mt-2">
                      <span
                        aria-hidden
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-semibold text-ink-600"
                      >
                        ₱
                      </span>
                      <input
                        id={`${id}-plan-${item.key}-amount`}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={item.amount}
                        onChange={(event) => updateItem(item.key, { amount: event.target.value })}
                        aria-invalid={errors[`plan.${index}.amountMinor`] ? true : undefined}
                        placeholder="0.00"
                        className={cn(fieldClasses, 'pl-10 tabular-nums')}
                      />
                    </div>
                    <FieldError
                      id={`${id}-plan-${item.key}-amount-error`}
                      message={errors[`plan.${index}.amountMinor`]}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <FieldLabel htmlFor={`${id}-plan-${item.key}-description`} optional>
                    {t.funding.itemDetails}
                  </FieldLabel>
                  <input
                    id={`${id}-plan-${item.key}-description`}
                    type="text"
                    maxLength={300}
                    value={item.description}
                    onChange={(event) => updateItem(item.key, { description: event.target.value })}
                    placeholder={t.funding.itemDetailsPlaceholder}
                    className={cn(fieldClasses, 'mt-2')}
                  />
                </div>
                <div className="mt-4">
                  <FieldLabel htmlFor={`${id}-plan-${item.key}-payout`}>{t.funding.itemPayout}</FieldLabel>
                  <select
                    id={`${id}-plan-${item.key}-payout`}
                    value={item.payout}
                    onChange={(event) => updateItem(item.key, { payout: event.target.value as PayoutChoice })}
                    className={cn(fieldClasses, 'mt-2')}
                  >
                    <option value="CREATOR">{t.funding.payoutCreator}</option>
                    <option value="DIRECT_TO_PROVIDER">{t.funding.payoutProvider}</option>
                  </select>
                  <p className="mt-2 text-ink-600">
                    {item.payout === 'CREATOR' ? t.funding.payoutCreatorHint : t.funding.payoutProviderHint}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          {plan.length < MAX_ITEMS && (
            <button
              type="button"
              onClick={() => setPlan((items) => [...items, newItem()])}
              className={buttonClasses({ variant: 'secondary', className: 'mt-4' })}
            >
              <Plus aria-hidden />
              {t.funding.addItem}
            </button>
          )}
          <FieldError id={`${id}-plan-error`} message={errors.plan} />
        </div>

        <div
          className={cn(
            'flex items-start gap-3 rounded-2xl p-4 ring-1 ring-inset',
            fundingType === 'FIXED' ? 'bg-gold-50 ring-gold-200' : 'bg-teal-50 ring-teal-100',
          )}
        >
          <HandCoins aria-hidden className="mt-0.5 size-6 shrink-0 text-ink-700" />
          {fundingType === 'FIXED' ? (
            <p className="text-ink-800">
              {rich(t.funding.fixedTotal, {
                amount: <strong className="text-lg text-ink">{formatPeso(fixedTotal)}</strong>,
              })}
            </p>
          ) : (
            <p className="text-ink-800">
              <strong className="text-ink">{t.funding.openTotalStrong}</strong> {t.funding.openTotal}
            </p>
          )}
        </div>
      </FormSection>

      {/* 6. Attestation and submit */}
      <div className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-7">
        <ChoiceCard
          type="checkbox"
          name={`${id}-attestation`}
          value="true"
          checked={attested}
          onChange={setAttested}
          // "Ana R." already ends with a period; the sentence adds its own.
          title={fmt(t.attestation, { name: creatorName.replace(/\.$/, '') })}
          description={t.attestationHelp}
        />
        <FieldError id={`${id}-attestation-error`} message={errors.attestation} />
        {formError && <FormAlert className="mt-4">{formError}</FormAlert>}
        <button
          type="submit"
          disabled={pending}
          className={buttonClasses({ size: 'lg', className: 'mt-5 w-full' })}
        >
          {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <Send aria-hidden />}
          {progress !== null && progress < 1
            ? fmt(forms.uploading, { percent: Math.round(progress * 100) })
            : pending
              ? forms.sending
              : t.submit}
        </button>
        <p className="mt-3 text-center text-sm text-ink-600">{t.submitNote}</p>
      </div>
    </form>
  );
}
