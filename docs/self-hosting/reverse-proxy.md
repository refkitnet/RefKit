# Reverse proxy and TLS

The supported topology leaves DNS, TLS certificates, and the reverse proxy on
the host. RefKit listens on `127.0.0.1:3000` by default. This loopback binding is
important because request handlers trust the proxy-provided client address.

## Caddy reference

Copy `deploy/self-hosted/Caddyfile.example` into the host Caddy configuration,
replace the hostname, and reload Caddy. Caddy obtains and renews TLS
certificates automatically when public DNS and ports 80 and 443 are correct.

The example:

- redirects HTTP to HTTPS through Caddy's automatic HTTPS behavior
- replaces client-supplied forwarding headers with proxy-derived values
- forwards the original host and HTTPS scheme for secure cookies and magic links
- limits request bodies to 2 MB, which covers the current 1 MB upload limit plus multipart overhead
- uses a 30-second upstream response timeout

`APP_URL` must exactly match the external origin in the Caddy site label. Do not
set it to the loopback upstream.

## Validate

```bash
curl --fail --show-error https://refkit.example.com/api/health/live
curl --fail --show-error https://refkit.example.com/api/health/ready
curl --head https://refkit.example.com/sign-in
```

Then complete a magic-link sign-in and confirm that the email URL uses the
public HTTPS origin. Also verify a request through the proxy records a client IP
hash, not the proxy's loopback address.

Keep the application port on loopback and keep PostgreSQL unexposed. If the
proxy runs in another container, attach only that proxy and the application to
a dedicated frontend network instead of publishing the application port to all
interfaces.
