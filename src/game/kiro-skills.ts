/**
 * Kiro.d skills: each open-weight core can give one special skill, spent as a charge.
 * `qwen` heals the vibecoder (`kiro heal`), `deepseek` whispers a riddle hint (`kiro hint`).
 * A skill has one charge per level; the shared VRAM pool (`Inventory.vram`) pays once it is spent.
 * Pure rules shared by the Classic and Chapter shells; the shells apply the outcome to their own state.
 */
import { addVram, type Inventory } from './inventory.js';
import type { KiroCoreDef, KiroSkillId } from './kiro.js';

export interface SkillContext {
  /** The core Kiro.d runs now, or null while he is weak (the tiny core). */
  core: KiroCoreDef | null;
  /** Skills already spent on this level (the level's own charge). */
  used: Set<string>;
  inv: Inventory;
  hp: number;
  maxHp: number;
  /** A battle is on and it is the player's turn: the skill is his action and the enemies answer. */
  inBattle: boolean;
  /** The hint line of the riddle in this room, or null with none (a generic line is said). */
  riddleHint: () => string | null;
}

export interface SkillOutcome {
  stdout: string;
  stderr: string;
  code: number;
  inv: Inventory;
  /** HP to add (heal). */
  healBy: number;
  /** True: the line is not a player action, so no enemy turn follows. */
  free: boolean;
  /** A charge was spent. */
  spent: boolean;
}

const CMD: Record<KiroSkillId, string> = { heal: 'kiro heal', hint: 'kiro hint' };
const NEEDS: Record<KiroSkillId, string> = { heal: 'qwen', hint: 'deepseek' };

/** The HP one `kiro heal` restores: half of the maximum, never past it. */
export function healAmount(hp: number, maxHp: number): number {
  return Math.max(0, Math.min(Math.floor(maxHp / 2), maxHp - hp));
}

/** Spends the level's own charge first, then one from the shared VRAM pool. `null`: nothing left. */
function spend(skill: KiroSkillId, used: Set<string>, inv: Inventory): Inventory | null {
  if (!used.has(skill)) {
    used.add(skill);
    return inv;
  }
  return inv.vram > 0 ? addVram(inv, -1) : null;
}

/** Runs `kiro heal` or `kiro hint`. Never throws; a refusal costs nothing and takes no turn. */
export function useKiroSkill(skill: KiroSkillId, ctx: SkillContext): SkillOutcome {
  const refuse = (message: string): SkillOutcome => ({ stdout: '', stderr: `${CMD[skill]}: ${message}\n`, code: 1, inv: ctx.inv, healBy: 0, free: true, spent: false });
  if (!ctx.core || ctx.core.skill !== skill) return refuse(`Kiro.d is not running the ${NEEDS[skill]} core (kiro load ${NEEDS[skill]})`);
  const heal = skill === 'heal' ? healAmount(ctx.hp, ctx.maxHp) : 0;
  if (skill === 'heal' && heal === 0) return refuse('you are already at full HP');
  const inv = spend(skill, ctx.used, ctx.inv);
  if (!inv) return refuse('no charge left on this level (VRAM modules hidden in the machine add spare charges)');
  const note = ` [${inv.vram} spare VRAM charge${inv.vram === 1 ? '' : 's'}]`;
  const line = skill === 'heal'
    ? `[KIRO.D] ${ctx.core.id} patches your RAM: +${heal} HP (HP ${ctx.hp + heal}/${ctx.maxHp}).${note}\n`
    : `[KIRO.D] ${ctx.core.id} whispers: "${ctx.riddleHint() ?? 'No riddle socket speaks in this room. Look for a .sock file and read it with cat.'}"${note}\n`;
  return { stdout: line, stderr: '', code: 0, inv, healBy: heal, free: !ctx.inBattle, spent: true };
}
