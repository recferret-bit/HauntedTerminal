import type { LevelInfo } from '../game/types.js';
import { el } from './dom-lite.js';

/** The small block under the avatar, HP and turn: the level name and a one-line objective (always visible). */
export interface LevelBlock {
  readonly root: HTMLElement;
  /** Cheap to call every frame: it writes only what changed. A missing level hides the block. */
  update(level: LevelInfo | undefined): void;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Appends `#level-block` to `statusCol` (`.hero-status-col`). */
export function mountLevelBlock(statusCol: HTMLElement): LevelBlock {
  const title = el('b', 'level-block-title');
  title.id = 'level-block-title';
  const objective = el('span', 'level-block-objective');
  objective.id = 'level-block-objective';
  const root = el('div', 'level-block', [title, objective]);
  root.id = 'level-block';
  root.hidden = true;
  statusCol.appendChild(root);
  return {
    root,
    update(level) {
      root.hidden = !level;
      if (!level) return;
      setText(title, level.title);
      setText(objective, level.objective);
      root.title = `${level.title}: ${level.objective}`;
    },
  };
}
