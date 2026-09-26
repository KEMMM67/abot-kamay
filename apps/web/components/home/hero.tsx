// apps/web/components/home/hero.tsx
import { Camera, Receipt, ScrollText, ShieldCheck, UserCheck, type LucideIcon } from 'lucide-react';
import { LogoMark } from '@/components/brand/logo';
import { ArrowNudge, ButtonLink } from '@/components/ui/button';
import { cn, type StyleWithVars } from '@/lib/cn';
import { rich } from '@/lib/i18n/format';
import { getMessages } from '@/lib/i18n/server';

const PROOF_ICONS: readonly LucideIcon[] = [UserCheck, ScrollText, Receipt];

type ProofPoint = { icon: LucideIcon; title: string; note: string };

export async function Hero() {
  const t = (await getMessages()).home.hero;
  const proofPoints: ProofPoint[] = t.proofPoints.map((point, index) => ({
    ...point,
    icon: PROOF_ICONS[index] ?? UserCheck,
  }));
  return (
    <section aria-labelledby="hero-heading" className="relative isolate overflow-hidden">
      {/* Soft brand glow. Radial gradients instead of blur filters: cheap on low-end phones. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-48 left-[-10%] size-[42rem] rounded-full bg-[radial-gradient(closest-side,rgb(208_239_232/0.9),transparent)]" />
        <div className="absolute -right-32 top-10 size-[30rem] rounded-full bg-[radial-gradient(closest-side,rgb(253_239_201/0.9),transparent)]" />
        <div className="absolute -bottom-40 left-1/3 size-[26rem] rounded-full bg-[radial-gradient(closest-side,rgb(251_225_215/0.55),transparent)]" />
      </div>

      <div className="container-page grid items-center gap-12 pb-16 pt-10 sm:pb-20 sm:pt-16 lg:grid-cols-[1.08fr_0.92fr] lg:gap-8 lg:pb-28 lg:pt-20">
        <div>
          <p className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-teal-200 bg-white/80 px-4 py-2 text-sm font-semibold text-teal-800 shadow-card">
            <ShieldCheck aria-hidden className="size-4" />
            {t.badge}
          </p>
          <h1
            id="hero-heading"
            className="animate-fade-up animation-delay-100 mt-6 text-[2.5rem] font-extrabold leading-[1.08] tracking-tight text-ink sm:text-6xl lg:text-[4.25rem]"
          >
            {rich(t.title, {
              highlight: <span className="whitespace-nowrap text-teal-600">{t.titleHighlight}</span>,
            })}
          </h1>
          <p className="animate-fade-up animation-delay-200 mt-6 max-w-xl text-lg leading-relaxed text-ink-700 sm:text-xl">
            {t.body}
          </p>
          <div className="animate-fade-up animation-delay-300 mt-9 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/campaigns" size="lg">
              {t.viewFeed}
              <ArrowNudge className="size-5" />
            </ButtonLink>
            <ButtonLink href="/mag-post" size="lg" variant="secondary">
              <Camera aria-hidden />
              {t.post}
            </ButtonLink>
          </div>

          {/* On phones and tablets the proof points sit here; on desktop they orbit the mark. */}
          <ul className="animate-fade-up animation-delay-400 mt-10 grid gap-3 sm:grid-cols-3 lg:hidden">
            {proofPoints.map(({ icon: Icon, title, note }) => (
              <li
                key={title}
                className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white/80 p-3"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span>
                  <span className="block font-bold text-ink">{title}</span>
                  <span className="block text-sm text-ink-600">{note}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <HeroVisual points={proofPoints} className="hidden lg:block" />
      </div>
    </section>
  );
}

const CHIP_POSITIONS = ['left-0 top-[14%]', '-right-6 top-[60%]', 'bottom-[6%] left-[4%]'] as const;

/** The mark draws itself (the hands reach, the person appears), then the proof points float in. */
function HeroVisual({ points, className }: { points: readonly ProofPoint[]; className?: string }) {
  return (
    <div className={cn('relative mx-auto aspect-square w-full max-w-[32rem]', className)}>
      <div
        aria-hidden
        className="absolute inset-[3%] rounded-full border-2 border-dashed border-teal-200 motion-safe:animate-[spin_90s_linear_infinite]"
      />
      <div aria-hidden className="absolute inset-[13%] rounded-full bg-white shadow-lift ring-1 ring-ink/5" />
      <div
        aria-hidden
        className="absolute inset-[13%] rounded-full bg-[radial-gradient(circle_at_50%_42%,rgb(242_182_50/0.18),transparent_62%)]"
      />
      <LogoMark animated className="absolute left-1/2 top-1/2 w-[46%] -translate-x-1/2 -translate-y-[47%]" />

      <ul>
        {points.map(({ icon: Icon, title, note }, index) => (
          <li
            key={title}
            style={{ '--i': index, '--stagger-step': '180ms', '--stagger-offset': '1350ms' } as StyleWithVars}
            className={cn('animate-fade-up stagger absolute', CHIP_POSITIONS[index])}
          >
            <div
              style={{ animationDelay: `${index * -2}s` }}
              className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white py-3 pl-3 pr-5 shadow-lift motion-safe:animate-float"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                <Icon aria-hidden className="size-5" />
              </span>
              <span>
                <span className="block font-bold text-ink">{title}</span>
                <span className="block text-sm text-ink-600">{note}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
