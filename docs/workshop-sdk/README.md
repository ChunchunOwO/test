# ECHO Workshop SDK

This folder is the portable developer kit for ECHO Steam Workshop. SDK version `1` targets Workshop manifest schema `1` and sandbox plug-in API `2`.

The original `1.0.0` runnable SDK starter is available as public Steam Workshop item
[`3784997717`](https://steamcommunity.com/sharedfiles/filedetails/?id=3784997717).
It includes the initial portable kit and a minimal plug-in that can be enabled in an API 2 ECHO build. SDK `1.1.0` remains local until that Workshop item is updated through a separate confirmed publication action.

It contains:

- `echo-workshop-plugin.d.ts`: editor completion for the sandbox `echo` global;
- `echo-workshop-sdk.json`: machine-readable supported-version contract;
- `schemas/`: JSON Schema hints for manifests and `.echo` packages;
- `bin/echo-workshop-sdk.mjs`: zero-dependency project generator, mock host and preflight checker;
- `templates/`: six official content templates plus a GitHub Actions validation workflow;
- `examples/`: focused lyrics, Agent, network source, Listen Together, metadata and complete-theme examples.

The JSON Schemas improve editor feedback. ECHO's production parser remains authoritative and may enforce cross-file, hash, size and runtime-policy checks that JSON Schema cannot express.

## Quick start from the packed SDK

```powershell
node .\bin\echo-workshop-sdk.mjs init .\my-plugin `
  --id echo.my-plugin `
  --title "My Plugin" `
  --holder "Workshop Author" `
  --kind plugin-package

cd .\my-plugin
npm test
npm run quality
```

The generator creates a complete project with a valid outer manifest, TypeScript declarations, a preview placeholder and a CI workflow. `--kind` accepts `theme`, `lyrics-style`, `visualizer-preset`, `dsp-preset`, `audio-plugin-profile` or `plugin-package`. For plug-ins, edit `src/plugin.js`; for data content, edit the generated JSON entry. `npm run sync` refreshes SHA-256 and validates the project.

`npm test` loads plug-ins in a deterministic local mock host and exercises registered commands, Agents, source providers, lyrics providers, metadata and cover providers without reading a real library or making network requests. `npm run dev` exposes the same report at `http://127.0.0.1:41783` and refreshes it when the source changes. This author-controlled local tool is not the production sandbox and must not be used as proof of Steam-client behavior.

`npm run quality` checks preview dimensions and aspect ratio, description, update notes, tags, compatibility, placeholders and project documentation. Blockers return a non-zero exit code; warnings remain author decisions.

Inside the ECHO source repository, the same project can additionally use the production authoring path:

```powershell
npm run workshop:author -- validate path\to\my-plugin
npm run workshop:author -- prepare path\to\my-plugin
```

## Commands

```text
echo-workshop-sdk init <directory> --id <id> --title <title> --holder <holder> [--kind <kind>] [--min-version <version>]
echo-workshop-sdk sync <directory>
echo-workshop-sdk validate <directory>
echo-workshop-sdk quality <directory>
echo-workshop-sdk test <directory>
echo-workshop-sdk dev <directory> [--port <port>]
echo-workshop-sdk doctor
```

These commands never upload or publish anything. Steam upload remains an explicit action in ECHO's Authoring Studio or the repository authoring CLI.

## Compatibility

- Prefer plug-in API `2` for new projects.
- Declare the oldest ECHO version actually tested in `compatibility.minEchoVersion`.
- Treat versions absent from `echo-workshop-sdk.json` as unsupported.
- Read [MIGRATING.md](./MIGRATING.md) before raising schema or API versions.

## License

This SDK is distributed as part of ECHO and is governed by the repository's ECHO Source-Available License. It is not an open-source license. Generated Workshop content remains the author's content, subject to ECHO's license, Steam Workshop terms and any third-party rights used by that content.
