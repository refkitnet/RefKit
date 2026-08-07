# Self-Hosted revenue integration

Self-Hosted Apps use provider-neutral API revenue reporting. RefKit does not
need Stripe or another billing-provider credential. Your application remains
connected to its billing provider and reports normalized successful payments,
refunds, and disputes to your RefKit instance.

## Configure the instance origin

Use the public HTTPS `APP_URL` from the deployment for every client:

```bash
export REFKIT_API_URL=https://refkit.example.com
npx refkitnet auth login --api-url "$REFKIT_API_URL"
```

MCP uses the same saved CLI origin, or `REFKIT_API_URL`. Set
`REFKIT_API_KEY` to an App-scoped Test or Live key for MCP revenue tools.

The browser SDK and every server SDK operation need the custom `baseUrl`:

```typescript
import {
  captureClick,
  identifyCustomer,
  reportDispute,
  reportPayment,
  reportRefund,
} from "@refkitnet/sdk";

const baseUrl = process.env.REFKIT_API_URL!;
const apiKey = process.env.REFKIT_API_KEY!;

const click = await captureClick({
  baseUrl,
  apiKey,
  via: linkCode,
  page: landingUrl,
});

const customer = await identifyCustomer({
  baseUrl,
  apiKey,
  clickId: click.click_id!,
  externalCustomerId: user.id,
  email: user.email,
});

await reportPayment({
  baseUrl,
  apiKey,
  paymentId: invoice.id,
  customerId: customer.customer_id,
  programId: customer.program_id,
  amount: invoice.amountPaid,
  currency: invoice.currency,
});
```

For browser fallback, call `init({ baseUrl })` before `capture()`. Keep App API
keys on the server. Server-side capture is preferred.

## Revenue semantics

- Report every successful initial payment and renewal with its own stable
  `paymentId`.
- Amounts are non-negative integer minor units. A zero-value payment creates
  history without commission and does not lock the App's revenue source.
- Report only completed refunds. Partial refunds may accumulate up to the
  original payment amount.
- Use one stable `disputeId` for the complete dispute lifecycle. Supported
  states are `opened`, `won`, `withdrawn`, `lost`, and `funds_reinstated`.
- Report the parent payment before a refund or dispute. Retry a missing-parent
  response after the parent has been accepted.
- Exact replay is harmless. Reusing an identity with different immutable
  payment, amount, currency, or parent details is rejected.
- Payment, refund, and dispute identities are isolated by App and Test or Live
  mode.
- The payment currency must match the Program currency.
- Cancellation and failed payment attempts are not revenue events.
- Correct accepted history with new refund, replacement-payment, or
  compensating event identities. Accepted events are never edited in place.

## Billing-provider adapter

Keep provider webhooks in your application. Verify the provider signature,
normalize the accepted event, and call RefKit from the server:

| Provider outcome | RefKit operation |
| --- | --- |
| Successful one-time payment | `reportPayment` with the provider payment or invoice ID |
| Successful recurring renewal | `reportPayment` with that renewal's unique invoice ID |
| Completed partial or full refund | `reportRefund` with the provider refund ID and parent payment ID |
| Dispute created | `reportDispute` with `opened` |
| Dispute resolved for the customer | `reportDispute` with `lost` |
| Dispute resolved for the application | `reportDispute` with `won` or `withdrawn`, according to provider semantics |
| Funds restored after a recorded loss | `reportDispute` with `funds_reinstated` |

Use your provider's durable event IDs and queue or retry failed RefKit calls
with the same normalized payload. Retry timeouts, `429`, and `5xx` responses.
Treat validation and identity conflicts as terminal until the integration or
payload is corrected.

## Test and Live isolation

Use a Test key while validating the full click, identify, payment, refund, and
dispute journey. Test records are non-payable and cannot access Live records.
Use a separate Live key for production. Do not mix keys or send the same
provider event through both Test and Live paths.

The dashboard integration checklist confirms capture, identify, revenue, and
commission activity. The REST details are in
[`apps/app/docs/api.md`](../../apps/app/docs/api.md).
