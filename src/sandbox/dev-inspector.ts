import type { KernelEvent } from '../contracts/events.js';
import type { ComicStage } from '../renderer/comic-stage.js';
import type { ItemId } from '../contracts/inventory.js';
import { dom } from '../ui/dom-lite.js';

export interface InspectorActions {
  onTeleport(floor: number): void;
  onHeal(): void;
  onDamage?(amount?: number): void;
  onDialogue(): void;
  onTerminalLog(msg: string): void;
  onPlayIntro(): void;
  onPlayOutro(): void;
  /** After a hot reload rebuilt the scene: re-sync the current room. */
  onAssetsReloaded?: () => void;
  /** Route a fake event through the game's event sink (stage + HUD reactions). Defaults to the stage only. */
  emit?: (ev: KernelEvent) => void;
  /** Give a pickup. Undefined when the Session has no debug hook for it (buttons show disabled). */
  /** Grant an inventory item. Undefined when the session has no hook for it (buttons show disabled). */
  onGrantItem?: (item: ItemId) => void;
  onGive?: (item: 'energy' | 'ram' | 'ssd') => void;
}

function inspSection(title: string, children: ReadonlyArray<HTMLElement>): HTMLElement {
  return dom('div', { class: 'insp-section' }, [dom('h3', {}, [title]), ...children]);
}

const GRANT_ITEMS: ReadonlyArray<readonly [ItemId, string]> = [
  ['tube_transistor', 'Lantern / Transistor'], ['map', 'Map'], ['terminal', 'Terminal'], ['laptop', 'Laptop'],
];

function buildInspectorNodes(
  stage: ComicStage,
  give: InspectorActions['onGive'],
  grant: InspectorActions['onGrantItem'],
): HTMLElement[] {
  const floors: Array<[string, string]> = [
    ['1', '1: Attic'], ['2', '2: Crypt'], ['3', '3: Symlinks'], ['4', '4: Boiler'], ['5', '5: Kernel'],
  ];
  const floorBtns = floors.map(([f, label]) => dom('button', { class: 'insp-btn', 'data-floor': f }, [label]));
  floorBtns.push(
    dom('button', { class: 'insp-btn', id: 'btn-heal' }, ['Heal HP']),
    dom('button', { class: 'insp-btn', id: 'btn-damage' }, ['+10 DMG']),
    dom('button', { class: 'insp-btn', id: 'btn-lightning' }, ['Intro flash']),
    dom('button', { class: 'insp-btn', id: 'btn-hitboxes' }, [`Hitboxes: ${stage.config.showHitboxes ? 'ON' : 'OFF'}`]),
    dom('button', { class: 'insp-btn', id: 'btn-hot-reload-top' }, ['Hot-Reload Assets']),
  );

  const pickups: Array<[string, string]> = [['energy', '+ Energy'], ['ram', '+16 GB RAM'], ['ssd', '+256 GB SSD']];
  const pickupRow = dom('div', { class: 'btn-grid three' }, pickups.map(([k, label]) =>
    dom('button', { class: 'insp-btn', 'data-give': k, disabled: !give }, [label]),
  ));
  const pickupChildren: HTMLElement[] = give
    ? [pickupRow]
    : [pickupRow, dom('p', { class: 'insp-note' }, ['Session has no debugGive() yet: pickups can only be collected in game.'])];

  const grantRow = dom('div', { class: 'btn-grid' }, [
    ...GRANT_ITEMS.map(([k, label]) => dom('button', { class: 'insp-btn', 'data-grant': k, disabled: !grant }, [label])),
    dom('button', { class: 'insp-btn', 'data-grant': 'all', disabled: !grant }, ['All items']),
  ]);

  const evs: Array<[string, string]> = [
    ['lantern', 'ls -la'], ['hop', 'cd hop'], ['smash3', 'cd ../../../'], ['eloop', 'ELOOP flood'],
    ['denied', 'Rattle 000'], ['chmod_open', 'chmod +rx'], ['petrify', 'chmod -x'], ['bridge', 'mv bridge'],
    ['null_sink', '/dev/null'], ['hand_fork', 'System Hand'], ['dialogue', 'Socket bubble'], ['xray', 'ps/top X-Ray'],
    ['freeze', 'kill -STOP'], ['kill9', 'kill -9'], ['damage', 'Player hit'], ['clear', 'Floor clear'],
  ];
  const statuses = stage.registry.listStatuses().map((s) =>
    dom('div', { class: 'asset-badge' }, [
      dom('span', {}, [s.key]),
      dom('span', { class: s.source === 'PNG' ? 'tag-png' : 'tag-proc' }, [`[${s.source}]`]),
    ]),
  );

  return [
    inspSection('F2 // FLOORS', [dom('div', { class: 'btn-grid' }, floorBtns)]),
    inspSection('PICKUPS', pickupChildren),
    inspSection('ITEMS', [grantRow]),
    inspSection('CINEMATICS', [
      dom('div', { class: 'btn-grid' }, [
        dom('button', { class: 'insp-btn', id: 'btn-intro' }, ['Play intro']),
        dom('button', { class: 'insp-btn', id: 'btn-outro' }, ['Play outro']),
      ]),
    ]),
    inspSection('KERNEL EVENTS', [
      dom('div', { class: 'btn-grid' }, evs.map(([k, label]) => dom('button', { class: 'insp-btn', 'data-ev': k }, [label]))),
    ]),
    inspSection('STAGE', [
      dom('div', { class: 'slider-row' }, [
        dom('span', {}, [`Shake (${stage.config.shakeIntensity})`]),
        dom('input', { type: 'range', min: 0, max: 28, value: stage.config.shakeIntensity, id: 'sl-shake' }),
      ]),
      dom('div', { class: 'slider-row' }, [
        dom('span', {}, [`Tween ms (${stage.config.transitionMs})`]),
        dom('input', { type: 'range', min: 140, max: 1000, step: 20, value: stage.config.transitionMs, id: 'sl-ms' }),
      ]),
    ]),
    inspSection('ALBEDO', statuses),
  ];
}

