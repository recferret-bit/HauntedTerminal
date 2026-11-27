# Laptop & Laptop Lab Configuration Schema

Sources of truth: `src/laptop/domain/{machine,apps,tasks,checks,run}.ts`, `src/laptop/ui/laptop.ts`, and `src/laptop/lab/{lab-page,inspector}.ts`.

## 1. URL Parameters (`/laptop-lab`)

| Param | Default | Accepted values | Behavior |
|---|---|---|---|
| `state` | `closed` | Any `LaptopState` (`closed`, `opening`, `open`, `diving`, `booting`, `desktop`, `shutting`, `surfacing`, `closing`) | Starting lifecycle state passed to `mountLaptop({ start })` |
| `speed` | `1` | Finite number `>= 0` (presets `1`, `0.5`, `0.4`, `0`) | Normalized by `parseLabSpeed()`; non-preset valid speeds add a `Custom (<v>x)` option; invalid/negative strings default to `1` |
| `mute` | `0` | `1` | Starts `/laptop-lab` muted (`startPageAudio` + `mountLaptop({ muted: true })`) |

Progress keys:
- `/laptop-lab`: `localStorage['credits.laptop.progress']`
- `/play` overlay (`src/play/laptop.ts`): `localStorage['out-of-credits:laptop-progress:v1']` (`null` in-memory only for `?draft=1` / `?lab=1`)

## 2. Lifecycle Machine (`src/laptop/domain/machine.ts`)

`LAPTOP_STATES`: `closed` -> `opening` (`1500ms`) -> `open` -> `diving` (`1300ms`) -> `booting` (`5200ms`) -> `desktop` -> `shutting` (`1100ms`) -> `surfacing` (`1100ms`) -> `open` -> `closing` (`1100ms`) -> `closed`.

User events (`LaptopEvent` excluding `DONE`): `OPEN`, `CLOSE`, `POWER`. Note `booting` also accepts `POWER` -> `shutting`.

`LOOKS[state]`: `{ camera: 'far' | 'near', lid: 'shut' | 'up', screen: 'off' | 'boot' | 'desktop' | 'bye' }`.

## 3. Desktop Apps (`src/laptop/domain/apps.ts`)

| `AppId` | `file` | Default `[w, h]` | Purpose |
|---|---|---|---|
| `quests` | `QUESTS.EXE` | `[300, 330]` | Task selector & completion state |
| `jspad` | `JSPAD.EXE` | `[420, 360]` | JavaScript Worker workbench (`mode: 'script'`) |
| `weaver` | `WEAVER.EXE` | `[600, 420]` | HTML/CSS/JS sandboxed iframe workbench (`mode: 'page'`) |
| `sysinfo` | `SYSTEM.INI` | `[280, 220]` | Machine stats & Power button (`POWER` event) |

## 4. `LaptopTask` & `Check` Vocabulary (`tasks.ts`, `checks.ts`, `run.ts`)

```ts
interface LaptopTask {
  id: string;                 // e.g. 'js-hello', 'js-add', 'js-countdown', 'web-hello', ...
  title: string;
  app: 'jspad' | 'weaver';
  brief: string;
  hint: string;
  starter: { html: string; css: string; js: string };
  solution: { html: string; css: string; js: string };
  checks: Check[];
  actions?: Array<{ click: string }>; // DOM clicks executed in weaver before probing
}
```

### `Check` Union (All 7 Variants)

| `kind` | Fields | Pass condition |
|---|---|---|
| `log` | `equals?: string`, `includes?: string`, `label: string` | Trimmed console output has an exact match or substring match |
| `logs` | `lines: string[]`, `label: string` | Console printed the exact sequence `lines` in order |
| `noError` | `label: string` | `!report.error && !report.timedOut` |
| `value` | `expr: string`, `equals: string`, `label: string` | Evaluated expression result `report.values[expr] === equals` |
| `element` | `selector: string`, `min?: number`, `text?: string`, `label: string` | At least `min` (default `1`) matches; first match `textContent` includes `text` |
| `style` | `selector: string`, `prop: string`, `equals: string`, `label: string` | First matched element computed `styles[prop] === equals` |
| `source` | `file: 'html' | 'css' | 'js'`, `includes: string`, `label: string` | Case-insensitive substring present in `files[file]` |

### `RunReport` & `WorkbenchInspectEvent`

- `RunReport`: `{ logs: { level: 'log'|'info'|'warn'|'error', text: string }[], error: string | null, probes: Record<string, { count: number, text: string, styles: Record<string, string> }>, values: Record<string, string>, timedOut: boolean }`.
- `WorkbenchInspectEvent`: `{ app: TaskApp, taskId: string | null, taskTitle: string | null, mode: 'script' | 'page', report: RunReport | null, checks: CheckResult[] | null }`.

## 5. `window.__laptop` (`LaptopHandle`)

```ts
interface LaptopHandle {
  machine: Machine;                         // .state, .speed, .send(ev), .jump(state), .dispose()
  view: LaptopView;                         // .keyboard.pressed(), .trackpad.state(), .screen
  desktop: DesktopView;
  ctx: LaptopContext;                       // .progress(), .setProgress(next), .onProgress(fn), .startTask(id), .open(app), .shutdown(), .pow(word), .onInspect?(ev), .sound
  onState(fn: (state, event) => void): void;
  setSpeed(speed: number): void;            // non-finite or < 0 defaults to 1, syncs speed select via onSpeed
  jump(to: LaptopState): boolean;
  runTask(id: string, files?: CodeFiles): Promise<CheckResult[]>;
  resetProgress(): void;
  dispose(): void;
}
```
