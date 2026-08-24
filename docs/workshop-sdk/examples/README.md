# Functional plug-in examples

These focused examples complement the complete `plugin-basic` starter. Copy only the example you need, then declare its matching contribution, capability and fixed `networkHosts` entry in the outer manifest.

- `lyrics-source`: user-selectable lyrics candidates from sanitized track metadata.
- `author-agent`: an author-defined local Agent handler.
- `network-source`: a paged catalog that resolves only to a direct, authorized HTTP(S) stream.
- `listen-together`: the API 2 local-track share task; it never receives a local path.
- `metadata-provider`: selectable metadata and cover candidates.
- `complete-ui-theme`: a declarative appearance contribution; it does not execute code.

Run generated projects with `npm test` in the local mock host. Network requests are intentionally disabled there; production requests remain capability-gated and limited to declared hosts.
