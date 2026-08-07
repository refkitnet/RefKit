# refkitnet

Command-line interface for the RefKit affiliate platform. All operations call the RefKit REST API.

## Install

```bash
npm install -g refkitnet
```

Or run without installing:

```bash
npx refkitnet <command>
```

## Quick start

```bash
refkitnet auth login
refkitnet init
refkitnet status
```

The CLI is an optional helper for JavaScript apps. Any backend can integrate
directly through the [manual REST API guide](https://refkit.gitbook.io/docs/integrate-refkit/manual-setup),
or hand the work to a coding agent with the [AI coding agent guide](https://refkit.gitbook.io/docs/integrate-refkit/ai-coding-agent).

The dashboard can hand off a specific integration without extra selection
prompts:

```bash
refkitnet init --app-id app_... --program-id prg_...
```

Set `REFKIT_API_URL` to override the API base (default `https://app.refkit.net`).
When a custom origin is configured, CLI help and init output direct users to operator-provided documentation instead of RefKit Cloud guides.

Run `refkitnet --help` or `refkitnet <command> --help` to see the matching Help Center links.

## Local CLI fixture

[`fixtures/react-app`](./fixtures/react-app) is a tracked customer application
used to exercise `refkitnet init` from outside the monorepo application. Build
the CLI, start the RefKit app, then run the CLI from the fixture directory:

```powershell
cd C:\Dev\RefKit
npm run build:cli
npm run dev:app

cd packages\cli\fixtures\react-app
node ..\..\dist\index.js init --api-url http://localhost:3000 --app-id app_... --program-id prg_...
```

The automated CLI test copies this fixture to a temporary directory and runs
the compiled CLI against a local mock REST server. It uses
`--skip-sdk-install` so tests do not access the npm registry; normal user setup
still installs the SDK by default.

## Commands

| Command | Description |
| --- | --- |
| `refkitnet auth login` | Sign in via device authorization |
| `refkitnet auth logout` | Clear stored session |
| `refkitnet init` | Optional JavaScript setup wizard; installs the SDK and creates or reuses an app-scoped test key (`--live` for a live key) |
| `refkitnet apps create` | Create an app |
| `refkitnet programs create` | Create a program with commission rule (`--recurring-duration-months`) |
| `refkitnet affiliates create` | Create or invite an affiliate |
| `refkitnet apps update` | Change an app default program or Network visibility |
| `refkitnet apps disconnect-stripe` | Disconnect live Stripe before switching to API reporting |
| `refkitnet network list` | Browse listed programs in the RefKit Network |
| `refkitnet network join` | Join a listed program after accepting its current app agreement |
| `refkitnet links list` | List own links, or a Developer-managed Affiliate's links with `--affiliate-id` |
| `refkitnet links create` | Create an own link with `--program-id`, or a Developer-managed Affiliate link with `--affiliate-id`; accepts a stable `--link-code` and optional UTM fields |
| `refkitnet links update` | Update label or UTM fields for a Developer-managed Affiliate link |
| `refkitnet links delete` | Delete an unused non-default own or Developer-managed Affiliate link |
| `refkitnet apps agreement publish` | Publish a new app affiliate agreement |
| `refkitnet programs terms publish` | Publish a new program terms version |
| `refkitnet commissions list` | List commission entries (`--environment test|live` optionally isolates a mode) |
| `refkitnet payouts ready` | List affiliate payouts ready to pay |
| `refkitnet payouts download` | Download the current ready-to-pay CSV |
| `refkitnet payouts pay-affiliate` | Mark one affiliate payout paid |
| `refkitnet payouts create` | Create an internal payout batch (advanced) |
| `refkitnet payouts resolve-item` | Resolve an internal payout item (advanced) |
| `refkitnet payouts mark-paid` | Complete an internal payout batch (advanced) |
| `refkitnet payouts dispatch` | Send a prepared batch to the configured payout system |
| `refkitnet payouts execution` | Fetch one execution with a live App-scoped key |
| `refkitnet payouts execution-succeeded` | Report external payout success with an idempotency key |
| `refkitnet payouts execution-failed` | Report external payout failure with an idempotency key |
| `refkitnet webhooks get` | Read an App webhook configuration |
| `refkitnet webhooks configure` | Create or update an App webhook |
| `refkitnet webhooks test` | Send one test delivery |
| `refkitnet webhooks rotate-secret` | Rotate and reveal the signing secret once |
| `refkitnet webhooks deliveries` | List recent delivery attempts |
| `refkitnet webhooks remove` | Remove the endpoint |
| `refkitnet status` | Show test-integration and production-readiness checklists for an app |

Payout execution commands use `--api-key` or `REFKIT_API_KEY`. The key must be live and scoped to the exact App. Webhook configuration and dispatch commands use the authenticated CLI session.

## License

MIT
