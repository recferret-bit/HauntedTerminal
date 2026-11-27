import { ACHIEVEMENT_SPECS, readAchievements } from '../chapters/achievements.js';
import { downloadPortableSaveFile } from '../chapters/portable-save.js';
import { wireExternalLinksForDesktop, wireSteamWishlistLink } from '../chapters/steam-bridge.js';
import { heroModel, type ItemId } from '../game/inventory.js';
import type { GameSnapshot } from '../game/types.js';
import {
  dom, el, heroFaceTierForHp, PORTRAIT_FRAMES, replayClass, type DrawPortrait, type HeroFaceTier,
} from './dom-lite.js';
import { mountItemsStrip, type ItemsStrip } from './items-strip.js';

export interface HudHandlers {
  onHint(): void;
  onMap?(): void;
  onManual?(): void;
  /** The laptop slot was clicked (the play page opens the laptop overlay). */
  onLaptop?(): void;
  onSkipDialog?(): void;
  onPlayAgain(skipIntroNextTime: boolean): void;
  maxFloors?: number;
  /** Draws the item icons of the strip (the renderer's `drawPortrait`, passed in by `src/play`: `src/ui` imports no three). Without it the strip is not mounted. */
  drawPortrait?: DrawPortrait;
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
  pickup(item: 'energy' | 'ram' | 'ssd' | 'tube_transistor' | 'laptop' | 'tensor_gpu' | 'vram_module', label: string): void;
  /** Pops an inventory slot when an NPC or sector reward hands over an item. */
  itemGiven?(item: ItemId): void;
  /** Big banner: an SSD backup saved the run. */
  backupUsed(hp: number): void;
  /** Non-blocking comic stamp when a local achievement unlocks. */
  achievement(item: { icon: string; title: string; steamApiName: string; description: string }): void;
  showStats(stats: EndStats, skipIntro: boolean): void;
  hideStats(): void;
}

function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
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

function buildHudNodes(maxFloors: number): HTMLElement[] {
  return [
    dom('div', { class: 'hud-cell', id: 'hud-ram-cell', title: 'RAM collected: every 16 GB adds max HP' }, [
      dom('span', { class: 'hud-k' }, ['RAM']), dom('b', { id: 'hud-ram' }, ['0']), dom('span', { class: 'hud-u' }, ['GB']),
    ]),
    dom('div', { class: 'hud-cell', id: 'hud-ssd-cell', title: 'SSD collected: 256 GB = one backup' }, [
      dom('span', { class: 'hud-k' }, ['SSD']), dom('b', { id: 'hud-ssd' }, ['0']), dom('span', { class: 'hud-u' }, ['GB']),
      dom('span', { class: 'pips', id: 'hud-pips' }),
    ]),
    dom('div', { class: 'hud-cell', id: 'hud-enemy-cell', title: 'Malware left on this floor' }, [
      dom('span', { class: 'hud-k' }, ['BUGS']), dom('b', { id: 'hud-enemies' }, ['0/0']),
    ]),
    dom('div', { class: 'hud-cell', title: 'Floor / Sector' }, [
      dom('span', { class: 'hud-k' }, ['FL']), dom('b', { id: 'hud-floor' }, ['1']), dom('span', { class: 'hud-u' }, [`/${maxFloors}`]),
    ]),
    dom('div', { class: 'hud-cell', title: 'Commands typed' }, [
      dom('span', { class: 'hud-k' }, ['CMD']), dom('b', { id: 'hud-cmd' }, ['0']),
    ]),
    dom('div', { class: 'hud-cell', title: 'Time' }, [
      dom('b', { id: 'hud-time' }, ['0:00']), dom('span', { class: 'hud-pause', id: 'hud-pause' }, ['II']),
    ]),
    dom('div', { class: 'hud-btns' }, [
      dom('button', { type: 'button', id: 'hud-map', title: 'Open Chapter Motherboard Map (F3)' }, ['Map']),
      dom('button', { type: 'button', id: 'hud-hint', title: 'Tasks & goals for this room' }, ['? Hint']),
    ]),
  ];
}

