# ECHO Workshop SDK changelog

## 1.1.0 — 2026-08-17

- Added complete generators for all six Workshop content kinds.
- Added deterministic `test` fixtures and a hot-reloading local `dev` mock host.
- Added the `quality` publication-readiness report.
- Added focused examples for lyrics, Agents, authorized direct sources, Listen Together, metadata and complete appearance themes.

## 1.0.0 — 2026-08-17

- Published the machine-readable SDK contract.
- Added sandbox plug-in API v2 TypeScript declarations.
- Added JSON Schema hints for outer manifests and plug-in packages.
- Added a zero-dependency `init`, `sync`, `validate` and `doctor` CLI.
- Added a basic plug-in starter and GitHub Actions validation template.

Compatibility policy: additive API v2 declarations may land in SDK 1.x. Removing or changing an existing API surface requires a new plug-in API version and a migration note.
