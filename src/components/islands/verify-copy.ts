import { localeTags, type Locale } from "@/i18n/locales";
import { t } from "@/i18n/utils";
import { receiptKinds, type ReceiptKind } from "@/lib/verify";

/** Every string the VerifyForm island displays, translated on the server (islands never import dictionaries). */
export function verifyCopy(locale: Locale) {
  const tr = (key: Parameters<typeof t>[1]) => t(locale, key);
  return {
    locale,
    localeTag: localeTags[locale],
    labels: {
      type: tr("verify.form.type"),
      contract: tr("verify.form.contract"),
      receipt: tr("verify.form.receipt"),
      number: tr("verify.form.number"),
      numberHint: tr("verify.form.numberHint"),
      code: tr("verify.form.code"),
      codeHint: tr("verify.form.codeHint"),
      submit: tr("verify.form.submit"),
      submitting: tr("verify.form.submitting"),
      again: tr("verify.form.again"),
    },
    errors: {
      summary: tr("verify.errors.summary"),
      number: tr("verify.errors.number"),
      code: tr("verify.errors.code"),
    },
    result: {
      genuineTitle: tr("verify.result.genuineTitle"),
      contractGenuine: tr("verify.result.contractGenuine"),
      receiptGenuine: tr("verify.result.receiptGenuine"),
      number: tr("verify.result.number"),
      signedAt: tr("verify.result.signedAt"),
      kind: tr("verify.result.kind"),
      amount: tr("verify.result.amount"),
      period: tr("verify.result.period"),
      periodRange: tr("verify.result.periodRange"),
      issuedAt: tr("verify.result.issuedAt"),
      city: tr("verify.result.city"),
      district: tr("verify.result.district"),
      noNames: tr("verify.result.noNames"),
      notFoundTitle: tr("verify.result.notFoundTitle"),
      notFoundText: tr("verify.result.notFoundText"),
      invalidTitle: tr("verify.result.invalidTitle"),
      invalidText: tr("verify.result.invalidText"),
      rateLimitedTitle: tr("verify.result.rateLimitedTitle"),
      rateLimitedText: tr("verify.result.rateLimitedText"),
      rateLimitedTextNoDelay: tr("verify.result.rateLimitedTextNoDelay"),
      unavailableTitle: tr("verify.result.unavailableTitle"),
      unavailableText: tr("verify.result.unavailableText"),
    },
    kinds: {
      ...(Object.fromEntries(receiptKinds.map((kind) => [kind, tr(`verify.kinds.${kind}`)])) as Record<
        ReceiptKind,
        string
      >),
      other: tr("verify.kinds.other"),
    },
  };
}

export type VerifyCopy = ReturnType<typeof verifyCopy>;
