# Tensor GPU hub ritual: design

Status: see requirements.md

Written from a read-only pass over the code on 2026-11-27. Requirement numbers (`Req n`) and Decisions (`Q n`) refer to `requirements.md`. Items marked **NOT possible** need a user decision and are collected in `## Resolved decisions

All 13 points of the first design review are decided (Q30 to Q34 and the adopted choices in `requirements.md`):

1. Req 20: the revisit rule (Q30). 2. Level 4 `openingSec` about 100 s (Q31). 3. `wait`, `take_item`, `empower`, `ACTOR_FLY_TO`, `Inventory.vram` / `taken`, optional `heroModel`, `GameSnapshot.inventory.vram`: adopted. 4. One active core, and hubs accept any core (Q32, Req 22). 5. No `hint` field, `hints[]` is reused (Q33). 6. Achievement loops ignore the new ids: adopted. 7. `find` already lists dotfiles, `tree -a` obeys the `ls` lock: adopted. 8. Free actions: adopted; the glossary and `.kiro/specs/turn-based-battles/` get one line each. 9. Heal rules (Q34). 10. Classic shell: commands, `tree` and `grep -r`, no modules or riddles: adopted. 11. `taken` for every pickup type: adopted. 12. Session-only VRAM state with optional `ChapterGrant.vram`: adopted. 13. Level 2's solution takes the GPU: adopted.

## Needs user decision

(none)
