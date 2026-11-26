# Declarative Gameplay Video, Screenshot, Infographic & Audio Harness (`social/media/`)

Captures real **Out Of Credits** 3D *Comix Zone* gameplay (`/play`), animated 3D comix (`/cinematic.html`), clamshell laptop coding (`/laptop-lab`), hardcover Field Manual (`/manual`), and procedural 3D reliefs (`/storybook.html`) on a deterministic stepped clock in headless Chrome over CDP, layers pure-time *Comix Zone* ink-framed overlays, mixes in-game audio (`public/music/`, `public/sfx/`) plus ElevenLabs voiceovers, and encodes MP4s, size-capped GIFs, PNG stills, high-DPI infographics, and `contact.jpg` QA sheets.

## Declarative Specs (`social/media/specs/`)

| Spec File | Format & Target | Description |
|---|---|---|
| `x-teaser.video.json` | `24.0s` · `1280x720` (`16:9`) | Muted-autoplay X teaser: storm pull -> `ls -la` & `kill -9` -> Laptop JS repair -> Dad's Matrix Hub -> PID 1 & Steam CTA. |
| `youtube-trailer.video.json` | `48.0s` · `1920x1080` (`16:9`) | Full Steam & YouTube Official Gameplay Trailer across 7 escalating scenes with `battle_boss` tracker bed & in-game SFX. |
| `tiktok-hook.video.json` | `16.0s` · `1080x1920` (`9:16`) | Native vertical TikTok / YouTube Shorts clip opening on Frame 0 with live terminal typing, `chmod -x` petrification & PID 1 countdown. |
| `screenshots.spec.json` | `10` × `1920x1080` PNGs | Batch capture of 10 signature gameplay, comix, laptop, manual, boss, and Steam hub stills. |
| `infographics.spec.json` | `6` × `2880x1620` PNGs | High-DPI (`1920x1080 @ 1.5x DPR`) *Comix Zone* + PCB schematic cards with overflow-checked SVG flow diagrams. |
| `audio-cues.json` | ElevenLabs TTS / SFX / Music | Declarative social voiceovers (`vo_tiktok_hook`, `vo_x_teaser`, `vo_youtube_trailer`, `vo_clod_social_taunt`), sting & loop prompts. |

## Commands

```bash
# Validate all specs offline (0 network calls)
node scripts/harness/social-media.mjs --check

# Render fast preview or production video (also callable via `node social/media/make.mjs <spec.json>`)
node scripts/harness/social-media.mjs video social/media/specs/x-teaser.video.json --preview
node scripts/harness/social-media.mjs video social/media/specs/x-teaser.video.json

# Render a specific time slice (seconds a-b) or remux audio without recapturing 3D frames
node scripts/harness/social-media.mjs video social/media/specs/youtube-trailer.video.json --only 0-6 --keep
node scripts/harness/social-media.mjs video social/media/specs/x-teaser.video.json --remux

# Attach an in-game cue, external .mp3, or spec audio plan onto any existing .mp4 / .mov
node scripts/harness/social-media.mjs video --add-audio clip.mp4 title_theme

# Capture screenshots & render infographics (filterable by id substring)
node scripts/harness/social-media.mjs screenshots
node scripts/harness/social-media.mjs screenshots 03-gpu-alley
node scripts/harness/social-media.mjs infographics

# Plan or generate ElevenLabs social voiceovers/stings (dry-run by default; --generate capped at 15k credits)
node scripts/harness/social-media.mjs audio list
node scripts/harness/social-media.mjs audio plan vo_tiktok_hook
```
