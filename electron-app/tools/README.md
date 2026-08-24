# Windows bundled tools

This directory is copied to packaged Windows resources as `resources/tools`.

Expected files for a Windows package:

```text
ffmpeg.exe
avcodec-62.dll
avformat-62.dll
avutil-60.dll
swresample-6.dll
FFMPEG-LICENSE.txt
ffmpeg-manifest.json
```

`ffmpeg.exe` is required for the Windows release gate. Large binaries stay out of git, so prepare the pinned FFmpeg build from `ffmpeg-manifest.json` before packaging:

```bash
npm run prepare:win-ffmpeg
npm run verify:ffmpeg
```

The pinned BtbN LGPL shared archive also supplies the FFmpeg development root under `.electron-cache/ffmpeg/development/`. The native audio host links against that same root, so do not replace only `ffmpeg.exe` or source FFmpeg DLLs from another installation.
