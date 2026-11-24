import { ACHIEVEMENT_SPECS, readAchievements } from '../chapters/achievements.js';
import { downloadPortableSaveFile } from '../chapters/portable-save.js';
import { wireExternalLinksForDesktop, wireSteamWishlistLink } from '../chapters/steam-bridge.js';
import { heroModel } from '../game/inventory.js';
import type { GameSnapshot } from '../game/types.js';
import { escHtml as esc } from '../renderer/html-escape.js';
import {
  el, heroFaceTierForHp, PORTRAIT_FRAMES, type DrawPortrait, type HeroFaceTier,
} from './dom-lite.js';
import { mountItemsStrip, type ItemsStrip } from './items-strip.js';

export interface HudHandlers {
  onHint(): void;
  onMute(): void;
  onRestartFloor(): void;
  onPlayAgain(skipIntroNextTime: boolean): void;
  maxFloors?: number;
  initialTactical?: boolean;
  /** Draws the item icons of the strip (the renderer's `drawPortrait`, passed in by `src/play`: `src/ui` imports no three). Without it the strip is not mounted. */
  drawPortrait?: DrawPortrait;
  onToggleTactical?: () => boolean;
  onHintShow?: () => void;
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
  pickup(item: 'energy' | 'ram' | 'ssd' | 'lantern', label: string): void;
  /** Big banner: an SSD backup saved the run. */
  backupUsed(hp: number): void;
  /** Non-blocking comic stamp when a local achievement unlocks. */
  achievement(item: { icon: string; title: string; steamApiName: string; description: string }): void;
  /** Paper note under the Hint button. */
  showHint(text: string): void;
  hideHint(): void;
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

const HERO_AVATAR_PX = 64;
const HERO_IDLE_MS = 180;
const HERO_OUCH_MS = 600;
const DEFAULT_HERO_MODEL = 'vibecoder.dev';
const heroHudCleanup = new WeakMap<HTMLElement, () => void>();

function unrefTimer(id: number): number {
  const handle = id as unknown as { unref?: () => void };
  handle.unref?.();
  return id;
}

const HUD_HTML = (maxFloors: number, tactical: string) => `
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
        <dt>Trophies</dt><dd id="outro-ach">0/${ACHIEVEMENT_SPECS.length}</dd>
      </dl>
      <label class="skip-row"><input type="checkbox" id="outro-skip" /> Skip the intro next time</label>
      <div class="outro-actions">
        <button type="button" id="outro-again">Play Again</button>
        <a class="hud-link hud-steam" id="outro-wishlist" href="/?wishlist=1">* Wishlist on Steam</a>
        <button type="button" id="outro-export">Export Save (.json)</button>
        <a class="hud-link" href="/">Home</a>
      </div>
    </div>
  `;

interface HudView {
  root: HTMLElement;
  stats: HTMLElement;
  heroRoot: HTMLElement;
  heroAvatar: HTMLElement;
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
  achToast: HTMLElement;
  achQueue: Array<{ icon: string; title: string; steamApiName: string; description: string }>;
  achTimer: number;
  skipBox: HTMLInputElement;
  items: ItemsStrip | null;
  drawPortrait?: DrawPortrait;
  heroModelId: string;
  heroFrame: number;
  heroFaceTier: 0 | 1 | 2 | 3 | 4;
  ouchUntil: number;
  heroTimer: number;
  ouchTimer: number;
  lastHp: number;
  lastPips: string;
  hintTimer: number;
  onHintShow?: () => void;
}

function renderHeroAvatar(view: HudView): void {
  const tier: HeroFaceTier = view.ouchUntil > Date.now() ? 'ouch' : view.heroFaceTier;
  view.heroRoot.dataset.tier = String(tier);
  view.heroRoot.dataset.frame = String(view.heroFrame);
  view.heroAvatar.dataset.tier = String(tier);
  view.heroAvatar.dataset.frame = String(view.heroFrame);
  if (!view.drawPortrait) return;
  const canvas = view.drawPortrait(view.heroModelId, HERO_AVATAR_PX, view.heroFrame, tier);
  if (view.heroAvatar.firstChild !== canvas) view.heroAvatar.replaceChildren(canvas);
}

function mountHeroHud(
  stageWrap: HTMLElement,
  drawPortrait?: DrawPortrait,
): { root: HTMLElement; avatar: HTMLElement; hpCell: HTMLElement; hpText: HTMLElement; hpBar: HTMLElement } {
  stageWrap.querySelector('#hero-hud')?.remove();
  const avatar = el('div', 'hero-avatar');
  avatar.id = 'hero-avatar';
  avatar.dataset.tier = '0';
  avatar.dataset.frame = '0';
  if (drawPortrait) avatar.appendChild(drawPortrait(DEFAULT_HERO_MODEL, HERO_AVATAR_PX, 0, 0));

  const hpBar = document.createElement('i');
  hpBar.id = 'hud-hp-bar';
  const barWrap = el('span', 'hp-bar', [hpBar]);
  barWrap.setAttribute('aria-hidden', 'true');
  const hpText = document.createElement('b');
  hpText.id = 'hud-hp';
  hpText.textContent = '100/100';
  const hpCell = el('div', 'hud-cell hud-hp', [barWrap, hpText]);
  hpCell.id = 'hud-hp-cell';
  hpCell.setAttribute('title', 'Health');

  const dName = el('b', 'dialog-name');
  dName.id = 'hero-dialog-name';
  const dText = el('p', 'dialog-text');
  dText.id = 'hero-dialog-text';
  const drawer = el('div', 'hero-dialog-drawer', [el('div', 'hero-dialog-inner', [dName, dText])]);
  drawer.id = 'hero-dialog-drawer';
  drawer.setAttribute('aria-live', 'polite');
  drawer.setAttribute('aria-hidden', 'true');

  const root = el('div', 'hero-hud', [el('div', 'hero-status-col', [avatar, hpCell]), drawer]);
  root.id = 'hero-hud';
  root.dataset.tier = '0';
  root.dataset.frame = '0';

  const host = stageWrap.querySelector<HTMLElement>('#titleblock') ?? stageWrap;
  if (typeof host.prepend === 'function') host.prepend(root);
  else host.appendChild(root);
  return { root, avatar, hpCell, hpText, hpBar };
}

function pop(anchor: HTMLElement, text: string, cls: string): void {
  const el = document.createElement('span');
  el.className = `hud-pop ${cls}`;
  el.textContent = text;
  anchor.appendChild(el);
  globalThis.setTimeout(() => el.remove(), 1400);
}

function updateHud(view: HudView, snap: GameSnapshot): void {
  const maxHp = Math.max(1, snap.maxHp || 100);
  if (snap.hp !== view.lastHp) {
    view.hpText.textContent = `${snap.hp}/${maxHp}`;
    view.lastHp = snap.hp;
  }
  view.hpBar.style.width = `${Math.max(0, Math.min(100, (snap.hp / maxHp) * 100))}%`;
  view.hpCell.classList.toggle('low', snap.hp / maxHp <= 0.3);
  const nextModel = heroModel(snap.inventory?.held);
  const nextTier = heroFaceTierForHp(snap.hp, maxHp);
  if (nextModel !== view.heroModelId || nextTier !== view.heroFaceTier) {
    view.heroModelId = nextModel;
    view.heroFaceTier = nextTier;
    renderHeroAvatar(view);
  }
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
  if (snap.inventory) view.items?.update(snap.inventory);
}

function hudApi(view: HudView): Hud {
  return {
    update: (snap) => updateHud(view, snap),
    damage(amount, source) {
      replay(view.flash, 'hit');
      replay(view.hpCell, 'shake');
      pop(view.hpCell, `-${amount}`, 'pop-dmg');
      view.flash.title = source;
      view.ouchUntil = Date.now() + HERO_OUCH_MS;
      view.heroRoot.classList.add('ouch');
      renderHeroAvatar(view);
      globalThis.clearTimeout(view.ouchTimer);
      view.ouchTimer = unrefTimer(globalThis.setTimeout(() => {
        view.ouchTimer = 0;
        view.ouchUntil = 0;
        view.heroRoot.classList.remove('ouch');
        renderHeroAvatar(view);
      }, HERO_OUCH_MS + 10) as unknown as number);
    },
    pickup(item, label) {
      if (item === 'lantern') {
        view.items?.pop('lantern');
        return;
      }
      const anchor = item === 'ram' ? q('#hud-ram-cell', view.root) : item === 'ssd' ? q('#hud-ssd-cell', view.root) : view.hpCell;
      replay(anchor, 'bump');
      pop(anchor, label, `pop-${item}`);
    },
    backupUsed(hp) {
      q('span', view.backup).textContent = `SSD backup loaded. HP ${hp}.`;
      replay(view.backup, 'show');
    },
    achievement(item) {
      view.achQueue.push(item);
      if (view.achTimer) return;
      const showNext = (): void => {
        const next = view.achQueue.shift();
        if (!next) {
          view.achToast.classList.remove('open');
          view.achTimer = 0;
          return;
        }
        q('.ach-icon', view.achToast).textContent = next.icon;
        q('.ach-title', view.achToast).textContent = next.title;
        q('.ach-key', view.achToast).textContent = next.steamApiName;
        q('.ach-desc', view.achToast).textContent = next.description;
        replay(view.achToast, 'open');
        view.achTimer = globalThis.setTimeout(showNext, 3400) as unknown as number;
      };
      showNext();
    },
    showHint(text) {
      view.onHintShow?.();
      q('p', view.hint).innerHTML = esc(text).replace(/\n/g, '<br>');
      replay(view.hint, 'open');
      globalThis.clearTimeout(view.hintTimer);
      view.hintTimer = globalThis.setTimeout(() => view.hint.classList.remove('open'), 9000) as unknown as number;
    },
    hideHint() {
      globalThis.clearTimeout(view.hintTimer);
      view.hintTimer = 0;
      view.hint.classList.remove('open');
    },
    showStats(s, skipIntro) {
      q('#outro-rank', view.stats).textContent = s.rank;
      q('#outro-time', view.stats).textContent = clock(s.timeSec);
      q('#outro-cmd', view.stats).textContent = String(s.commands);
      q('#outro-cuts', view.stats).textContent = s.shortcuts.length ? s.shortcuts.join(', ') : 'none';
      const unlockedCount = Object.keys(readAchievements().unlocked).length;
      q('#outro-ach', view.stats).textContent = `${unlockedCount}/${ACHIEVEMENT_SPECS.length} local (Steam-ready)`;
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
  stageWrap.querySelector<HTMLElement>('.hud-fx-layer')?.remove();
  const fx = document.createElement('div');
  fx.className = 'hud-fx-layer';
  fx.innerHTML = `
    <div class="damage-flash" id="fx-damage"></div>
    <div class="hint-note" id="fx-hint" role="status"><span class="hint-pin"></span><p></p><small>click to close</small></div>
    <div class="backup-banner" id="fx-backup"><b>BACKUP RESTORED!</b><span></span></div>
    <div class="achievement-toast" id="fx-achievement" aria-live="polite">
      <span class="ach-icon"></span>
      <div class="ach-body">
        <div class="ach-head"><b>TROPHY UNLOCKED</b><code class="ach-key"></code></div>
        <strong class="ach-title"></strong>
        <small class="ach-desc"></small>
      </div>
    </div>
  `;
  stageWrap.appendChild(fx);
  return fx;
}

export function mountHud(root: HTMLElement, stageWrap: HTMLElement, stats: HTMLElement, handlers: HudHandlers): Hud {
  heroHudCleanup.get(stageWrap)?.();
  const tactical = handlers.onToggleTactical
    ? `<button type="button" id="hud-tactical" class="${handlers.initialTactical ? 'tactical-on' : ''}" title="Toggle Turn-Based Tactical Mode">${handlers.initialTactical ? 'Tactical: ON' : 'Tactical'}</button>`
    : '';
  root.innerHTML = HUD_HTML(handlers.maxFloors ?? 5, tactical);
  const hero = mountHeroHud(stageWrap, handlers.drawPortrait);
  const fx = mountFx(stageWrap);
  bindHud(root, fx, handlers);
  stats.innerHTML = STATS_HTML;
  const skipBox = q<HTMLInputElement>('#outro-skip', stats);
  q<HTMLButtonElement>('#outro-again', stats).onclick = () => handlers.onPlayAgain(skipBox.checked);
  wireExternalLinksForDesktop(stats);
  wireSteamWishlistLink(q<HTMLAnchorElement>('#outro-wishlist', stats));
  const exportBtn = q<HTMLButtonElement>('#outro-export', stats);
  exportBtn.onclick = () => {
    downloadPortableSaveFile();
    exportBtn.textContent = 'Save Exported';
    globalThis.setTimeout(() => {
      exportBtn.textContent = 'Export Save (.json)';
    }, 2400);
  };
  const hint = q('#fx-hint', fx);
  const view: HudView = {
    root,
    stats,
    heroRoot: hero.root,
    heroAvatar: hero.avatar,
    hpCell: hero.hpCell,
    hpText: hero.hpText,
    hpBar: hero.hpBar,
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
    achToast: q('#fx-achievement', fx),
    achQueue: [],
    achTimer: 0,
    skipBox,
    items: handlers.drawPortrait ? mountItemsStrip(root, handlers.drawPortrait) : null,
    drawPortrait: handlers.drawPortrait,
    heroModelId: DEFAULT_HERO_MODEL,
    heroFrame: 0,
    heroFaceTier: 0,
    ouchUntil: 0,
    heroTimer: 0,
    ouchTimer: 0,
    lastHp: -1,
    lastPips: '',
    hintTimer: 0,
    onHintShow: handlers.onHintShow,
  };
  if (handlers.drawPortrait) {
    view.heroTimer = unrefTimer(globalThis.setInterval(() => {
      view.heroFrame = (view.heroFrame + 1) % PORTRAIT_FRAMES;
      renderHeroAvatar(view);
    }, HERO_IDLE_MS) as unknown as number);
  }
  heroHudCleanup.set(stageWrap, () => {
    globalThis.clearInterval(view.heroTimer);
    globalThis.clearTimeout(view.ouchTimer);
    view.heroTimer = 0;
    view.ouchTimer = 0;
  });
  return hudApi(view);
}
