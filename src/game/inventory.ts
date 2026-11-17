/**
 * The developer's inventory: what he carries and which item he holds out in his hand.
 * Pure data and pure functions; the classic and the chapter sessions both keep one `Inventory` and
 * route `inventory` / `inv` / `hold` here. The held item picks the hero's model (one procgen
 * `vibecoder.*` variant per item, see src/procgen/archetypes/vibecoder.ts).
 */
import { empty, out } from './play.js';
import type { Step } from './shell.js';

export type ItemId = 'lantern' | 'laptop';

export interface ItemDef {
  id: ItemId;
  label: string;
  /** The item on its own (ModelCatalog id). */
  model: string;
  /** The developer holding it (ModelCatalog id). */
  heroModel: string;
  /** One line for `inventory`. */
  use: string;
}

export const ITEMS: Readonly<Record<ItemId, ItemDef>> = {
  lantern: { id: 'lantern', label: 'lantern', model: 'item.lantern', heroModel: 'vibecoder.dev', use: 'ls -a lights it: dotfiles and hiding malware show.' },
  laptop: { id: 'laptop', label: 'laptop', model: 'item.laptop', heroModel: 'vibecoder.dev_laptop', use: 'an old clamshell with code editors, for coding tasks.' },
};

export interface Inventory {
  /** In the order they were picked up. */
  readonly items: readonly ItemId[];
  readonly held: ItemId;
}

export const isItemId = (v: string): v is ItemId => Object.prototype.hasOwnProperty.call(ITEMS, v);

/** He walks in with the lantern from his desk; the laptop comes later. */
export function starterInventory(): Inventory {
  return { items: ['lantern'], held: 'lantern' };
}

export function hasItem(inv: Inventory, id: ItemId): boolean {
  return inv.items.includes(id);
}

/** Adds an item (once). The held item does not change. */
export function giveItem(inv: Inventory, id: ItemId): Inventory {
  return hasItem(inv, id) ? inv : { ...inv, items: [...inv.items, id] };
}

/** Holds an item he owns; anything else leaves the inventory as it is. */
export function holdItem(inv: Inventory, id: ItemId): Inventory {
  return hasItem(inv, id) ? { ...inv, held: id } : inv;
}

/** The hero model for the item in his hand (the lantern when nothing says otherwise). */
export function heroModel(held: ItemId | undefined): string {
  return ITEMS[held ?? 'lantern'].heroModel;
}

function listing(inv: Inventory): string {
  const rows = inv.items.map((id) => `  ${inv.held === id ? '*' : ' '} ${ITEMS[id].label.padEnd(8)} ${ITEMS[id].use}`);
  return `INVENTORY (* in hand)\n${rows.join('\n')}\n`;
}

/**
 * `inventory` / `inv` list the items; `hold <item>` puts one in his hand.
 * Returns the step to print and the inventory after it.
 */
export function inventoryCommand(inv: Inventory, cmd: string, args: readonly string[]): { step: Step; inv: Inventory } {
  if (cmd !== 'hold') return { step: out(listing(inv)), inv };
  const want = args[0] ?? '';
  if (!want) return { step: empty(1, 'hold: which item? Try: inventory\n'), inv };
  if (!isItemId(want) || !hasItem(inv, want)) return { step: empty(1, `hold: you are not carrying '${want}'\n`), inv };
  const next = holdItem(inv, want);
  return { step: out(`You hold the ${ITEMS[want].label}.\n`, [{ type: 'VIBECODER_ACTION', action: 'collect', command: `hold ${want}` }]), inv: next };
}

/** Runs an inventory command on whoever keeps the inventory (the classic run, the chapter state) and stores the result. */
export function runInventory(holder: { inventory: Inventory }, cmd: string, args: readonly string[]): Step {
  const res = inventoryCommand(holder.inventory, cmd, args);
  holder.inventory = res.inv;
  return res.step;
}

/** Command names the inventory answers. */
export const INVENTORY_COMMANDS: readonly string[] = ['inventory', 'inv', 'hold'];
