import type { GameSnapshot } from '../game/types.js';
import { escHtml as esc } from '../renderer/html-escape.js';

export interface HudHandlers {
  onHint(): void;
  onMute(): void;
  onRestartFloor(): void;
  onPlayAgain(skipIntroNextTime: boolean): void;
  maxFloors?: number;
  initialTactical?: boolean;
  onToggleTactical?: () => boolean;
}

export interface EndStats {
  rank: 'C' | 'B' | 'A' | 'S';
  timeSec: number;
  commands: number;
  shortcuts: string[];
}

export interface Hud {
  update(snap: GameSnapshot): void;
  /** Red flash over the stage and a floating damage number on the HP bar. */
  damage(amount: number, source: string): void;
  /** A comic pop next to the field the pickup raised. */
  pickup(item: 'energy' | 'ram' | 'ssd', label: string): void;
  /** Big banner: an SSD backup saved the run. */
  backupUsed(hp: number): void;
  /** Paper note under the Hint button. */
  showHint(text: string): void;
  showStats(stats: EndStats, skipIntro: boolean): void;
  hideStats(): void;
}

export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** Restart a CSS animation by toggling its class. */
function replay(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

function q<T extends HTMLElement>(sel: string, from: ParentNode): T {
  return from.querySelector<T>(sel)!;
}

const HUD_HTML = (maxFloors: number, tactical: string) => `
    <div class="hud-cell hud-hp" id="hud-hp-cell" title="Health">
      <span class="hud-k">HP</span>
      <span class="hp-bar" aria-hidden="true"><i id="hud-hp-bar"></i></span>
      <b id="hud-hp">100/100</b>
    </div>
    <div class="hud-cell" id="hud-ram-cell" title="RAM collected: every 16 GB adds max HP">
      <span class="hud-k">RAM</span><b id="hud-ram">0</b><span class="hud-u">GB</span>
    </div>
    <div class="hud-cell" id="hud-ssd-cell" title="SSD collected: 256 GB = one backup">
      <span class="hud-k">SSD</span><b id="hud-ssd">0</b><span class="hud-u">GB</span>
      <span class="pips" id="hud-pips"></span>
    </div>
    <div class="hud-cell" id="hud-enemy-cell" title="Malware left on this floor">
      <span class="hud-k">BUGS</span><b id="hud-enemies">0/0</b>
    </div>
    <div class="hud-cell" title="Floor / Sector">
      <span class="hud-k">FL</span><b id="hud-floor">1</b><span class="hud-u">/${maxFloors}</span>
    </div>
    <div class="hud-cell" title="Commands typed">
      <span class="hud-k">CMD</span><b id="hud-cmd">0</b>
    </div>
    <div class="hud-cell" title="Time">
      <b id="hud-time">0:00</b><span class="hud-pause" id="hud-pause">II</span>
    </div>
    <div class="hud-btns">
      ${tactical}
      <button type="button" id="hud-hint" title="A nudge for this room">? Hint</button>
      <button type="button" id="hud-mute" title="Toggle sound">Sound</button>
      <button type="button" id="hud-restart" title="Restart this floor">Restart floor</button>
    </div>
  `;

const STATS_HTML = `
    <div class="card">
      <p class="kicker">DAWN // RUN COMPLETE</p>
      <h2>YOU EXITED</h2>
      <div class="rank" id="outro-rank">C</div>
      <dl>
        <dt>Time</dt><dd id="outro-time">0:00</dd>
        <dt>Commands</dt><dd id="outro-cmd">0</dd>
        <dt>Shortcuts</dt><dd id="outro-cuts">none</dd>
      </dl>
      <label class="skip-row"><input type="checkbox" id="outro-skip" /> Skip the intro next time</label>
      <div class="outro-actions">
        <button type="button" id="outro-again">Play Again</button>
        <a class="hud-link" href="/">Home</a>
      </div>
    </div>
  `;

interface HudView {
  root: HTMLElement;
  stats: HTMLElement;
  hpCell: HTMLElement;
  hpText: HTMLElement;
  hpBar: HTMLElement;
  ram: HTMLElement;
  ssd: HTMLElement;
  pips: HTMLElement;
  enemies: HTMLElement;
  floor: HTMLElement;
  cmd: HTMLElement;
  time: HTMLElement;
  pause: HTMLElement;
  mute: HTMLButtonElement;
  flash: HTMLElement;
  hint: HTMLElement;
  backup: HTMLElement;
  skipBox: HTMLInputElement;
  lastHp: number;
  lastPips: string;
  hintTimer: number;
}

function pop(anchor: HTMLElement, text: string, cls: string): void {
  const el = document.createElement('span');
  el.className = `hud-pop ${cls}`;
  el.textContent = text;
  anchor.appendChild(el);
  window.setTimeout(() => el.remove(), 1400);
}

function updateHud(view: HudView, snap: GameSnapshot): void {
  const maxHp = Math.max(1, snap.maxHp || 100);
  if (snap.hp !== view.lastHp) {
    view.hpText.textContent = `${snap.hp}/${maxHp}`;
    view.lastHp = snap.hp;
  }
  view.hpBar.style.width = `${Math.max(0, Math.min(100, (snap.hp / maxHp) * 100))}%`;
  view.hpCell.classList.toggle('low', snap.hp / maxHp <= 0.3);
  view.ram.textContent = String(snap.ram ?? 0);
  view.ssd.textContent = String(snap.ssd ?? 0);
  const backups = Math.max(0, snap.backups ?? 0);
  const progress = ((snap.ssd ?? 0) % 256) / 256;
  const key = `${backups}:${progress}`;
  if (key !== view.lastPips) {
    view.lastPips = key;
    const full = Array.from({ length: Math.min(backups, 6) }, () => '<i class="pip on"></i>').join('');
    const more = backups > 6 ? `<em>+${backups - 6}</em>` : '';
    view.pips.innerHTML = `${full}${more}<i class="pip part" style="--fill:${Math.round(progress * 100)}%"></i>`;
    view.pips.title = `${backups} backup${backups === 1 ? '' : 's'}`;
  }
  view.enemies.textContent = `${snap.enemiesLeft ?? 0}/${snap.enemiesTotal ?? 0}`;
  q('#hud-enemy-cell', view.root).classList.toggle('clear', (snap.enemiesTotal ?? 0) > 0 && snap.enemiesLeft === 0);
  view.floor.textContent = String(snap.room?.floor ?? snap.floor);
  view.cmd.textContent = String(snap.commands);
  view.time.textContent = clock(snap.timeSec);
  view.pause.classList.toggle('on', !!snap.paused);
  view.mute.textContent = snap.muted ? 'Muted' : 'Sound';
  view.mute.classList.toggle('off', snap.muted);
}

function hudApi(view: HudView): Hud {
  return {
    update: (snap) => updateHud(view, snap),
    damage(amount, source) {
      replay(view.flash, 'hit');
      replay(view.hpCell, 'shake');
      pop(view.hpCell, `-${amount}`, 'pop-dmg');
      view.flash.title = source;
    },
    pickup(item, label) {
      const anchor = item === 'ram' ? q('#hud-ram-cell', view.root) : item === 'ssd' ? q('#hud-ssd-cell', view.root) : view.hpCell;
      replay(anchor, 'bump');
      pop(anchor, label, `pop-${item}`);
    },
    backupUsed(hp) {
      q('span', view.backup).textContent = `SSD backup loaded. HP ${hp}.`;
      replay(view.backup, 'show');
    },
    showHint(text) {
      q('p', view.hint).innerHTML = esc(text).replace(/\n/g, '<br>');
      replay(view.hint, 'open');
      window.clearTimeout(view.hintTimer);
      view.hintTimer = window.setTimeout(() => view.hint.classList.remove('open'), 9000);
    },
    showStats(s, skipIntro) {
      q('#outro-rank', view.stats).textContent = s.rank;
      q('#outro-time', view.stats).textContent = clock(s.timeSec);
      q('#outro-cmd', view.stats).textContent = String(s.commands);
      q('#outro-cuts', view.stats).textContent = s.shortcuts.length ? s.shortcuts.join(', ') : 'none';
      view.skipBox.checked = skipIntro;
      view.stats.classList.add('open');
      q<HTMLButtonElement>('#outro-again', view.stats).focus();
    },
    hideStats() {
      view.stats.classList.remove('open');
    },
  };
}

function bindHud(root: HTMLElement, fx: HTMLElement, handlers: HudHandlers): void {
  q<HTMLButtonElement>('#hud-hint', root).onclick = () => handlers.onHint();
  q<HTMLButtonElement>('#hud-mute', root).onclick = () => handlers.onMute();
  q<HTMLButtonElement>('#hud-restart', root).onclick = () => handlers.onRestartFloor();
  const tacticalBtn = root.querySelector<HTMLButtonElement>('#hud-tactical');
  if (tacticalBtn && handlers.onToggleTactical) {
    tacticalBtn.onclick = () => {
      const on = handlers.onToggleTactical!();
      tacticalBtn.classList.toggle('tactical-on', on);
      tacticalBtn.textContent = on ? 'Tactical: ON' : 'Tactical';
    };
  }
  q('#fx-hint', fx).onclick = () => q('#fx-hint', fx).classList.remove('open');
}

function mountFx(stageWrap: HTMLElement): HTMLElement {
  const fx = document.createElement('div');
  fx.className = 'hud-fx-layer';
  fx.innerHTML = `
    <div class="damage-flash" id="fx-damage"></div>
    <div class="hint-note" id="fx-hint" role="status"><span class="hint-pin"></span><p></p><small>click to close</small></div>
    <div class="backup-banner" id="fx-backup"><b>BACKUP RESTORED!</b><span></span></div>
  `;
  stageWrap.appendChild(fx);
  return fx;
}

export function mountHud(root: HTMLElement, stageWrap: HTMLElement, stats: HTMLElement, handlers: HudHandlers): Hud {
  const tactical = handlers.onToggleTactical
    ? `<button type="button" id="hud-tactical" class="${handlers.initialTactical ? 'tactical-on' : ''}" title="Toggle Turn-Based Tactical Mode">${handlers.initialTactical ? 'Tactical: ON' : 'Tactical'}</button>`
    : '';
  root.innerHTML = HUD_HTML(handlers.maxFloors ?? 5, tactical);
  const fx = mountFx(stageWrap);
  bindHud(root, fx, handlers);
  stats.innerHTML = STATS_HTML;
  const skipBox = q<HTMLInputElement>('#outro-skip', stats);
  q<HTMLButtonElement>('#outro-again', stats).onclick = () => handlers.onPlayAgain(skipBox.checked);
  const hint = q('#fx-hint', fx);
  return hudApi({
    root,
    stats,
    hpCell: q('#hud-hp-cell', root),
    hpText: q('#hud-hp', root),
    hpBar: q('#hud-hp-bar', root),
    ram: q('#hud-ram', root),
    ssd: q('#hud-ssd', root),
    pips: q('#hud-pips', root),
    enemies: q('#hud-enemies', root),
    floor: q('#hud-floor', root),
    cmd: q('#hud-cmd', root),
    time: q('#hud-time', root),
    pause: q('#hud-pause', root),
    mute: q<HTMLButtonElement>('#hud-mute', root),
    flash: q('#fx-damage', fx),
    hint,
    backup: q('#fx-backup', fx),
    skipBox,
    lastHp: -1,
    lastPips: '',
    hintTimer: 0,
  });
}
