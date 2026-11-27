// Kiro skill charges: one charge per skill per level, the shared VRAM pool pays after it, nothing goes negative, and a
// refusal changes nothing and takes no turn. Spec: .kiro/specs/tensor-gpu-hub-ritual/ (requirements 9 to 12).
import fc from 'fast-check';
import { expect } from './kit.mjs';

export async function kiroSkillProps(ctx) {
  const { useKiroSkill, healAmount } = await ctx.load('/src/game/kiro-skills.ts');
  const { KIRO_CORES } = await ctx.load('/src/game/kiro.ts');
  const { starterInventory } = await ctx.load('/src/game/inventory.ts');
  const call = fc.record({
    skill: fc.constantFrom('heal', 'hint'),
    core: fc.constantFrom('qwen', 'deepseek', 'llama', 'mistral', null),
    hp: fc.integer({ min: 1, max: 130 }),
    inBattle: fc.boolean(),
  });
  return [
    {
      name: 'skill charges: one per skill per level then the VRAM pool, never negative; a refusal changes nothing and is free; heal never passes max HP',
      build: () =>
        fc.property(fc.integer({ min: 0, max: 5 }), fc.array(call, { maxLength: 30 }), (pool, calls) => {
          const used = new Set();
          let inv = { ...starterInventory([]), vram: pool };
          let spentOwn = 0;
          let spentPool = 0;
          for (const c of calls) {
            const usedBefore = [...used].sort().join();
            const before = inv;
            const out = useKiroSkill(c.skill, {
              core: c.core ? KIRO_CORES[c.core] : null,
              used,
              inv,
              hp: c.hp,
              maxHp: 130,
              inBattle: c.inBattle,
              riddleHint: () => 'hint',
            });
            expect(out.inv.vram >= 0, `the pool went negative (${out.inv.vram}) after ${JSON.stringify(c)}`);
            if (out.code !== 0) {
              expect(out.inv === before && [...used].sort().join() === usedBefore, `a refusal changed the charges: ${JSON.stringify(c)}`);
              expect(out.free && !out.spent && out.healBy === 0, `a refusal was not free: ${JSON.stringify(out)}`);
            } else {
              expect(out.spent, `a success spent nothing: ${JSON.stringify(c)}`);
              expect(out.free === !c.inBattle, `free=${out.free} with inBattle=${c.inBattle}`);
              if (used.size > [...usedBefore.split(',')].filter(Boolean).length) spentOwn += 1;
              else spentPool += 1;
              expect(out.healBy === (c.skill === 'heal' ? healAmount(c.hp, 130) : 0), `healed ${out.healBy} at ${c.hp} HP`);
              expect(c.hp + out.healBy <= 130, `healed past the max: ${c.hp} + ${out.healBy}`);
            }
            inv = out.inv;
          }
          expect(spentOwn <= 2, `more than one own charge per skill was spent (${spentOwn})`);
          expect(inv.vram === pool - spentPool, `pool ${pool} - ${spentPool} spent is not ${inv.vram}`);
        }),
    },
  ];
}
