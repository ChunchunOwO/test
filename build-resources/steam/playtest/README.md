# ECHO Playtest Steam assets

Target App ID: `5105150`.

These exports are derived only from ECHO-owned artwork and ECHO UI QA captures:

- `build-resources/icons/software.png`
- `misc/eq-pro-live-spectrum-final.png`
- `misc/crossfeed-after.png`

The generator removes the bottom player strip from both UI captures so the final assets do not contain album covers, artist names, lyrics, local paths, or other user-library content.

`library_hero.png` deliberately contains no title text or logo. All other title treatment is limited to the product name `ECHO` and the official `PLAYTEST` subtitle.

Run `node misc/steamworks/create-playtest-assets.mjs` to regenerate the PNG files and `asset-manifest.json`.
