# Music list (ElevenLabs prompts)

Music only: no sound effects, no voice, no lyrics. The sound-effect cues live in `docs/SFX_LIST.md`. This list covers the one Kiroween chapter: the front door, the five floor themes, the Matrix Hub, turn-based fights, the laptop and the Terminal Lab, and the intro and outro cinematics.

The look the music has to sit under:

- **Comix page.** Ink frames, flat cel bands, halftone, paper gutters, a rubber-stamp hit. The mix is dry and close, with a short gated room, never a concert hall.
- **Haunted machine.** Dark rooms, one lantern, locked ports, something watching. The machine's key is A minor. The only warm figure is a rising fifth, C5 to G5, and it belongs to the human (the Vibecoder and his lantern).
- **Pixel pass.** Ordered Bayer quantizer, 16 levels, cell size 3.5. Music uses at most six tracker channels, pitches on the scale, and a quiet noise hat where the picture has dither. No portamento except a sweep a prompt names.
- **CRT pass.** Scanlines, a bright band that rolls every 8 seconds, tape grain, a little flicker, vignette. Barrel warp is off, so the music does not wobble in pitch. A very quiet 60 Hz hum and a little tape hiss live in every bed. A pad may breathe on an 8-second cycle. No vinyl crackle.
- **Terminal.** The player types every action. Key clicks are sound effects. Every bed leaves rests, and the 2–5 kHz band stays thin so typing cuts through. Battles are turn-based: a phrase, a rest, an answer. Not a chase.
- **Storm.** Rain, thunder and lightning are sound effects (`rain_loop`, `thunder_close`, `lightning`). No music prompt contains them.

Palette, as pitch:

| Colour on screen | What it is | What the music does |
|---|---|---|
| Orange (hoodie, lantern) | The only human | Rising fifth C5–G5, soft pulse wave |
| Green / grey hardware | Rooms, PCBs, the crypt and the attic | A minor, short FM bass, low and sparse |
| Phosphor, cyan, amber | LEDs, data, the Matrix Hub | Quiet triangle arpeggios |
| Magenta / violet | Malware | Flat 2 (Bb) and bitcrush, same key, not a new one |
| Paper and ink | The page | Dry stamp percussion, almost no reverb |

Tempos are locked so a floor can crossfade into a fight without a lurch. 144 BPM is 96 BPM felt twice as fast.

| Tempo | One 4/4 bar | Lengths in this list |
|---|---|---|
| 80 BPM | 3.0 s | 24 s = 8 bars, 36 s = 12, 48 s = 16 |
| 96 BPM | 2.5 s | 5 s = 2 bars, 10 s = 4, 20 s = 8, 40 s = 16, 60 s = 24 |
| 144 BPM | 1.667 s | 5 s = 3 bars, 20 s = 12, 40 s = 24 |

## How to use

- Use the model **Music v2.5** (`music_v2_5`). The API default is `music_v1`. Pass the model on purpose.
- Every prompt is standalone: paste it as is. Each prompt names the ensemble, the key, the tempo, the bar count, what must not be in the track, and the total length. Also set **music length** by hand to the Length column (do not leave it on Auto). Length is milliseconds: 40 s is `40000`. The API accepts 3 s to 600 s.
- Set **force instrumental** on. It is prompt-mode only. Do not send lyrics. The prompt also says instrumental, because a prompt without that line often grows a singer.
- Prompts must stay at or under 4100 characters. Every prompt in this list is far under that.
- There is no loop switch on music compose. Rows marked `loop` are written so the last bar is the same figure as the first. After export, crossfade one bar in an editor and listen to the join. If the join pumps or adds a note, regenerate.
- One-shots end in silence so they trim cleanly and do not ring under the next bed.
- Generate 2 variations of every row and keep the best. Beds: keep the take whose ending joins its opening. Name the files from the Name column, `floor_crypt_1.mp3` and `floor_crypt_2.mp3`, the same pattern as `docs/SFX_LIST.md`.
- Output **mp3 at 44.1 kHz, 192 kbps** (`mp3_44100_192`) so a bed and a sound effect share a sample rate. Left on Auto, this model picks 48 kHz.
- Do not name a commercial game, a film score, or a composer in the prompt. Describe the ensemble. The model is screened for copyrighted material.
- If a cinematic comes back with the sections in the wrong order, rebuild that one row as a composition plan (`elevenlabs music composition-plan create`, then `music compose` with the plan and no prompt). Three chunks, one per sentence of the timeline, durations matching the prompt. Do not send a prompt and a plan together.

