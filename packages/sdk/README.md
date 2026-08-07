# @refkitnet/sdk

Browser and server helpers for RefKit affiliate click capture, customer identification, and provider-neutral revenue reporting.

## Install

```bash
npm install @refkitnet/sdk
```

## Consent (required where applicable)

Before recording RefKit tracking, you **must** obtain end-user consent where your jurisdiction or CMP requires it (e.g. GDPR/ePrivacy). Server-side capture does not remove that responsibility; only capture after any required consent is granted.

Browser fallback example:

```typescript
if (userHasAnalyticsConsent()) {
  refkit.capture();
}
```

RefKit is a data processor; you (the developer) are the data controller and are responsible for lawful basis, privacy notices, and consent UI.

## Server capture (recommended)

Capture on the backend that receives the landing request so RefKit receives the
original visitor metadata and the returned click id can live in secure
first-party storage.

```typescript
import { captureClick } from "@refkitnet/sdk";

const landingUrl = new URL(request.url);
const via = landingUrl.searchParams.get("via");
const refkitBaseUrl = process.env.REFKIT_API_URL!;

if (via) {
  const result = await captureClick({
    apiKey: process.env.REFKIT_API_KEY!,
    baseUrl: refkitBaseUrl,
    via,
    page: landingUrl.toString(),
    referrer: request.headers.get("referer") ?? undefined,
    visitorIp: trustedClientIp(request),
    visitorUserAgent: request.headers.get("user-agent") ?? undefined,
  });

  secureSession.refkitClickId = result.click_id;
}
```

The app API key is server-side only. Never expose it in browser code. When your
app is behind a proxy, use your framework or platform's trusted-proxy client IP
helper instead of accepting an arbitrary `X-Forwarded-For` value.

## Browser fallback

```typescript
import { init, capture, getClickId, getStripeMetadata } from "@refkitnet/sdk/browser";

init();

// After consent - reads ?via= from URL, records click, and persists click_id
await capture();

const clickId = getClickId();

// Stripe apps: pass to Stripe Checkout metadata on your server
const metadata = getStripeMetadata();
```

Self-Hosted browser integrations must initialize with
`init({ baseUrl: "https://your-refkit-instance.example" })` instead of using
the Cloud default.

Browser capture uses the public capture mode without an API key. RefKit derives visitor metadata from the request and ignores body-supplied visitor metadata.

The `via` code is unique within an App. Production affiliate links stay
`?via=` only: browser capture resolves the App from the landing-page origin.
Dashboard Test links may include `refkit_app=`; the browser SDK reads it and
removes it after capture. Do not add a Program identifier to the public URL.

## Customer identification and API revenue

```typescript
import {
  identifyCustomer,
  reportDispute,
  reportPayment,
  reportRefund,
} from "@refkitnet/sdk";

const refkitBaseUrl = process.env.REFKIT_API_URL!;

const result = await identifyCustomer({
  apiKey: process.env.REFKIT_API_KEY!,
  baseUrl: refkitBaseUrl,
  externalCustomerId: "user_123",
  email: "user@example.com",
  clickId: clickIdFromSecureSession,
});

// API-reported revenue apps only
await reportPayment({
  apiKey: process.env.REFKIT_API_KEY!,
  baseUrl: refkitBaseUrl,
  paymentId: invoice.id,
  customerId: result.customer_id,
  programId: result.program_id,
  amount: 2900,
  currency: "usd",
});

await reportRefund({
  apiKey: process.env.REFKIT_API_KEY!,
  baseUrl: refkitBaseUrl,
  refundId: refund.id,
  paymentId: invoice.id,
  amount: 2900,
});

await reportDispute({
  apiKey: process.env.REFKIT_API_KEY!,
  baseUrl: refkitBaseUrl,
  disputeId: dispute.id,
  paymentId: invoice.id,
  status: "opened",
  amount: 2900,
});
```

If payment reporting happens after signup, persist `result.customer_id` and `result.program_id` with your customer or billing record.

Managed provider integrations using a managed revenue key may identify without a click when they authoritatively map a promotion code to a Program Affiliate:

```typescript
const result = await identifyCustomer({
  apiKey: process.env.REFKIT_API_KEY!,
  baseUrl: refkitBaseUrl,
  externalCustomerId: opaqueCustomerId,
  attributionEvidence: {
    type: "promotion_code",
    value: appliedCode,
    programId,
    programAffiliateId,
  },
});
```

Ordinary App keys must send `clickId` and cannot use clickless promotion-code evidence. The Program must enable promotion-code fallback. When both inputs are present, a valid `clickId` wins. Code-based attribution returns `click_id: null` and never creates a synthetic click. Managed integrations must use opaque external Customer IDs and omit email.

Set `REFKIT_API_URL` to your instance origin. RefKit Cloud uses `https://app.refkit.net`. Self-Hosted integrations should pass their configured origin to every SDK call so they never fall back to Cloud.

Use a new stable payment ID for every successful initial payment or renewal. Zero-value payments record history without commission. Reuse the same dispute ID while reporting `opened`, `won`, `withdrawn`, `lost`, or `funds_reinstated`. Report the parent payment before its refund or dispute. Refunds plus disputes in `opened` or `lost` cannot exceed the original payment. Exact retries are safe; changing the immutable payment, amount, or currency for an accepted identity returns a conflict.

## External payout execution

Use a live API key scoped to the exact App. The `payout.ready` webhook contains the execution ID. Fetch the immutable instructions, execute payment in your finance system, then report the result with a unique idempotency key:

```typescript
import {
  getPayoutExecution,
  reportPayoutSucceeded,
} from "@refkitnet/sdk";

const refkitBaseUrl = process.env.REFKIT_API_URL!;

const execution = await getPayoutExecution({
  apiKey: process.env.REFKIT_API_KEY!,
  baseUrl: refkitBaseUrl,
  executionId,
});

await payWithYourFinanceSystem(execution.instructions);

await reportPayoutSucceeded({
  apiKey: process.env.REFKIT_API_KEY!,
  baseUrl: refkitBaseUrl,
  executionId,
  idempotencyKey: `payout-${executionId}-success`,
  externalReference: "transfer_123",
});
```

Use `reportPayoutFailed` when payment fails. A failed execution stays allocated and may later be reported as succeeded. RefKit never moves funds.

## Attribution window

Clicks are attributed for 30 days. Keep the server-captured click id in secure first-party storage and call `identifyCustomer` as soon as possible after signup. Browser storage limits are another reason to treat browser capture as the fallback.

## License

MIT
