// apps/web/components/home/trust-band.tsx
//
// "Legit ba 'to?": the scam most donors meet is a copied video with someone else's GCash number in the
// comments, so the home page ends with the checker.
import { Check, Search, Smartphone } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { getMessages } from '@/lib/i18n/server';

export async function TrustBand() {
  const t = (await getMessages()).home.trustBand;
  return (
    <section aria-labelledby="legit-heading" className="pb-16 sm:pb-24">
      <div className="container-page">
        <div className="surface-dark relative isolate overflow-hidden rounded-[2rem] bg-ink px-6 py-12 text-cream sm:px-12 sm:py-16 lg:px-16">
          <div
            aria-hidden
            className="absolute -right-28 -top-28 -z-10 size-[26rem] rounded-full bg-[radial-gradient(closest-side,rgb(45_191_163/0.32),transparent)]"
          />
          <div
            aria-hidden
            className="absolute -bottom-32 -left-20 -z-10 size-[22rem] rounded-full bg-[radial-gradient(closest-side,rgb(242_122_86/0.22),transparent)]"
          />
          <div className="grid items-center gap-12 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="reveal">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-400">{t.eyebrow}</p>
              <h2 id="legit-heading" className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                {t.title}
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-200">{t.body}</p>
              <ButtonLink href="/verify" variant="light" size="lg" className="mt-8">
                <Search aria-hidden />
                {t.button}
              </ButtonLink>
            </div>

            {/* Illustration of a checker result; the real tool is one tap away. */}
            <div
              aria-hidden
              className="reveal mx-auto w-full max-w-sm rotate-2 rounded-3xl bg-white p-5 text-ink shadow-lift"
            >
              <div className="flex h-14 items-center gap-3 rounded-2xl border-2 border-ink-200 px-4 text-lg font-semibold tabular-nums">
                <Smartphone className="size-5 text-ink-500" />
                0917 ••• 4567
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border-2 border-teal-600">
                <div className="flex items-center gap-3 bg-teal-600 px-4 py-3 text-white">
                  <span className="grid size-8 place-items-center rounded-full bg-white text-teal-700">
                    <Check className="size-5" strokeWidth={3} />
                  </span>
                  <span className="font-bold">{t.sampleVerified}</span>
                </div>
                <div className="space-y-2.5 p-4">
                  <div className="h-2.5 w-11/12 rounded-full bg-ink-100" />
                  <div className="h-2.5 w-8/12 rounded-full bg-ink-100" />
                  <div className="h-2.5 w-9/12 rounded-full bg-ink-100" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
