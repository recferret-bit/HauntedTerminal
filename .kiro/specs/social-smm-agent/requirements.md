# Social Media Harness & SMM Agent: requirements

Status: done (requirements, design and tasks approved from user `/boost` directive 2026-11-26)

Capability: port the declarative `social/` video, screenshot, and infographic production workflow from `TerraAgent` into **Out Of Credits** (`social/` + `scripts/harness/social-media.mjs` + `scripts/harness/lib/social-*.mjs`), wired exclusively to **Out Of Credits**' existing in-game audio (`public/music/`, `public/sfx/`) and the credit-capped ElevenLabs CLI pipeline (`scripts/harness/lib/audio-gen-cli.mjs`), and add a ninth Kiro Crew team agent, `smm-agent`, paired with `[SOCIAL]` skills and saved Steam/social comparable research aimed at a **$1,000,000 gross revenue** funnel across **X**, **YouTube**, and **TikTok**.

## Requirements

### Declarative `social/` folder & media harness

1. THE SYSTEM SHALL add `social/` as an allowed root directory in `scripts/quality/check-root.mjs` and `.kiro/steering/structure.md`, keeping generated renders under git-ignored `social/media/out/` (`SHARED_OUTPUTS` in `scripts/hooks/agent-scope.mjs`).
2. THE SYSTEM SHALL provide a deterministic, zero-LLM media harness (`scripts/harness/social-media.mjs` with thin `social/media/{make,capture-screenshots,render-infographics}.mjs` shims) driven 100% by declarative JSON specs in `social/media/specs/` (`*.video.json` / `*.json`, `screenshots.spec.json`, `infographics.spec.json`, `audio-cues.json`) with zero hardcoded chapter, level, or comix scene IDs in harness code (`{chapter}` and `{level:N}` placeholders resolved against `chapters/<slug>/chapter.manifest.json`).
3. WHEN rendering a video spec (`social-media.mjs video <spec.json>`), THE SYSTEM SHALL capture real **Out Of Credits** surfaces (`mode`: `"play"`, `"comix"`, `"storybook"`, `"laptop"`, `"page"`) in headless Chrome over CDP on a deterministic stepped/virtual clock (`window.__stage.freeze(true)` + `window.__stage.advance(ms)` and seeded `Math.random`), execute declarative `setup` steps and timed `events[]` (`type`, `submit`, `typeAndSubmit`, `modal`, `skin`, `tick`, `scroll`), layer pure-time *Comix Zone* overlays (ink-framed captions, SFX bursts, command pills, callout dialogs, PiP shots, transitions, end cards) across `16:9` (YouTube / X / Steam), `1:1` (`crop: "square"`), and `9:16` (`1080x1920` TikTok / YouTube Shorts), and encode `.mp4`, `.min.mp4`, `.gif`, `.min.gif`, `.tiny.gif`, `contact.jpg`, and `timeline.json` via `ffmpeg` (`FFMPEG_BIN`, `PATH`, or pinned `ffmpeg-static`).
4. WHEN `social-media.mjs video` runs with `--preview`, `--only <a-b>`, `--remux`, `--compress`, `--silent`, `--audio <file|cue>`, or `--add-audio <in.mp4> <audio|spec.json>`, THE SYSTEM SHALL support fast half-res previewing, time-slice rendering, lossless video-copy soundtrack remuxing, and external/spec audio attachment without recapturing frames.
5. WHEN `social-media.mjs screenshots` runs, THE SYSTEM SHALL capture high-resolution (`1920x1080` or spec-declared) in-game, comix, laptop, manual, and storybook stills from declarative `social/media/specs/screenshots.spec.json`, fail on browser runtime errors, and write `social/media/out/screenshots/<id>.png`, `manifest.json`, and `contact.jpg`.
6. WHEN `social-media.mjs infographics` runs, THE SYSTEM SHALL render high-DPI comic-book / PCB marketing & Steam/social cards from declarative `social/media/specs/infographics.spec.json`, verify zero layout overflow, zero SVG text overflow, and decoded embedded images, and write `social/media/out/infographics/<id>.png`, `manifest.json`, and `contact.jpg`.

### In-game audio & ElevenLabs generation (no ported audio files)

7. THE SYSTEM SHALL NOT copy any audio or video binaries from `TerraAgent`; instead, video specs SHALL resolve in-game music beds (`public/music/<id>.mp3`), timed in-game SFX/voice cues (`public/sfx/<id>.mp3`), and optional `autoGameSfx: true` (mapping captured `window.__game.events()` via `src/audio/sfx-kernel.ts` parity rules and typing keystrokes to timestamped `public/sfx/` cues) and mix them cleanly via `ffmpeg` (`adelay`, `atrim`, `afade`, `volume`, `amix`).
8. WHEN generating new social voiceovers, narration, or promo stings (`social-media.mjs audio plan <id>... [--generate]`), THE SYSTEM SHALL read declarative rows from `social/media/specs/audio-cues.json`, reuse `scripts/harness/lib/audio-gen-cli.mjs` (`CAP = 15,000` credits per run, `RESERVE = 30,000` remaining credits, macOS Keychain OAuth login check, zero `.env` or API key reads), default to dry-run (`--dry-run`) unless `--generate` is passed, post-process via `ffmpeg` (`-3 dBFS` peak + silence trim), and write `social/media/out/audio/<id>.mp3` + `manifest.json`.
9. THE SYSTEM SHALL restrict `social-media.mjs ... --generate` in `scripts/hooks/agent-shell-guard.mjs` to `smm-agent` and `sound-designer`, while keeping `scripts/harness/social-media.mjs` and `scripts/harness/lib/social-*.mjs` owned by `lead-dev` so credit-spending agents cannot raise their own cap.

