# @refkitnet/mcp

RefKit MCP server for AI agents - manage affiliate programs, check integration setup, and wire the REST API or JavaScript SDK into your app.

Runs locally over stdio. Talks to the RefKit REST API at `https://app.refkit.net`.

## Install

No global install required. Configure your agent to run:

```bash
npx -y @refkitnet/mcp
```

Or install globally:

```bash
npm install -g @refkitnet/mcp
refkit-mcp
```

**Local monorepo development:** build and run from repo root:

```bash
npm run build:mcp
node packages/mcp/dist/index.js
```

## Authentication

**Developers (session):** log in once with the RefKit CLI. The MCP reads the same config file.

```bash
npx refkitnet auth login
```

Config is stored at `~/.refkitnet/config.json`.

**Affiliate tools:** set an affiliate API key (`rk_aff_...`) in the environment, or use a session token from `refkitnet auth login`.

**Revenue and payout execution tools:** set `REFKIT_API_KEY` to a key scoped to the exact App. Test keys report isolated revenue. Payout execution still requires a live key.

| Variable | Purpose |
|----------|---------|
| `REFKIT_TOKEN` | Override session token |
| `REFKIT_AFFILIATE_KEY` | Affiliate API key for affiliate tools |
| `REFKIT_API_KEY` | App-scoped test or live key for revenue tools; live key for payout execution |
| `REFKIT_API_URL` | API base URL (default `https://app.refkit.net`) |

## Cursor

```json
{
  "mcpServers": {
    "refkit": {
      "command": "npx",
      "args": ["-y", "@refkitnet/mcp"]
    }
  }
}
```

Run `npx refkitnet auth login` in your terminal first.

For local monorepo development of this package (from repo root after `npm run build:mcp`), use:

```json
{
  "mcpServers": {
    "refkit": {
      "command": "node",
      "args": ["packages/mcp/dist/index.js"]
    }
  }
}
```

The same configuration can be used while iterating on the MCP itself.

## Claude Code

Add to `~/.claude/settings.json` or project MCP config:

```json
{
  "mcpServers": {
    "refkit": {
      "command": "npx",
      "args": ["-y", "@refkitnet/mcp"]
    }
  }
}
```

## Tools

### Integration

| Tool | Description |
|------|-------------|
| `get_auth_status` | Check auth and login instructions |
| `get_help` | Return the matching Cloud Help Center page, or operator-doc guidance for a custom origin |
| `get_setup_status` | Mode-aware test integration and production readiness status |
| `create_stripe_connect_link` | Stripe Connect onboarding URL |
| `disconnect_stripe` | Disconnect live or test Stripe before switching to API reporting |
| `list_api_keys` | List API keys |
| `create_api_key` | Create app or affiliate key (`test_mode=true` while integrating) |
| `revoke_api_key` | Revoke a key |

### Provider-neutral revenue (App key)

| Tool | Description |
|------|-------------|
| `report_payment` | Report a successful payment or renewal, including zero-value history |
| `report_refund` | Report a completed partial or full refund |
| `report_dispute` | Report `opened`, `won`, `withdrawn`, `lost`, or `funds_reinstated` |

### Developer management (session)

Organizations, apps (including `publish_app_agreement`), programs (including `recurring_duration_months` and `publish_program_terms`), affiliates, clicks, referrals, payments, commissions, and ready payouts (including `list_ready_payouts` and `mark_affiliate_payout_paid`). Developer-managed Affiliate links use `list_owned_affiliate_links`, `create_owned_affiliate_link`, `update_owned_affiliate_link`, and `delete_owned_affiliate_link`.

Developer read tools for overview, affiliates, clicks, referrals, transactions, and commissions accept `environment: "test" | "live"` where the REST endpoint supports mode isolation.

### Webhooks and external payouts

Session tools: `get_webhook`, `configure_webhook`, `test_webhook`, `rotate_webhook_secret`, `list_webhook_deliveries`, `remove_webhook`, and `dispatch_payout_batch`.

Live App-key tools: `get_payout_execution`, `report_payout_succeeded`, and `report_payout_failed`.

### Affiliate (affiliate key or session)

`update_app`, `browse_refkit_network`, `join_refkit_network_program`, `list_affiliate_links`, `list_program_affiliate_links`, `create_program_affiliate_link`, `delete_program_affiliate_link`, `get_payout_balance`, `request_payout`, `get_payout_details`

## Typical agent workflow

1. `get_auth_status` - confirm logged in
2. `get_help` - open the current setup guide instead of duplicating it in the MCP response
3. Follow the selected Help Center page in the Customer App
4. `create_stripe_connect_link` - connect Stripe
5. `get_setup_status` - verify clicks, identify, and commissions are flowing

Canonical setup guides:

- [Manual setup](https://refkit.gitbook.io/docs/integrate-refkit/manual-setup)
- [AI coding agent setup](https://refkit.gitbook.io/docs/integrate-refkit/ai-coding-agent)

## License

The MCP server source is MIT licensed. The RefKit name and packaged icon are excluded from the MIT grant. See [BRAND_NOTICE.md](./BRAND_NOTICE.md).
