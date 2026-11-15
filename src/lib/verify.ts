/**
 * Public check of a printed Mboa document — the page `mboacm.com/verifier` that the API's
 * contract and receipt PDFs point to ("Authenticité : vérifiez ce document sur mboacm.com/verifier…").
 *
 * The visitor's browser calls the API directly, so its 60 requests/min/IP limit applies to
 * each visitor, not to the site as a whole. The API answers (api/docs/api-error-codes.md):
 * - 200 — genuine, with a deliberately thin summary (no names, no address);
 * - 404 `CONTRACT_NOT_VERIFIED` / `RECEIPT_NOT_VERIFIED` — the same answer for a wrong code and an unknown number;
 * - 400 — the number is not an identifier, or the code is missing;
 * - 429 `RATE_LIMIT_EXCEEDED`, with `Retry-After` in seconds — readable here only if the API lists it in
 *   `Access-Control-Expose-Headers`; otherwise the page asks to wait a minute.
 * Framework-free: shared by the VerifyForm island and the unit tests.
 */

export const documentTypes = ["contract", "receipt"] as const;
export type DocumentType = (typeof documentTypes)[number];

/** Production API. Overridden at build time with PUBLIC_API_BASE_URL (staging: https://api-staging.mboacm.com). */
export const DEFAULT_API_BASE_URL = "https://api.mboacm.com";

const VERIFY_PATHS: Record<DocumentType, string> = {
  contract: "/api/v1/contracts/verify/",
  receipt: "/api/v1/receipts/verify/",
};

const NOT_VERIFIED_CODES: Record<DocumentType, string> = {
  contract: "CONTRACT_NOT_VERIFIED",
  receipt: "RECEIPT_NOT_VERIFIED",
};

/** Kinds of receipt the API issues (ReceiptKind) — an unknown one is shown as a generic receipt. */
export const receiptKinds = ["RENT", "RENT_PARTIAL", "DEPOSIT", "INVOICE"] as const;
export type ReceiptKind = (typeof receiptKinds)[number];

/** `ContractVerification` — signedAt is an ISO instant. */
export interface ContractVerification {
  contractId: string;
  signed: boolean;
  signedAt: string | null;
  city: string | null;
  district: string | null;
}

/** `ReceiptVerification` — period dates are ISO dates (YYYY-MM-DD), issuedAt an ISO instant, amount in FCFA. */
export interface ReceiptVerification {
  receiptId: string;
  kind: string;
  periodStart: string | null;
  periodEnd: string | null;
  amount: number;
  issuedAt: string | null;
  city: string | null;
  district: string | null;
}

export type VerifyResult =
  | { status: "genuine"; type: "contract"; contract: ContractVerification }
  | { status: "genuine"; type: "receipt"; receipt: ReceiptVerification }
  | { status: "not_found" }
  | { status: "invalid" }
  | { status: "rate_limited"; retryAfter: number | null }
  | { status: "unavailable" };

export type VerifyField = "number" | "code";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** 32 hex characters: the verification code, and a document number typed without its dashes. */
const CODE_PATTERN = /^[0-9a-f]{32}$/;

/**
 * The document number as the API wants it (a lowercase UUID), or null.
 * Tolerates what people copy from a PDF: the "N° " prefix, spaces, capitals, missing dashes.
 */
export function normalizeNumber(input: string): string | null {
  const compact = input
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/^n[°o]:?/, "")
    .replace(/\.$/, "");
  if (UUID_PATTERN.test(compact)) return compact;
  const bare = compact.replace(/-/g, "");
  if (!CODE_PATTERN.test(bare)) return null;
  return `${bare.slice(0, 8)}-${bare.slice(8, 12)}-${bare.slice(12, 16)}-${bare.slice(16, 20)}-${bare.slice(20)}`;
}

/**
 * The verification code as the API compares it (32 lowercase hex characters), or null.
 * Spaces are removed (the contract check does not strip them) and so is the full stop
 * that ends the printed sentence, often copied along with the code.
 */
export function normalizeCode(input: string): string | null {
  const code = input.toLowerCase().replace(/\s+/g, "").replace(/\.$/, "");
  return CODE_PATTERN.test(code) ? code : null;
}

/** Field errors of a submission — empty when it can be sent. */
export function validateInput(number: string, code: string): VerifyField[] {
  const errors: VerifyField[] = [];
  if (!normalizeNumber(number)) errors.push("number");
  if (!normalizeCode(code)) errors.push("code");
  return errors;
}

/** API base URL without trailing slash; falls back to production when the value is not an http(s) URL. */
export function apiBaseUrl(value: string | undefined): string {
  const candidate = (value ?? "").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^/\s]+$/.test(candidate) ? candidate : DEFAULT_API_BASE_URL;
}

export function verifyUrl(baseUrl: string, type: DocumentType, number: string, code: string): string {
  return `${apiBaseUrl(baseUrl)}${VERIFY_PATHS[type]}${encodeURIComponent(number)}?code=${encodeURIComponent(code)}`;
}

function retryAfterSeconds(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : undefined;
  } catch {
    return undefined;
  }
}

function isContract(body: unknown): body is ContractVerification {
  const value = body as Partial<ContractVerification> | null;
  return typeof value?.contractId === "string" && value.signed === true;
}

function isReceipt(body: unknown): body is ReceiptVerification {
  const value = body as Partial<ReceiptVerification> | null;
  return typeof value?.receiptId === "string" && typeof value.amount === "number" && typeof value.kind === "string";
}

/** Maps an API response to what the page shows. */
export async function interpretResponse(type: DocumentType, response: Response): Promise<VerifyResult> {
  if (response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { status: "unavailable" };
    }
    if (type === "contract" && isContract(body)) return { status: "genuine", type, contract: body };
    if (type === "receipt" && isReceipt(body)) return { status: "genuine", type, receipt: body };
    return { status: "unavailable" };
  }

  if (response.status === 429)
    return { status: "rate_limited", retryAfter: retryAfterSeconds(response.headers.get("retry-after")) };
  if (response.status === 400) return { status: "invalid" };
  // A 404 without the module's code means the route itself is missing: a configuration problem, not an answer.
  if (response.status === 404)
    return (await errorCode(response)) === NOT_VERIFIED_CODES[type]
      ? { status: "not_found" }
      : { status: "unavailable" };
  return { status: "unavailable" };
}

const TIMEOUT_MS = 15_000;

/** Calls the API's public verification route. Inputs that cannot be valid are refused without a request. */
export async function verifyDocument(
  input: { type: DocumentType; number: string; code: string },
  options: { baseUrl: string; fetchFn?: typeof fetch },
): Promise<VerifyResult> {
  const number = normalizeNumber(input.number);
  const code = normalizeCode(input.code);
  if (!number || !code) return { status: "invalid" };

  const fetchFn = options.fetchFn ?? fetch;
  try {
    const response = await fetchFn(verifyUrl(options.baseUrl, input.type, number, code), {
      method: "GET",
      // A "simple" request (no custom header, no credentials): no CORS preflight, nothing sent but the URL.
      headers: { accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
      signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(TIMEOUT_MS) : undefined,
    });
    return await interpretResponse(input.type, response);
  } catch {
    return { status: "unavailable" };
  }
}
