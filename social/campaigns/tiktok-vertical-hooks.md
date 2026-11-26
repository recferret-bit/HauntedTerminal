# Out Of Credits — TikTok & YouTube Shorts Vertical Playbook (`9:16` `1080×1920`)

Grounded in [`docs/marketing/MARKET_RESEARCH_1M_REVENUE.md`](../../docs/marketing/MARKET_RESEARCH_1M_REVENUE.md): *The Farmer Was Replaced* and *Buckshot Roulette* proved that tight, high-contrast retro/code loops explode on TikTok and Shorts when **Frame 0** poses an immediate challenge, cuts land every **3–4 seconds**, and the final frame loops cleanly back into Frame 0.

---

## 1. Flagship Vertical Clip (`tiktok-hook.video.json` — `16.0s`, `1080×1920`)

- **Spec:** [`social/media/specs/tiktok-hook.video.json`](../media/specs/tiktok-hook.video.json)
- **Render Command:** `npm run social:video -- social/media/specs/tiktok-hook.video.json`
- **Voiceover Plan (Dry-Run):** `npm run social:audio -- plan vo_tiktok_hook`

### Beat Sheet (`16.0s` Seamless Loop)

| Time | Scene | On-Screen Action & Comix Overlay | Audio Layer |
|---|---|---|---|
| `0:00–0:03.6` | `tt-01-frame0-hook` | Live Sector 03 dark room; `0 CREDITS!` starburst at `0.1s`; `$ ls -la` typed live at 22 CPS; hidden malware revealed. | `cine_sfx_slam` + mechanical `key_press` + `battle_loop` + *"I ran out of AI credits at 2 AM..."* |
| `0:03.6–0:07.8` | `tt-02-chmod-stone` | Amber comic flash -> VT100 terminal; `$ chmod -x ` typed; `CHMOD -X!` cyan starburst over Logic Cell Trojan. | `lantern_on` + `petrify` stone crunch + *"my only weapon against malware is a real Linux terminal."* |
| `0:07.8–0:12.0` | `tt-03-boss-timer` | Glitch cut -> Sector 11 `/sys/clod_overlord_core`; Supervisor Clod + towering Kernel Boss (`30s CLOCK!`); `$ kill -9 1` typed. | `taunt_clod_1` robot voice + *"One wrong command and PID 1 wipes my memory."* |
| `0:12.0–0:16.0` | `tt-04-loop-cta` | White flash -> Vibecoder holding clamshell laptop + bold yellow Comix CTA card (**PLAY CHAPTER 1 FREE · WISHLIST ON STEAM**) cutting cleanly back to `0:00`. | Tracker bass resolve -> seamless loop into `0:00` slam. |

---

## 2. Five Repeatable Short-Form Hook Templates (5× Weekly Cadence)

Every variation below can be cloned from `tiktok-hook.video.json` by swapping `level`, `skin`, `events`, and `captions` declaratively:

1. **The Permission Trick (`chmod -x` vs `rm`):**
   - *Frame-0 Text:* `"POV: You try rm on an armed Trojan vs chmod -x"`
   - *Payoff:* Show permission rattle (`perm_denied`) vs stripping execute bits to turn the Trojan into harmless stone (`petrify`).
   - *Comment Bait:* `"Which Linux command deserves to be an overpowered spell in Chapter 2?"`
2. **The 30-Second Boss Challenge (`PID 1`):**
   - *Frame-0 Text:* `"Bet you can't beat PID 1 in under 12 commands"`
   - *Payoff:* Fast cut of redirecting streams to `/dev/null`, Kiro Ghost cracking the shield, and `kill -9 1` lightning strike.
   - *Comment Bait:* `"Drop your S-rank command count from the free browser demo."`
3. **Terminal Aesthetic Showcase (`6 Skins`):**
   - *Frame-0 Text:* `"Tell me your age by which terminal skin you pick"`
   - *Payoff:* Rapid 2-second cuts flipping the exact same battle across `VT100` -> `PuTTY` -> `GNOME` -> `Windows Terminal` -> `macOS Terminal` -> `iTerm2`.
   - *Comment Bait:* `"Team VT100 phosphor or Team iTerm2?"`
4. **Laptop Full-Stack Rescue (`item.laptop`):**
   - *Frame-0 Text:* `"When the dungeon boss breaks CSS & Docker mid-fight"`
   - *Payoff:* Flip open the 3D clamshell laptop, patch the broken JS/CSS in Web Weaver, close the lid, and watch the sector gate unlock.
5. **Greybeard Dad & Parody Big Four Roast (`dad.tty`):**
   - *Frame-0 Text:* `"Enterprise C developer meets 4 smug AI supervisors"`
   - *Payoff:* Show `dad.tty` smoking at his Matrix server rack loading open-weight `qwen` / `deepseek` / `llama` while Anti-Gravy, Codec, and Gork short-circuit.

---

## 3. Caption, Hashtag & Bio Funnel Checklist

- **Caption Formula (`<= 110 chars`):** `Your ONLY weapon in this 1995 Comix Zone dungeon crawler is real Linux commands. Free browser demo in bio! #linux #coding #indiegame #programming #steam`
- **Pinned First Comment (YouTube Shorts & TikTok):** `Play all 11 levels of Out Of Credits FREE in your browser (no download) + Wishlist on Steam — link in bio!`
- **UTM Bio Link:** Route bio traffic to a fast 2-button landing or directly to `/?utm_source=tiktok&utm_medium=short&utm_campaign=vertical_hooks` so visitors on mobile can save/wishlist and desktop visitors jump straight into Sector 01.