function buildStatsCard(): HTMLElement {
  return dom('div', { class: 'card' }, [
    dom('p', { class: 'kicker' }, ['DAWN // RUN COMPLETE']),
    dom('h2', {}, ['YOU EXITED']),
    dom('div', { class: 'rank', id: 'outro-rank' }, ['C']),
    dom('dl', {}, [
      dom('dt', {}, ['Time']), dom('dd', { id: 'outro-time' }, ['0:00']),
      dom('dt', {}, ['Commands']), dom('dd', { id: 'outro-cmd' }, ['0']),
      dom('dt', {}, ['Shortcuts']), dom('dd', { id: 'outro-cuts' }, ['none']),
      dom('dt', {}, ['Trophies']), dom('dd', { id: 'outro-ach' }, [`0/${ACHIEVEMENT_SPECS.length}`]),
    ]),
    dom('label', { class: 'skip-row' }, [
      dom('input', { type: 'checkbox', id: 'outro-skip' }),
      ' Skip the intro next time',
    ]),
    dom('div', { class: 'outro-actions' }, [
      dom('button', { type: 'button', id: 'outro-again' }, ['Play Again']),
      dom('a', { class: 'hud-link hud-steam', id: 'outro-wishlist', href: '/?wishlist=1' }, ['* Wishlist on Steam']),
      dom('button', { type: 'button', id: 'outro-export' }, ['Export Save (.json)']),
      dom('a', { class: 'hud-link', href: '/' }, ['Home']),
    ]),
  ]);
}

interface HudView {
  root: HTMLElement;
  stats: HTMLElement;
  heroRoot: HTMLElement;
  heroAvatar: HTMLElement;
  hpCell: HTMLElement;
  hpText: HTMLElement;
  hpBar: HTMLElement;
  turn: HTMLElement;
  battleCallout: HTMLElement;
  skipDialogBtn: HTMLButtonElement;
  mapBtn: HTMLButtonElement;
  lastTurn: string;
  ram: HTMLElement;
  ssd: HTMLElement;
  pips: HTMLElement;
  enemies: HTMLElement;
  floor: HTMLElement;
  cmd: HTMLElement;
  time: HTMLElement;
  pause: HTMLElement;
  flash: HTMLElement;
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
): { root: HTMLElement; avatar: HTMLElement; hpCell: HTMLElement; hpText: HTMLElement; hpBar: HTMLElement; turn: HTMLElement } {
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

  // The battle turn indicator: YOUR TURN 0:27 / ENEMY TURN (turn-based-battles Req 20). Hidden outside a battle.
  const turn = el('div', 'hero-turn');
  turn.id = 'hud-turn';
  turn.hidden = true;
  turn.setAttribute('aria-live', 'polite');

  const statusCol = el('div', 'hero-status-col', [avatar, hpCell, turn]);
  const root = el('div', 'hero-hud', [statusCol, drawer]);
  root.id = 'hero-hud';
  root.dataset.tier = '0';
  root.dataset.frame = '0';

  const host = stageWrap.querySelector<HTMLElement>('#titleblock') ?? stageWrap;
  if (typeof host.prepend === 'function') host.prepend(root);
  else host.appendChild(root);
  return { root, avatar, hpCell, hpText, hpBar, turn };
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
    const full = Array.from({ length: Math.min(backups, 6) }, () => dom('i', { class: 'pip on' }));
    const more = backups > 6 ? dom('em', {}, [`+${backups - 6}`]) : null;
    const part = dom('i', { class: 'pip part', style: `--fill:${Math.round(progress * 100)}%` });
    view.pips.replaceChildren(...full, ...(more ? [more] : []), part);
    view.pips.title = `${backups} backup${backups === 1 ? '' : 's'}`;
  }
  view.enemies.textContent = `${snap.enemiesLeft ?? 0}/${snap.enemiesTotal ?? 0}`;
  q('#hud-enemy-cell', view.root).classList.toggle('clear', (snap.enemiesTotal ?? 0) > 0 && snap.enemiesLeft === 0);
  view.floor.textContent = String(snap.room?.floor ?? snap.floor);
  view.cmd.textContent = String(snap.commands);
  view.time.textContent = clock(snap.timeSec);
  view.pause.classList.toggle('on', !!snap.paused);
  if (snap.inventory) view.items?.update(snap.inventory);
  const hideMap = !snap.inventory?.items.includes('map');
  view.mapBtn.hidden = hideMap;
  view.mapBtn.classList.toggle('hidden', hideMap);
  const hideSkip = !snap.openingDialog;
  view.skipDialogBtn.hidden = hideSkip;
  view.skipDialogBtn.classList.toggle('hidden', hideSkip);
  updateTurn(view, snap.battle);
}

