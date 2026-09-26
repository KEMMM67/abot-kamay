// apps/web/lib/i18n/format.tsx
//
// Filling the {placeholders} in lib/i18n/messages. Pure functions, so Server Components, Client
// Components and Server Actions all use the same ones.
//
//   fmt('Hello {name}', { name: 'Ana' })                          -> 'Hello Ana'
//   rich('{amount} ang mapupunta', { amount: <strong>₱500</strong> }) -> ['', <strong/>, ' ang mapupunta']
//   plural({ one: '{count} donor', other: '{count} donors' }, 3)  -> '3 donors'
import { Fragment, type ReactNode } from 'react';

type Values = Record<string, string | number>;

/** Fills {placeholders} with text. A placeholder without a value is left as written, so it shows. */
export function fmt(template: string, values: Values): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}

/** Like fmt, for values that are elements (a bold amount, a highlighted word, a link). */
export function rich(template: string, values: Record<string, ReactNode>): ReactNode {
  // split() with a capture group puts the placeholder names at the odd indexes.
  return template
    .split(/\{(\w+)\}/g)
    .map((part, index) =>
      index % 2 === 1 ? (
        <Fragment key={index}>{Object.hasOwn(values, part) ? values[part] : `{${part}}`}</Fragment>
      ) : (
        part
      ),
    );
}

export interface PluralForms {
  one: string;
  other: string;
}

/**
 * Picks the singular or plural form, then fills {count} and any other values; pass a formatted
 * count ({ count: '1,204' }) to show it instead of the raw number. Filipino nouns don't inflect, so
 * its two forms are the same; English needs both ("1 receipt", "3 receipts").
 */
export function plural(forms: PluralForms, count: number, values: Values = {}): string {
  return fmt(count === 1 ? forms.one : forms.other, { count, ...values });
}
