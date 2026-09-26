// apps/web/lib/i18n/client-messages.ts
//
// The slices of the dictionary that Client Components need, picked on the server and passed to the
// providers in lib/i18n/client.tsx. Only these travel to the browser:
//   siteMessages     every page (navbar, donation dialog, share link, feed video, checker, errors)
//   creatorMessages  only the creator routes (sign-in, verify-ID, post and receipt forms)
// so a donor opening a campaign from TikTok never downloads the forms' copy.
import type { Messages } from './messages/fil';

export function siteMessages(m: Messages) {
  return {
    nav: m.nav,
    common: m.common,
    media: m.media,
    donate: m.donate,
    money: m.money,
    checker: m.verify.checker,
    errors: m.errors,
    api: m.api,
  };
}

export function creatorMessages(m: Messages) {
  return {
    signIn: m.signIn,
    forms: m.forms,
    verifyId: m.verifyId,
    createPost: m.createPost,
    report: m.report,
    refreshStatus: m.creator.kycPending.refresh,
    labels: {
      needs: m.labels.needs,
      funding: m.labels.funding,
      relationships: m.labels.relationships,
      consent: m.labels.consent,
      idTypes: m.labels.idTypes,
      kycRejection: m.labels.kycRejection,
      proofKind: m.labels.proofKind,
    },
  };
}

export type SiteMessages = ReturnType<typeof siteMessages>;
export type CreatorMessages = ReturnType<typeof creatorMessages>;
