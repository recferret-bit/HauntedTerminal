# Out Of Credits — X (Twitter) Launch & Weekly Growth Scenarios

Grounded in [`docs/marketing/MARKET_RESEARCH_1M_REVENUE.md`](../../docs/marketing/MARKET_RESEARCH_1M_REVENUE.md): 80%+ of X scrollers watch on mute, developer/Linux/indie communities reward authentic mechanics over buzzwords, and outbound Steam links must carry UTM parameters (`?utm_source=x&utm_medium=social&utm_campaign=kiroween_launch`).

---

## Option 1 (Recommended Main Launch Post) — Relatable Dev Premise + Native Teaser MP4

**Attach Video:** [`social/media/out/video/x-teaser/x-teaser.mp4`](../media/out/video/x-teaser/x-teaser.mp4) (`24.0s`, `1280x720`, muted-autoplay captions + `title_theme` & live terminal SFX)

```text
What happens when you run out of AI credits at 2:00 AM, lightning hits your PC tower, and you get pulled inside your own motherboard?

I built Out Of Credits — a 1995 Comix Zone dungeon crawler where you are the only human inside a haunted machine, and your ONLY controller is a real Unix terminal & JavaScript laptop:

• Real POSIX Combat: Every directory is a comic panel. Sweep dark hardware rooms with your Tube Transistor, expose hidden spyware with `ls -la`, petrify Trojans with `chmod -x`, and snipe PIDs with `kill -9` before the 30-second turn clock runs out.
• Real Code in a Clamshell Laptop: Flip open your in-game laptop to patch broken HTML/CSS, fix JavaScript bugs in a sandboxed Worker, and build clean Docker & Compose services.
• Open-Weights Rebellion: Scavenge RAM & GPU chips for a cigarette-smoking bare-metal greybeard (`dad.tty`) to reboot Kiro Ghost with Qwen, DeepSeek & Llama—silencing Anti-Gravy, Codec, Gork, and PID 1 Supervisor Clod.

All 11 sectors of Chapter 1 are playable free in your browser right now (zero install), and your `.json` save + 15 `ACH_*` trophies carry straight into Steam.

What's the very first command you're typing when you wake up in `/mnt/wires_and_chips`?
```

**Reply 1 / 2 (UTM Conversion Links — keeps Post 1 reach unthrottled on non-Premium feeds):**

```text
Play Chapter 1 free in browser + Wishlist Out Of Credits on Steam:

Browser Demo (instant boot, 0 signup): https://out-of-credits.netlify.app/?utm_source=x&utm_medium=social&utm_campaign=launch_teaser
Steam Wishlist & Native Mac/Win/Linux Builds: https://out-of-credits.netlify.app/desktop.html?utm_source=x&utm_medium=social&utm_campaign=launch_teaser
```

---

## Option 2 — 5-Post Technical & Art Architecture Thread (Friday Engineering Deep-Dive)

### Post 1 / 5 — Hook + Gameplay Video
Attach [`x-teaser.mp4`](../media/out/video/x-teaser/x-teaser.mp4).
```text
1/5 Most "coding games" look like grey spreadsheets. Most stylised dungeon crawlers play like every other mouse-click RPG.

For Out Of Credits, we built a custom Three.js + xterm.js engine inspired by 1995 Sega Comix Zone where typing real Unix commands and JavaScript drives every 3D comic panel.

Here is how the architecture works under the hood:
```

### Post 2 / 5 — 3D-Drawn-As-2D Reliefs & Single Palette Contract
Attach [`02-comix-zone-3d-relief-engine.png`](../media/out/infographics/02-comix-zone-3d-relief-engine.png) + [`09-storybook-boss-kernel.png`](../media/out/screenshots/09-storybook-boss-kernel.png).
```text
2/5 3D Drawn as 2D Comic Reliefs:

Every actor and hardware room is procedural 3D geometry shot by a level orthographic camera, wrapped in a constant-weight `#110e1b` ink shell, quantized into 3 hard cel bands with Ben-Day halftone shadows, and pushed through a pixel-art + CRT scanline pass.

Color is gameplay read: warm orange = human Vibecoder, PCB green/gold = machine, cyan/amber = ports & pickups, magenta = hostile malware.
```

### Post 3 / 5 — Turn-Based Unix Kernel & 0-Death Deterministic Solver
Attach [`01-unix-terminal-combat-loop.png`](../media/out/infographics/01-unix-terminal-combat-loop.png) + [`03-gpu-alley-lantern-battle.png`](../media/out/screenshots/03-gpu-alley-lantern-battle.png).
```text
3/5 Turn-Based Unix Combat & 0-Death Verification:

Every file in the VFS corresponds to a live 3D entity in the panel. Every non-empty `Enter` is one tactical player turn answered by one malware turn under a 30-second turn clock.

Before any sector ships, a headless solver plays the entire 11-level campaign in CI and verifies a 0-death clear.
```

### Post 4 / 5 — Sandboxed Clamshell Laptop, Field Manual & 6 Terminal Skins
Attach [`03-clamshell-laptop-and-docker.png`](../media/out/infographics/03-clamshell-laptop-and-docker.png) + [`07-hardcover-field-manual.png`](../media/out/screenshots/07-hardcover-field-manual.png).
```text
4/5 Real Code Sandboxes & Tactile Developer Tools:

In Sector 06 (`mv laptop ~`), you recover your clamshell laptop—running real player JS in an isolated WebWorker with loop guards and live HTML/CSS in a sandboxed iframe, plus Dockerfile & Compose repairs.

Stuck on flags? Hit `F1` for the hardcover comic Terminal Field Manual, `F3` for the live PCB Motherboard Map, or `skin vt100` to swap among 6 classic terminal chromes.
```

### Post 5 / 5 — Native Tauri v2 + Steamworks & Playable Browser Demo
Attach [`05-steam-and-desktop-architecture.png`](../media/out/infographics/05-steam-and-desktop-architecture.png).
```text
5/5 Web-to-Steam Save Portability:

Play all 11 sectors in your browser right now with zero install, export your `.json` save bundle, and import every sector rank, `~/.bashrc` rig perk, and `ACH_*` trophy straight into our offline-verified Tauri v2 + Steamworks desktop build (macOS, Windows, Linux & Steam Deck).

Try Chapter 1 & Wishlist on Steam (link in bio / reply). #IndieDev #Linux #WebGL #ThreeJS
```