### Market research, `[SOCIAL]` skills & the `smm-agent` Kiro Crew member

10. THE SYSTEM SHALL perform and save concrete research on comparable terminal, programming, hacking, and retro-CRT indie games on Steam and social media (`Hacknet`, `Duskers`, `Turing Complete`, `The Farmer Was Replaced`, `Grey Hack`, `TIS-100`, `EXAPUNKS`, `Bitburner`, `Buckshot Roulette`, `Inscryption`) plus Chris Zukowski (*How To Market A Game*) wishlist/Next Fest conversion math for reaching **$1,000,000 gross revenue** in `docs/marketing/MARKET_RESEARCH_1M_REVENUE.md` and structured `social/research/competitors-and-benchmarks.json`.
11. THE SYSTEM SHALL add a `[SOCIAL]` skill category in `check-agents.mjs` and `.kiro/steering/skills-map.md`, shipping `.kiro/skills/social-video-harness/SKILL.md` (declarative video, screenshot, infographic, in-game & ElevenLabs audio workflow) and `.kiro/skills/smm-revenue-playbook/SKILL.md` (comparable-backed content playbooks for **X**, **YouTube / Shorts**, **TikTok**, and the Browser Demo -> Steam Wishlist -> Next Fest -> $1M launch funnel, grounded in **Out Of Credits**' 1995 *Comix Zone* mood, terminal combat, Laptop coding, Matrix Dad Hubs, and parody Big Four lore).
12. THE SYSTEM SHALL add `smm-agent` as the ninth agent in `scripts/harness/agents-build.mjs`, generate `.kiro/agents/smm-agent.json`, write `.kiro/agents/prompts/smm-agent.md`, wire `subagent/smm-agent` into `lead-dev`, keep every agent's `file://` resources under Kiro CLI's 32-file / 100,000-character limit, and give `smm-agent` exclusive write ownership of `social/*.md`, `social/campaigns/**`, `social/research/**`, `social/media/README.md`, `social/media/specs/**`, and `docs/marketing/**`.
13. THE SYSTEM SHALL ship ready-to-render declarative specs and multi-platform campaign scripts for **X** (`social/media/specs/x-teaser.video.json`, `social/campaigns/x-launch-threads.md`), **YouTube** (`social/media/specs/youtube-trailer.video.json`, `social/campaigns/youtube-trailer-and-devlogs.md`), and **TikTok / Shorts** (`social/media/specs/tiktok-hook.video.json` at native `1080x1920`, `social/campaigns/tiktok-vertical-hooks.md`), plus `screenshots.spec.json`, `infographics.spec.json`, and `audio-cues.json`.

### Gates

14. WHEN `node scripts/harness/social-media.mjs --check` runs, THE SYSTEM SHALL offline-validate every JSON spec in `social/media/specs/`, verify all referenced in-game music/SFX cues exist in `public/music/` and `public/sfx/`, verify `social/research/competitors-and-benchmarks.json`, and make zero network calls.
15. `node scripts/harness/social-unit.mjs`, `npm run quality` (including `quality:root`, `quality:deps`, `quality:lint`, `quality:specs`, `quality:agents`, `quality:brands`, `quality:legacy-name`, `quality:props`), and a real headless preview render of gameplay video + screenshot + infographic SHALL pass cleanly.

## Out of scope

- Posting live to X, YouTube, or TikTok APIs without explicit human review and publish confirmation.
- Copying `TerraAgent`'s music/video binaries or Web3/blockchain copy into **Out Of Credits**.

## Decisions

- **Q:** What is asked for?
  **A (user, 2026-11-26):** Port `TerraAgent/social` video generation/editing, screenshot, and infographic capabilities to **Out Of Credits** declaratively; do not port `TerraAgent` audio — use **Out Of Credits**' in-game audio (`public/music`, `public/sfx`) and ElevenLabs CLI; pay attention to skills and harness; create a new Kiro Crew SMM agent (`smm-agent`) aware of the game's mood and features for X, YouTube, and TikTok; research similar Steam/social projects, save the results, ground social skills in comparable marketing strategy toward **$1M revenue**.
- **Q1:** How is `ffmpeg` provided on machines without system `ffmpeg`?
  **A (user-aligned architecture, 2026-11-26):** Pin `"ffmpeg-static": "5.3.0"` in root `devDependencies` (matching `TerraAgent/social/media` while obeying `check-deps.mjs` single-root lockfile discipline), resolved via `FFMPEG_BIN` -> `PATH` -> `ffmpeg-static`.
- **Q2:** Who owns the wrapper vs. declarative specs and campaigns?
  **A (user-aligned architecture, 2026-11-26):** Following `.kiro/specs/audio-agent/` Q11, `lead-dev` owns `scripts/harness/social-media.mjs`, `social-unit.mjs`, and `lib/social-*.mjs` (so `smm-agent` cannot raise the 15,000-credit ElevenLabs cap), while `smm-agent` owns `social/**` content/specs and `docs/marketing/**`.

## Open questions


## Verification

- Req 1, 9, 11, 12: `npm run quality:root`, `npm run quality:agents`, `node scripts/harness/agents-unit.mjs`.
- Req 2-8, 13-14: `node scripts/harness/social-media.mjs --check` and `node scripts/harness/social-unit.mjs` (schema negative/positive tests, real `ffmpeg` MP4/GIF/contact-sheet + multi-track in-game audio + voiceover muxing, fake `elevenlabs` cap/reserve/dry-run/auth tests).
- Req 3, 5, 6, 15: real headless Chrome CDP execution of `social-media.mjs screenshots`, `social-media.mjs infographics`, and `social-media.mjs video ... --preview`, plus full `npm run quality`.