```bash
elevenlabs music compose \
  --model-id music_v2_5 \
  --prompt "<paste the Prompt cell>" \
  --music-length-ms 40000 \
  --force-instrumental true \
  --output-format mp3_44100_192 \
  --output public/music/floor_crypt_1.mp3
```

## 1. Front door

| # | Name | Where it plays | Length | Prompt |
|---|---|---|---|---|
| 1 | `title_theme` | Home, the comic masthead, before Play | 48 s, loop | Title music for a 16-bit comic about a person trapped in his own computer. Early 1990s tracker, A minor, 80 BPM, 4/4, sixteen bars, six channels at most. A soft pulse-wave lead, a short FM bass, a paper-dry tick, and a quiet triangle pad that breathes louder and softer once every eight seconds. In bar eight only, the lead plays one rising fifth, C5 to G5, then returns to A minor. The last bar does not contain it. Sparse enough that a room tone could sit under it. No orchestra, no brass fanfare, no EDM drop. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum and a little tape hiss, no pitch wobble, no thunder and no rain. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 48 seconds. |
| 2 | `menu_bed` | Esc menu during play. The turn timer is paused | 24 s, loop | The title theme with the power pulled down, for a pause menu. Early 1990s tracker, A minor, 80 BPM, 4/4, eight bars, three channels. Only the triangle pad and the quiet FM bass, with the rising fifth C5 to G5 once in the middle, very soft. No lead melody, no drums, no tick. Calm, flat and small, so the menu text is the loudest thing. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum, no pitch wobble, no thunder. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 24 seconds. |
| 3 | `level_select` | Level select and the chapter front door | 36 s, loop | A choosing-the-floor loop, still in the title's tempo, a step more awake than the pause menu. Early 1990s tracker, A minor, 80 BPM, 4/4, twelve bars, four channels. The pulse-wave fifth C5 to G5 is now a slow four-bar walking figure that repeats three times, answered by a soft square tick on each bar, like a cursor moving down a list. Bar twelve copies bar one. No combat drums. Curious, not heroic. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum, no pitch wobble, no thunder. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 36 seconds. |
| 4 | `manual_bed` | Field manual (`/manual`), the book open on the desk | 48 s, loop | Reading music for a heavy comic manual on a wooden desk. Early 1990s tracker, A minor, 80 BPM, 4/4, sixteen bars, three channels. A slow music-box pulse playing only the rising fifth C5 to G5 and the note A4, in a four-bar pattern that repeats, with long gaps, and a quiet triangle underneath. The last bar copies the first. Dusty, warm and very quiet. No page-turn sound and no desk creak; those are sound effects. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum, no pitch wobble. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 48 seconds. |
| 5 | `achievements_bed` | Achievements page, the shelf of finished work | 20 s, loop | A small victory shelf, brighter than the title but still a tracker loop. Early 1990s tracker, 96 BPM, 4/4, eight bars, four channels. Bars one and two are A minor, bars three and four lift to C major, and bars five through eight return to A minor so the ending matches the opening. Soft pulse lead, short FM bass, a dry tick, no cymbal shower. Pleased and modest, like a badge lighting up, not a stadium. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum, no pitch wobble. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 20 seconds. |
| 6 | `comic_reader` | The six-page issue and the comic reader | 48 s, loop | Music for turning the pages of a printed comic about the same night. Early 1990s tracker, A minor, 80 BPM, 4/4, sixteen bars, four channels. A narrating pulse-wave line with rests every bar, a quiet FM bass, and the rising fifth C5 to G5 once, in bar eight, not in the last bar. Storytelling pace, no fight and no chase. No paper rustle; that is a sound effect. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum, no pitch wobble, no thunder. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 48 seconds. |
| 7 | `rank_card` | End-of-game rank, under the rank-reveal hit | 10 s, one-shot | A rank being stamped onto the last page. Early 1990s tracker, 96 BPM, 4/4, four bars, five channels. Bar one holds A minor in a low pulse. Bars two and three climb a square-wave arpeggio A4, C5, E5, G5. Bar four lands on a C major chord, pulse and triangle, then stops. The loud stamp and the sparkle are sound effects, so this cue stays behind them and does not add a crash. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum. Ends in silence. Total length: 10 seconds. |

## 2. Floors and the hub

