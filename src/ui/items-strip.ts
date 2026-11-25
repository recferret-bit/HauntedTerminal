import { ITEMS, ITEM_IDS, type ItemId } from '../contracts/inventory.js';
import { el, replayClass, type DrawPortrait } from './dom-lite.js';

export interface ItemsStrip {
  /** Redraw from `snapshot.inventory`: dim what he does not carry, highlight the held one. */
  update(inventory: { items: readonly ItemId[]; held: ItemId | null }): void;
  /** Short pop on a slot (a pickup). */
  pop(item: ItemId): void;
}

/** Icon size in CSS px. */
const ICON_PX = 36;

/**
 * Always-visible HUD strip: one slot per item (`lantern`, `terminal`, `laptop`, `manual`).
 * Classes: `items-strip`, `item-slot` (`carried`, `held`, `pop`, `item-<id>`), `item-icon`, `item-label`.
 */
export function mountItemsStrip(parent: HTMLElement, drawPortrait: DrawPortrait): ItemsStrip {
  const slots = new Map<ItemId, HTMLElement>();
  for (const id of ITEM_IDS) {
    const slot = el('div', `item-slot item-${id}`, [el('span', 'item-icon', [drawPortrait(ITEMS[id].model, ICON_PX)]), el('span', 'item-label', [ITEMS[id].label])]);
    slot.title = `${ITEMS[id].label}: ${ITEMS[id].use}`;
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
        slot.setAttribute('aria-label', `${ITEMS[id].label}: ${carried ? (inventory.held === id ? 'in hand' : 'carried') : 'not carried'}`);
      }
    },
    pop(item) {
      const slot = slots.get(item);
      if (slot) replayClass(slot, 'pop');
    },
  };
}
