# Out Of Credits — YouTube Trailer, Devlog & Creator Kit

Grounded in [`docs/marketing/MARKET_RESEARCH_1M_REVENUE.md`](../../docs/marketing/MARKET_RESEARCH_1M_REVENUE.md): YouTube viewers sit on desktop one click from Steam, converting wishlists at 3–5× the rate of mobile feeds when the trailer hooks inside the first 3 seconds without studio-logo padding.

---

## 1. Official 48-Second Steam & YouTube Gameplay Trailer (`youtube-trailer.video.json`)

- **Spec:** [`social/media/specs/youtube-trailer.video.json`](../media/specs/youtube-trailer.video.json) (`1920×1080`, `24 fps`, `look: "big"`, `battle_boss` tracker bed + in-game SFX + optional `vo_youtube_trailer` narration)
- **Render Command:** `npm run social:video -- social/media/specs/youtube-trailer.video.json`

### Second-by-Second Storyboard & Teleprompter Voiceover (`~135 WPM`)

| Time | Scene ID | Visual On Screen | Spoken Narration (`vo_youtube_trailer`) |
|---|---|---|---|
| `0:00–0:06` | `yt-01-midnight-lightning` | 3D Intro Comix: storm outside desk window, lightning bolt hits PC tower, Vibecoder pulled into motherboard. | *"Lightning strikes your tower at midnight and pulls you straight into the motherboard."* |
| `0:06–0:12.8` | `yt-02-kiro-awakening` | Sector 01: Vibecoder in wires & chips; types `ps`; opens `F1` hardcover comic Field Manual to `kill`. | *"In Out Of Credits, every comic panel is a real directory and your terminal is the only way out."* |
| `0:12.8–0:20` | `yt-03-lantern-and-battles` | Sector 03 GPU Alley: lantern glow, `ls -la` reveals hidden malware, `FIGHT!` burst, VT100 -> PuTTY skin switch. | *"Sweep dark sectors with your lantern, petrify trojans with chmod,"* |
| `0:20–0:27.2` | `yt-04-chmod-and-laptop` | Clamshell Laptop Studio open on desktop with JS Pad & Web Weaver + comic dossier callout card. | *"patch broken JavaScript and Docker containers on your laptop,"* |
| `0:27.2–0:34` | `yt-05-matrix-hub-dad` | Sector 04 Matrix Hub: `dad.tty` smoking at his CRT rack + `F3` PCB Motherboard Map deploy view. | *"upgrade open-weight servers at the Matrix Hub,"* |
| `0:34–0:41` | `yt-06-clod-kernel-boss` | Sector 11 Kernel Core: Supervisor Clod cameo + towering `boss.kernel` (`PID 1!`) battle. | *"and silence Clod at the kernel core."* |
| `0:41–0:48` | `yt-07-end-slate` | Full Comix Zone End Card over animated Kernel Boss: **WISHLIST OUT OF CREDITS ON STEAM**. | *"Play Chapter One free in your browser and wishlist on Steam."* |

### YouTube Upload Metadata (SEO-Tuned for Steam Conversion)

- **Title:** `Out Of Credits — Official Gameplay Trailer | 1995 Comix Zone × Real Unix Terminal Dungeon Crawler`
- **First 2 Lines of Description (Above the Fold):**
  ```text
  Play Chapter 1 FREE in your browser (0 install): https://out-of-credits.netlify.app/?utm_source=youtube&utm_medium=trailer&utm_campaign=official_trailer
  Wishlist Out Of Credits on Steam (Mac / Win / Linux / Steam Deck): https://out-of-credits.netlify.app/desktop.html?utm_source=youtube&utm_medium=trailer&utm_campaign=official_trailer
  ```
- **Pinned Comment:** Direct Steam Wishlist + Browser Demo UTM link, plus *"Drop the Linux one-liner you'd use on PID 1 — cleanest command gets pinned."*

---

## 2. 10-Minute Engineering Devlog Blueprint (High-Retention Tech Audience)

Target comparable audience: fans of *The Farmer Was Replaced*, *Turing Complete*, *Hacknet*, *Inscryption*, and technical indie devlogs.

1. **`0:00–0:45` — The Hook:** Show a real `chmod -x` turning a 3D Trojan to stone inside a comic panel. State the constraint: *"Zero mouse clicks, zero fake hacking bars, zero runtime AI asset generation—every room, enemy, and comic panel is driven by real Unix commands and code."*
2. **`0:45–3:00` — 1995 *Comix Zone* in Three.js:** Show `/storybook.html` toggling ink outlines, 3-band cel shading, Ben-Day halftones, pixel-art quantizer, and CRT scanlines. Explain why warm orange vs. cold PCB hardware gives an instant 3-second gameplay read.
3. **`3:00–5:30` — Designing Turn-Based Terminal Combat:** Why real-time typing punishes slow typists unfairly, and how a 30-second turn clock + `F1` hardcover comic Field Manual makes Unix accessible to non-sysadmins while preserving `S`-rank command golf for veterans.
4. **`5:30–8:00` — Putting a Working Laptop Inside a Computer:** How `item.laptop` runs real user JS in a WebWorker with loop protection and real HTML/CSS in a sandboxed iframe.
5. **`8:00–10:00` — Free Chapter 1 Browser Demo -> Native Tauri v2 Steam Build:** Show exporting `.json` saves and unlocking `ACH_*` trophies; ask viewers to try Chapter 1 and Wishlist on Steam.

---

## 3. Creator & Streamer Outreach Brief (50 Micro-Creators + Variety/Tech Channels)

- **Subject Line:** ` Unix Terminal × 1995 Comix Zone dungeon crawler — instant browser demo (no install needed)`
- **Why Creators Pick It Up (*Duskers* / *The Farmer Was Replaced* / *Buckshot Roulette* Angle):**
  - **Instant 5-Second Test:** Paste one browser URL to play Sector 01 immediately before downloading anything.
  - **Chat Participation Goldmine:** Twitch/YouTube chat yells Unix flags (`ls -la`, `chmod -x`, `kill -9`, `kiro scan`) while the 30-second battle timer ticks down and Clod/Gork roast typos out loud.
  - **Clean Media Kit:** Attach `social/media/out/screenshots/` (`1920×1080` PNGs) and `x-teaser.min.gif` (`< 4.5 MB`).
