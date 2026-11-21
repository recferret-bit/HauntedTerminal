import { bootHubPage, refreshOnSaveChange } from './boot.js';
import { wirePortableSaves } from './portable-saves.js';
import { renderTrophyRack, type TrophyFilter } from './trophy-rack.js';

bootHubPage('achievements');

let filter: TrophyFilter = 'all';

function refresh(): void {
  renderTrophyRack(filter, (next) => {
    filter = next;
    refresh();
  });
}

refresh();
wirePortableSaves(refresh);
refreshOnSaveChange(refresh);
