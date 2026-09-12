# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/) and [SemVer](https://semver.org/).

## [Unreleased]

### Fixed
- The map no longer shows OpenStreetMap's "Access blocked" tiles. Two independent
  causes: `helmet`'s default `Referrer-Policy: no-referrer` stripped the `Referer`
  header the OSMF tile servers require, and the demo used the long-deprecated
  `{s}.tile.openstreetmap.org` rotating-subdomain host. A refusal arrives as
  *200 OK* carrying a "blocked" image, so Leaflet never raised `tileerror` and the
  failure was invisible to the app.

### Changed
- Basemap tiles now come from keyless vector providers with automatic failover —
  OpenFreeMap, then VersaTiles, then OSM raster only if the browser has no WebGL.
  Both vector providers permit production use and ask only for attribution.
  See `public/basemap.js`.
- MapLibre GL and its Leaflet bridge are served from this app's own origin
  (`public/vendor/`, refreshed by `scripts/vendor-map-libs.sh`) rather than a CDN.
  MapLibre GL 6 is required: the attribution sanitizer bypass GHSA-jrc7-96c5-q579
  is fixed in 6.4.1 and has no 5.x patch.
- The basemap follows the light/dark theme toggle.

### Changed
- MCP client now uses the official `@modelcontextprotocol/sdk` (proper `initialize`
  handshake + automatic latest-protocol negotiation), replacing the hand-rolled
  per-request JSON-RPC client. Public `listTools`/`callTool` interface and the
  `/api/mcp` response shape are unchanged.

### Added
- `GET /healthz` liveness probe.
- `helmet` and configurable `express-rate-limit` middleware.
- `mcp-client.js` alias (clearer name for the MCP client).
- `examples/standalone.js` and `docs/mcp-contract.md`.
- Vitest + supertest test suite (`npm test`).
- CI workflow, Dependabot, and governance files (SECURITY, CODE_OF_CONDUCT, CONTRIBUTING).

### Fixed
- MCP child process now handles `error` events instead of crashing the server.
- Nominatim requests now send a compliant `User-Agent` header.
- 500 responses are sanitized when `NODE_ENV=production` (no internal leakage).
- `POST /api/mcp` validates the `command` field (returns `400` when missing).

### Security
- `npm audit fix` applied — 0 known vulnerabilities (no breaking upgrades).