Floor themes are the five regions of the machine. Exploration stays in A minor at 96 BPM so any floor crossfades into any other. The three hub levels share one cue. They use floor theme 1 on the map, and this cue replaces `floor_attic` while the mentor is in the room.

| # | Name | Where it plays | Length | Prompt |
|---|---|---|---|---|
| 8 | `floor_attic` | Level 01 "Wires, Chips & The Kiro Ghost", and any attic room that is not the hub. He starts in the dark, before the lantern | 40 s, loop | Explore music for a storage attic made of drive bays, dusty platters and ribbon-cable cobwebs, with a dead CRT in the corner. Early 1990s tracker, A minor, 96 BPM, 4/4, sixteen bars, four channels. Very sparse: a short FM bass on beat one of each bar, a soft pulse note every other bar, and a quiet noise hat. The rising fifth C5 to G5 appears only once, in bar fourteen, as if the lantern has just been found. It is not in the last bar. Room to type. No ghost moan and no wind. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum and a little tape hiss, no pitch wobble, no thunder and no rain. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 40 seconds. |
| 9 | `floor_crypt` | Floor theme 2. Level 02 "Cache Vault" and level 03 "GPU Alley" | 40 s, loop | Explore music for a firewall crypt: iron port grilles, log-file tombstones, a gap in the bus. Early 1990s tracker, A minor, 96 BPM, 4/4, sixteen bars, five channels. A muted square bass on the offbeat, a slow pulse lead on the minor pentatonic, and a small metal latch tick as the hat. Low, locked and watchful, with a full beat of rest at the end of every two-bar phrase. No battle snare and no siren. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum, no pitch wobble, no thunder. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 40 seconds. |
| 10 | `floor_maze` | Floor theme 3. Level 05 "UI Grid" and level 06 "Logic Cell" | 40 s, loop | Explore music for a bus maze of mirrored traces and loopback ports, the same hallway repeating. Early 1990s tracker, A minor, 96 BPM, 4/4, sixteen bars, five channels. A short square-wave figure, then a quieter copy of that same figure one eighth-note later, like a reflection in the copper. Bass holds A. Uneasy and steady, with a rest every two bars so a typed command fits. No Shepard tone, no filter howl, no speeding up. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum, no pitch wobble, no thunder. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 40 seconds. |
| 11 | `floor_furnace` | Floor theme 4. Level 08 "Docker Forge" and level 09 "Compose Furnace" | 40 s, loop | Explore music for a CPU cooling furnace: heatsink fins, heat pipes, a glow in the die. Early 1990s tracker, A minor, 96 BPM, 4/4, sixteen bars, five channels. A warmer pulse bass, a gated triangle pad, and a soft piston tick on each beat that is clearly a drum, not a recording of a fan. Heavier than the crypt, still sparse, still with a rest at the end of each phrase. No fire crackle, no alarm, no siren; those would fight the sound effects. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum, no pitch wobble, no thunder. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 40 seconds. |
| 12 | `floor_core` | Floor theme 5, the puzzle half of level 11, before the boss fight starts. A cracked CPU die in a cellar storm | 40 s, loop | Explore music for the kernel cellar before the fight: a cracked CPU die, pins like a fence, the storm left to the sound effects. Early 1990s tracker, A minor, 96 BPM, 4/4, sixteen bars, three channels. A sub pulse on A once per bar, two high square ticks like sparks off the die, and the rising fifth C5 to G5 once, in bar eight, very quiet, so the lantern still reads as his. It is not in the last bar. Dread, not combat, and emptier than the other floors. No explosions, no thunder, no alarm, no choir. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum, no pitch wobble. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 40 seconds. |
| 13 | `hub_matrix` | Levels 04, 07 and 10, "The Matrix Hub". The old coder at the CRT, Kiro loads the next open-weight model | 60 s, loop | Music for a mentor's room you return to three times: an old coder at a CRT, green data falling, a server being rebooted by a typed command. Early 1990s tracker, A minor, 96 BPM, 4/4, twenty-four bars, five channels. A very quiet triangle arpeggio in steady sixteenths, like data running down a screen, and a calm pulse-wave answer that plays the rising fifth C5 to G5 in bars eight and sixteen only, not in the last bar. Focused and kind, the sound of someone who already knows the next line. No chant, no voice, no cinematic swell. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum and a little tape hiss, no pitch wobble, no thunder. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 60 seconds. |

