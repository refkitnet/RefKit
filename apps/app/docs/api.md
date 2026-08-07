# API Reference

Grouped reference for the RefKit REST API. Public contract path is `/v1/*` (internally routed to `/api/v1/*`).

**Machine-readable index:** `GET /v1` returns a JSON list of endpoints available in the current deployment edition. Self-Hosted omits Cloud-only managed connection, Network, Stripe, and RefKit support entries. Keep `src/app/api/v1/route.ts` in sync when adding or removing routes.

## Auth by group

| Group | Auth required |
|-------|---------------|
| Public meta | None |
| RefKit Network browse | None |
| Organizations, API keys | Session only |
| Developer endpoints | Session, `rk_app_*` key, or `rk_test_app_*` key |
| Managed Developer endpoints | Active app-scoped `rk_managed_*` key |
| Affiliate self-service | Session or `rk_aff_*` key |
| Join (public signup) | None (creates affiliate) |
| Admin | Session + admin allowlist |
| Webhooks | Stripe signature |
| Dev endpoints | `DEV_API_SECRET` bearer (local/test only) |
| Managed provisioning | Cloud provisioning secret |

Error shape: `{ "error": { "code": "...", "message": "..." } }` via `AppError`.

---

## Meta

| Method | Endpoint | Auth | Handler |
|--------|----------|------|---------|
| GET | `/v1` | None | API index |
| GET | `/v1/me` | Session only | Current user identity, modes, optional `image` URL, and deployment edition/capabilities |
| PATCH | `/v1/me` | Session only | Update current user profile (`name`) |
| POST | `/v1/me/photo` | Session only | Upload or replace profile photo (multipart `file`; PNG/JPEG/WebP, max 1 MB) |
| DELETE | `/v1/me/photo` | Session only | Remove profile photo |

The session response includes `deployment.edition`,
`deployment.instance_url`, and capability booleans for Cloud billing,
filesystem uploads, managed Stripe, official Network, and RefKit support.
Clients must still rely on server authorization; these fields let the dashboard
avoid presenting unavailable actions.
| POST | `/v1/support` | Session only | Send a developer support request to RefKit (multipart `type`, `message`, optional `file`; PNG/JPEG/WebP, max 1 MB) |

---

## Organizations and API keys

Session auth only. Organizations are managed here; app API keys are created per app in the dashboard (App → Integration).

| Method | Endpoint | Handler |
|--------|----------|---------|
| GET | `/v1/organizations` | List user's organizations |
| POST | `/v1/organizations` | Create organization |
| GET | `/v1/api-keys` | List API keys (filter by `organization_id`; keys include `app_id` when scoped) |
| POST | `/v1/api-keys` | Create API key (`app_id` recommended for app keys) |
| DELETE | `/v1/api-keys/:id` | Revoke API key |

App keys should be scoped with `app_id`. Pass `test_mode: true` to create an `rk_test_app_*` key for local or staging integration; omit it or pass `false` only when creating a live `rk_app_*` production key. New Apps receive one reusable test key during creation, and CLI init reuses it. Live keys remain one-time values.

### Managed connections (RefKit Cloud internal)

Managed providers provision non-login Developer accounts through
`POST /v1/managed-connections/provision`. The request uses the Cloud
provisioning bearer secret plus a stable, generation-specific
`Idempotency-Key`. `external_account_id` must be an opaque provider-owned
HMAC or equivalent pseudonymous identifier, never a raw provider customer or
store identifier.

Providers must keep `external_account_id` stable across installation
generations and use a new `Idempotency-Key` for each generation. A new
generation reuses the existing non-redacted Organization and App, reconnects
the managed account, and returns a recoverable pending or freshly rotated
credential bundle. Redacted connections are terminal and are never
reconnected.

