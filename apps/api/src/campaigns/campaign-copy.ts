// apps/api/src/campaigns/campaign-copy.ts
//
// Text for the public campaign page: what AbotKamay checked, and the timeline from the creator's ID
// check to the last receipt. Built from facts in the database, so every line is true for this
// campaign. Conversational Filipino by default, like the rest of the product, and English for donors
// who switched the site to English (GET /campaigns/:slug?lang=en). Which steps appear, and in what
// state, is decided once below; only the wording differs per language.
import { formatDateEn } from '../common/format/en.js';
import { formatDateFil, formatPesoFil } from '../common/format/fil.js';
import type { ContentLang, TimelineEventDto } from './campaign.dto.js';

interface CopyText {
  date(date: Date): string;
  checks: {
    idVerified(name: string, date: string): string;
    selfHelped(name: string): string;
    consentVideo: string;
    consentSignedForm: string;
    consentGuardian: string;
    reviewed: string;
    coordinatorVisit(name: string, date: string): string;
    receiptsForever: string;
  };
  timeline: {
    creatorVerified: { title: string; detail(name: string): string };
    posted: { title: string; detail(name: string): string };
    reviewedDone: { title: string; detail: string };
    reviewedPending: { title: string; detail: string };
    fieldVerified: { title: string; detail(alias: string): string };
    donationsArrived: { title: string; detail(count: number): string };
    firstDonation: { title: string; detail: string };
    disbursedDone: { title: string; detail(amount: string): string };
    disbursedUpcoming: { title: string; detail: string };
    receiptsDone: { title(count: number): string; detail: string };
    receiptsMissing: { title: string; detail(amount: string): string };
    receiptsUpcoming: { title: string; detailPosted(count: number): string; detailNone: string };
  };
}

