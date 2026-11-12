---
name: comix-story-drawer
description: "[LEVEL GEN] Step 2 of level generation (story layer). Author and render the multi-page Comix Zone story issue of a chapter from `chapters/<slug>/story/comix.spec.json` into PNG pages (`page-01.png` .. `page-NN.png` + `contact-sheet.png`) with `scripts/harness/draw-comix.mjs`, and wire them into the `/comic.html` reader and `/chapters.html` selector. Use whenever the user wants to write, draw, preview or update a chapter's comic story, panels, dialogue captions, speech bubbles or SFX lettering. Uses existing models and rooms; does not create assets."
---

# Comix Story Drawer (`comix-story-drawer`)

**Category: LEVEL GEN** (story layer). It draws the comic issue of the single Kiroween chapter with existing models and rooms. If a panel needs an actor or room that does not exist, create it with the ASSET PCG skills first (see `.kiro/steering/skills-map.md`).

Every Haunted Terminal chapter opens and closes as a genuine **1995 *Comix Zone*-inspired comic issue**: warm `#efe6d2` halftone paper gutters, `5px` `#110e1b` ink panel frames, `#ffd166` narration boxes, crisp speech bubbles, and 3D cel-shaded procedural rooms & malware actors rasterized directly from `ModelCatalog`.

Read `haunted-art-direction` first.

---

## 1. Authoring `story/comix.spec.json`

Place each chapter's comic script at `chapters/<chapter-id>/story/comix.spec.json`:

```json
{
  "chapterId": "chapter-01-freelance-storefront",
  "issueNumber": 1,
  "title": "ISSUE #1: FREELANCE NIGHTMARE",
  "subtitle": "ByteRig PC Parts & Games — Clean the AI Slop Before 6:00 AM",
  "pages": [
    {
      "pageNumber": 1,
      "title": "3:12 AM // FOUR AGENTS, ZERO SANITY",
      "panels": [
        {
          "id": "p1-1",
          "rect": [0.03, 0.03, 0.94, 0.30],
          "bgHex": "#211a36",
          "room": "room.desk",
          "caption": "03:12 AM — CLIENT MARTY'S BYTERIG PC PARTS & GAMES STORE LAUNCHES AT 06:00.",
          "cast": [
            { "model": "vibecoder.dev", "x": -0.5, "scale": 1.0 },
            { "model": "prop.crt", "x": 0.45, "scale": 1.1 }
          ],
          "bubbles": [
            { "speaker": "marty", "style": "normal", "text": "Dev! GPU, RAM, SSD cards and cart ordering ready by 6 AM—$1,200 on delivery!", "x": 0.62, "y": 0.28 }
          ]
        }
      ]
    }
  ]
}
```

### Comix Layout & Storytelling Rules
1. **Panel Grid (`rect: [x, y, w, h]` in `0..1`):**
   - Keep `2–4` panels per page with `0.02–0.03` gutters between panels so the Ben-Day paper breathes.
   - Vary panel widths (`0.94` widescreen establishing shot -> `0.45` + `0.46` side-by-side reaction beats -> `0.94` splash impact).
2. **Valid `ModelCatalog` IDs Only:**
   - Rooms: `room.desk`, `room.attic`, `room.crypt_entrance`, `room.crypt_hall`, `room.lab_hall`, `room.catwalk`, `room.furnace`, `room.core`.
   - Cast: `vibecoder.dev`, `vibecoder.hand`, `door.socket` (`hank.tty`), `prop.crt`, `pickup.ram`, `pickup.ssd`, `pickup.energy`, `malware.*`, `boss.kernel`, `boss.forkbomb`.
3. **Lettering Economy:**
   - Keep `caption` under `95` characters and each `bubble.text` under `100` characters so lines stay bold and readable at thumbnail and mobile sizes.
   - Use `style: "shout"` + `sfx` (`KRAKOOM!`, `SIGKILL!`, `SHIPPED!`) sparingly on climax panels (`1` per page max).

---

## 2. Drawing the Comic Pages (No GPU Required)

Run `scripts/harness/draw-comix.mjs` to rasterize every page and sync static previews to `public/comix/<chapter-id>/`:

```bash
node scripts/harness/draw-comix.mjs --chapter chapter-01-freelance-storefront
```

### Outputs Produced
- `chapters/<chapter-id>/story/out/page-01.png` .. `page-NN.png` (`900x1240` full-page Comix renders)
- `chapters/<chapter-id>/story/out/contact-sheet.png` (2-column issue overview sheet)
- `public/comix/<chapter-id>/page-01.png` .. `page-NN.png` + `contact-sheet.png` (served directly by Vite in `/chapters.html` and `/comic.html`)

---

## 3. Visual QA Loop (Mandatory)

1. Run the drawer self-test:
   ```bash
   node .kiro/skills/comix-story-drawer/scripts/self-test.mjs
   ```
2. **Visually inspect** `chapters/<chapter-id>/story/out/contact-sheet.png` and individual `page-01.png` files using `read_file`! Check that:
   - Actors stand grounded on the dark floor strip (`feetY`) and are not clipped at the head.
   - Captions (`#ffd166`) and speech bubbles (`#fffdf7` / `#ffe3e0`) do not cover character faces.
   - Panel ink borders (`5px #110e1b`) are crisp with clean Ben-Day paper gutters between panels.
3. Open `/comic.html?chapter=<chapter-id>` (or screenshot via `screenshot-lab.mjs`) to verify the interactive browser issue reader.