## 3. Battle

Fights are turn-based. The player types, then the enemy answers. The same tempo and key as a double-time version of the floor, so the bed can swap in on the battle-start hit. The low-health bed replaces `battle_loop`. It does not stack on top of it, and it does not contain the heartbeat. That heartbeat is the sound effect `low_hp_loop`.

| # | Name | Where it plays | Length | Prompt |
|---|---|---|---|---|
| 14 | `battle_loop` | Every non-boss fight, from the battle intro until the fight is won | 40 s, loop | Turn-based battle music. The player types one command, then the malware answers, and nobody moves in real time. Early 1990s tracker, A minor, 144 BPM, 4/4, twenty-four bars, six channels. A dry square bass, a paper-stamp snare on the backbeat, a short pulse lead, and a rest of one full beat at the end of every two-bar phrase so a keystroke fits there. Tense and readable, not a chase and not a dance. No dubstep bass, no screaming lead, no continuous blast, no orchestra hit. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum, no pitch wobble, no thunder. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 40 seconds. |
| 15 | `battle_boss` | Level 11 boss, Clod's kernel, once the fight starts. Same tempo as `battle_loop`, heavier arrangement | 40 s, loop | Boss music for a kernel panic fought by typing, the same speed as a normal battle so the change is weight. Early 1990s tracker, A minor with a flat second (Bb), 144 BPM, 4/4, twenty-four bars, six channels. Half-time kick, a low distorted FM bass, a bitcrushed square stab on Bb that answers the lead, and the same one-beat rest at the end of every phrase so typing still fits. Huge and dry. No orchestra hit, no choir, no trailer impact, no siren. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum, no pitch wobble, no thunder. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 40 seconds. |
| 16 | `low_hp_bed` | Replaces `battle_loop` or `battle_boss` while the player is one hit from falling. Swap, do not layer | 20 s, loop | A low-health replacement bed in the same key and tempo as the battle, so the swap does not jump. Early 1990s tracker, A minor with a flat second (Bb), 144 BPM, 4/4, twelve bars, three channels only. A bass drone on A, a thin pulse, and one bitcrushed tick. No melody and no fill. No heartbeat and no medical beep; those are sound effects playing beside this. Urgent, thin and quiet enough to sit under a typing cursor. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum, no pitch wobble. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 20 seconds. |

## 4. Stingers

Short musical figures. They play once over a bed, then the bed continues. They are not the sound-effect stings (`level_clear`, `battle_won`, `kiro_advice`, `agent_taunt`); those stay brighter and shorter. These carry the fifth, or the flat 2, so the ear ties the hit to a person.

| # | Name | Where it plays | Length | Prompt |
|---|---|---|---|---|
| 17 | `sting_lantern` | Lantern taken, a dark room lighting, the human motif stated alone | 5 s, one-shot | The human motif alone. Early 1990s tracker, about 96 BPM, two bars. One soft pulse-wave rising fifth, C5 to G5, then a quieter triangle echo of the same fifth, then silence. Warm, small and close, a lantern in one comic panel. No chime shower and no voice. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, no reverb tail. Ends in silence. Total length: 5 seconds. |
| 18 | `sting_kiro` | Kiro Ghost arrives or gives advice. Friendlier and slower than the lantern figure | 5 s, one-shot | A helpful ghost's motif, the same rising fifth as the lantern but glassy and a little slower to speak. Early 1990s tracker, two bars. A triangle wave rises C5 to G5 with a gentle wobble, a faint high sparkle of two notes after it, then silence. Calm and kind. No whisper and no voice. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry, a very short tail only on the last note. Ends in silence. Total length: 5 seconds. |
| 19 | `sting_taunt` | An agent of the big four taunts (Anti-Gravy, Codec, Gork, Clod) | 5 s, one-shot | A smug machine taunt with no mouth. Early 1990s tracker, A minor with a flat second (Bb), 144 BPM, three bars. Two bitcrushed square stabs, Bb then A, a tiny stutter repeat of the second stab, then a hard stop. Mocking, short and dry. No laugh, no whisper, no voice. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, no reverb. Ends in silence. Total length: 5 seconds. |
| 20 | `sting_clear` | Level cleared, a two-bar button under the level-clear sound effect | 5 s, one-shot | A level-clear button that stays behind the sound-effect sparkle. Early 1990s tracker, 96 BPM, two bars. Bar one is an A minor pulse arpeggio, A4 C5 E5. Bar two resolves to C major, C5 E5 G5, on a soft pulse and a triangle, then silence. Modest and clean. No bell tree and no choir; the glitter is a sound effect. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close. Ends in silence. Total length: 5 seconds. |

