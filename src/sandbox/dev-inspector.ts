import type { KernelEvent } from '../contracts/events.js';
import type { ComicStage } from '../renderer/comic-stage.js';

export interface InspectorActions {
  onTeleport(floor: number): void;
  onHeal(): void;
  onDialogue(): void;
  onTerminalLog(msg: string): void;
  onPlayIntro(): void;
  onPlayOutro(): void;
  /** After a hot reload rebuilt the scene: re-sync the current room. */
  onAssetsReloaded?: () => void;
  /** Route a fake event through the game's event sink (stage + HUD reactions). Defaults to the stage only. */
  emit?: (ev: KernelEvent) => void;
  /** Give a pickup. Undefined when the Session has no debug hook for it (buttons show disabled). */
  onGive?: (item: 'energy' | 'ram' | 'ssd') => void;
}

function inspectorMarkup(stage: ComicStage, give: InspectorActions['onGive']): string {
  const statuses = stage.registry.listStatuses();
  return `
      <div class="insp-section">
        <h3>F2 // FLOORS</h3>
        <div class="btn-grid">
          <button class="insp-btn" data-floor="1">1: Attic</button>
          <button class="insp-btn" data-floor="2">2: Crypt</button>
          <button class="insp-btn" data-floor="3">3: Symlinks</button>
          <button class="insp-btn" data-floor="4">4: Boiler</button>
          <button class="insp-btn" data-floor="5">5: Kernel</button>
          <button class="insp-btn" id="btn-heal">Heal HP</button>
          <button class="insp-btn" id="btn-lightning">Intro flash</button>
          <button class="insp-btn" id="btn-hitboxes">Hitboxes: ${stage.config.showHitboxes ? 'ON' : 'OFF'}</button>
          <button class="insp-btn" id="btn-hot-reload-top">Hot-Reload Assets</button>
        </div>
      </div>
      <div class="insp-section">
        <h3>PICKUPS</h3>
        <div class="btn-grid three">
          <button class="insp-btn" data-give="energy" ${give ? '' : 'disabled'}>+ Energy</button>
          <button class="insp-btn" data-give="ram" ${give ? '' : 'disabled'}>+16 GB RAM</button>
          <button class="insp-btn" data-give="ssd" ${give ? '' : 'disabled'}>+256 GB SSD</button>
        </div>
        ${give ? '' : '<p class="insp-note">Session has no debugGive() yet: pickups can only be collected in game.</p>'}
      </div>
      <div class="insp-section">
        <h3>CINEMATICS</h3>
        <div class="btn-grid">
          <button class="insp-btn" id="btn-intro">Play intro</button>
          <button class="insp-btn" id="btn-outro">Play outro</button>
        </div>
      </div>
      <div class="insp-section">
        <h3>KERNEL EVENTS</h3>
        <div class="btn-grid">
          <button class="insp-btn" data-ev="lantern">ls -la</button>
          <button class="insp-btn" data-ev="hop">cd hop</button>
          <button class="insp-btn" data-ev="smash3">cd ../../../</button>
          <button class="insp-btn" data-ev="eloop">ELOOP flood</button>
          <button class="insp-btn" data-ev="denied">Rattle 000</button>
          <button class="insp-btn" data-ev="chmod_open">chmod +rx</button>
          <button class="insp-btn" data-ev="petrify">chmod -x</button>
          <button class="insp-btn" data-ev="bridge">mv bridge</button>
          <button class="insp-btn" data-ev="null_sink">/dev/null</button>
          <button class="insp-btn" data-ev="hand_fork">System Hand</button>
          <button class="insp-btn" data-ev="dialogue">Socket bubble</button>
          <button class="insp-btn" data-ev="xray">ps/top X-Ray</button>
          <button class="insp-btn" data-ev="freeze">kill -STOP</button>
          <button class="insp-btn" data-ev="kill9">kill -9</button>
          <button class="insp-btn" data-ev="damage">Player hit</button>
          <button class="insp-btn" data-ev="clear">Floor clear</button>
        </div>
      </div>
      <div class="insp-section">
        <h3>STAGE</h3>
        <div class="slider-row">
          <span>Shake (${stage.config.shakeIntensity})</span>
          <input type="range" min="0" max="28" value="${stage.config.shakeIntensity}" id="sl-shake" />
        </div>
        <div class="slider-row">
          <span>Tween ms (${stage.config.transitionMs})</span>
          <input type="range" min="140" max="1000" step="20" value="${stage.config.transitionMs}" id="sl-ms" />
        </div>
      </div>
      <div class="insp-section">
        <h3>ALBEDO</h3>
        ${statuses
          .map(
            (s) => `<div class="asset-badge"><span>${s.key}</span><span class="${s.source === 'PNG' ? 'tag-png' : 'tag-proc'}">[${s.source}]</span></div>`,
          )
          .join('')}
      </div>
    `;
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
  fire: (ev: KernelEvent) => void,
  render: () => void,
): void {
  container.querySelectorAll<HTMLButtonElement>('[data-floor]').forEach((btn) => {
    btn.onclick = () => actions.onTeleport(Number(btn.dataset.floor));
  });
  const heal = container.querySelector<HTMLButtonElement>('#btn-heal');
  if (heal) heal.onclick = () => actions.onHeal();
  container.querySelectorAll<HTMLButtonElement>('[data-give]').forEach((btn) => {
    btn.onclick = () => give?.(btn.dataset.give as 'energy' | 'ram' | 'ssd');
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
  const fire = actions.emit ?? ((ev: KernelEvent) => stage.handleEvent(ev));
  const render = (): void => {
    container.innerHTML = inspectorMarkup(stage, give);
    wireInspector(container, stage, actions, give, fire, render);
  };
  render();
}
