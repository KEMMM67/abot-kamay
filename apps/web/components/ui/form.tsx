// apps/web/components/ui/form.tsx
//
// Shared form pieces, styled like the donation dialog: 56px fields, a 2px border that turns teal on
// focus and coral when invalid, labels above fields, help text below, and errors announced to screen
// readers. Every control is at least 44px tall (WCAG 2.2 target size, and older hands).
//
// Only the creator forms (Client Components) import this file, so it runs in the browser and
// FieldLabel reads the "(optional)" wording from the language provider.
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useMessages } from '@/lib/i18n/client';

export const fieldClasses =
  'min-h-14 w-full rounded-2xl border-2 border-ink-400 bg-white px-4 text-lg text-ink transition-[border-color,box-shadow] ' +
  'placeholder:text-ink-500 focus:border-teal-600 focus:shadow-[0_0_0_4px_rgb(14_124_107/0.15)] focus:outline-none ' +
  'aria-[invalid=true]:border-coral-600 aria-[invalid=true]:focus:shadow-[0_0_0_4px_rgb(224_96_58/0.18)] ' +
  'disabled:cursor-not-allowed disabled:bg-ink-50';

export const textareaClasses = cn(fieldClasses, 'min-h-36 py-3 leading-relaxed');

export function FieldLabel({
  htmlFor,
  children,
  optional = false,
  className,
}: {
  htmlFor: string;
  children: ReactNode;
  optional?: boolean;
  className?: string;
}) {
  const { common } = useMessages();
  return (
    <label htmlFor={htmlFor} className={cn('block font-semibold text-ink', className)}>
      {children}
      {optional && <span className="font-normal text-ink-600">{common.optional}</span>}
    </label>
  );
}

export function FieldHint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-2 text-ink-600">
      {children}
    </p>
  );
}

export function FieldError({ id, message }: { id: string; message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-2 font-semibold text-coral-800">
      {message}
    </p>
  );
}

/** A section of a long form: a numbered heading and its fields. */
export function FormSection({
  number,
  title,
  description,
  children,
  id,
}: {
  number: number;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className="rounded-3xl border border-ink-100 bg-white p-5 shadow-card sm:p-7"
    >
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-2xl bg-teal-600 font-bold text-white shadow-cta"
        >
          {number}
        </span>
        <div className="min-w-0">
          <h2 id={id ? `${id}-title` : undefined} className="text-xl font-extrabold tracking-tight text-ink">
            {title}
          </h2>
          {description && <p className="mt-1 leading-relaxed text-ink-700">{description}</p>}
        </div>
      </div>
      <div className="mt-6 space-y-6">{children}</div>
    </section>
  );
}

/** Radio or checkbox styled as a large card, for choices that need a sentence of explanation. */
export function ChoiceCard({
  type,
  name,
  value,
  checked,
  onChange,
  title,
  description,
  disabled,
}: {
  type: 'radio' | 'checkbox';
  name: string;
  value: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        'pressable flex cursor-pointer items-start gap-3 rounded-2xl border-2 bg-white p-4',
        'border-ink-200 hover:border-teal-600 has-checked:border-teal-600 has-checked:bg-teal-50',
        'has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-teal-600',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-5 shrink-0 cursor-pointer accent-teal-600"
      />
      <span className="min-w-0">
        <span className="block font-semibold text-ink">{title}</span>
        {description && <span className="mt-0.5 block text-ink-600">{description}</span>}
      </span>
    </label>
  );
}

/** A form-level error, e.g. "something needs fixing". Shown at the top and next to the submit button. */
export function FormAlert({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      role="alert"
      className={cn('rounded-2xl bg-coral-50 px-4 py-3 font-semibold text-coral-800', className)}
    >
      {children}
    </p>
  );
}
