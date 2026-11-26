# Level 01: Wires, Chips & Kiro.d

Mechanic `terminal`, room `attic`, cwd `/mnt/wires_and_chips`, exit `hub_uplink`. Safe level: no damage.

## Beat

He starts in the dark completely empty-handed (`manifest.startItems: []`), with the terminal locked (`openingSec: 60`, skippable via `Skip Dialog »`) until Vibecoder and Kiro.d finish talking, after which Clod taunts.

| Level tick | What happens |
|---|---|
| 1, 7, 13 | VIBECODER monologue + shout (`HELLOOOO??`) in the dark with empty hands. |
| 19 | Kiro.d glides in (`spawn.entrance: glide`), scans, and introduces himself (PID 777). |
| 28 | Kiro.d explains the whole-chapter mission (6 hardware sectors -> 3 Matrix Hub open-weight reboots -> Clod + PID 1). |
| 37 | Kiro.d explains why `ls` works for visible files while `ls -la` and flags stay locked until Sector 02 returns the glowing Tube Transistor (RAM and SSD explanations trigger separately on very first pickup via `manifest.onFirstPickup`). |
| 46 | Kiro.d carries the terminal over (`carry_item`). |
| 54 | Vibecoder reacts (`54..60s`) while the terminal remains withheld & locked until the conversation finishes. |
| 60 | Opening dialog finishes, Kiro.d hands over the terminal (`give_item`), Clod taunts, and tutorial card 1 (`ls`) appears! |

Timed entries fire on world ticks (`script.timed`), not on commands.

## Tutorial cards

1. `ls` (basic visible files only; `ls -la` and all `ls` flags unlock when you grab the fallen Tube Transistor on Level 2)
2. `mv starter_ram_8gb.dimm ~`
3. `cat kiro_story.txt`
4. `ps`
5. `kill -9 {pid:tutorial_virus_1}`
6. `cd hub_uplink`

## Win rules

RAM pocketed, `kiro_story.txt` read, `tutorial_virus_1` neutralized. Then `cd hub_uplink`.

## Solution

```
ls
mv starter_ram_8gb.dimm ~
cat kiro_story.txt
ps
kill -9 {pid:tutorial_virus_1}
cd hub_uplink
```

## Entering later

A player who jumps to later levels receives cumulative `manifest.grants`: `terminal` (`afterLevel: 1`), `tube_transistor` (`afterLevel: 2`), `map` + `manual` (`afterLevel: 4`), and `laptop` (`afterLevel: 6`).
