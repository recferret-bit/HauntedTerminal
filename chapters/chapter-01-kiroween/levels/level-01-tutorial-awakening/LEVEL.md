# Level 01: Wires, Chips & Kiro.d

Mechanic `terminal`, room `attic`, cwd `/mnt/wires_and_chips`, exit `hub_uplink`. Safe level: no damage.

## Beat

He starts in the dark with empty hands and only the field manual in his pocket (`manifest.startItems: ["manual"]`).

| Level tick | What happens |
|---|---|
| 1, 3, 5 | Dialog box, VIBECODER monologue: "What is going on?!", "Where am I?", dark and empty hands (no terminal yet). |
| 7, 9, 11, 13 | Big Four small talk (Anti-Gravy, Codec, Gork, Clod): each laughs at Vibecoder and warns he must type all commands manually and even write code manually. |
| 15 | Vibecoder shock emote (`WRITE CODE MANUALLY?!`) and shocked dialog box line. |
| 17 | Vibecoder shout emote (`HELLOOOO??`) and line. |
| 19 | Kiro.d glides in (`spawn.entrance: glide`), scans, introduces himself as a local Unix `.d` daemon in dialog box. |
| 22 | Kiro.d picks up the terminal (`carry_item`) and flies beside him. |
| 25 | Kiro.d hands over the terminal (`give_item`), terminal panel opens, phosphor glow lights nearby wires, tutorial card 1 appears. |
| 28, 31 | Kiro.d tells him to look around with `ls` (unless `ls` has already run). |

Timed entries fire on world ticks (`script.timed`), not on commands.

## Tutorial cards

1. `ls`
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

A player who jumps to level 2 or later gets the terminal from `manifest.grants` (`afterLevel: 1`, `items: ["terminal"]`). The lantern arrives at Level 3 (`afterLevel: 3`) and the laptop at Level 6 (`afterLevel: 6`).