const COPY: Record<ContentLang, CopyText> = {
  fil: {
    date: formatDateFil,
    checks: {
      idVerified: (name, date) => `Na-verify ang government ID at selfie ni ${name} noong ${date}.`,
      selfHelped: (name) => `Si ${name} mismo ang tinutulungan ng kampanyang ito.`,
      consentVideo: 'May naka-record na video ng pagpayag ng taong tinutulungan bago siya nai-post.',
      consentSignedForm: 'May pirmadong pahintulot ang taong tinutulungan bago siya nai-post.',
      consentGuardian: 'May pahintulot ng magulang o guardian, at naka-blur ang mukha ng bata.',
      reviewed: 'Sinuri ng AbotKamay team ang mga litrato, video at caption bago ito lumabas sa feed.',
      coordinatorVisit: (name, date) => `Personal ding binisita ng coordinator na si ${name} noong ${date}.`,
      receiptsForever:
        'Ang creator ang nagpo-post ng resibo ng bawat gastos, at hindi na ito mabubura o mababago.',
    },
    timeline: {
      creatorVerified: {
        title: 'Na-verify ang ID ng nag-post',
        detail: (name) =>
          `Government ID at selfie na may one-time code ni ${name}, sinuri ng AbotKamay team.`,
      },
      posted: {
        title: 'Nai-post ang kampanya',
        detail: (name) =>
          `In-upload ni ${name} ang mga litrato o video, ang kuwento, at ang plano sa paggamit ng pondo.`,
      },
      reviewedDone: {
        title: 'Pumasa sa review',
        detail: 'Sinuri ang mga litrato, video, caption at pahintulot bago ito lumabas sa feed.',
      },
      reviewedPending: {
        title: 'Sinusuri pa',
        detail: 'Tinitingnan pa ng AbotKamay team ang post bago ito lumabas sa feed.',
      },
      fieldVerified: {
        title: 'Personal na binisita',
        detail: (alias) => `Nakita at nakausap ng isang AbotKamay coordinator si ${alias}.`,
      },
      donationsArrived: {
        title: 'Dumating ang mga donasyon',
        detail: (count) =>
          `${count} na donasyon na ang natanggap. Nakatala ang bawat isa sa pampublikong talaan.`,
      },
      firstDonation: { title: 'Unang donasyon', detail: 'Hinihintay pa ang unang donasyon.' },
      disbursedDone: {
        title: 'Nailabas ang pondo',
        detail: (amount) =>
          `${amount} na ang nailabas, sa na-verify na creator o diretso sa ospital o tindahan.`,
      },
      disbursedUpcoming: {
        title: 'Paglabas ng pondo',
        detail: 'Ilalabas lang ang pondo sa na-verify na creator, o diretso sa ospital o tindahan.',
      },
      receiptsDone: {
        title: (count) => `${count} resibo ang nai-post`,
        detail: 'May resibo na ang lahat ng nailabas na pondo. Makikita ang bawat isa sa ibaba.',
      },
      receiptsMissing: {
        title: 'Hinihintay ang resibo',
        detail: (amount) => `${amount} pa sa nailabas na pondo ang wala pang resibo.`,
      },
      receiptsUpcoming: {
        title: 'Mga resibo',
        detailPosted: (count) => `${count} resibo na ang nai-post ng creator.`,
        detailNone: 'Ipo-post ng creator ang resibo at litrato ng bawat gastos.',
      },
    },
  },
  en: {
    date: formatDateEn,
    checks: {
      idVerified: (name, date) => `${name}'s government ID and selfie were verified on ${date}.`,
      selfHelped: (name) => `${name} is the person this campaign helps.`,
      consentVideo: 'The person being helped gave recorded video consent before being posted.',
      consentSignedForm: 'The person being helped signed a consent form before being posted.',
      consentGuardian: "A parent or guardian gave consent, and the child's face is blurred.",
      reviewed:
        'The AbotKamay team reviewed the photos, videos and caption before this appeared in the feed.',
      coordinatorVisit: (name, date) => `Coordinator ${name} also visited in person on ${date}.`,
      receiptsForever:
        'The creator posts a receipt for every expense, and receipts can never be edited or deleted.',
    },
    timeline: {
      creatorVerified: {
        title: "Creator's ID verified",
        detail: (name) =>
          `${name}'s government ID and a selfie with a one-time code, checked by the AbotKamay team.`,
      },
      posted: {
        title: 'Campaign posted',
        detail: (name) => `${name} uploaded the photos or videos, the story, and the plan for the money.`,
      },
      reviewedDone: {
        title: 'Passed review',
        detail: 'Photos, videos, caption and consent were checked before it appeared in the feed.',
      },
      reviewedPending: {
        title: 'In review',
        detail: 'The AbotKamay team is still checking the post before it appears in the feed.',
      },
      fieldVerified: {
        title: 'Visited in person',
        detail: (alias) => `An AbotKamay coordinator met and spoke with ${alias}.`,
      },
      donationsArrived: {
        title: 'Donations arrived',
        detail: (count) =>
          `${count} ${count === 1 ? 'donation' : 'donations'} received so far. Each one is recorded in the public ledger.`,
      },
      firstDonation: { title: 'First donation', detail: 'Waiting for the first donation.' },
      disbursedDone: {
        title: 'Funds released',
        detail: (amount) =>
          `${amount} released so far, to the verified creator or directly to the hospital or store.`,
      },
      disbursedUpcoming: {
        title: 'Releasing the funds',
        detail: 'Funds are released only to the verified creator, or directly to the hospital or store.',
      },
      receiptsDone: {
        title: (count) => `${count} ${count === 1 ? 'receipt' : 'receipts'} posted`,
        detail: 'Every peso released has a receipt. You can see each one below.',
      },
      receiptsMissing: {
        title: 'Waiting for receipts',
        detail: (amount) => `${amount} of the released funds has no receipt yet.`,
      },
      receiptsUpcoming: {
        title: 'Receipts',
        detailPosted: (count) => `The creator has posted ${count} ${count === 1 ? 'receipt' : 'receipts'}.`,
        detailNone: 'The creator will post a receipt and a photo for every expense.',
      },
    },
  },
};

export interface CheckFacts {
  creatorName: string;
  creatorVerifiedAt: Date | null;
  relationshipSelf: boolean;
  consentMethod: string | null;
  publishedAt: Date | null;
  coordinatorVisitAt: Date | null;
  coordinatorName: string | null;
}

export function verificationChecks(facts: CheckFacts, lang: ContentLang = 'fil'): string[] {
  const copy = COPY[lang];
  const text = copy.checks;
  const checks: string[] = [];
  if (facts.creatorVerifiedAt) {
    checks.push(text.idVerified(facts.creatorName, copy.date(facts.creatorVerifiedAt)));
  }
  if (facts.relationshipSelf) {
    checks.push(text.selfHelped(facts.creatorName));
  } else if (facts.consentMethod === 'VIDEO') {
    checks.push(text.consentVideo);
  } else if (facts.consentMethod === 'SIGNED_FORM') {
    checks.push(text.consentSignedForm);
  } else if (facts.consentMethod === 'GUARDIAN') {
    checks.push(text.consentGuardian);
  }
  if (facts.publishedAt) {
    checks.push(text.reviewed);
  }
  if (facts.coordinatorVisitAt && facts.coordinatorName) {
    checks.push(text.coordinatorVisit(facts.coordinatorName, copy.date(facts.coordinatorVisitAt)));
  }
  checks.push(text.receiptsForever);
  return checks;
}