/** `YOUR TURN 0:27` / `ENEMY TURN` / `FIGHT!` while a battle runs; hidden outside one. */
function updateTurn(view: HudView, battle: GameSnapshot['battle']): void {
  const text = !battle
    ? ''
    : battle.phase === 'player'
      ? `YOUR TURN ${clock(battle.secondsLeft ?? 0)}${battle.held ? ' II' : ''}`
      : battle.phase === 'enemy'
        ? 'ENEMY TURN'
        : 'FIGHT!';
  if (text === view.lastTurn) return;
  view.lastTurn = text;
  view.turn.hidden = text === '';
  view.turn.textContent = text;
  view.turn.dataset.phase = battle?.phase ?? 'idle';
  const urgent = battle?.phase === 'player' && (battle.secondsLeft ?? 0) <= 10;
  view.turn.classList.toggle('urgent', urgent);
  const callout = !battle
    ? ''
    : battle.phase === 'intro'
      ? 'BATTLE INCOMING — BIG FOUR TAUNTING! Press ENTER to FIGHT now!'
      : battle.phase === 'player'
        ? `BATTLE // YOUR TURN ${clock(battle.secondsLeft ?? 0)}${battle.held ? ' (PAUSED)' : ''} — Every Enter = 1 move, then enemies attack!`
        : 'BATTLE // ENEMY TURN — Incoming attack!';
  const hideCallout = callout === '';
  view.battleCallout.hidden = hideCallout;
  view.battleCallout.classList.toggle('hidden', hideCallout);
  view.battleCallout.textContent = callout;
  view.battleCallout.dataset.phase = battle?.phase ?? 'idle';
  view.battleCallout.classList.toggle('urgent', urgent);
}

