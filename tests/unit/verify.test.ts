import { describe, expect, it, vi } from "vitest";
import {
  apiBaseUrl,
  DEFAULT_API_BASE_URL,
  interpretResponse,
  normalizeCode,
  normalizeNumber,
  validateInput,
  verifyDocument,
  verifyUrl,
} from "@/lib/verify";

const ID = "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const CODE = "0123456789abcdef0123456789abcdef";

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

describe("normalizeNumber", () => {
  it("accepts the number as printed, with or without the N° prefix", () => {
    expect(normalizeNumber(ID)).toBe(ID);
    expect(normalizeNumber(`N° ${ID}`)).toBe(ID);
    expect(normalizeNumber(`  ${ID.toUpperCase()}. `)).toBe(ID);
  });

  it("accepts a number typed without dashes, or with stray spaces", () => {
    expect(normalizeNumber(ID.replace(/-/g, ""))).toBe(ID);
    expect(normalizeNumber("3f2a 9c1e-5b7d-4e8f-9a0b-1c2d 3e4f 5a6b")).toBe(ID);
  });

  it("refuses anything that is not an identifier", () => {
    expect(normalizeNumber("")).toBeNull();
    expect(normalizeNumber("12345")).toBeNull();
    expect(normalizeNumber(`${ID}0`)).toBeNull();
    expect(normalizeNumber(ID.replace("3f", "zz"))).toBeNull();
    expect(normalizeNumber(`../${ID}`)).toBeNull();
  });
});

describe("normalizeCode", () => {
  it("lowercases, removes spaces and the sentence's final full stop", () => {
    expect(normalizeCode(CODE.toUpperCase())).toBe(CODE);
    expect(normalizeCode("0123 4567 89ab cdef 0123 4567 89ab cdef.")).toBe(CODE);
  });

  it("refuses a code of the wrong length or alphabet", () => {
    expect(normalizeCode(CODE.slice(1))).toBeNull();
    expect(normalizeCode(`${CODE}0`)).toBeNull();
    expect(normalizeCode(CODE.replace("a", "g"))).toBeNull();
  });
});

describe("validateInput", () => {
  it("names each field to correct", () => {
    expect(validateInput(ID, CODE)).toEqual([]);
    expect(validateInput("nope", CODE)).toEqual(["number"]);
    expect(validateInput("", "")).toEqual(["number", "code"]);
  });
});

describe("apiBaseUrl / verifyUrl", () => {
  it("defaults to production and drops a trailing slash", () => {
    expect(apiBaseUrl(undefined)).toBe(DEFAULT_API_BASE_URL);
    expect(apiBaseUrl("")).toBe(DEFAULT_API_BASE_URL);
    expect(apiBaseUrl("javascript:alert(1)")).toBe(DEFAULT_API_BASE_URL);
    expect(apiBaseUrl("https://api-staging.mboacm.com/")).toBe("https://api-staging.mboacm.com");
  });

  it("builds the matching API route", () => {
    expect(verifyUrl(DEFAULT_API_BASE_URL, "contract", ID, CODE)).toBe(
      `https://api.mboacm.com/api/v1/contracts/verify/${ID}?code=${CODE}`,
    );
    expect(verifyUrl("https://api-staging.mboacm.com", "receipt", ID, CODE)).toBe(
      `https://api-staging.mboacm.com/api/v1/receipts/verify/${ID}?code=${CODE}`,
    );
  });
});

describe("interpretResponse", () => {
  const contract = {
    contractId: ID,
    signed: true,
    signedAt: "2026-11-14T09:32:00Z",
    city: "Douala",
    district: "Bonapriso",
  };
  const receipt = {
    receiptId: ID,
    kind: "RENT",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    amount: 150000,
    issuedAt: "2026-11-02T08:00:00Z",
    city: "Douala",
    district: "Akwa",
  };

  it("reads a genuine contract and a genuine receipt", async () => {
    expect(await interpretResponse("contract", json(200, contract))).toEqual({
      status: "genuine",
      type: "contract",
      contract,
    });
    expect(await interpretResponse("receipt", json(200, receipt))).toEqual({
      status: "genuine",
      type: "receipt",
      receipt,
    });
  });

  it("does not call genuine a body of the wrong shape", async () => {
    expect(await interpretResponse("contract", json(200, receipt))).toEqual({ status: "unavailable" });
    expect(await interpretResponse("contract", json(200, { ...contract, signed: false }))).toEqual({
      status: "unavailable",
    });
    expect(await interpretResponse("receipt", new Response("<html>", { status: 200 }))).toEqual({
      status: "unavailable",
    });
  });

  it("maps the module's 404 to not found, any other 404 to unavailable", async () => {
    expect(await interpretResponse("contract", json(404, { error: "CONTRACT_NOT_VERIFIED" }))).toEqual({
      status: "not_found",
    });
    expect(await interpretResponse("receipt", json(404, { error: "RECEIPT_NOT_VERIFIED" }))).toEqual({
      status: "not_found",
    });
    expect(await interpretResponse("receipt", json(404, { error: "NOT_FOUND" }))).toEqual({ status: "unavailable" });
  });

  it("maps 400, 429 and server errors", async () => {
    expect(await interpretResponse("contract", json(400, { error: "MALFORMED_REQUEST" }))).toEqual({
      status: "invalid",
    });
    expect(
      await interpretResponse("contract", json(429, { error: "RATE_LIMIT_EXCEEDED" }, { "retry-after": "42" })),
    ).toEqual({ status: "rate_limited", retryAfter: 42 });
    expect(await interpretResponse("contract", json(429, {}))).toEqual({ status: "rate_limited", retryAfter: null });
    expect(await interpretResponse("contract", json(500, { error: "INTERNAL_ERROR" }))).toEqual({
      status: "unavailable",
    });
  });
});

describe("verifyDocument", () => {
  it("sends a credential-less GET with the normalized number and code", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(json(404, { error: "CONTRACT_NOT_VERIFIED" }));
    const result = await verifyDocument(
      { type: "contract", number: `N° ${ID.toUpperCase()}`, code: `${CODE.toUpperCase()}.` },
      { baseUrl: DEFAULT_API_BASE_URL, fetchFn },
    );
    expect(result).toEqual({ status: "not_found" });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(`https://api.mboacm.com/api/v1/contracts/verify/${ID}?code=${CODE}`);
    expect(init).toMatchObject({ method: "GET", credentials: "omit" });
  });

  it("refuses invalid input without calling the API", async () => {
    const fetchFn = vi.fn<typeof fetch>();
    expect(await verifyDocument({ type: "receipt", number: "x", code: CODE }, { baseUrl: "", fetchFn })).toEqual({
      status: "invalid",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("reports a network failure (or a CORS refusal) as unavailable", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await verifyDocument({ type: "receipt", number: ID, code: CODE }, { baseUrl: "", fetchFn })).toEqual({
      status: "unavailable",
    });
  });
});
