/**
 * The developer's inventory: what he carries and which item he holds out in his hand.
 * Pure data and pure functions; the classic and the chapter sessions both keep one `Inventory` and
 * route `inventory` / `inv` / `hold` here. The held item picks the hero's model (one procgen
 * `vibecoder.*` variant per item, see src/procgen/archetypes/vibecoder.ts).
 */
import {
  ITEM_IDS,
  type ItemId,
  ITEMS,
  isItemId,
  heroModelFor,
} from '../contracts/inventory.js';
import { empty, out } from './play.js';
import type { Step } from './shell.js';

export { ITEM_IDS, type ItemId, ITEMS, isItemId };

export interface Inventory {
  /** In the order they were picked up. */
  readonly items: readonly ItemId[];
  /** The item in his hand; `null` = empty hands. */
  readonly held: ItemId | null;
  /** Spare skill charges from VRAM modules: one shared pool, never negative. */
  readonly vram: number;
  /** `<levelId>:<pickupId>` of every pickup he took, so a revisit does not respawn it. No duplicates. */
  readonly taken: readonly string[];
}

/** He walks in with what the chapter's `startItems` name (default: the tube transistor and terminal); the tube transistor is held when he has it. */
export function starterInventory(items: readonly ItemId[] = ['tube_transistor', 'terminal']): Inventory {
  const unique = items.filter((id, i) => items.indexOf(id) === i);
  const held = unique.includes('tube_transistor') ? 'tube_transistor' : unique.includes('terminal') ? 'terminal' : null;
  return { items: unique, held, vram: 0, taken: [] };
}

export function hasItem(inv: Inventory, id: ItemId): boolean {
  return inv.items.includes(id);
}

/** Adds an item (once). The held item does not change. */
export function giveItem(inv: Inventory, id: ItemId): Inventory {
  return hasItem(inv, id) ? inv : { ...inv, items: [...inv.items, id] };
}

/** An item he can hold in his hand: it has a hero model (the Tensor GPU and the VRAM module do not). */
function isHoldable(id: ItemId): boolean {
  return ITEMS[id].heroModel !== undefined;
}

/** The item joins the inventory (once) without being given or held: a pickup he took himself. */
export function takeItem(inv: Inventory, id: ItemId): Inventory {
  return giveItem(inv, id);
}

/** Adds spare skill charges to the shared pool (never below 0). */
export function addVram(inv: Inventory, n = 1): Inventory {
  return { ...inv, vram: Math.max(0, inv.vram + Math.floor(n)) };
}

/** Records that a pickup was taken (once per key). */
export function markTaken(inv: Inventory, levelId: string, pickupId: string): Inventory {
  const key = `${levelId}:${pickupId}`;
  return inv.taken.includes(key) ? inv : { ...inv, taken: [...inv.taken, key] };
}

/** Holds an item he owns and can hold; anything else leaves the inventory as it is. */
export function holdItem(inv: Inventory, id: ItemId): Inventory {
  return hasItem(inv, id) && isHoldable(id) ? { ...inv, held: id } : inv;
}

/** The hero model for the item in his hand (`null`: the bare hero). */
export function heroModel(held: ItemId | null | undefined): string {
  return heroModelFor(held);
}

function listing(inv: Inventory): string {
  const rows = inv.items.map((id) => `  ${inv.held === id ? '*' : ' '} ${ITEMS[id].label.padEnd(16)} ${ITEMS[id].use}`);
  const vram = inv.vram > 0 ? `  VRAM spare charges: ${inv.vram}\n` : '';
  return `INVENTORY (* in hand)\n${rows.join('\n')}\n${vram}`;
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
  if (!isHoldable(want)) return { step: empty(1, `hold: the ${ITEMS[want].label} is carried, not held in hand\n`), inv };
  const next = holdItem(inv, want);
  return { step: out(`You hold the ${ITEMS[want].label}.\n`, [{ type: 'VIBECODER_ACTION', action: 'collect', command: `hold ${want}` }]), inv: next };
}

/** Runs an inventory command on whoever keeps the inventory (the classic run, the chapter state) and stores the result. */
export function runInventory(holder: { inventory: Inventory }, cmd: string, args: readonly string[]): Step {
  const res = inventoryCommand(holder.inventory, cmd, args);
  holder.inventory = res.inv;
  return res.step;
}

/** Tab completion matches for `hold <prefix>`. */
export function completeHold(inv: Inventory, prefix: string): string[] {
  return inv.items.filter((id) => id.startsWith(prefix));
}
