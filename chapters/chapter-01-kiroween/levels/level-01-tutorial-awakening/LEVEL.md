# Level 01: Wires, Chips & The Kiro Ghost

Mechanic `terminal`, room `attic`, cwd `/mnt/wires_and_chips`, exit `hub_uplink`. Safe level: no damage.

## Beat

He starts in the dark with only his terminal in hand (`manifest.startItems: ["terminal"]`).

| Level tick | What happens |
|---|---|
| 1, 3, 5 | Dialog box, VIBECODER monologue: "What is going on?!", "Where am I?", dark and no lantern. |
| 7, 9, 11, 13 | Big Four small talk (Anti-Gravy, Codec, Gork, Clod): each laughs at Vibecoder and warns he must type all commands manually and even write code manually. |
| 15 | Vibecoder shock emote (`WRITE CODE MANUALLY?!`) and shocked dialog box line. |
| 17 | Kiro Ghost glides in (`spawn.entrance: glide`), scans, introduces himself in dialog box, tutorial card 1 appears. |
| 20, 23 | Kiro tells him to take the lantern: `mv lantern ~`. |

Timed entries fire on world ticks (`script.timed`), not on commands. Input is never blocked: he may type `mv lantern ~` at any time.

## Lock

`ls` (and `ls -a`, `ls -la`) refuses until `has_item lantern`: "it is too dark to see anything ... mv lantern ~".

## Tutorial cards

1. `mv lantern ~` (done when he holds the lantern)
2. `ls`
3. `mv starter_ram_8gb.dimm ~`
4. `cat kiro_story.txt`
5. `ps`
6. `kill -9 1011`
7. `cd hub_uplink`

## Win rules

Lantern is not a win rule (a `questCritical` file respawns when removed, so `file_absent` can never hold; there is no `has_item` win rule). RAM pocketed, `kiro_story.txt` read, `tutorial_virus_1` neutralized. Then `cd hub_uplink`.

## Solution

```
mv lantern ~
ls
mv starter_ram_8gb.dimm ~
cat kiro_story.txt
ps
kill -9 1011
cd hub_uplink
```

## Entering later

A player who jumps to level 2 or later gets the lantern from `manifest.grants` (`afterLevel: 1`, `items: ["lantern"]`).
