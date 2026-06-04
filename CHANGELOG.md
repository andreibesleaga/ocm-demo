# Changelog

All notable changes to this project are documented here, following
[Keep a Changelog](https://keepachangelog.com/) and [SemVer](https://semver.org/).

## [Unreleased]

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