function debugEvent(kind: string): KernelEvent | 'dialogue' | null {
  if (kind === 'lantern') return { type: 'LANTERN_REVEAL', dirId: 4, revealedInodes: [7] };
  if (kind === 'hop') {
    return { type: 'ROOM_TRANSITION', fromDir: 4, toDir: 5, toPath: '/next', upwardPanelsSmashed: 0, viaSymlinkLoop: false };
  }
  if (kind === 'smash3') {
    return { type: 'ROOM_TRANSITION', fromDir: 9, toDir: 1, toPath: '/top', upwardPanelsSmashed: 3, viaSymlinkLoop: false };
  }
  if (kind === 'eloop') {
    return { type: 'ROOM_TRANSITION', fromDir: 9, toDir: 9, toPath: '/loop', upwardPanelsSmashed: 0, viaSymlinkLoop: true };
  }
  if (kind === 'denied') return { type: 'PERMISSION_DENIED_RATTLE', targetId: 6, command: 'cd gate' };
  if (kind === 'chmod_open') return { type: 'INODE_MODE_CHANGED', inodeId: 6, oldMode: 0, newMode: 0o755 };
  if (kind === 'petrify') return { type: 'INODE_MODE_CHANGED', inodeId: 11, oldMode: 0o555, newMode: 0o444 };
  if (kind === 'bridge') {
    return { type: 'OBJECT_MOVED', inodeId: 12, fromDir: 4, toDir: 15, formedBridge: true, suckedIntoNull: false };
  }
  if (kind === 'null_sink') {
    return { type: 'OBJECT_MOVED', inodeId: 19, fromDir: 4, toDir: 0, formedBridge: false, suckedIntoNull: true };
  }
  if (kind === 'hand_fork') {
    return { type: 'SYSTEM_HAND_SPAWN', entityKind: 'process', id: 667, name: 'zombie_worker', reason: 'boss_fork' };
  }
  if (kind === 'dialogue') return 'dialogue';
  if (kind === 'xray') {
    return {
      type: 'HUD_OVERLAY_TOGGLED',
      mode: 'PS_XRAY',
      processes: [{ pid: 666, ppid: 1, name: 'necromancer', cpu: 98, state: 'RUNNING' }],
    };
  }
  if (kind === 'freeze') return { type: 'PROC_SIGNALED', pid: 666, signal: 'SIGSTOP', outcome: 'FROZEN' };
  if (kind === 'kill9') return { type: 'PROC_SIGNALED', pid: 666, signal: 'SIGKILL', outcome: 'KILLED' };
  if (kind === 'damage') return { type: 'PLAYER_DAMAGED', amount: 15, hpRemaining: 85, sourceName: 'zombie_worker' };
  if (kind === 'clear') return { type: 'FLOOR_CLEARED', floorId: 1, speedrunBonus: true, commandsCount: 3 };
  return null;
}