export interface TimelineFacts {
  slug: string;
  creatorName: string;
  beneficiaryAlias: string;
  creatorVerifiedAt: Date | null;
  postedAt: Date;
  publishedAt: Date | null;
  coordinatorVisitAt: Date | null;
  firstDonationAt: Date | null;
  donorCount: number;
  disbursedMinor: bigint;
  lastDisbursedAt: Date | null;
  receiptedMinor: bigint;
  receiptCount: number;
  lastReceiptAt: Date | null;
}

export function campaignTimeline(facts: TimelineFacts, lang: ContentLang = 'fil'): TimelineEventDto[] {
  const text = COPY[lang].timeline;
  const events: Array<Omit<TimelineEventDto, 'id'>> = [];

  if (facts.creatorVerifiedAt) {
    events.push({
      kind: 'CREATOR_VERIFIED',
      state: 'DONE',
      title: text.creatorVerified.title,
      detail: text.creatorVerified.detail(facts.creatorName),
      occurredAt: facts.creatorVerifiedAt.toISOString(),
    });
  }
  events.push({
    kind: 'POSTED',
    state: 'DONE',
    title: text.posted.title,
    detail: text.posted.detail(facts.creatorName),
    occurredAt: facts.postedAt.toISOString(),
  });
  events.push(
    facts.publishedAt
      ? {
          kind: 'REVIEWED',
          state: 'DONE',
          title: text.reviewedDone.title,
          detail: text.reviewedDone.detail,
          occurredAt: facts.publishedAt.toISOString(),
        }
      : {
          kind: 'REVIEWED',
          state: 'CURRENT',
          title: text.reviewedPending.title,
          detail: text.reviewedPending.detail,
          occurredAt: null,
        },
  );
  if (facts.coordinatorVisitAt) {
    events.push({
      kind: 'FIELD_VERIFIED',
      state: 'DONE',
      title: text.fieldVerified.title,
      detail: text.fieldVerified.detail(facts.beneficiaryAlias),
      occurredAt: facts.coordinatorVisitAt.toISOString(),
    });
  }

  events.push(
    facts.donorCount > 0
      ? {
          kind: 'MILESTONE_FUNDED',
          state: 'DONE',
          title: text.donationsArrived.title,
          detail: text.donationsArrived.detail(facts.donorCount),
          occurredAt: facts.firstDonationAt?.toISOString() ?? null,
        }
      : {
          kind: 'MILESTONE_FUNDED',
          state: facts.publishedAt ? 'CURRENT' : 'UPCOMING',
          title: text.firstDonation.title,
          detail: text.firstDonation.detail,
          occurredAt: null,
        },
  );

  events.push(
    facts.disbursedMinor > 0n
      ? {
          kind: 'DISBURSED',
          state: 'DONE',
          title: text.disbursedDone.title,
          detail: text.disbursedDone.detail(formatPesoFil(facts.disbursedMinor)),
          occurredAt: facts.lastDisbursedAt?.toISOString() ?? null,
        }
      : {
          kind: 'DISBURSED',
          state: 'UPCOMING',
          title: text.disbursedUpcoming.title,
          detail: text.disbursedUpcoming.detail,
          occurredAt: null,
        },
  );

  const unreceipted = facts.disbursedMinor - facts.receiptedMinor;
  if (facts.receiptCount > 0 && unreceipted <= 0n) {
    events.push({
      kind: 'PROOF',
      state: 'DONE',
      title: text.receiptsDone.title(facts.receiptCount),
      detail: text.receiptsDone.detail,
      occurredAt: facts.lastReceiptAt?.toISOString() ?? null,
    });
  } else if (facts.disbursedMinor > 0n) {
    events.push({
      kind: 'PROOF',
      state: 'CURRENT',
      title: text.receiptsMissing.title,
      detail: text.receiptsMissing.detail(formatPesoFil(unreceipted)),
      occurredAt: facts.lastReceiptAt?.toISOString() ?? null,
    });
  } else {
    events.push({
      kind: 'PROOF',
      state: 'UPCOMING',
      title: text.receiptsUpcoming.title,
      detail:
        facts.receiptCount > 0
          ? text.receiptsUpcoming.detailPosted(facts.receiptCount)
          : text.receiptsUpcoming.detailNone,
      occurredAt: facts.lastReceiptAt?.toISOString() ?? null,
    });
  }

  return events.map((event, index) => ({ ...event, id: `${facts.slug}-step-${index + 1}` }));
}
