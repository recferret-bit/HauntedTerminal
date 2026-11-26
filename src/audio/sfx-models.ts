import type { SfxId } from './catalog.js';

/** Enemy model id -> attack sample. */
export const ATTACK_CUE: Record<string, SfxId> = {
  'malware.bug': 'atk_bug',
  'malware.spyware': 'atk_spyware',
  'malware.rootkit': 'atk_rootkit',
  'malware.worm': 'atk_worm',
  'malware.crack': 'atk_crack',
  'malware.trojan': 'atk_trojan',
  'malware.virus': 'atk_virus',
  'malware.exploit': 'atk_exploit',
  'malware.ransomware': 'atk_ransomware',
  'malware.zombie': 'atk_zombie',
  'boss.forkbomb': 'boss_forkbomb',
  'boss.kernel': 'boss_kernel_panic',
};

const PICKUP: Record<string, SfxId> = {
  energy: 'pickup_energy',
  ram: 'pickup_ram',
  ssd: 'pickup_ssd',
  lantern: 'pickup_lantern',
  laptop: 'pickup_ssd',
};

/** Models whose signature action has `damage: 0` (indirect effects rather than missed hits). */
const INDIRECT_ATTACK_MODELS = new Set(['malware.crack', 'malware.ransomware', 'boss.forkbomb']);

export function attackCue(model: string, damage: number): SfxId {
  if (damage <= 0 && !INDIRECT_ATTACK_MODELS.has(model)) return 'enemy_miss';
  return ATTACK_CUE[model] ?? 'enemy_hit';
}

export function pickupCue(item: string): SfxId | null {
  return PICKUP[item] ?? null;
}

export function isEnemyModel(model: string): boolean {
  return model.startsWith('malware.') || model.startsWith('boss.');
}

export function isBossModel(model: string): boolean {
  return model === 'boss.kernel' || model === 'boss.forkbomb';
}
