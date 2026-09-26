// apps/web/components/creator/media-picker.tsx
'use client';

//
// Photo and video pickers with previews. Previews use blob: URLs (allowed by the CSP) and are revoked
// when a file is removed or the form unmounts. Files are checked against the same type and size
// limits as the API before anything is uploaded.
import { Camera, ImagePlus, Trash2, Video } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { FieldError } from '@/components/ui/form';
import { cn } from '@/lib/cn';
import { useCreatorMessages, useMessages } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n/format';
import { fileProblem, IMAGE_TYPES, isVideo, VIDEO_TYPES } from '@/lib/uploads';

export interface PickedMedia {
  key: string;
  file: File;
  previewUrl: string;
  altText: string;
  showsMinor: boolean;
}

let keySequence = 0;

function toPicked(file: File): PickedMedia {
  keySequence += 1;
  return {
    key: `m${keySequence}`,
    file,
    previewUrl: URL.createObjectURL(file),
    altText: '',
    showsMinor: false,
  };
}

function Preview({ item, className }: { item: PickedMedia; className?: string }) {
  return isVideo(item.file) ? (
    <video
      src={item.previewUrl}
      muted
      playsInline
      preload="metadata"
      className={cn('size-full bg-ink object-cover', className)}
    />
  ) : (
    // A local preview (blob: URL), not a remote image: next/image adds nothing here.
    // oxlint-disable-next-line nextjs/no-img-element
    <img src={item.previewUrl} alt="" className={cn('size-full object-cover', className)} />
  );
}

