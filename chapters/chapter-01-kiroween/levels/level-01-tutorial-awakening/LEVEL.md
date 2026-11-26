# Level 01: Wires, Chips & Kiro.d

Mechanic `terminal`, room `attic`, cwd `/mnt/wires_and_chips`, exit `hub_uplink`. Safe level: no damage.

## Beat

He starts in the dark completely empty-handed (`manifest.startItems: []`), with the terminal locked (`openingSec: 60`, skippable via `Skip Dialog »`) until Vibecoder and Kiro.d finish talking, after which Clod taunts.

| Level tick | What happens |
|---|---|
| 1, 7, 13 | VIBECODER monologue + shout (`HELLOOOO??`) in the dark with empty hands. |
| 19 | Kiro.d glides in (`spawn.entrance: glide`), scans, and introduces himself (PID 777). |
| 28 | Kiro.d explains the whole-chapter mission (6 hardware sectors -> 3 Matrix Hub open-weight reboots -> Clod + PID 1). |
| 37 | Kiro.d explains RAM (+10 Max HP) and SSD/GPU images (256GB = automatic Revive backup + Hub parts), and why `ls` is locked until Sector 02 rewards the Oil Lantern. |
| 46 | Kiro.d carries the terminal over (`carry_item`). |
| 54 | Vibecoder reacts (`54..60s`) while the terminal remains withheld & locked until the conversation finishes. |
| 60 | Opening dialog finishes, Kiro.d hands over the terminal (`give_item`), Clod taunts, and tutorial card 1 (`pwd`) appears! |

Timed entries fire on world ticks (`script.timed`), not on commands.

## Tutorial cards

1. `pwd` (`ls` stays disabled until the lantern reward after Level 2)
2. `mv starter_ram_8gb.dimm ~`
3. `cat kiro_story.txt`
4. `ps`
5. `kill -9 {pid:tutorial_virus_1}`
6. `cd hub_uplink`

## Win rules

RAM pocketed, `kiro_story.txt` read, `tutorial_virus_1` neutralized. Then `cd hub_uplink`.

## Solution

```
pwd
mv starter_ram_8gb.dimm ~
cat kiro_story.txt
ps
kill -9 {pid:tutorial_virus_1}
cd hub_uplink
```

## Entering later

A player who jumps to later levels receives cumulative `manifest.grants`: `terminal` (`afterLevel: 1`), `lantern` (`afterLevel: 2`), `map` + `manual` (`afterLevel: 4`), and `laptop` (`afterLevel: 6`).