function hudApi(view: HudView): Hud {
  return {
    update: (snap) => updateHud(view, snap),
    damage(amount, source) {
      replayClass(view.flash, 'hit');
      replayClass(view.hpCell, 'shake');
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
      if (item === 'tube_transistor' || item === 'laptop' || item === 'tensor_gpu' || item === 'vram_module') {
        view.items?.pop(item);
        return;
      }
      const anchor = item === 'ram' ? q('#hud-ram-cell', view.root) : item === 'ssd' ? q('#hud-ssd-cell', view.root) : view.hpCell;
      replayClass(anchor, 'bump');
      pop(anchor, label, `pop-${item}`);
    },
    itemGiven(item) {
      view.items?.pop(item);
    },
    backupUsed(hp) {
      q('span', view.backup).textContent = `SSD backup loaded. HP ${hp}.`;
      replayClass(view.backup, 'show');
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
        replayClass(view.achToast, 'open');
        view.achTimer = globalThis.setTimeout(showNext, 3400) as unknown as number;
      };
      showNext();
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

function bindHud(root: HTMLElement, handlers: HudHandlers): void {
  const mapBtn = root.querySelector<HTMLButtonElement>('#hud-map');
  if (mapBtn) mapBtn.onclick = () => handlers.onMap?.();
  q<HTMLButtonElement>('#hud-hint', root).onclick = () => handlers.onHint();
}

function mountLeftItemsStrip(
  titleblock: HTMLElement | null,
  fallback: HTMLElement,
  heroRoot: HTMLElement,
  drawPortrait?: DrawPortrait,
  onItemClick?: (id: ItemId) => void,
): ItemsStrip | null {
  if (!drawPortrait) return null;
  const host = titleblock ?? fallback;
  const items = mountItemsStrip(host, drawPortrait, onItemClick);
  const stripEl = host.querySelector<HTMLElement>('.items-strip');
  if (titleblock && stripEl && typeof heroRoot.after === 'function') heroRoot.after(stripEl);
  return items;
}

function mountFx(stageWrap: HTMLElement, onSkipDialog?: () => void): { fx: HTMLElement; skipBtn: HTMLButtonElement; battleCallout: HTMLElement } {
  stageWrap.querySelector<HTMLElement>('#titleblock > #fx-hint')?.remove();
  stageWrap.querySelector<HTMLElement>('.hud-fx-layer')?.remove();
  stageWrap.querySelector<HTMLElement>('#skip-dialog-btn')?.remove();
  stageWrap.querySelector<HTMLElement>('#battle-callout')?.remove();
  const skipBtn = dom('button', { type: 'button', id: 'skip-dialog-btn', class: 'skip-dialog-btn', title: 'Skip conversation and unlock terminal' }, [
    'Skip Dialog »',
  ]);
  skipBtn.hidden = true;
  skipBtn.onclick = () => onSkipDialog?.();
  const battleCallout = dom('div', { id: 'battle-callout', class: 'battle-callout', 'aria-live': 'polite' });
  battleCallout.hidden = true;
  const fx = dom('div', { class: 'hud-fx-layer' }, [
    dom('div', { class: 'damage-flash', id: 'fx-damage' }),
    dom('div', { class: 'backup-banner', id: 'fx-backup' }, [dom('b', {}, ['BACKUP RESTORED!']), dom('span')]),
    dom('div', { class: 'achievement-toast', id: 'fx-achievement', 'aria-live': 'polite' }, [
      dom('span', { class: 'ach-icon' }),
      dom('div', { class: 'ach-body' }, [
        dom('div', { class: 'ach-head' }, [dom('b', {}, ['TROPHY UNLOCKED']), dom('code', { class: 'ach-key' })]),
        dom('strong', { class: 'ach-title' }),
        dom('small', { class: 'ach-desc' }),
      ]),
    ]),
  ]);
  stageWrap.append(fx, skipBtn, battleCallout);
  return { fx, skipBtn, battleCallout };
}

export function mountHud(root: HTMLElement, stageWrap: HTMLElement, stats: HTMLElement, handlers: HudHandlers): Hud {
  heroHudCleanup.get(stageWrap)?.();
  root.replaceChildren(...buildHudNodes(handlers.maxFloors ?? 5));
  const hero = mountHeroHud(stageWrap, handlers.drawPortrait);
  const { fx, skipBtn, battleCallout } = mountFx(stageWrap, handlers.onSkipDialog);
  bindHud(root, handlers);
  stats.replaceChildren(buildStatsCard());
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
  const view: HudView = {
    root,
    stats,
    heroRoot: hero.root,
    heroAvatar: hero.avatar,
    hpCell: hero.hpCell,
    hpText: hero.hpText,
    hpBar: hero.hpBar,
    turn: hero.turn,
    battleCallout,
    skipDialogBtn: skipBtn,
    mapBtn: q<HTMLButtonElement>('#hud-map', root),
    lastTurn: '',
    ram: q('#hud-ram', root),
    ssd: q('#hud-ssd', root),
    pips: q('#hud-pips', root),
    enemies: q('#hud-enemies', root),
    floor: q('#hud-floor', root),
    cmd: q('#hud-cmd', root),
    time: q('#hud-time', root),
    pause: q('#hud-pause', root),
    flash: q('#fx-damage', fx),
    backup: q('#fx-backup', fx),
    achToast: q('#fx-achievement', fx),
    achQueue: [],
    achTimer: 0,
    skipBox,
    items: mountLeftItemsStrip(
      stageWrap.querySelector<HTMLElement>('#titleblock'),
      root,
      hero.root,
      handlers.drawPortrait,
      (id) => {
        if (id === 'map') handlers.onMap?.();
        else if (id === 'manual') handlers.onManual?.();
        else if (id === 'laptop') handlers.onLaptop?.();
      },
    ),
    drawPortrait: handlers.drawPortrait,
    heroModelId: DEFAULT_HERO_MODEL,
    heroFrame: 0,
    heroFaceTier: 0,
    ouchUntil: 0,
    heroTimer: 0,
    ouchTimer: 0,
    lastHp: -1,
    lastPips: '',
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
