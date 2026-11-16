import { expect, test, type Page } from "@playwright/test";

/** The API is mocked: these tests cover the page, not the API (see tests/unit/verify.test.ts). */
const ID = "3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b";
const CODE = "0123456789abcdef0123456789abcdef";

async function mockApi(page: Page, status: number, body: unknown, headers: Record<string, string> = {}) {
  const urls: string[] = [];
  await page.route("https://api.mboacm.com/api/v1/**", async (route) => {
    urls.push(route.request().url());
    await route.fulfill({
      status,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*", ...headers },
      body: JSON.stringify(body),
    });
  });
  return urls;
}

async function fill(
  page: Page,
  type: "Contrat de location" | "Quittance ou reçu de paiement",
  number = ID,
  code = CODE,
) {
  await page.getByRole("radio", { name: type }).check();
  await page.getByLabel("Numéro du document").fill(number);
  await page.getByLabel("Code de vérification").fill(code);
  await page.getByRole("button", { name: "Vérifier le document" }).click();
}

test("confirms a genuine contract with the API's details", async ({ page }) => {
  const urls = await mockApi(page, 200, {
    contractId: ID,
    signed: true,
    signedAt: "2026-11-14T09:32:00Z",
    city: "Douala",
    district: "Bonapriso",
  });
  await page.goto("/verifier");

  await fill(page, "Contrat de location", `N° ${ID}`, `${CODE.toUpperCase()}.`);

  await expect(page.getByRole("heading", { name: "Document authentique" })).toBeVisible();
  await expect(page.getByText("14 novembre 2026")).toBeVisible();
  await expect(page.getByText("Bonapriso")).toBeVisible();
  expect(urls).toEqual([`https://api.mboacm.com/api/v1/contracts/verify/${ID}?code=${CODE}`]);
});

test("confirms a genuine receipt with its amount and period", async ({ page }) => {
  const urls = await mockApi(page, 200, {
    receiptId: ID,
    kind: "RENT",
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    amount: 150000,
    issuedAt: "2026-11-02T08:00:00Z",
    city: "Douala",
    district: "Akwa",
  });
  await page.goto("/verifier");

  await fill(page, "Quittance ou reçu de paiement");

  await expect(page.getByRole("heading", { name: "Document authentique" })).toBeVisible();
  await expect(page.getByText("Quittance de loyer")).toBeVisible();
  await expect(page.getByText(/150\s000 FCFA/)).toBeVisible();
  await expect(page.getByText("du 1 novembre 2026 au 30 novembre 2026")).toBeVisible();
  expect(urls[0]).toContain("/api/v1/receipts/verify/");

  await page.getByRole("button", { name: "Vérifier un autre document" }).click();
  await expect(page.getByLabel("Numéro du document")).toHaveValue("");
  await expect(page.getByLabel("Numéro du document")).toBeFocused();
});

test("says when no document matches", async ({ page }) => {
  await mockApi(page, 404, { status: 404, error: "CONTRACT_NOT_VERIFIED" });
  await page.goto("/verifier");

  await fill(page, "Contrat de location");

  await expect(page.getByRole("heading", { name: "Aucun document ne correspond" })).toBeVisible();
});

test("refuses a malformed number or code without calling the API", async ({ page }) => {
  const urls = await mockApi(page, 200, {});
  await page.goto("/verifier");

  await fill(page, "Contrat de location", "12345", "abc");

  await expect(page.getByRole("alert")).toContainText("Certains champs sont à corriger");
  await expect(page.getByLabel("Numéro du document")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Code de vérification")).toHaveAttribute("aria-invalid", "true");
  expect(urls).toEqual([]);
});

test("asks to wait the API's delay when it rate-limits", async ({ page }) => {
  // Cross-origin, the browser only lets the page read Retry-After if the API exposes it.
  await mockApi(
    page,
    429,
    { error: "RATE_LIMIT_EXCEEDED" },
    { "retry-after": "30", "access-control-expose-headers": "Retry-After" },
  );
  await page.goto("/verifier");

  await fill(page, "Quittance ou reçu de paiement");

  await expect(page.getByRole("heading", { name: "Trop de vérifications" })).toBeVisible();
  await expect(page.getByText("Réessayez dans 30 secondes.")).toBeVisible();
});

test("asks to wait a minute when the API's delay is not readable", async ({ page }) => {
  await mockApi(page, 429, { error: "RATE_LIMIT_EXCEEDED" }, { "retry-after": "30" });
  await page.goto("/verifier");

  await fill(page, "Contrat de location");

  await expect(page.getByText("Réessayez dans une minute.")).toBeVisible();
});

test("says the service is unavailable when the API cannot be reached", async ({ page }) => {
  await page.route("https://api.mboacm.com/api/v1/**", (route) => route.abort("connectionfailed"));
  await page.goto("/verifier");

  await fill(page, "Contrat de location");

  await expect(page.getByRole("heading", { name: "Vérification indisponible" })).toBeVisible();
});

test("the English page verifies too", async ({ page }) => {
  await mockApi(page, 404, { error: "RECEIPT_NOT_VERIFIED" });
  await page.goto("/en/verify");

  await page.getByRole("radio", { name: "Rent or payment receipt" }).check();
  await page.getByLabel("Document number").fill(ID);
  await page.getByLabel("Verification code").fill(CODE);
  await page.getByRole("button", { name: "Verify the document" }).click();

  await expect(page.getByRole("heading", { name: "No matching document" })).toBeVisible();
});
