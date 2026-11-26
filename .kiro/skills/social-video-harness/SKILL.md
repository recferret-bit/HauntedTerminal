---
name: social-video-harness
description: "[SOCIAL] Capture real Out Of Credits 3D Comix Zone gameplay, animated comix, laptop coding, and procedural models from 100% declarative JSON specs (`social/media/specs/`), mix in-game music/SFX (`public/music/`, `public/sfx/`) and credit-capped ElevenLabs voiceovers, and render MP4s, size-capped GIFs, 1920x1080 screenshots, 2880x1620 infographics, and QA contact sheets."
---

# Declarative Social Video, Screenshot, Infographic & Audio Harness

Turns any campaign idea for **X**, **YouTube / Steam**, or **TikTok / Shorts** into a **100% declarative JSON spec** in `social/media/specs/`, drives the real **Out Of Credits** engine (`/play`, `/cinematic.html`, `/storybook.html`, `/laptop-lab`, `/manual`, `/`) deterministically on a stepped virtual clock in headless Chrome over CDP, layers pure-time **1995 *Comix Zone*** ink-framed overlays, mixes in-game music + SFX + ElevenLabs voiceovers, and encodes `.mp4`, `.min.mp4`, `.gif`, `.min.gif`, `.tiny.gif`, PNG stills, high-DPI infographics, and `contact.jpg` QA sheets.

---

## 1. Non-Negotiable Guardrails

1. **100% Declarative Specs (Zero Hardcoded Content):**
   - Every scene (`play`, `comix`, `storybook`, `laptop`, `page`), terminal skin, setup step, timed typing/command/modal event, transition, *Comix Zone* caption/pill/burst/dialog/card, and audio mix MUST live in `social/media/specs/*.json`.
   - Always use `{chapter}` and `{level:N}` (and `{ "solution": { "level": N, "count": K } }`) rather than hardcoding chapter or level folder names in harness scripts.
2. **1995 *Comix Zone* Visual Contract (`credits-art-direction`):**
   - Heavy `#110e1b` ink borders (`3px–4px solid`) + hard offset shadows (`6px 6px 0 #110e1b`), zero soft drop-shadow blurs.
   - Comic paper/amber caption boxes (`#ffd166`, `#f4f1ea`) with `#110e1b` ink text, `#ff6a13` Vibecoder orange CTAs, `#3ddc84` phosphor command pills, `#39d0ff` data cyan laptop tags, `#ff3b8b` malware magenta boss alerts.
   - Fonts: self-hosted `Chakra Petch` (uppercase comic display) and `IBM Plex Mono` (terminal commands & telemetry).
   - Pure function of `videoT`: zero CSS wall-clock `transition` or `@keyframes` in overlays (`scripts/harness/lib/social-overlay.mjs`).
3. **In-Game Audio First + Capped ElevenLabs Generation:**
   - Never import external third-party songs. Reference in-game music beds by cue ID (`"title_theme"`, `"battle_boss"`, `"battle_loop"`, `"cine_intro"`, `"hub_matrix"`, etc. in `public/music/`) and SFX/robot taunts by cue ID (`"lightning"`, `"petrify"`, `"kill"`, `"taunt_clod_1"`, `"kiro_advice"`, etc. in `public/sfx/`).
   - Keep `"autoGameSfx": true` on gameplay videos so real keystrokes and `window.__game.events()` (`KernelEvent`s) automatically mix their authentic in-game SFX cues into the MP4.
   - For new social narration, hooks, or promo stings, add a declarative entry to `social/media/specs/audio-cues.json` and run `node scripts/harness/social-media.mjs audio plan <id>` (**dry-run by default**). Pass `--generate` **only** when the user explicitly asked to generate audio; the wrapper enforces the 15,000-credit per-run cap, 30,000-credit reserve, and macOS Keychain OAuth login (`elevenlabs auth login`).
4. **Parody & Title Gates:**
   - Use only parody AI names (**Anti-Gravy**, **Codec**, **Gork**, **Clod** — `npm run quality:brands`) and canonical title **Out Of Credits** (`npm run quality:legacy-name`).

---

## 2. Commands

