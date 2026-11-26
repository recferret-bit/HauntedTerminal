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

## Kiroween Project Page Pack

Declarative specs for the 5 size-capped GIFs (`< 5 MB` each) and 10 high-res (`1920x1080`) project-page PNG stills:

| Spec File | Output | Description |
|---|---|---|
| `kiroween-01-gameplay.video.json` | `out/kiroween/gifs/01-gameplay.gif` | Matrix Fault -> `chmod -x` Petrify & RAM pickup (`level:2`), `pkill -STOP` ice & `pkill -9` (`level:8`), Matrix Hub `deepseek` (`level:7`). |
| `kiroween-02-bosses-enemies-fx.video.json` | `out/kiroween/gifs/02-bosses-enemies-fx.gif` | Kernel Boss (`level:11`) fault/`/dev/null`/`SIGKILL`, Exploit (`level:9`), `fx.matrix-cast`, `fx.matrix-fault`, and `boss.forkbomb`. |
| `kiroween-03-terminal.video.json` | `out/kiroween/gifs/03-terminal.gif` | Matrix Error/OK + `pkill -STOP` across 6 terminal skins, single brief lantern reveal (`level:3`), F1 Field Manual & F3 Map. |
| `kiroween-04-laptop.video.json` | `out/kiroween/gifs/04-laptop.gif` | In-game `mv laptop ~` pickup -> smooth 3D clamshell lid open & dive -> BIOS + HAUNTED/OS 3.1 splash -> JS Pad & Web Weaver. |
| `kiroween-05-comix.video.json` | `out/kiroween/gifs/05-comix.gif` | 3D animated Comix Zone intro (`KRAKOOM!`, `KRSSSH!`, `SHLUUURRP!`) and dawn outro return. |
| `kiroween/screenshots.spec.json` | `out/kiroween/images/*.png` | 10 × `1920x1080` stills: Home, Steam Launch Pass dialog, Desktop Builds, Achievements, all labs, editors & Field Manual. |

```bash
# Regenerate the 10 Kiroween project-page screenshots
node scripts/harness/social-media.mjs screenshots --spec social/media/specs/kiroween/screenshots.spec.json --out social/media/out/kiroween/images

# Regenerate the 5 Kiroween video/GIF bundles
for s in kiroween-01-gameplay kiroween-02-bosses-enemies-fx kiroween-03-terminal kiroween-04-laptop kiroween-05-comix; do
  node scripts/harness/social-media.mjs video "social/media/specs/${s}.video.json" --out "social/media/out/kiroween/video/${s}"
done
```
