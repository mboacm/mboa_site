import { useEffect, useId, useRef, useState, type ReactNode, type SubmitEvent } from "react";
import {
  receiptKinds,
  validateInput,
  verifyDocument,
  type DocumentType,
  type ReceiptKind,
  type VerifyField,
  type VerifyResult,
} from "@/lib/verify";
import type { VerifyCopy } from "./verify-copy";

interface Props {
  copy: VerifyCopy;
  /** API origin, resolved at build time (PUBLIC_API_BASE_URL). */
  apiBaseUrl: string;
}

type Status = "idle" | "submitting" | "done";

/** Instants are shown in Cameroon's time, the time printed on the PDFs. */
const TIME_ZONE = "Africa/Douala";

function Svg({ children, size = 24 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export default function VerifyForm({ copy, apiBaseUrl }: Props) {
  const id = useId();
  const { labels, errors: messages, result: text } = copy;

  const [type, setType] = useState<DocumentType>("contract");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [fieldErrors, setFieldErrors] = useState<VerifyField[]>([]);

  const formRef = useRef<HTMLFormElement>(null);
  const numberRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "done") resultRef.current?.focus();
  }, [status, result]);

  const dateTime = (iso: string | null) =>
    iso
      ? new Intl.DateTimeFormat(copy.localeTag, { dateStyle: "long", timeStyle: "short", timeZone: TIME_ZONE }).format(
          new Date(iso),
        )
      : null;
  // Period bounds are calendar dates (YYYY-MM-DD): formatted in UTC so they never shift by a day.
  const day = (isoDate: string) =>
    new Intl.DateTimeFormat(copy.localeTag, { dateStyle: "long", timeZone: "UTC" }).format(
      new Date(`${isoDate}T00:00:00Z`),
    );
  const amount = (value: number) =>
    `${new Intl.NumberFormat(copy.localeTag, { maximumFractionDigits: 0 }).format(value)} FCFA`;
  const kindLabel = (kind: string) =>
    (receiptKinds as readonly string[]).includes(kind) ? copy.kinds[kind as ReceiptKind] : copy.kinds.other;

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const number = String(form.get("number") ?? "");
    const code = String(form.get("code") ?? "");

    const found = validateInput(number, code);
    setFieldErrors(found);
    if (found.length > 0) {
      setResult(null);
      setStatus("idle");
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }

    setStatus("submitting");
    setResult(await verifyDocument({ type, number, code }, { baseUrl: apiBaseUrl }));
    setStatus("done");
  }

  /** A result describes what was typed: editing a field makes it stale. */
  function onEdit() {
    if (status === "done") {
      setResult(null);
      setStatus("idle");
    }
  }

  function reset() {
    formRef.current?.reset();
    setType("contract");
    setResult(null);
    setFieldErrors([]);
    setStatus("idle");
    requestAnimationFrame(() => numberRef.current?.focus());
  }

  const hasError = (field: VerifyField) => fieldErrors.includes(field);
  const describedBy = (field: VerifyField) =>
    [`${id}-${field}-hint`, hasError(field) ? `${id}-${field}-error` : undefined].filter(Boolean).join(" ");

  const inputClass =
    "h-13 w-full rounded-button border-[1.5px] border-gray-light bg-warm-white px-4 text-base text-ink tabular-nums placeholder:text-gray-mid transition-colors focus:border-forest focus:outline-none aria-[invalid=true]:border-error";
  const labelClass = "mb-1.5 block text-sm font-medium text-ink";

  const fieldError = (field: VerifyField) =>
    hasError(field) ? (
      <p id={`${id}-${field}-error`} className="mt-1.5 text-sm text-error-text">
        {messages[field]}
      </p>
    ) : null;

  function details(rows: [string, string | null][]) {
    const shown = rows.filter((row): row is [string, string] => Boolean(row[1]));
    return (
      <dl className="mt-5 grid gap-x-6 gap-y-3 rounded-button bg-white p-4 sm:grid-cols-[auto_1fr]">
        {shown.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-sm font-medium text-gray-dark">{label}</dt>
            <dd className="font-medium break-all text-ink sm:break-normal">{value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  function renderResult(current: VerifyResult) {
    if (current.status === "genuine") {
      const rows: [string, string | null][] =
        current.type === "contract"
          ? [
              [text.number, current.contract.contractId],
              [text.signedAt, dateTime(current.contract.signedAt)],
              [text.city, current.contract.city],
              [text.district, current.contract.district],
            ]
          : [
              [text.number, current.receipt.receiptId],
              [text.kind, kindLabel(current.receipt.kind)],
              [text.amount, amount(current.receipt.amount)],
              [
                text.period,
                current.receipt.periodStart && current.receipt.periodEnd
                  ? text.periodRange
                      .replace("{start}", day(current.receipt.periodStart))
                      .replace("{end}", day(current.receipt.periodEnd))
                  : null,
              ],
              [text.issuedAt, dateTime(current.receipt.issuedAt)],
              [text.city, current.receipt.city],
              [text.district, current.receipt.district],
            ];
      return (
        <div className="rounded-card bg-forest-pale p-5 md:p-6">
          <div className="flex items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-forest text-white">
              <Svg>
                <path d="M20 6 9 17l-5-5" />
              </Svg>
            </span>
            <h3 className="text-h3 text-forest-dark">{text.genuineTitle}</h3>
          </div>
          <p className="mt-4 text-forest-dark">
            {current.type === "contract" ? text.contractGenuine : text.receiptGenuine}
          </p>
          {details(rows)}
          <p className="mt-4 text-sm text-forest-dark">{text.noNames}</p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 inline-flex h-11 items-center justify-center rounded-button border-[1.5px] border-forest px-4 text-sm font-semibold text-forest transition-colors hover:bg-white"
          >
            {labels.again}
          </button>
        </div>
      );
    }

    const notice = {
      not_found: { title: text.notFoundTitle, body: text.notFoundText },
      invalid: { title: text.invalidTitle, body: text.invalidText },
      rate_limited: {
        title: text.rateLimitedTitle,
        body:
          current.status === "rate_limited" && current.retryAfter
            ? text.rateLimitedText.replace("{seconds}", String(current.retryAfter))
            : text.rateLimitedTextNoDelay,
      },
      unavailable: { title: text.unavailableTitle, body: text.unavailableText },
    }[current.status];
    const notFound = current.status === "not_found";

    return (
      <div
        className={
          notFound
            ? "rounded-card bg-coral-pale p-5 md:p-6"
            : "rounded-card border border-gray-light bg-warm-white p-5 md:p-6"
        }
      >
        <div className="flex items-center gap-3">
          <span
            className={`flex size-11 shrink-0 items-center justify-center rounded-full ${notFound ? "bg-white text-error-text" : "bg-gray-light text-ink"}`}
          >
            {notFound ? (
              <Svg>
                <path d="M18 6 6 18M6 6l12 12" />
              </Svg>
            ) : (
              <Svg>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </Svg>
            )}
          </span>
          <h3 className="text-h3 text-ink">{notice.title}</h3>
        </div>
        <p className="mt-4 text-ink">{notice.body}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        ref={formRef}
        noValidate
        onSubmit={onSubmit}
        onInput={onEdit}
        className="flex flex-col gap-5"
        aria-busy={status === "submitting"}
      >
        <div ref={summaryRef} tabIndex={-1} aria-live="assertive" className="outline-none">
          {fieldErrors.length > 0 && (
            // error-text, not coral-dark: coral-dark on coral-pale is 4.2:1, short of AA at this size.
            <p className="rounded-button bg-coral-pale px-4 py-3 text-sm font-medium text-error-text" role="alert">
              {messages.summary}
            </p>
          )}
        </div>

        <fieldset>
          <legend className={labelClass}>{labels.type}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["contract", "receipt"] as const).map((value) => (
              <label
                key={value}
                className="flex min-h-13 cursor-pointer items-center gap-3 rounded-button border-[1.5px] border-gray-light bg-warm-white px-4 py-3 text-base font-medium text-ink transition-colors has-checked:border-forest has-checked:bg-forest-pale has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-forest"
              >
                <input
                  type="radio"
                  name="type"
                  value={value}
                  checked={type === value}
                  onChange={() => setType(value)}
                  className="size-5 shrink-0 accent-forest"
                />
                {labels[value]}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor={`${id}-number`} className={labelClass}>
            {labels.number}
          </label>
          <input
            ref={numberRef}
            id={`${id}-number`}
            name="number"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={64}
            required
            placeholder="3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b"
            aria-invalid={hasError("number")}
            aria-describedby={describedBy("number")}
            className={inputClass}
          />
          <p id={`${id}-number-hint`} className="mt-1.5 text-xs text-gray-dark">
            {labels.numberHint}
          </p>
          {fieldError("number")}
        </div>

        <div>
          <label htmlFor={`${id}-code`} className={labelClass}>
            {labels.code}
          </label>
          <input
            id={`${id}-code`}
            name="code"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={48}
            required
            aria-invalid={hasError("code")}
            aria-describedby={describedBy("code")}
            className={inputClass}
          />
          <p id={`${id}-code-hint`} className="mt-1.5 text-xs text-gray-dark">
            {labels.codeHint}
          </p>
          {fieldError("code")}
        </div>

        <button
          type="submit"
          disabled={status === "submitting"}
          className="group inline-flex h-13 items-center justify-center gap-2.5 rounded-button bg-coral-dark px-5 text-base font-semibold text-white transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.98] disabled:translate-y-0 disabled:cursor-wait disabled:opacity-85 disabled:shadow-none"
        >
          {status === "submitting" ? labels.submitting : labels.submit}
          <Svg size={20}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </Svg>
        </button>
      </form>

      <div ref={resultRef} tabIndex={-1} aria-live="polite" className="outline-none">
        {status === "done" && result && renderResult(result)}
      </div>
    </div>
  );
}
