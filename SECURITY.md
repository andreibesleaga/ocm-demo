# Security Policy

> This is a proof-of-concept demo, not a production service.

## Supported versions

Only the latest `main` is supported.

## Reporting a vulnerability

Please report security issues privately to the maintainer (or via GitHub Security Advisories on this repository).
Do not open public issues for undisclosed vulnerabilities.

We aim to acknowledge reports within 7 days and follow a 90-day coordinated
disclosure window.

## Notes

- `OCM_API_KEY` is optional and must be supplied via environment/`.env` (which is
  gitignored). Never commit real keys.
- Error responses are sanitized when `NODE_ENV=production`.
