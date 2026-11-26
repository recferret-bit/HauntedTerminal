# Out Of Credits — Declarative Social Media Studio & $1M Launch Engine (`social/`)

Declarative video, screenshot, infographic, and ElevenLabs audio workspace for **Out Of Credits**, managed by the **`smm-agent`** Kiro Crew member and grounded in [`docs/marketing/MARKET_RESEARCH_1M_REVENUE.md`](../docs/marketing/MARKET_RESEARCH_1M_REVENUE.md) and [`docs/STEAM_RELEASE_PLAYBOOK.md`](../docs/STEAM_RELEASE_PLAYBOOK.md).

## Contents

| Path | Purpose |
|---|---|
| [`README.md`](./README.md) | Multi-platform strategy (**X**, **YouTube / Shorts**, **TikTok**), $1M Steam funnel targets, and human-publish safety rules. |
| [`research/competitors-and-benchmarks.json`](./research/competitors-and-benchmarks.json) | Structured Steam & social comparable dataset (*Hacknet*, *The Farmer Was Replaced*, *Turing Complete*, *Duskers*, *Grey Hack*, *TIS-100*, *EXAPUNKS*, *Bitburner*, *Buckshot Roulette*, *Inscryption*) and $1M gross revenue conversion math. |
| [`campaigns/x-launch-threads.md`](./campaigns/x-launch-threads.md) | Copy-ready **X (Twitter)** launch posts, 5-part technical architecture thread, `#WishlistWednesday`, and `#ScreenshotSaturday` templates. |
| [`campaigns/youtube-trailer-and-devlogs.md`](./campaigns/youtube-trailer-and-devlogs.md) | **YouTube & Steam** 48s gameplay trailer storyboard, 10-minute engineering devlog outline, teleprompter script, and creator outreach kit. |
| [`campaigns/tiktok-vertical-hooks.md`](./campaigns/tiktok-vertical-hooks.md) | **TikTok & YouTube Shorts** (`1080x1920` `9:16`) `<0.8s` Frame-0 hooks, seamless loop scripts, and micro-creator brief. |
| [`media/`](./media/) | Declarative video, screenshot, infographic, and ElevenLabs audio specs (`media/specs/*.json`) plus git-ignored deliverables (`media/out/`). |

## Quick Commands

```bash
# Offline check of all declarative social specs, audio cue references & market research JSON
npm run social:check

# Fast half-resolution 12fps video previews (inspect contact.jpg first!)
npm run social:video -- social/media/specs/x-teaser.video.json --preview
npm run social:video -- social/media/specs/youtube-trailer.video.json --preview
npm run social:video -- social/media/specs/tiktok-hook.video.json --preview

# Full production renders (.mp4, .min.mp4, .gif, .min.gif, .tiny.gif, contact.jpg, timeline.json)
npm run social:video -- social/media/specs/x-teaser.video.json
npm run social:video -- social/media/specs/youtube-trailer.video.json
npm run social:video -- social/media/specs/tiktok-hook.video.json

# Capture 10 high-resolution (1920x1080) gameplay, comix, laptop & manual stills
npm run social:screenshots

# Render 6 high-DPI (2880x1620) Comix Zone + PCB marketing infographics
npm run social:infographics

# List in-game + social audio cues or dry-run ElevenLabs voiceovers/stings (0 credits spent)
npm run social:audio -- list
npm run social:audio -- plan vo_tiktok_hook vo_x_teaser
```

## Non-Negotiable Safety & Brand Rules

1. **Parody Names Only (`npm run quality:brands`):** Always refer to the story's rival AI supervisors by their parody names (**Anti-Gravy**, **Codec**, **Gork**, **Clod**) — never real AI company or product names.
2. **Canonical Title (`npm run quality:legacy-name`):** The game is **Out Of Credits**.
3. **100% Declarative & Real Engine Capture:** Every scene, command, overlay, and audio mix lives in `social/media/specs/*.json` using `{chapter}` and `{level:N}` placeholders. Never hardcode level slugs in harness scripts or fake non-existent mechanics.
4. **ElevenLabs Credit Cap:** Social audio dry-runs by default (`plan <id>`); `--generate` requires explicit user authorization and enforces the 15,000-credit per-run cap and 30,000-credit reserve via macOS Keychain OAuth.
5. **Human Publishes:** `smm-agent` prepares specs, renders local MP4/PNG/GIF packages, and drafts copy; a human reviews `contact.jpg`, listens to the audio mix, and publishes to X, YouTube, TikTok, and Steamworks.
