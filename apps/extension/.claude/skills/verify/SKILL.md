---
name: verify
description: Verify extension changes by driving the real built bundle in headless Chromium against real listing-site HTML (archived or live), capturing content-script console output as evidence.
---

# Verifying the LandMatch Chrome extension

## Build

```bash
pnpm --filter @landmatch/extension build   # dist/ = manifest + content/main.js + sw + sidepanel
```

## Drive the real extension headlessly

Branded Google Chrome ≥137 ignores `--load-extension`; use Playwright's Chromium
(`~/Library/Caches/ms-playwright/chromium-*/chrome-mac/Chromium.app/Contents/MacOS/Chromium`).

```bash
"$CHROMIUM" --headless=new --disable-gpu --no-first-run --user-data-dir=$(mktemp -d) \
  --load-extension=<repo>/apps/extension/dist \
  --enable-logging=stderr --v=0 --timeout=12000 --dump-dom \
  "<listing url>" > /dev/null 2> chrome.log
grep "LandMatch" chrome.log   # INFO:CONSOLE lines carry content-script logs
```

Evidence lines: `[LandMatch] Content script loaded on: <url>` (injection/manifest
works) and `[LandMatch] Enriching: <address>` (extractor produced a listing).
Chromium often never exits on pages with long-polling — rely on the Bash tool
timeout and read the log afterwards; the console lines land within ~2s.

## Real listing pages when sites block headless traffic

Zillow (PerimeterX), LandFlip (Cloudflare), LandWatch all block headless/curl.
Craigslist postings expire in ~30–45 days, so search-indexed URLs are usually 404.

Get real HTML from the Wayback Machine (CDX prefix search, then `id_` snapshot):

```bash
curl "http://web.archive.org/cdx/search/cdx?url=<host>/<path-prefix>&matchType=prefix&collapse=urlkey&limit=50&from=2024&filter=statuscode:200"
curl -L --compressed "https://web.archive.org/web/<ts>id_/<original-url>" -o page.html
# some snapshots come back gzipped even with --compressed; check with `file`
```

Serve it under the REAL hostname so the manifest matches and extractors see the
real URL — self-signed TLS + host remap:

```bash
openssl req -x509 -newkey rsa:2048 -keyout key.pem -out cert.pem -days 2 -nodes -subj "/CN=x"
node serve.mjs page.html   # any https server on 8443 returning the file for every path
# add to the chromium flags:
--host-resolver-rules="MAP www.zillow.com 127.0.0.1:8443" --ignore-certificate-errors
```

Then navigate to the original listing URL. Works for any of the supported hosts.

## Gotchas

- LandFlip has no Wayback snapshots (robots); sister site FARMFLIP
  (`farmflip.com/farm/<id>`) runs the identical platform markup — use its
  snapshots as a proxy.
- The service worker throws at startup in dev builds loaded this way
  (`VITE_API_BASE_URL must be an https:// URL in production builds`) — content
  script still runs; harmless for extractor verification.
- Real LandFlip/FLIP pages carry only BreadcrumbList JSON-LD; listing data is
  DOM-only (`.address` → nested `<address><p>street</p><p>county</p>`, `.acres`,
  h1, title/meta description).