## 5. Laptop and Terminal Lab

The in-game terminal uses the floor bed. These two are the benches, and they stay quieter than the chapter so a test does not sound like a boss.

| # | Name | Where it plays | Length | Prompt |
|---|---|---|---|---|
| 21 | `laptop_bed` | The laptop item and Laptop Lab (`/laptop-lab`), writing code on a small machine | 20 s, loop | A small coding loop for an old laptop on a desk, three channels and no more. Early 1990s tracker, A minor, 96 BPM, 4/4, eight bars. A quiet triangle arpeggio, a short FM bass on beat one, and a dry tick. Focused and plain, with a rest every bar so keys stay louder than the music. No fan whirr and no hard-drive click; those are sound effects. The rising fifth C5 to G5 once, softly, in bar four, not in the last bar. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, a very quiet 60 Hz hum, no pitch wobble. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 20 seconds. |
| 22 | `lab_bed` | Terminal Lab only (`/terminal-lab`), a test bench, not the campaign | 20 s, loop | A test-bench loop with almost no mood, so a passing check and a failing check can play over it. Early 1990s tracker, A minor, 96 BPM, 4/4, eight bars, two channels. A FM bass on beat one and a soft square tick on the backbeat. No lead, no fifth, no swell, no minor-second sting. Neutral, dry and quiet. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, a very quiet 60 Hz hum, no pitch wobble, no thunder. The last bar is the same figure as the first bar so the file can loop. No fade-out. Total length: 20 seconds. |

## 6. Cinematics

One-shots, timed to the films. Intro is 0–16.5 s at the desk, 16.5–31.9 s as the agents wake, 31.9–39.9 s as he is pulled into floor 01. Outro is 9.8 s of reverse storm and dawn. Music stays a little inside those windows and leaves the thunder out.

| # | Name | Where it plays | Length | Prompt |
|---|---|---|---|---|
| 23 | `cine_intro` | Intro cinematic "Day 847 — New Management", the whole 40 seconds | 40 s, one-shot | A forty-second comic opening in three scored parts, not a loop and not a drone. Early 1990s tracker, A minor, 80 BPM, six channels at most. First sixteen seconds: a tired night at the desk, a real pulse-wave melody in A minor with rests, the rising fifth C5 to G5 once, a quiet triangle and a short FM bass. It is music, not silence. No thunder and no rain. Next fifteen seconds: that same melody is taken over. The lead snaps to a flat second (Bb), the bass steps in, and a dry tick doubles. Smug and minor, still a tune. No noise burst and no bitcrush wash. Last nine seconds: the melody climbs in stepped square-wave notes from A3 to E5, one hard dry stamp, the fifth C5 to G5 cut short, then silence. No smooth riser. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close, no pitch wobble. Ends in silence. Total length: 40 seconds. |
| 24 | `cine_outro` | Outro cinematic "Exit Code 0 — Dawn Return" | 10 s, one-shot | A ten-second dawn ending, the opening upload run backwards, one shot. Early 1990s tracker, 96 BPM, four bars. First two bars: a square-wave sweep falls from A5 down to A3, A minor, no thunder in the music. Next bar: the pad warms and a soft pulse plays the rising fifth C5 to G5 once, the lantern still in his hand at a real desk. Last bar: silence. No fanfare brass and no choir. Instrumental only, no vocals, no humming, no choir and no lyrics. Narrow stereo, dry and close. Ends in silence. Total length: 10 seconds. |

## Priority

Generate these 8 first. Together they cover the front door, the opening level, the first dungeon, every hub, every fight, the boss, and both films.

| Where | Row | Name |
|---|---|---|
| Home | 1 | `title_theme` |
| Level 01, the dark attic | 8 | `floor_attic` |
| Levels 02 and 03 | 9 | `floor_crypt` |
| The three hubs | 13 | `hub_matrix` |
| Any normal fight | 14 | `battle_loop` |
| Level 11 boss | 15 | `battle_boss` |
| Intro film | 23 | `cine_intro` |
| Outro film | 24 | `cine_outro` |

Next are the other floors (`floor_maze`, `floor_furnace`, `floor_core`), then the front-door beds, the stingers, and the two labs.
