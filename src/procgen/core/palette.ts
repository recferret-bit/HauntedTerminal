/**
 * The one palette of Haunted Terminal. Models and textures use these zones and nothing else.
 * Art direction: .kiro/skills/haunted-art-direction/SKILL.md
 *
 * Families carry meaning, so the validators can check them:
 *   human    warm and organic. Only the vibecoder (and the System Hand) may use it.
 *   hardware the machine itself: PCB, solder, silicon, plastic. Cold greens, greys, violets.
 *   signal   emissive light that means "the system is talking": status LEDs, pickups, ports.
 *   malware  corruption. Hot magenta, violet, toxic green. Only hostile things may use it.
 *   glass    translucent screens, mirrors, ice.
 *   neutral  ink and paper, allowed anywhere.
 */
export type ZoneFamily = 'neutral' | 'human' | 'hardware' | 'signal' | 'malware' | 'glass';

export interface ZoneDef {
  color: number;
  family: ZoneFamily;
  /** Added as color * emissive on top of the cel band. >= 0.3 reads as a light source. */
  emissive?: number;
  opacity?: number;
  /** Fresnel ghost: transparent centre, bright rim. */
  ghost?: boolean;
  /** Ben-Day dots in the shadow bands. */
  halftone?: boolean;
  stripes?: boolean;
}

export const INK = 0x110e1b;
export const PAPER = 0xf4f1ea;

export const ZONES = {
  // neutral
  ink: { color: INK, family: 'neutral' },
  paper: { color: PAPER, family: 'neutral' },

  // human: the developer is the only warm, soft thing in the machine
  skin: { color: 0xffe0c2, family: 'human' },
  hoodie: { color: 0xf77f00, family: 'human', halftone: true },
  denim: { color: 0x3a506b, family: 'human' },
  hair: { color: 0x4a2c2a, family: 'human' },
  lantern: { color: 0xffd166, family: 'human', emissive: 0.35 },

  // hardware: what the world is made of
  pcb: { color: 0x1f7a5c, family: 'hardware', halftone: true },
  pcbDark: { color: 0x12473b, family: 'hardware', halftone: true },
  solder: { color: 0xadb5bd, family: 'hardware' },
  heatsink: { color: 0x7d8597, family: 'hardware', stripes: true },
  gold: { color: 0xe9b44c, family: 'hardware' },
  copper: { color: 0xc8763a, family: 'hardware' },
  silicon: { color: 0x2b2540, family: 'hardware' },
  plastic: { color: 0xd9d2c5, family: 'hardware' },
  rubber: { color: 0x3a3550, family: 'hardware' },

  // signal: emissive system light
  phosphor: { color: 0x39ff88, family: 'signal', emissive: 0.6 },
  dataCyan: { color: 0x4cc9f0, family: 'signal', emissive: 0.5 },
  powerAmber: { color: 0xffd166, family: 'signal', emissive: 0.6 },
  lockRed: { color: 0xef233c, family: 'signal', emissive: 0.5 },

  // malware: corruption
  corruptMagenta: { color: 0xef476f, family: 'malware', halftone: true },
  corruptViolet: { color: 0x9b5de5, family: 'malware', halftone: true },
  toxicGreen: { color: 0x8ac926, family: 'malware', halftone: true },
  voidPurple: { color: 0x3c096c, family: 'malware' },
  malwareEye: { color: 0xfff07c, family: 'malware', emissive: 1.1 },
  ghostViolet: { color: 0x9b5de5, family: 'malware', ghost: true, opacity: 0.55 },
  // The four parody AI agents of the intro/outro cinematics (src/procgen/archetypes/agents/cast.ts).
  // Hostile things, so family `malware`; each carries one agent's signature colour so the caricature
  // reads by colour first: clay for CLAUDE, blue for GEMINI, black for GROK, the icon gradient for CODEX.
  clayOrange: { color: 0xd97757, family: 'malware', halftone: true },
  geminiBlue: { color: 0x4c8df6, family: 'malware', halftone: true },
  grokBlack: { color: 0x1d1d22, family: 'malware' },
  // The Codex icon's vertical gradient (lilac -> sky -> indigo), cut into three flat cel bands.
  codexLilac: { color: 0xb1a7ff, family: 'malware' },
  codexSky: { color: 0x7a9dff, family: 'malware' },
  codexIndigo: { color: 0x3941ff, family: 'malware', halftone: true },

  // glass
  glass: { color: 0xc8fff4, family: 'glass', emissive: 0.45, opacity: 0.85 },
  ice: { color: 0x9bdcff, family: 'glass', emissive: 0.2, opacity: 0.7 },
} as const satisfies Record<string, ZoneDef>;

export type ZoneId = keyof typeof ZONES;

export const ZONE_IDS = Object.keys(ZONES) as ZoneId[];

export function zone(id: ZoneId): ZoneDef {
  return ZONES[id];
}

/** Room mood per floor: backdrop base and accent. Mirrors FLOORS in src/renderer/comic-stage.ts. */
export const FLOOR_THEMES = {
  1: { name: 'storage attic', path: '/home/dev/nightmare_workspace', bg: 0x211a36, accent: 0xffd166 },
  2: { name: 'firewall crypt', path: '/var/dungeon', bg: 0x1c252c, accent: 0x06d6a0 },
  3: { name: 'symlink bus maze', path: '/usr/local/labyrinth', bg: 0x182038, accent: 0x4cc9f0 },
  4: { name: 'cpu cooling furnace', path: '/proc_mansion/boiler_room', bg: 0x2e1720, accent: 0xef476f },
  5: { name: 'kernel panic core', path: '/sys/kernel/panic_chamber', bg: 0x1f1135, accent: 0xb5179e },
} as const;

export type FloorId = keyof typeof FLOOR_THEMES;

export function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