Provisioning returns one `rk_managed_*` administration key and separate live
and test App revenue keys. Raw values remain recoverable only until
`POST /v1/managed-connections/:id/credentials/:ackId/acknowledge` succeeds.
The acknowledgement ID is retained only to make acknowledgement retries
idempotent. Rotation returns a new pending bundle; acknowledging it revokes the
previous generation.

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/v1/managed-connections/provision` | Provisioning secret | Idempotently provision or reconnect one Organization, App, and managed account per provider account, rotating credentials for a new installation generation |
| POST | `/v1/managed-connections/:id/credentials/:ackId/acknowledge` | Provisioning secret | Confirm encrypted credential persistence and erase the recoverable bundle |
| POST | `/v1/managed-connections/:id/credentials/rotate` | Managed key | Rotate management, live, and test credentials |
| POST | `/v1/managed-connections/:id/suspend` | Managed key | Suspend ordinary owner and revenue access |
| POST | `/v1/managed-connections/:id/reconnect` | Managed key | Restore an installed connection |
| POST | `/v1/managed-connections/:id/uninstall` | Managed key | Mark the provider installation uninstalled |
| DELETE | `/v1/managed-connections/:id` | Managed key | Revoke credentials and sever the external-account mapping |
| POST | `/v1/managed-data-subjects/export` | Managed key | Export the allowlisted customer record, linked attribution click data, and ledger data |
| POST | `/v1/managed-data-subjects/redact` | Managed key | Delete the external customer mapping, scrub the linked click, and detach deidentified ledger records |

Management keys never authenticate capture, identify, revenue writes, or
Affiliate self-service. Suspended and uninstalled keys can call lifecycle and
privacy operations, but ordinary owner APIs require an active connection.
Customer redaction stores an opaque receipt separately from the Customer row,
so exact retries are idempotent and a later re-identification with the same
external ID creates a new generation that can be redacted independently.
Final connection redaction also removes webhook payloads and configuration,
tracking records, promotion-code mappings, data-subject receipts, payout
instruction snapshots, and every Affiliate-user association for the managed
App. Programs, Customers, and other retained ledger anchors are rewritten with
non-identifying values.

---

## Apps

| Method | Endpoint | Handler |
|--------|----------|---------|
| GET | `/v1/apps` | List apps |
| POST | `/v1/apps` | Create app |
| GET | `/v1/apps/:id` | Get app |
| PATCH | `/v1/apps/:id` | Update website, revenue source, default program, and/or Network visibility |
| POST | `/v1/apps/:id/logo` | Upload or replace app logo (multipart `file`; PNG/JPEG/WebP, max 1 MB) |
| DELETE | `/v1/apps/:id/logo` | Remove app logo |
| GET | `/v1/apps/:id/setup-status` | Mode-aware test-integration and production-readiness status. Includes `cross_currency_alarm` when a commission was blocked for currency mismatch. |
| GET | `/v1/apps/:id/overview` | Aggregated stats across all programs. `environment=test|live` selects isolated activity and defaults to `live`. |
| GET | `/v1/apps/:id/agreement` | Read current app affiliate agreement |
| PATCH | `/v1/apps/:id/agreement` | Publish a new app affiliate agreement version |

App create/update fields:

| Field | Notes |
|-------|--------|
| `website_url` | URL used to build affiliate links (`{website_url}?via=link_code`). Required before creating a program. Its origin must be unique across Apps so browser capture can resolve the App from the landing page. |
| `revenue_source` | `stripe` or `api` |
| `logo_url` | Public read-only URL returned after logo upload |
| `default_program` | Optional nested program payload on app creation. Creates the app and its first/default program atomically. |
| `default_program_id` | Read on app responses; write on app update to choose another program from the same app. |
| `network_visible` | Show the app once in the RefKit Network using its active default program. Independent of that program's hosted join page (`join_page_enabled`). |

An app logo cannot be removed while the app is visible in the RefKit Network. Hide the app first.

Program `destination_url` is optional on create and defaults to the app `website_url`. If provided, it must match.

Revenue source changes remain available while an App has only test activity or zero-value live payment history. The first positive live payment locks `revenue_source`; a live Stripe connection must be disconnected before switching to API reporting.

### Setup status

`GET /v1/apps/:id/setup-status` retains the aggregate V1 fields and adds mode-specific fields:

| Stage | Fields |
|-------|--------|
| Test integration | `test_api_key`, `test_api_key_created`, `test_api_key_used`, `test_affiliate_created`, `test_first_click`, `test_first_identify`, `test_stripe_connected`, `test_first_revenue_event`, `test_first_commission`, `test_integration_complete` |
| Production | `production_website_ready`, `live_api_key_created`, `live_api_key_used`, `live_stripe_connected`, `live_first_revenue_event`, `live_first_commission`, `production_ready` |

`test_api_key` contains the reusable app-scoped test key for setup. It is `null` for an older test key that predates recoverable test credentials; running init creates a recoverable test key in that case. Test integration completes only after the internal Test affiliate produces a non-payable test commission, or after a real affiliate has already earned a commission. Testing is optional. Production readiness requires a non-local HTTPS website URL, a live app key, and a live Stripe connection when Stripe is the revenue source. It does not require test completion or the first live payment.

The dashboard's local or staging Test website URL is browser-local UI state. It is not an App or Program API field and does not replace `website_url` or `destination_url`.

### App affiliate agreement

`GET /v1/apps/:id/agreement` - session auth. Returns the current app agreement version.

**Response** (`200`)

```json
{
  "agreement_version": {
    "id": "aagr_...",
    "version_number": 1,
    "terms_text": "Developer-written agreement text.",
    "...": "..."
  }
}
```

`PATCH /v1/apps/:id/agreement` - session auth. Creates a new immutable app agreement version.

**Request body**

```json
{
  "terms_text": "Updated developer-written affiliate agreement."
}
```

**Response** (`201`)

```json
{
  "agreement_version": { "id": "aagr_...", "version_number": 2, "terms_text": "...", "...": "..." }
}
```

New apps seed `terms_text` from a default agreement template until the developer publishes their own. Affiliate join surfaces show the developer agreement plus fixed RefKit rules (tracking, approval, and payment responsibility). RefKit rules are not developer-configurable.

---

## Programs

| Method | Endpoint | Handler |
|--------|----------|---------|
| GET | `/v1/programs` | List programs |
| POST | `/v1/programs` | Create program |
| GET | `/v1/programs/:id` | Get program |
| PATCH | `/v1/programs/:id` | Update program settings (name, join page, minimum payout, payout methods) |
| GET | `/v1/programs/:id/overview` | Program stats overview. `environment=test|live` defaults to `live`. |
| POST | `/v1/programs/:id/pause` | Pause program |
| POST | `/v1/programs/:id/resume` | Resume program |
| POST | `/v1/programs/:id/disable` | Disable program |
| POST | `/v1/programs/:id/acknowledge-disable` | Acknowledge disable notice |
| POST | `/v1/programs/:id/terms` | Publish new program terms version (commission rule only) |
| GET | `/v1/programs/:id/terms` | Read current program terms version |

### Update program settings

`PATCH /v1/programs/:id` - session auth. Updates program metadata; commission offer changes use `POST /v1/programs/:id/terms`.

**Request body** (all fields optional)

```json
{
  "name": "Affiliate Program",
  "join_page_enabled": true,
  "join_page_approval": "pending",
  "minimum_payout_amount": 5000,
  "supported_payout_methods": ["paypal"]
}
```

Program responses include `is_default`. The first program created for an app becomes its default. Change the default through `PATCH /v1/apps/:id` with `default_program_id`.

### Publish program terms

`POST /v1/programs/:id/terms` - session auth. Creates a new immutable terms version and sets it as the active default commission rule.

**Request body**

```json
{
  "commission_rule": {
    "reward_type": "percent",
    "percent_value": 25,
    "recurring_duration_months": null
  }
}
```

**Response** (`201`)

```json
{
  "terms_version": { "id": "ptv_...", "version_number": 2, "...": "..." },
  "commission_rule": { "id": "cr_...", "is_default": true, "...": "..." }
}
```

### Read current program terms

`GET /v1/programs/:id/terms` - session auth. Returns the current commission terms version for the program.

**Response** (`200`)

```json
{
  "terms_version": {
    "id": "ptv_...",
    "version_number": 1,
    "reward_type": "percent",
    "percent_value": 25,
    "...": "..."
  }
}
```

Program terms are commission-only. The developer-written affiliate agreement is versioned per app (`GET/PATCH /v1/apps/:id/agreement`).

---

## RefKit Network

| Method | Endpoint | Auth | Handler |
|--------|----------|------|---------|
| GET | `/v1/network/apps` | None | Cursor-paginated visible apps with their active default program, logo, offer, current terms version, and join URL |
| GET | `/v1/network/programs` | None | Compatibility alias for `/v1/network/apps` |

Use `limit` and the last app ID as `starting_after` for pagination. Responses allow public cross-origin reads and may be cached for up to one minute. Each app appears at most once, and changing its default program never moves existing program records.

---

## Program affiliates

| Method | Endpoint | Handler |
|--------|----------|---------|
| GET | `/v1/program-affiliates` | List program affiliates (`program_id` or `app_id`). `environment=test` returns the internal Test affiliate, while `environment=live` returns ordinary affiliates. `test_mode=true` remains supported. |
| POST | `/v1/program-affiliates` | Create / invite affiliate; `test_mode=true` idempotently creates the Program's internal Test affiliate and link without sending an invite |
| POST | `/v1/program-affiliates/:id/approve` | Approve pending affiliate |
| POST | `/v1/program-affiliates/:id/disable` | Disable affiliate |
| POST | `/v1/program-affiliates/:id/enable` | Re-enable affiliate |
| GET | `/v1/program-affiliates/:id/links` | Developer-list links for one Program Affiliate |
| POST | `/v1/program-affiliates/:id/links` | Developer-create a link for one Program Affiliate |
| PATCH | `/v1/program-affiliates/:id/links/:linkId` | Developer-update link label, destination, or UTM fields |
| DELETE | `/v1/program-affiliates/:id/links/:linkId` | Developer-delete an unused non-default link |

Affiliate responses include `is_test`, the default `link_code`, and optional `image` URL from the linked user. Internal Test affiliates are excluded from ordinary lists, live overview metrics, and payouts.

---

## Affiliate links and join

| Method | Endpoint | Auth | Handler |
|--------|----------|------|---------|
| GET | `/v1/affiliate-links` | Developer or affiliate key | List affiliate links (developer/legacy scope) |
| GET | `/v1/affiliate/programs/:programId/links` | Affiliate session/key | List links for a program membership |
| POST | `/v1/affiliate/programs/:programId/links` | Affiliate session/key | Create a named affiliate link |
| DELETE | `/v1/affiliate/programs/:programId/links/:linkId` | Affiliate session/key | Delete a named affiliate link |
| POST | `/v1/affiliate/programs/:programId/join` | Affiliate session/key | Join or request approval for a visible app's current default program |
| GET | `/v1/join/:programSlug` | None | Join page data |
| POST | `/v1/join/:programSlug` | None | Start self-signup; sends an email confirmation link |
| POST | `/v1/join/:programSlug/confirm` | Session | Confirm self-signup after the email link and create the membership |

### Join page

`GET /v1/join/:programSlug` returns program metadata, commission terms, and the current agreement:

```json
{
  "name": "My Program",
  "slug": "my-program",
  "app": {
    "name": "My App",
    "logo_url": "https://assets.example.com/logo.png"
  },
  "join_page_enabled": true,
  "join_page_approval": "active",
  "current_terms_version": {
    "id": "ptv_...",
    "version_number": 1,
    "reward_type": "percent",
    "percent_value": 20,
    "fixed_amount": null,
    "fixed_currency": null,
    "recurring_duration_months": null
  },
  "current_agreement_version": {
    "id": "aagr_...",
    "version_number": 1,
    "terms_text": "Developer-written agreement text."
  }
}
```

`current_terms_version` is the commission offer shown on the hosted join page.

`POST /v1/join/:programSlug` - public affiliate signup, step 1. Requires acceptance of the app agreement. This does not create a membership. It creates an unverified user (if needed) and emails a confirmation link so the signup only completes when the recipient proves control of the email. It is rate limited per client IP and per email.

**Request body**

```json
{
  "email": "affiliate@example.com",
  "name": "Alex Affiliate",
  "app_agreement_version_id": "aagr_...",
  "accepted_program_rules": true
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `email` | yes | Affiliate email |
| `name` | no | Display name |
| `app_agreement_version_id` | yes | Must match the current app agreement version; stale ids are rejected |
| `accepted_program_rules` | yes | Must be `true` |

Response `202` includes `status: "email_sent"` and a message. The confirmation link carries a short-lived signed token and returns the recipient to `/join/:programSlug/confirm`.

`POST /v1/join/:programSlug/confirm` - public affiliate signup, step 2. Requires the session created by the emailed magic link. The signed `token` from the confirmation link carries the program, email, name, and agreement version. The endpoint rejects the request unless the verified session email matches the token email, then records agreement acceptance and creates the membership.

**Request body**

```json
{
  "token": "<signed join token from the email link>"
}
```

Response `201` includes `affiliate`, `status` (`active` or `pending`), and a message.

### Join from the RefKit Network

`POST /v1/affiliate/programs/:programId/join` binds the membership to the authenticated affiliate. It requires the same `app_agreement_version_id` and `accepted_program_rules: true` fields. The program must be the app's active default and the app must be Network-visible. Hosted join page (`join_page_enabled`) is not required. Response `201` contains the new membership and `active` or `pending` status.

### Create affiliate link

`POST /v1/affiliate/programs/:programId/links` - affiliate session or `rk_aff_*` key.

**Request body**

```json
{
  "label": "Newsletter",
  "link_code": "newsletter",
  "destination_url": "https://example.com/pricing",
  "utm_source": "newsletter",
  "utm_medium": "email",
  "utm_campaign": "launch"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `link_code` | one of link_code/label | Value for `?via=` |
| `label` | one of link_code/label | Display name (1–120 chars); defaults to link_code if omitted |
| `destination_url` | no | Must match app website URL; defaults to it |
| `utm_*` | no | Stored on click records |

**Response** (`201`) includes `tracking_url` (`{destination}?via={link_code}` plus optional UTMs) and `is_default`.

Link codes are unique within an App (`UNIQUE (app_id, link_code)`), so the same `via` may exist on different Apps. Within one App, duplicate codes return `409 affiliate_link_code_taken`. Production affiliate links stay `{destination}?via={link_code}` because each App has one production tracking origin. Dashboard-generated Test links may add `refkit_app=` when the Test URL differs from that origin.

### Delete affiliate link

`DELETE /v1/affiliate/programs/:programId/links/:linkId` - affiliate session or `rk_aff_*` key.

Guards:

- The default link (the program affiliate's primary `link_code`) cannot be deleted (`400 default_affiliate_link_immutable`).
- Links with recorded clicks cannot be deleted (`409 affiliate_link_has_clicks`).

**Response** (`200`) returns the deleted link payload.

---

## Affiliate self-service

| Method | Endpoint | Auth | Handler |
|--------|----------|------|---------|
| GET | `/v1/affiliate/data-export` | Affiliate session/key | GDPR data export |
| POST | `/v1/affiliate/delete-account` | Affiliate session/key | Delete affiliate account |

---

## Tracking and attribution

| Method | Endpoint | Handler |
|--------|----------|---------|
| POST | `/v1/capture` | Record a click from first-party tracking parameters (app backend recommended; browser SDK fallback) |
| GET | `/v1/clicks` | List clicks. Developer reads accept `environment=test|live` and default to `live`. |
| GET | `/v1/referrals` | List referrals (`program_id` or `app_id`). Developer reads accept `environment=test|live` and default to `live`. Each row includes `customer_email` and `customer_external_customer_id` when available for dashboard display. |
| POST | `/v1/identify` | Identify customer from the app backend |

### Capture click

`POST /v1/capture` supports two intentionally different modes:

- **Authenticated server capture (recommended):** use an app-scoped
  `rk_app_*` or `rk_test_app_*` key. The app backend may forward the
  original visitor IP and user agent.
- **Public browser capture (fallback):** no authorization. RefKit derives
  metadata from the request and ignores body-supplied visitor metadata.

The app API key is server-side only. Never embed it in browser JavaScript.
RefKit intentionally does not allow `Authorization` in this endpoint's public
CORS preflight.

**Request body**

```json
{
  "via": "john",
  "page": "https://app.example/pricing?via=john",
  "referrer": "https://search.example",
  "visitor_ip": "203.0.113.10",
  "visitor_user_agent": "Mozilla/5.0 ..."
}
```

`john` is an example. Use the real link code from an affiliate link in the RefKit dashboard.

| Field | Required | Notes |
|-------|----------|-------|
| `via` | yes | Link code from `via`; unique within an App; 1-60 characters |
| `page` | no for authenticated capture; required for public capture unless `refkit_app` is set | Absolute landing-page URL. Public capture uses its origin to resolve the App. |
| `referrer` | no | Absolute referrer URL |
| `refkit_app` | no | Public capture only. App ID hint for dashboard Test links whose origin differs from the App production website. |
| `visitor_ip` | no | Authenticated server capture only; valid IPv4 or IPv6 address, at most 45 characters |
| `visitor_user_agent` | no | Authenticated server capture only; 1-1024 characters |

Authenticated capture resolves `app_id` from the API key, then `via`. Public browser capture resolves `app_id` from `refkit_app` when present, otherwise from the `page` origin, then `via`.

RefKit stores a one-way hash of the IP address, not the raw address. If either
visitor field is omitted during authenticated capture, RefKit falls back to
metadata from the request that reached RefKit.

**cURL**

```bash
curl https://app.refkit.net/v1/capture \
  -H "Authorization: Bearer $REFKIT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "via": "john",
    "page": "https://app.example/pricing?via=john",
    "referrer": "https://search.example",
    "visitor_ip": "203.0.113.10",
    "visitor_user_agent": "Mozilla/5.0 ..."
  }'
