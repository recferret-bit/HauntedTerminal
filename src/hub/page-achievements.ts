import { refreshOnSaveChange } from './boot.js';
import { wirePortableSaves } from './portable-saves.js';
import { renderTrophyRack, type TrophyFilter } from './trophy-rack.js';

export function mount(): void {
  let filter: TrophyFilter = 'all';
  const refresh = (): void => {
    renderTrophyRack(filter, (next) => {
      filter = next;
      refresh();
    });
  };
  refresh();
  wirePortableSaves(refresh);
  refreshOnSaveChange(refresh);
}
