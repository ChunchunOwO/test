# Steam client icon assets

`app-icon-184.jpg` is the opaque Steamworks **App Icon** candidate for both ECHO (`5105090`) and ECHO Playtest (`5105150`). It must be uploaded to each App ID separately; this repository change does not publish Steamworks metadata.

The corresponding transparent application assets are:

- `build-resources/icons/echo-app-icon.png`
- `build-resources/icons/echo-app-icon.ico`

## Source and processing

- Character reference: `src/renderer/assets/echo-mascot-lemon-rabbit-q.png` (ECHO project-owned artwork).
- User-approved transparent desktop shortcut source: `build-resources/icons/software.png` and `build-resources/icons/software.ico` (the pre-v2 icon treatment).
- User-approved Steam square concept: `build-resources/icons/echo-app-icon-concepts/echo-steam-square-integrated-v3.png`.
- Generated with OpenAI's built-in image generation on 2026-08-15 as an opaque, full-bleed square composition optimized for 16-32 px readability.
- The Steam JPG uses the concept's integrated illustrated background because Steamworks App Icons are JPG and cannot preserve alpha; it is not derived from the transparent desktop shortcut icon.
- No third-party logo, character, font, photo, or user-library media is included.
