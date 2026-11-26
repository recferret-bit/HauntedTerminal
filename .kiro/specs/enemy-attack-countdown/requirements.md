# Enemy attack countdown: requirements

Status: done

Capability: in a battle, every enemy that hurts the vibecoder shows a floating red skull badge with the number of his actions left before its hit lands. A gargoyle that bites every 3 turns shows `☠ 3`, `☠ 2`, `☠ 1`; once it has told its attack the badge shows `!☠` (the hit lands after his next action). The data already exists in the world (`ticksToTell`, `cadence`, `told`); today only the Terminal Lab reads it.

User's words, 2026-11-27: "its not obvious about gargoyle and similar monsters attacks, if it bites at 2d or every N turns, we need some indication, like some icons, red skulls or timer, what ever."

## Requirements

1. WHILE a battle is in its player phase, THE SYSTEM SHALL show, over each enemy that hurts the vibecoder (damage above 0, cadence above 0) and is in his room, a badge made of a red skull and the number of player actions until its hit lands (`N`, at least 2; one action left is shown as `!`).
2. WHEN the enemy has told its attack (the strike comes on the next enemy turn), THE SYSTEM SHALL show `!` with the skull in place of the number.
3. WHEN the count is 1 or the attack is told, THE SYSTEM SHALL draw the skull solid red; WHEN the count is above 1, THE SYSTEM SHALL draw it pulsing, on the stepped 12 fps beat, with no CSS transform bounce.
4. THE SYSTEM SHALL count in the same unit as the game: one player action, answered by one enemy turn, is one step down. After an enemy strikes, the count restarts from its cadence.
5. THE SYSTEM SHALL hide the badge for an enemy that is dead, petrified, frozen, sealed, hidden, away from the hero's room, or holding fire; it SHALL also hide every badge during the battle intro and outside a battle.
6. WHILE the turn timer is held (edit mini-editor, laptop), THE SYSTEM SHALL keep the badges, since the count moves only with actions.
7. THE SYSTEM SHALL show one badge per enemy when several fight, and SHALL NOT show one on pickups, doors, the hero or an enemy that never hurts (crack, ransomware, forkbomb tells, rootkit).
8. THE SYSTEM SHALL carry the count in the room view (`RoomActor`), computed by the game from `ticksToTell`, so the stage invents no timing and the same number reaches the Terminal Lab.
9. THE SYSTEM SHALL build the badge from DOM text nodes in the stage overlay (no `innerHTML`), next to the HP pips and PID plate, and SHALL NOT cover the HP pips.

## Out of scope

- A HUD strip listing enemies (asked: no, badge only).
- A tutorial-only version, a man page line, or a Kiro.d mention (asked: no).
- Sound for the badge.
- Changing any enemy's cadence or damage.

## Decisions

**Q (round 1):** Where does the indicator sit? **A (user, 2026-11-27):** a floating badge over each enemy.
**Q:** What does it show? **A (user, 2026-11-27):** turns until the hit lands.
**Q:** Look? **A (user, 2026-11-27):** a red skull that pulses and turns solid red at 1 turn; after the tell it becomes `!` with the skull.
**Q:** Which enemies? **A (user, 2026-11-27):** every enemy that hurts and has a cadence.
**Q:** Hiding rules? **A (user, 2026-11-27):** right: hidden when petrified, frozen, away, in the intro; shown while the turn timer is held.

**Approval (user, 2026-11-27):** "i approve" (requirements, design, tasks).

## Open questions

(none)

## Verification

- A unit check in `scripts/harness/battle-unit.mjs` (trojan, virus, bug): after each action the badge equals the actions until the next `PLAYER_DAMAGED` (`!` = 0 = the next action), absent in the intro and on a frozen enemy. For the gargoyle the sequence is 2, `!`, hit, 3 (after the first hit), 2, `!`, hit.
- `node scripts/harness/battle-unit.mjs`, `property-tests.mjs --only gameplay`, `generate-chapter.mjs --verify`, `npm run quality`, `terminal-lab-unit.mjs`, and a screenshot of the badge at 3, 1 and told (`visual-audit.mjs --screens` for the play screen).
