/**
 * Item types and descriptors for the developer's inventory.
 * Pure data and contracts shared across procgen (3D models, hero variants) and game (inventory state, shell).
 */
export const ITEM_IDS = ['lantern', 'terminal', 'laptop', 'manual'] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export interface ItemDef {
  readonly id: ItemId;
  readonly label: string;
  /** The item on its own (ModelCatalog id: item.<id>). */
  readonly model: string;
  /** The developer holding it (ModelCatalog id: vibecoder.dev or vibecoder.dev_<id>). */
  readonly heroModel: string;
  /** Developer variant label in ModelCatalog. */
  readonly heroLabel: string;
  /** Lore description for ModelCatalog and world lexicon. */
  readonly lore: string;
  /** Developer variant lore in ModelCatalog. */
  readonly heroLore?: string;
  /** Whether the item provides a light source (sockets.light -> sockets.lantern). */
  readonly light?: boolean;
  /** Whether the hero variant uses gameKey: 'vibecoder'. */
  readonly gameKey?: string;
  /** One line for `inventory`. */
  readonly use: string;
}

export const ITEMS: Readonly<Record<ItemId, ItemDef>> = {
  lantern: {
    id: 'lantern',
    label: 'lantern',
    model: 'item.lantern',
    heroModel: 'vibecoder.dev',
    heroLabel: 'The developer',
    gameKey: 'vibecoder',
    light: true,
    lore: 'The oil lantern he brought in from the desk. ls -a lights it, and dotfiles and hiding malware show.',
    heroLore: 'The only human in the machine: a tired developer in an orange hoodie, carrying a lantern. The player.',
    use: 'ls -a lights it: dotfiles and hiding malware show.',
  },
  terminal: {
    id: 'terminal',
    label: 'terminal',
    model: 'item.terminal',
    heroModel: 'vibecoder.dev_terminal',
    heroLabel: 'The developer (terminal)',
    lore: 'A handheld field cyberdeck slate: dark silicon shell, leather grip, phosphor prompt screen, and keypad.',
    heroLore: 'The developer holding his field cyberdeck slate: dark silicon shell, leather grip, phosphor prompt screen.',
    use: 'a field cyberdeck slate linking you directly to the machine.',
  },
  laptop: {
    id: 'laptop',
    label: 'laptop',
    model: 'item.laptop',
    heroModel: 'vibecoder.dev_laptop',
    heroLabel: 'The developer (laptop)',
    lore: 'An old clamshell laptop with a carry handle. Opened, it runs a tiny desktop with code editors: the tool for coding tasks.',
    heroLore: 'The developer carrying his old clamshell laptop by its handle: the held item when a coding task needs it.',
    use: 'an old clamshell with code editors, for coding tasks.',
  },
  manual: {
    id: 'manual',
    label: 'manual',
    model: 'item.manual',
    heroModel: 'vibecoder.dev_manual',
    heroLabel: 'The developer (manual)',
    lore: 'A dog-eared hardcover unix field manual with a ribbon bookmark and phosphor reference badge: the pocket guide to every command and flag.',
    heroLore: 'The developer holding his hardcover Unix Field Manual by its spine strap: ready to flip to any command, flag, or chmod octal mask.',
    use: 'a hardcover unix field manual with command, flag, and chmod references.',
  },
};

export const isItemId = (v: string): v is ItemId => Object.prototype.hasOwnProperty.call(ITEMS, v);

/** The developer with empty hands (ModelCatalog id): what he looks like while he holds nothing. */
export const BARE_HERO_MODEL = 'vibecoder.dev_bare';

/** The hero model for the item in his hand: `null` is empty hands; `undefined` (no inventory) is the lantern. */
export function heroModelFor(held: ItemId | null | undefined): string {
  if (held === null) return BARE_HERO_MODEL;
  return ITEMS[held ?? 'lantern']?.heroModel ?? 'vibecoder.dev';
}