function wireInspector(
  container: HTMLElement,
  stage: ComicStage,
  actions: InspectorActions,
  give: InspectorActions['onGive'],
  grant: InspectorActions['onGrantItem'],
  fire: (ev: KernelEvent) => void,
  render: () => void,
): void {
  container.querySelectorAll<HTMLButtonElement>('[data-floor]').forEach((btn) => {
    btn.onclick = () => actions.onTeleport(Number(btn.dataset.floor));
  });
  const heal = container.querySelector<HTMLButtonElement>('#btn-heal');
  if (heal) heal.onclick = () => actions.onHeal();
  const damage = container.querySelector<HTMLButtonElement>('#btn-damage');
  if (damage) {
    damage.onclick = () => (actions.onDamage
      ? actions.onDamage(10)
      : fire({ type: 'PLAYER_DAMAGED', amount: 10, hpRemaining: 90, sourceName: 'dev_panel' }));
  }
  container.querySelectorAll<HTMLButtonElement>('[data-give]').forEach((btn) => {
    btn.onclick = () => give?.(btn.dataset.give as 'energy' | 'ram' | 'ssd');
  });
  container.querySelectorAll<HTMLButtonElement>('[data-grant]').forEach((btn) => {
    btn.onclick = () => {
      const key = btn.dataset.grant ?? '';
      const ids = key === 'all' ? GRANT_ITEMS.map(([id]) => id) : [key as ItemId];
      ids.forEach((id) => grant?.(id));
    };
  });
  const intro = container.querySelector<HTMLButtonElement>('#btn-intro');
  if (intro) intro.onclick = () => actions.onPlayIntro();
  const outro = container.querySelector<HTMLButtonElement>('#btn-outro');
  if (outro) outro.onclick = () => actions.onPlayOutro();
  const lightning = container.querySelector<HTMLButtonElement>('#btn-lightning');
  if (lightning) lightning.onclick = () => stage.triggerLightningIntro();
  container.querySelectorAll<HTMLButtonElement>('[data-ev]').forEach((btn) => {
    btn.onclick = () => {
      const ev = debugEvent(btn.dataset.ev ?? '');
      if (ev === 'dialogue') actions.onDialogue();
      else if (ev) fire(ev);
    };
  });
  const slShake = container.querySelector<HTMLInputElement>('#sl-shake');
  if (slShake) {
    slShake.oninput = () => { stage.config.shakeIntensity = Number(slShake.value); };
    slShake.onchange = () => render();
  }
  const slMs = container.querySelector<HTMLInputElement>('#sl-ms');
  if (slMs) {
    slMs.oninput = () => { stage.config.transitionMs = Number(slMs.value); };
    slMs.onchange = () => render();
  }
  const hb = container.querySelector<HTMLButtonElement>('#btn-hitboxes');
  if (hb) {
    hb.onclick = () => {
      stage.config.showHitboxes = !stage.config.showHitboxes;
      stage.applyConfigVisuals();
      render();
    };
  }
  container.querySelectorAll<HTMLButtonElement>('#btn-hot-reload-top').forEach((reloadBtn) => {
    reloadBtn.onclick = async () => {
      await stage.registry.reloadAll();
      stage.buildScene();
      actions.onAssetsReloaded?.();
      render();
      actions.onTerminalLog('\x1b[36m[Assets hot-reloaded]\x1b[0m');
    };
  });
}

export function mountDevInspector(
  container: HTMLElement,
  stage: ComicStage,
  actions: InspectorActions,
): void {
  const give = actions.onGive;
  const grant = actions.onGrantItem;
  const fire = actions.emit ?? ((ev: KernelEvent) => stage.handleEvent(ev));
  const render = (): void => {
    container.replaceChildren(...buildInspectorNodes(stage, give, grant));
    wireInspector(container, stage, actions, give, grant, fire, render);
  };
  render();
}