export function MediaPicker({
  label,
  hint,
  items,
  onChange,
  max,
  allowVideo,
  error,
  renderDetails,
}: {
  label: string;
  hint: ReactNode;
  items: PickedMedia[];
  onChange: (items: PickedMedia[]) => void;
  max: number;
  allowVideo: boolean;
  error?: string | null;
  /** Extra fields under each preview, e.g. a description and "there is a child in this photo". */
  renderDetails?: (item: PickedMedia, update: (patch: Partial<PickedMedia>) => void) => ReactNode;
}) {
  const { forms } = useCreatorMessages();
  const t = forms.picker;
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  });

  // Revoke every preview URL when the picker goes away.
  useEffect(() => () => itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl)), []);

  function add(fileList: FileList | null) {
    if (!fileList) return;
    const room = max - items.length;
    const accepted: PickedMedia[] = [];
    let firstProblem: string | null = null;
    for (const file of Array.from(fileList)) {
      const reason = fileProblem(file, { allowVideo });
      if (reason) {
        firstProblem ??= fmt(t.fileProblem, { file: file.name, reason: forms.upload[reason] });
        continue;
      }
      if (accepted.length >= room) {
        firstProblem ??= fmt(t.tooMany, { max });
        break;
      }
      accepted.push(toPicked(file));
    }
    setProblem(firstProblem);
    if (accepted.length) onChange([...items, ...accepted]);
    if (inputRef.current) inputRef.current.value = '';
  }

  function remove(key: string) {
    const item = items.find((candidate) => candidate.key === key);
    if (item) URL.revokeObjectURL(item.previewUrl);
    onChange(items.filter((candidate) => candidate.key !== key));
  }

  function update(key: string, patch: Partial<PickedMedia>) {
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  const accept = (allowVideo ? [...IMAGE_TYPES, ...VIDEO_TYPES] : [...IMAGE_TYPES]).join(',');

  return (
    <div>
      <p id={`${id}-label`} className="font-semibold text-ink">
        {label}
      </p>
      <p id={`${id}-hint`} className="mt-1 text-ink-600">
        {hint}
      </p>

      {items.length > 0 && (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {items.map((item, index) => (
            <li key={item.key} className="overflow-hidden rounded-2xl border border-ink-100 bg-cream-50">
              <div className="relative aspect-4/3">
                <Preview item={item} />
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-ink/80 px-2.5 py-1 text-sm font-semibold text-white">
                  {isVideo(item.file) ? (
                    <Video aria-hidden className="size-4" />
                  ) : (
                    <Camera aria-hidden className="size-4" />
                  )}
                  {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => remove(item.key)}
                  className="absolute right-2 top-2 grid size-11 place-items-center rounded-full bg-white/95 text-ink shadow-card transition-colors hover:bg-coral-50 hover:text-coral-800"
                >
                  <Trash2 aria-hidden className="size-5" />
                  <span className="sr-only">{fmt(t.removeFile, { number: index + 1 })}</span>
                </button>
              </div>
              {renderDetails && (
                <div className="space-y-3 p-3">{renderDetails(item, (patch) => update(item.key, patch))}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {items.length < max && (
        <>
          <input
            ref={inputRef}
            id={`${id}-input`}
            type="file"
            accept={accept}
            multiple={max > 1}
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-hint`}
            onChange={(event) => add(event.target.files)}
            className="peer sr-only"
          />
          <label
            htmlFor={`${id}-input`}
            className="pressable mt-4 flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-ink-300 bg-cream-50 p-4 text-center font-semibold text-ink hover:border-teal-600 hover:text-teal-800 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-600"
          >
            <ImagePlus aria-hidden className="size-7 text-teal-700" />
            {items.length > 0 ? t.addMore : allowVideo ? t.pickPhotoOrVideo : t.pickPhoto}
            <span className="text-sm font-normal text-ink-600">
              {fmt(t.count, { count: items.length, max })}
            </span>
          </label>
        </>
      )}
      <FieldError id={`${id}-problem`} message={problem ?? error} />
    </div>
  );
}

/** One photo, e.g. the front of an ID. `capture` opens the camera directly on phones. */
export function PhotoField({
  label,
  hint,
  value,
  onChange,
  capture,
  error,
}: {
  label: string;
  hint: ReactNode;
  value: PickedMedia | null;
  onChange: (value: PickedMedia | null) => void;
  capture?: 'user' | 'environment';
  error?: string | null;
}) {
  const { forms } = useCreatorMessages();
  const { common } = useMessages();
  const id = useId();
  const [problem, setProblem] = useState<string | null>(null);
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  });
  useEffect(
    () => () => {
      if (valueRef.current) URL.revokeObjectURL(valueRef.current.previewUrl);
    },
    [],
  );

  function pick(file: File | undefined) {
    if (!file) return;
    const reason = fileProblem(file, { allowVideo: false });
    setProblem(reason && forms.upload[reason]);
    if (reason) return;
    if (value) URL.revokeObjectURL(value.previewUrl);
    onChange(toPicked(file));
  }

  return (
    <div>
      <p id={`${id}-label`} className="font-semibold text-ink">
        {label}
      </p>
      <p id={`${id}-hint`} className="mt-1 text-ink-600">
        {hint}
      </p>
      <div className="mt-3 flex items-center gap-4">
        <div className="grid size-28 shrink-0 place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-ink-300 bg-cream-50">
          {value ? <Preview item={value} /> : <Camera aria-hidden className="size-8 text-ink-400" />}
        </div>
        <div className="flex flex-col gap-2">
          <input
            id={`${id}-input`}
            type="file"
            accept={IMAGE_TYPES.join(',')}
            capture={capture}
            aria-labelledby={`${id}-label`}
            aria-describedby={`${id}-hint`}
            aria-invalid={problem || error ? true : undefined}
            onChange={(event) => {
              pick(event.target.files?.[0]);
              event.target.value = '';
            }}
            className="peer sr-only"
          />
          <label
            htmlFor={`${id}-input`}
            className="pressable inline-flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-ink-200 bg-white px-5 font-semibold text-ink hover:border-teal-600 hover:text-teal-800 peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-teal-600"
          >
            <Camera aria-hidden className="size-5 shrink-0" />
            {value ? forms.picker.replace : forms.picker.takeOrPick}
          </label>
          {value && (
            <button
              type="button"
              onClick={() => {
                URL.revokeObjectURL(value.previewUrl);
                onChange(null);
              }}
              className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl px-2 font-semibold text-ink-700 hover:text-coral-800"
            >
              <Trash2 aria-hidden className="size-4" />
              {common.remove}
            </button>
          )}
        </div>
      </div>
      <FieldError id={`${id}-problem`} message={problem ?? error} />
    </div>
  );
}
