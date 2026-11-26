import type { KernelEvent } from '../contracts/events.js';
import type { TerminalSkinId } from '../contracts/terminal-skins.js';
import type { GameSnapshot, TickResult } from '../game/types.js';
import type { EndStats } from '../ui/hud.js';

export type PlayModalKind = 'manual' | 'map' | 'hint' | 'menu';
export type PlayModalAction = 'open' | 'close' | 'toggle';

export type PlayEvent =
  | { kind: 'apply-events'; events: KernelEvent[]; snap: GameSnapshot; printed?: string }
  | { kind: 'apply-tick'; res: TickResult }
  | { kind: 'paint'; snap: GameSnapshot }
  | { kind: 'sync-pause' }
  | { kind: 'ending-begin'; stats: EndStats | null }
  | { kind: 'play-again'; skipIntro: boolean }
  | { kind: 'run-start' }
  | { kind: 'skin-change'; id: TerminalSkinId }
  | { kind: 'modal'; modal: PlayModalKind; action: PlayModalAction; query?: string | number }
  | { kind: 'floor-restart' }
  | { kind: 'session-swapped' };

export interface PlayModalTarget {
  openManual(query?: string | number): void;
  closeManual(): void;
  isManualOpen(): boolean;
  openMap(query?: string | number): void;
  closeMap(): void;
  isMapOpen(): boolean;
  openHint(): void;
  closeHint(): void;
  isHintOpen(): boolean;
  openMenu(): void;
  closeMenu(): void;
  isMenuOpen(): boolean;
}

export function routeModalAction(
  target: PlayModalTarget,
  ev: { modal: PlayModalKind; action: PlayModalAction; query?: string | number },
): void {
  const slots: Record<PlayModalKind, { isOpen: () => boolean; open: () => void; close: () => void }> = {
    manual: { isOpen: target.isManualOpen, open: () => target.openManual(ev.query), close: target.closeManual },
    map: { isOpen: target.isMapOpen, open: () => target.openMap(ev.query), close: target.closeMap },
    hint: { isOpen: target.isHintOpen, open: target.openHint, close: target.closeHint },
    menu: { isOpen: target.isMenuOpen, open: target.openMenu, close: target.closeMenu },
  };
  const slot = slots[ev.modal];
  if (ev.action === 'open') slot.open();
  else if (ev.action === 'close') slot.close();
  else if (slot.isOpen()) slot.close();
  else slot.open();
}

export interface PlayEventBus {
  emit(event: PlayEvent): void;
  subscribe(listener: (event: PlayEvent) => void): () => void;
}

export function createPlayBus(): PlayEventBus {
  const listeners = new Set<(event: PlayEvent) => void>();
  return {
    emit(event) {
      for (const fn of listeners) fn(event);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