```

**PHP**

```php
<?php
session_start();

$via = $_GET["via"] ?? null;

if ($via) {
    $payload = array_filter([
        "via" => $via,
        "page" => "https://app.example" . ($_SERVER["REQUEST_URI"] ?? "/"),
        "referrer" => $_SERVER["HTTP_REFERER"] ?? null,
        // Behind a proxy, use your framework's trusted-proxy client IP helper.
        "visitor_ip" => $_SERVER["REMOTE_ADDR"] ?? null,
        "visitor_user_agent" => $_SERVER["HTTP_USER_AGENT"] ?? null,
    ], static fn ($value) => $value !== null && $value !== "");

    $request = curl_init("https://app.refkit.net/v1/capture");
    curl_setopt_array($request, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => [
            "Authorization: Bearer " . $_ENV["REFKIT_API_KEY"],
            "Content-Type: application/json",
        ],
        CURLOPT_POSTFIELDS => json_encode($payload, JSON_THROW_ON_ERROR),
    ]);

    $body = curl_exec($request);
    $status = curl_getinfo($request, CURLINFO_RESPONSE_CODE);
    curl_close($request);

    if ($status >= 200 && $status < 300 && $body !== false) {
        $result = json_decode($body, true, flags: JSON_THROW_ON_ERROR);

        if (!empty($result["click_id"])) {
            $_SESSION["refkit_click_id"] = $result["click_id"];
        }
    }
}
```

Recommended integration flow:

1. The app backend reads `via` from the landing request. The unique code
   resolves the affiliate link and its Program.
2. It calls `POST /v1/capture` with its app-scoped API key and original
   visitor metadata.
3. It stores the returned `click_id` in its secure session, first-party
   cookie, or database.
4. On signup, it sends that `click_id` to `POST /v1/identify`.
5. Apps without practical backend middleware use `@refkitnet/sdk/browser`
   as the fallback after any required consent.

**Response** (`200`)

```json
{ "click_id": "clk_..." }
```

A paused program or inactive affiliate returns `{ "click_id": null }`,
preserving the browser SDK response contract. A disabled Program returns
`404 program_not_found`; an unknown link returns `404 affiliate_link_not_found`.
An authenticated key cannot capture a link owned by another App and receives
the link not-found response.
Organization-wide app keys return `400 app_scope_required`.

### Identify customer

`POST /v1/identify` requires an App revenue key. Ordinary App keys must send
`click_id` for last-click attribution. A managed provider integration using a
managed revenue key may instead send direct promotion-code evidence:

```json
{
  "external_customer_id": "opaque_customer_hmac",
  "attribution_evidence": {
    "type": "promotion_code",
    "value": "AFFILIATE10",
    "program_id": "prg_...",
    "program_affiliate_id": "aff_..."
  }
}
```

The Program must have promotion-code fallback enabled and the Affiliate must
be active in the key's Test or Live mode. Ordinary App keys cannot submit
clickless promotion-code evidence. When both `click_id` and promotion evidence
are present, the valid click wins. Promotion-code attribution stores
`click_id: null`; RefKit never creates a synthetic click. Managed connections
must omit `email` and use only opaque external customer IDs.

The response includes `attribution_source: "click" | "promotion_code"` and a
nullable `click_id` in both the main result and `stripe_metadata`.

---

## Transactions and commissions

| Method | Endpoint | Handler |
|--------|----------|---------|
| GET | `/v1/transactions` | List transactions (`program_id` or `app_id`). `environment=test|live` isolates a mode; omitting it preserves the combined API response. |
| POST | `/v1/transactions` | Report payment (`revenue_source=api` apps only; app API key) |
| POST | `/v1/transactions/refunds` | Report refund (`revenue_source=api` apps only; app API key) |
| POST | `/v1/transactions/disputes` | Report dispute lifecycle (`revenue_source=api` apps only; app API key) |
| GET | `/v1/commissions` | List commission entries (`program_id`, `app_id`, or affiliate scope). Developer reads accept `environment=test|live`; omitting it preserves the combined API response. |

### Report payment

`POST /v1/transactions` - app API key (`rk_app_*` or `rk_test_app_*`). App must have `revenue_source=api`.

**Request body**

```json
{
  "payment_id": "your-subscription-invoice-id",
  "customer_id": "cus_...",
  "program_id": "prg_...",
  "amount": 2900,
  "currency": "usd",
  "paid_at": "2026-07-10T12:00:00.000Z"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `payment_id` | yes | Your stable id for this payment (idempotency key) |
| `customer_id` | yes | RefKit customer id from `/v1/identify` |
| `program_id` | yes | Program the payment belongs to |
| `amount` | yes | Non-negative integer, minor units (cents). Zero records history without commission. |
| `currency` | yes | Lowercase ISO 4217 (3 letters) |
| `paid_at` | no | ISO 8601 datetime; defaults to now |

**Response** (`201` created, `200` replay)

```json
{
  "transaction_id": "txn_...",
  "commission_entry_id": "ce_...",
  "attributed": true,
  "livemode": false,
  "created": true
}
```

| Error code | HTTP | When |
|------------|------|------|
| `revenue_source_conflict` | 409 | App uses Stripe, not API reporting |
| `invalid_amount` | 400 | Amount is negative |
| `cross_currency_unsupported` | 400 | Currency differs from Program currency |
| `transaction_id_conflict` | 409 | Same `payment_id` with different details |
| `customer_not_found` / `program_not_found` | 404 | Invalid ids or wrong app scope |

### Report refund

`POST /v1/transactions/refunds` - **app-scoped** API key only (key must be tied to the app).

**Request body**

```json
{
  "refund_id": "your-refund-id",
  "payment_id": "your-subscription-invoice-id",
  "amount": 1450,
  "refunded_at": "2026-07-10T13:00:00.000Z"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `refund_id` | yes | Your stable id for this refund (idempotency key) |
| `payment_id` | yes | `payment_id` from the original reported payment |
| `amount` | yes | Positive integer, minor units; cumulative refunds plus active disputes cannot exceed payment |
| `refunded_at` | no | ISO 8601 datetime; defaults to now |

**Response** (`201` created, `200` replay)

```json
{
  "transaction_id": "txn_...",
  "commission_entry_id": "ce_...",
  "livemode": false,
  "created": true
}
```

Refunds inherit `livemode` from the parent payment. Idempotent replays return the stored transaction even when the payment is fully refunded.

| Error code | HTTP | When |
|------------|------|------|
| `app_scope_required` | 400 | Org-wide key used instead of app-scoped key |
| `refund_exceeds_payment` | 400 | Refunds plus opened or lost dispute exposure would exceed payment amount |
| `transaction_id_conflict` | 409 | Same `refund_id` with different parent or amount |
| `payment_not_found` | 404 | Unknown `payment_id` for this app |

### Report dispute

`POST /v1/transactions/disputes` - **app-scoped** API key only. Report each provider dispute state against its accepted parent payment.

**Request body**

```json
{
  "dispute_id": "your-dispute-id",
  "payment_id": "your-subscription-invoice-id",
  "status": "opened",
  "amount": 2900,
  "occurred_at": "2026-07-10T14:00:00.000Z"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `dispute_id` | yes | Stable identity for the complete dispute lifecycle |
| `payment_id` | yes | `payment_id` from the original reported payment |
| `status` | yes | `opened`, `won`, `withdrawn`, `lost`, or `funds_reinstated` |
| `amount` | yes | Positive integer, minor units; refunds plus opened or lost dispute exposure cannot exceed the payment |
| `occurred_at` | no | ISO 8601 datetime for this lifecycle event; defaults to now |

**Response** (`201` new dispute identity, `200` transition or replay)

```json
{
  "dispute_id": "your-dispute-id",
  "payment_transaction_id": "rtxn_...",
  "status": "opened",
  "commission_entry_id": null,
  "livemode": false,
  "created": true,
  "updated": false
}
```

`opened` holds approved commission. `won` and `withdrawn` restore it. `lost` creates a proportional reversal. `funds_reinstated` creates the matching reinstatement after a loss. A terminal state may arrive before `opened`; a delayed `opened` replay cannot regress it.

| Error code | HTTP | When |
|------------|------|------|
| `app_scope_required` | 400 | Org-wide key used instead of app-scoped key |
| `invalid_dispute_amount` | 400 | Amount is not positive, or refunds plus opened or lost disputes would exceed the payment |
| `dispute_id_conflict` | 409 | Same `dispute_id` reused for another payment or amount |
| `dispute_status_conflict` | 409 | A conflicting terminal outcome follows a terminal outcome |
| `payment_not_found` | 404 | Parent payment is absent or belongs to the other mode |

### Revenue delivery and corrections

- Report successful initial payments and renewals as separate payments with stable IDs.
- Report the parent payment before any refund or dispute. A `payment_not_found` response is retryable after the payment is accepted.
- Across one payment, cumulative refunds plus disputes in `opened` or `lost` cannot exceed the original amount. Won, withdrawn, and reinstated disputes no longer consume that balance.
- Exact payment, refund, and dispute replays are harmless. Test and Live identities are isolated.
- Accepted identity details are immutable. Correct a payment with a new refund identity and, when needed, a new payment identity. Do not edit accepted events in place.
- Subscription cancellation and failed payment attempts are not revenue events.
- Unattributed payments remain in transaction history, create no commission, and set the existing unattributed-revenue setup alarm.
- Test activity and zero-value live payments do not lock the App source. The first positive live payment locks it.

| Method | Endpoint | Handler |
|--------|----------|---------|
| POST | `/v1/commissions/:id/release` | Release commission for payout |
| POST | `/v1/commissions/:id/reject` | Reject commission |

---

## Outgoing webhooks

Each App may configure one outgoing HTTPS endpoint. Secrets are shown only when the endpoint is created or rotated and are stored encrypted. Delivery signs `timestamp.rawBody` with HMAC-SHA256 and sends `X-RefKit-Webhook-Id`, `X-RefKit-Webhook-Event`, `X-RefKit-Webhook-Timestamp`, `X-RefKit-Webhook-Signature`, and `X-RefKit-Webhook-Version` headers.

Delivery is best-effort and single-attempt with a three-second timeout. A failed delivery is recorded and never rolls back the originating operation. There is no replay or automatic retry API.

Payload shape: `{ id, type, created_at, livemode, app_id, data }`.

Supported event types: `affiliate.created`, `affiliate.approved`, `affiliate.disabled`, `referral.created`, `transaction.created`, `transaction.refunded`, `commission.created`, `commission.reversed`, `commission.paid`, `payout.ready`, `payout.succeeded`, and `payout.failed`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/v1/apps/:appId/webhook` | Read the App webhook configuration |
| PUT | `/v1/apps/:appId/webhook` | Create or update URL, enabled state, and event subscriptions |
| DELETE | `/v1/apps/:appId/webhook` | Remove the endpoint while retaining delivery history |
| POST | `/v1/apps/:appId/webhook/rotate-secret` | Rotate and reveal a new signing secret once |
| POST | `/v1/apps/:appId/webhook/test` | Send and record one `webhook.test` delivery |
| GET | `/v1/apps/:appId/webhook/deliveries` | List delivery attempts |

Hosted deployments reject private, loopback, and link-local targets. Self-hosted deployments may set `WEBHOOK_ALLOW_PRIVATE_NETWORKS=true` when an internal HTTPS target is intentional.

## Payouts

Payout details are stored per affiliate user, method, and **program currency** (`usd`, `eur`, etc.). Both `GET` and `PUT /v1/payout-details` require `program_id` (query or body) so details resolve to the program's currency.

Payout requests allocate specific commission entries (`payout_request_items`). Developers read the live Ready to pay list and mark each affiliate's aggregated payout paid after paying outside RefKit. CSV export and direct Mark paid create the internal audit batch silently. A request is fulfilled only when every allocated entry is paid and amounts match. Post-payout refunds create `recovery_debt` entries that reduce payable balance.

Payout batch statuses: `draft`, `prepared` (snapshotted and awaiting manual completion or dispatch), `paid`, `cancelled`.

| Method | Endpoint | Handler |
|--------|----------|---------|
| GET | `/v1/payout-details` | Get affiliate payout details (`program_id` required) |
| PUT | `/v1/payout-details` | Update payout details (`program_id` in body) |
| GET | `/v1/payout-balance` | Get available payout balance |
| GET | `/v1/payout-requests` | List payout requests (`program_id`, `app_id`, or affiliate scope) |
| POST | `/v1/payout-requests` | Create payout request |
| POST | `/v1/payout-requests/:id/decline` | Decline payout request |
| GET | `/v1/ready-payouts?program_id=...` | List current affiliate payouts ready to pay |
| POST | `/v1/ready-payouts/csv` | Snapshot and download the current program payout CSV |
| POST | `/v1/ready-payouts/:programAffiliateId/mark-paid` | Snapshot and mark one current affiliate payout paid |
| POST | `/v1/payout-batches` | Create payout batch |
| GET | `/v1/payout-batches` | List payout batches (`program_id`, `app_id`, or affiliate scope) |
| GET | `/v1/payout-batches/:id/items` | List items in a batch |
| GET | `/v1/payout-batches/:id/csv` | Download payout CSV |
| POST | `/v1/payout-batches/:id/affiliates/:programAffiliateId/mark-paid` | Mark one affiliate's aggregated payout paid; snapshots details if needed |
| POST | `/v1/payout-batches/:id/items/:itemId/resolve` | Resolve payout item issue |
| POST | `/v1/payout-batches/:id/mark-paid` | Legacy/admin completion after resolving individual items |
| POST | `/v1/payout-batches/:id/cancel` | Cancel payout batch |
| POST | `/v1/payout-batches/:id/dispatch` | Create one external execution per Affiliate and emit `payout.ready`; requires an enabled subscription |
| GET | `/v1/payout-executions/:id` | Fetch execution and payout instructions; exact App-scoped live key only |
| POST | `/v1/payout-executions/:id/succeeded` | Report success and reuse Mark paid; exact App-scoped live key plus `Idempotency-Key` |
| POST | `/v1/payout-executions/:id/failed` | Report failure without releasing payout items; exact App-scoped live key plus `Idempotency-Key` |

`payout.ready` contains the execution ID but not payout instructions. The external system fetches instructions from the execution endpoint. Test keys and organization-wide keys are rejected. `failed` may later transition to `succeeded`; `succeeded` is terminal. An identical repeated callback is idempotent, while a conflicting callback returns `409`.

---

## Stripe App

| Method | Endpoint | Handler |
|--------|----------|---------|
| POST | `/v1/stripe/connect-link` | Generate a signed Stripe App install URL and store a pending install. Session requests pass `livemode=false` for Test mode or `livemode=true` for Live mode. |
| POST | `/v1/stripe/claim-pending-install` | Claim a Stripe `account.application.authorized` install for the pending RefKit app |
| POST | `/v1/stripe/disconnect` | Mark the app's live (default) or test Stripe connection as disconnected |

The signed install state records the expected Stripe mode. RefKit rejects an
authorization from the other mode before it can create or replace a connection.

Install callbacks (browser redirects, not part of `/v1` contract):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/stripe/install/callback` | Verify the signed install and store `stripe_connections` |
| GET | `/api/stripe/install/post-install` | Finish install from Stripe's post-install button using the session + pending install |

---

## Admin (`/v1/admin/*`)

All require an administrator session. Cloud additionally requires
`ADMIN_EMAIL_ALLOWLIST`; Self-Hosted trusts the database administrator flag.

| Method | Endpoint | Handler |
|--------|----------|---------|
| GET | `/v1/admin/organizations` | List all organizations |
| GET | `/v1/admin/organization-members` | List organization members (`role` filter) |
| POST | `/v1/admin/users` | Create an invited user and send a signup magic link |
| POST | `/v1/admin/email-diagnostic` | Send an email-delivery diagnostic to the current administrator |
| GET | `/v1/admin/apps` | List all apps |
| POST | `/v1/admin/apps/:id/integration-issue` | Flag integration issue |
| GET | `/v1/admin/programs` | List all programs |
| POST | `/v1/admin/programs/:id/disable` | Admin-disable program |
| GET | `/v1/admin/program-affiliates` | List all program affiliates |
| POST | `/v1/admin/program-affiliates/:id/disable` | Admin-disable program affiliate |
| GET | `/v1/admin/clicks` | List all clicks |
| GET | `/v1/admin/referrals` | List all referrals |
| GET | `/v1/admin/customers` | List all customers |
| GET | `/v1/admin/transactions` | List all transactions |
| GET | `/v1/admin/commission-entries` | List all commission entries |
| POST | `/v1/admin/commission-adjustments` | Manual commission adjustment |
| GET | `/v1/admin/stripe-connections` | List Stripe connections |
| GET | `/v1/admin/stripe-events` | List ingested Stripe events (`processing_status`, `attention_only=true` filters) |
| POST | `/v1/admin/stripe-events/:id/reprocess` | Synchronously reprocess a Stripe event |
| GET | `/v1/admin/payout-requests` | List all payout requests |
| GET | `/v1/admin/payout-batches` | List all payout batches |
| GET | `/v1/admin/payout-batches/:id/csv` | Download admin payout CSV |
| GET | `/v1/admin/payout-items` | List all payout items |
| GET | `/v1/admin/audit-logs` | List admin audit logs |

---

## Non-`/v1` routes

These are not part of the public `/v1` contract but are part of the running app.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/health` | None | Build identity and process health |
| GET | `/api/health/live` | None | Liveness check |
| GET | `/api/health/ready` | None | Configuration, database, and release-migration readiness |
| GET/POST | `/api/self-hosted/setup` | Setup token for POST | Read bootstrap status or create the one-time first administrator |
| GET/POST | `/api/auth/*` | Varies | Better Auth (magic link, bearer, device) |
| POST | `/api/auth/register` | None | Create/update an unverified account and send its signup magic link |
| POST | `/api/webhooks/stripe` | Stripe signature | Stripe Connect webhook ingestion |
| GET | `/api/stripe/install/callback` | Signed Stripe App redirect | Complete Stripe App installation |
| GET | `/api/stripe/install/post-install` | Stripe post-install button | Complete install when the signed redirect did not run |
| POST | `/v1/capture` | None or app-scoped API key | Record an affiliate click from `?via=` |
| POST | `/api/dev/stripe/inject` | `DEV_API_SECRET` | Inject and synchronously process a fixture webhook (dev/test) |
| POST | `/api/dev/stripe/sandbox-connect` | Session or `DEV_API_SECRET` | Sandbox Stripe Connect (dev/test) |

Public browser fallback (`POST /v1/capture`):

```json
{ "via": "alice", "page": "https://acme.com/pricing?via=alice" }
```

Returns `{ "click_id": "clk_..." }` when the program and affiliate are active.

`POST /api/auth/register` accepts `{ "name", "email", "primary_mode": "owner" | "affiliate", "callback_url"? }`. It returns `202 { "status": true }`; a verified duplicate returns `409 account_exists`. This app-auth route is not part of the public `/v1` wrapper contract.

---

## Wrapper coverage

When adding or changing an endpoint, update these consumers:

| Consumer | Update location |
|----------|-----------------|
| API index | `src/app/api/v1/route.ts` |
| CLI | `packages/cli/src/api.ts` + relevant `commands/*.ts` |
| MCP | `packages/mcp/src/tools/*.ts` |
| SDK | Only if identify/tracking surface changes (`packages/sdk/src/`) |
| Integration tests | `tests/integration/*.test.ts` |
| This doc | Relevant section above |
| Integration guidance | Public package READMEs and `docs/self-hosting/` |

See `AGENTS.md` for the full change-propagation checklist.