```bash
# 1. Offline validation of all specs, audio cue references & market research JSON (0 network calls)
node scripts/harness/social-media.mjs --check

# 2. Fast half-res 12fps preview -> ALWAYS inspect social/media/out/video/<name>-preview/contact.jpg FIRST!
node scripts/harness/social-media.mjs video social/media/specs/x-teaser.video.json --preview
node scripts/harness/social-media.mjs video social/media/specs/tiktok-hook.video.json --preview

# 3. Render a time slice (seconds a-b) while tuning a single scene
node scripts/harness/social-media.mjs video social/media/specs/youtube-trailer.video.json --only 6-13 --keep

# 4. Full production render (.mp4, .min.mp4, .gif, .min.gif, .tiny.gif, contact.jpg, timeline.json)
node scripts/harness/social-media.mjs video social/media/specs/x-teaser.video.json
node scripts/harness/social-media.mjs video social/media/specs/youtube-trailer.video.json
node scripts/harness/social-media.mjs video social/media/specs/tiktok-hook.video.json

# 5. Remux audio onto an already-rendered video (~1s, zero 3D frame recapture) or attach audio to any .mp4
node scripts/harness/social-media.mjs video social/media/specs/x-teaser.video.json --remux
node scripts/harness/social-media.mjs video --add-audio clip.mp4 title_theme

# 6. Capture 1920x1080 gameplay stills & render 2880x1620 Comix+PCB infographics
node scripts/harness/social-media.mjs screenshots
node scripts/harness/social-media.mjs infographics

# 7. Plan or generate ElevenLabs social audio cues
node scripts/harness/social-media.mjs audio list
node scripts/harness/social-media.mjs audio plan vo_tiktok_hook
```

---

## 3. Declarative Spec Reference (`scripts/harness/lib/social-spec.mjs`)

- **Top-level video fields:** `name`, `platform` (`"x" | "youtube" | "tiktok" | "shorts" | "steam"`), `fps` (`12..60`), `width`, `height` (`1080x1920` default on `tiktok`/`shorts`/`look:"vertical"`, `1280x720` or `1920x1080` on `16:9`), `maxSeconds`, `look` (`"comix" | "big" | "vertical"`), `crop` (`"square" | "vertical"`), `ticker`, `badge`, `gif`, `audio` (`music`, `voiceover`, `cues[]`, `autoGameSfx`), `scenes[]`.
- **Scene modes (`scenes[].mode`):**
  - `"play"`: `level` (`1..11`) or `url`, `skin` (`"iterm2" | "vt100" | "putty" | "gnome-terminal" | "windows-terminal" | "terminal-app"`), `setup[]` (command strings, `{ "solution": { "level": N, "count": K } }`, `{ "ticks": N }`, `{ "wait": ms }`, or `{ "until": expr }`), `events[]` (`type`, `submit`, `typeAndSubmit`, `modal`, `skin`, `tick`).
  - `"comix"`: `comix: { "slug": "intro" | "outro", "from": sec, "to": sec }` — scrubs `window.__cinematic.seek(t)` deterministically.
  - `"storybook"`: `storybook: { "inspect": "<modelId>", "bg": "floor1..5", "state": "normal|walk|attack|...", "from": 0, "to": 4, "guides": false, "ui": false }` — steps `window.__storybook` animation time across `[from, to]`.
  - `"laptop"`: `laptop: { "state": "desktop", "speed": 0, "task": "js-add" | "web-style" | ..., "ui": false }` — mounts the clamshell 486 laptop without dev sidebar chrome and optionally opens a live JS Pad / Web Weaver coding task.
  - `"page"`: `page: { "url": "/manual?cmd=chmod", "scrollY": [0, 240] }`.
- **Overlays:** `transition` (`cut`, `flash`, `flash-amber`, `glitch`, `whip`, `zoom`, `dip`, `punch`), `bumper`, `captions[]`, `pills[]` (`pos: "top-left" | "top-center" | "top-right" | "above-caption"`), `bursts[]` (comic SFX starbursts), `dialogs[]`, `shots[]` (PiP images, responsive across `16:9`, `1:1`, `9:16`), `card`.

---

## 4. Mandatory Visual QA Loop

1. Run `--check` first, then `--preview` (`12 fps` half-res -> `social/media/out/video/<name>-preview/contact.jpg`).
2. Read `contact.jpg` (and `screenshots/contact.jpg` or `infographics/contact.jpg`) to verify:
   - Frame 0 hooks immediately with live 3D comic geometry + legible text (never a black or blank frame).
   - Overlays leave the center 3D stage and xterm prompt unobstructed across `16:9`, `1:1`, and `9:16`.
   - Zero browser console/runtime errors reported by `social-media.mjs`.
3. Only after `contact.jpg` passes visual inspection, run the full production render.
