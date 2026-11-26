# Terminal skins: design

Status: see requirements.md

## Pieces

```
src/contracts/terminal-skins.ts  NEW. The skin table, pure data: { id, label, title } for iterm2, terminal-app, putty,
                                 windows-terminal, gnome-terminal, vt100; SKIN_IDS; isSkinId(). Inner layer, so the shell
                                 (game) and the UI read one list.
src/contracts/brand.ts           TERMINAL_SKIN_KEY = `${PROJECT_SLUG}:terminal-skin:v1` (prefix-migrated, no legacy entry).
src/game/commands-proc.ts        runSkin(args): `skin` lists the ids and labels; `skin <id>` returns the id as a request;
                                 anything else exits 1 with the valid ids. Same shape as runManual / restart-level.
src/game/session.ts              case 'skin' -> pendingSkin; consumeSkinRequest().
src/chapters/session-shell.ts    case 'skin' -> g.pendingSkin; session-state.ts field; session-flow.ts consumeSkinRequest(g);
src/chapters/chapter-session.ts  the public consumeSkinRequest().
src/game/manual.ts               COMMANDS, helpText; manual-cmds-meta.ts the field manual entry and `man skin`; completion
                                 of `skin <id>` from SKIN_IDS.
src/game/selfcheck.ts            a row for `skin` (list, switch, refuse).
src/terminal-lab/commands.ts     `skin` in a group (ungrouped() stays empty).
src/ui/terminal-skin.ts          NEW. readSkinPref / writeSkinPref (untrusted parse, never throws, like sound-pref.ts),
                                 defaultSkinFor(platform) (mac -> iterm2, win -> windows-terminal, linux -> gnome-terminal,
                                 else iterm2), applySkin(bezel, id): sets `data-skin` on #terminal-bezel and the title text.
src/ui/esc-menu.ts               a "Terminal skin" <select id="esc-skin"> next to Fullscreen; handlers onSkin(id), currentSkin().
pages/play.html                  #tty-bar gains `.tty-winbtns` (three decorative window-button glyphs, aria-hidden) for the
                                 Windows and Linux skins; nothing else changes.
src/styles/terminal-skins.css    NEW. One block per `#terminal-bezel[data-skin=...]`: what shows (dots or window buttons, tab
                                 row or not), colours, heights. The default rules in game.css stay the iTerm2 look, so a
                                 page with no `data-skin` looks as today. Imported once from src/main.ts.
src/play/menu.ts                 at mount: saved pref or OS default -> applySkin; menu onSkin -> apply + save; exposes
                                 setSkin(id) for the command path.
src/play/input.ts                after each command: consumeSkinRequest() -> setSkin(id) (like the manual request).
```

## What each skin draws (chrome only, Req 2)

| Skin | Title bar | Buttons | Tabs | Title text |
|---|---|---|---|---|
| iterm2 | 28 px #2b2b2e | red/yellow/green dots left | one `zsh` tab | `vibecoder@motherboard: ~ (zsh)` |
| terminal-app | 28 px light grey #e8e6e8, dark text | dots left | none | `dev — -zsh — 80×24` |
| putty | 22 px flat navy #0a246a, white text | grey `_ □ ×` squares right | none | `haunted.local - PuTTY` |
| windows-terminal | the tab row is the title bar, 32 px #202020 | `─ □ ✕` right, `+` and `⌄` after the tab | one tab `dev@haunted: ~` | (on the tab) |
| gnome-terminal | 36 px Adwaita #303030 header bar | one round `✕` right | none | `dev@haunted: ~` (centred, bold) |
| vt100 | none | none | none | a 14 px beige #d8cfb8 bezel with an inner dark lip and a `VT100` badge bottom right |

`MANUAL (F1)` stays in the title bar on the right (before the window buttons). On VT100, which has no bar, it sits on the bezel's top edge.

## Decisions

- **Chrome is CSS on one markup.** All six share `#tty-bar` / `#tty-tabs`; a `data-skin` attribute picks what shows. Rejected: per-skin markup swapped by script (more DOM code, ids that tests use would move).
- **Glyphs are text in the bundled font**, not images or system fonts, so the visual audit's `font-fallback` stays clean and the desktop build stays offline.
- **Flat colours only** (no gradients, so PuTTY's title is flat navy), as the art bible asks.
- **Body untouched** (Req 2): no xterm option changes, so the fit stays as fixed in the previous spec; the bar heights only take rows.
- **The command never touches the DOM.** The shell (three-free `game` / `chapters`) only returns a request; `src/play` applies it, like `manual`. Listing needs no current skin, so `skin` prints the table and the play page prints nothing extra.
- **Each skin has its own tab text** (`tab` in the table): iTerm2's tab reads `zsh` while its title is the long prompt, so one `title` field was not enough (found while building).
- **VT100 Manual button** sits inside a 24 px top bezel; at 16 px the first capture clipped it (fixed after the visual run).
- **Preview and lab do not save** (Req 7): `src/play/menu.ts` already knows `isPreview` / `lab` from boot; it skips `writeSkinPref`.
- **New files and owners.** `src/contracts/terminal-skins.ts` and `src/styles/terminal-skins.css` (lead-dev's `src/contracts/**`, `src/styles/**`), `src/ui/terminal-skin.ts` (terminal-designer's `src/ui/**`). No new `src/game/` file, because the team fence lists those files by name.

## Layers and gates

- No new `src/<area>/`, page, route or layer rule. A new command and a save key (both covered above). No asset change, so `quality:fingerprint` is unaffected.
- Gates: `npm run quality` sub-gates, `npm run build`, `node scripts/harness/property-tests.mjs --only terminal`, `node scripts/harness/terminal-lab-unit.mjs`, `node scripts/harness/terminal-lab.mjs --all`, `node scripts/harness/terminal-lab-smoke.mjs`, `node scripts/harness/editor-smoke.mjs`, the skins visual run.
