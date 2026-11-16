/// <reference types="astro/client" />

declare module "cloudflare:workers" {
  /** Worker bindings: wrangler.jsonc `vars` + secrets (`wrangler secret put`), `.dev.vars` locally. */
  export const env: import("@/lib/forms/handlers").FormsEnv & Record<string, string | undefined>;
}

interface ImportMetaEnv {
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  readonly PUBLIC_CF_ANALYTICS_TOKEN?: string;
  /** API origin for the public document check (/verifier). Default: https://api.mboacm.com. */
  readonly PUBLIC_API_BASE_URL?: string;
}

declare module "*.yaml?raw" {
  const content: string;
  export default content;
}
