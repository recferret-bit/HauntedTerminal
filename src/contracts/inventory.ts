/**
 * Item types and descriptors for the developer's inventory.
 * Pure data and contracts shared across procgen (3D models, hero variants) and game (inventory state, shell).
 */
export const ITEM_IDS = ['tube_transistor', 'terminal', 'laptop', 'manual', 'map', 'tensor_gpu', 'vram_module'] as const;
export type ItemId = (typeof ITEM_IDS)[number];

export interface ItemDef {
  readonly id: ItemId;
  readonly label: string;
  /** The item on its own (ModelCatalog id: item.<id>). */
  readonly model: string;
  /** The developer holding it (ModelCatalog id: vibecoder.dev or vibecoder.dev_<id>). Absent: the item is carried, never held in hand. */
  readonly heroModel?: string;
  /** Developer variant label in ModelCatalog (with `heroModel`). */
  readonly heroLabel?: string;
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
  tube_transistor: {
    id: 'tube_transistor',
    label: 'tube transistor',
    model: 'item.tube_transistor',
    heroModel: 'vibecoder.dev',
    heroLabel: 'The developer',
    gameKey: 'vibecoder',
    light: true,
    lore: 'A glowing vacuum-tube transistor with three gold leads. Unlocks ls flags (-a, -l, -la): ls -a lights its warm filament so dotfiles and hiding malware show.',
    heroLore: 'The only human in the machine: a tired developer in an orange hoodie, carrying a glowing tube transistor. The player.',
    use: 'unlocks ls flags (-a, -l, -la): dotfiles, details, and hiding malware show.',
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
  map: {
    id: 'map',
    label: 'map',
    model: 'item.map',
    heroModel: 'vibecoder.dev_map',
    heroLabel: 'The developer (map)',
    lore: 'A trace-etched PCB motherboard schematic slate with gold bus channels, IC sector blocks, and glowing phosphor trace nodes: the live circuit map of the chapter.',
    heroLore: 'The developer holding his PCB motherboard schematic map by its top strap: tracing data channels and sector blocks across the machine.',
    use: 'a PCB motherboard schematic map of all chapter channels and sector blocks.',
  },
  tensor_gpu: {
    id: 'tensor_gpu',
    label: 'tensor gpu',
    model: 'item.tensor_gpu',
    lore: 'A PCIe card with a tensor die under a heatsink: the hardware that lets Kiro load open-weight models.',
    use: 'a tensor card: bring it to the old coder so Kiro can load open-weight models.',
  },
  vram_module: {
    id: 'vram_module',
    label: 'vram module',
    model: 'item.vram_module',
    lore: 'A memory module with gold pins, hidden deep in the file tree: each one adds a spare charge to Kiro skills.',
    use: 'a memory module: one spare charge for a Kiro skill (kiro heal, kiro hint).',
  },
};

export const isItemId = (v: string): v is ItemId => Object.prototype.hasOwnProperty.call(ITEMS, v);

/** The developer with empty hands (ModelCatalog id): what he looks like while he holds nothing. */
export const BARE_HERO_MODEL = 'vibecoder.dev_bare';

/** The hero model for the item in his hand: `null` is empty hands; `undefined` (no inventory) is the tube transistor. */
export function heroModelFor(held: ItemId | null | undefined): string {
  if (held === null) return BARE_HERO_MODEL;
  return ITEMS[held ?? 'tube_transistor']?.heroModel ?? 'vibecoder.dev';
}
