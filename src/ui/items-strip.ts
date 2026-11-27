import { ITEMS, ITEM_IDS, type ItemId } from '../contracts/inventory.js';
import { el, replayClass, type DrawPortrait } from './dom-lite.js';

export interface ItemsStrip {
  /** Redraw from `snapshot.inventory`: dim what he does not carry, highlight the held one. */
  update(inventory: { items: readonly ItemId[]; held: ItemId | null }): void;
  /** Short pop on a slot (a pickup). */
  pop(item: ItemId): void;
}

/** Slots that open a dialog on click, with the key that opens it too. */
const CLICK_KEYS: Partial<Record<ItemId, string>> = { manual: 'F1', map: 'F3', laptop: 'F4' };

/** Icon size in CSS px. */
const ICON_PX = 36;

/**
 * Always-visible HUD strip: one slot per item (`tube_transistor`, `terminal`, `laptop`, `manual`, `map`); `manual`, `map` and `laptop` open their dialog on click when carried.
 * Classes: `items-strip`, `item-slot` (`carried`, `held`, `pop`, `item-<id>`), `item-icon`, `item-label`.
 */
export function mountItemsStrip(
  parent: HTMLElement,
  drawPortrait: DrawPortrait,
  onItemClick?: (id: ItemId) => void,
): ItemsStrip {
  const slotTitle = (id: ItemId, carried: boolean): string => {
    const base = `${ITEMS[id].label}: ${ITEMS[id].use}`;
    const key = CLICK_KEYS[id];
    if (!onItemClick || !key) return base;
    if (!carried) return `${base} (Not carried yet)`;
    return `${base} (Click or ${key})`;
  };
  const slots = new Map<ItemId, HTMLElement>();
  for (const id of ITEM_IDS) {
    const slot = el('div', `item-slot item-${id}`, [el('span', 'item-icon', [drawPortrait(ITEMS[id].model, ICON_PX)]), el('span', 'item-label', [ITEMS[id].label])]);
    slot.title = slotTitle(id, false);
    slot.dataset.item = id;
    if (CLICK_KEYS[id] && onItemClick) {
      slot.classList.add('clickable');
      slot.setAttribute('role', 'button');
      slot.setAttribute('aria-disabled', 'true');
      slot.tabIndex = -1;
      const fire = () => {
        if (slot.classList.contains('carried')) onItemClick(id);
      };
      slot.onclick = fire;
      slot.onkeydown = (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          fire();
        }
      };
    }
    slots.set(id, slot);
  }
  const root = el('div', 'items-strip', [...slots.values()]);
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Items');
  parent.querySelector('.items-strip')?.remove();
  parent.appendChild(root);

  return {
    update(inventory) {
      for (const [id, slot] of slots) {
        const carried = inventory.items.includes(id);
        slot.classList.toggle('carried', carried);
        slot.classList.toggle('held', carried && inventory.held === id);
        slot.title = slotTitle(id, carried);
        if (CLICK_KEYS[id] && onItemClick) {
          slot.tabIndex = carried ? 0 : -1;
          slot.setAttribute('aria-disabled', String(!carried));
        }
        slot.setAttribute('aria-label', `${ITEMS[id].label}: ${carried ? (inventory.held === id ? 'in hand' : 'carried') : 'not carried'}`);
      }
    },
    pop(item) {
      const slot = slots.get(item);
      if (slot) replayClass(slot, 'pop');
    },
  };
}
