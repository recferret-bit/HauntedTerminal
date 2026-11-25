# Play page edge-to-edge layout and terminal skin: design

Status: approved (by the user 2026-11-25)

## Pieces

```
pages/play.html        #tty-bar becomes the iTerm title bar: three decorative dots (aria-hidden), the centred title,
                       #tty-manual-btn on the right; a new #tty-tabs row with one active tab `zsh`. Ids kept:
                       #terminal-dock, #terminal-bezel, #tty-bar, #tty-manual-btn, #terminal-panel.
src/styles/game.css    in place (no override file, so no specificity fights):
                       body: dark background, no dotted paper on /play (the page has no gaps left to show it).
                       #page: padding 0, gap 0.
                       #stage-wrapper: no border, no box-shadow.
                       #terminal-dock: 1 px dark top divider.
                       #terminal-bezel: no padding, no orange top border, no shadow; column of title bar, tabs, panel.
                       #tty-bar: 28 px, flat #2b2b2e, 1 px #000 bottom line, dots 12 px (#ff5f57, #febc2e, #28c840
                       with a 1 px darker ring), title 12 px centred, system UI font for the chrome.
                       #tty-tabs: 24 px, #1c1c1e, one tab #2b2b2e with the `zsh` label.
                       #terminal-panel: padding 0; .xterm gets the 6px 10px 4px margins; background unchanged (#07080a).
                       #code-editor-pane and the stacked (<= 860 px) split: shadows and 3 px ink borders become 1 px dividers.
src/ui/terminal.ts     unchanged (theme, font and size stay, Req 3).
```

## Decisions

- **Edit game.css in place.** The rules being changed live there; an override file would leave dead rules and specificity fights. Rejected: a new `terminal-window.css`.
- **Flat chrome.** iTerm's title bar is a flat dark grey; no gradient, so it also stays inside the art bible's "no smooth gradients".
- **Chrome font.** The title, tab and Manual button use the bundled IBM Plex Mono (600). A system UI font like iTerm's was tried first and rejected: the visual audit flagged it as `font-fallback` (`.SF NS` is not bundled, so it differs per OS and is missing offline). No new font file.
- **Terminal margins on `.xterm`.** The fit addon measures `#terminal-panel` including its padding and subtracts only the `.xterm` padding, so the 6/10/4 px margins sit on `.xterm`; padding on the panel made xterm one row too tall (audit `text-overflow`, 2 to 4 px).
- **Dots do nothing** (Req 5): plain spans, `aria-hidden="true"`, no pointer cursor, so nobody expects them to close the game.
- **CRT animations unchanged.** They run on `#terminal-bezel`, which now includes the title bar and tab, so the whole window powers on and off like a monitor.
- **No layout script change.** The stage resizes from its container; xterm's fit addon refits on the existing resize path, so the extra 28 + 24 px of chrome only takes rows from the terminal (the dock stays 38vh).

## Layers and gates

- No new file, layer rule, page, route, vocabulary or asset; `quality:fingerprint` is unaffected.
- Every `/play` visual baseline changes; the visual audit shows the diffs and a person approves them.
- Gates: `npm run quality` sub-gates, `npm run build`, `node scripts/harness/manual-smoke.mjs`, `node scripts/harness/terminal-lab-smoke.mjs`, `node scripts/harness/editor-smoke.mjs`, `node scripts/harness/visual-audit.mjs` (play screens, 1600x950 and 1280x820).
