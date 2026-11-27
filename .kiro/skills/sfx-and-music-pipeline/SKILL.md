---
name: sfx-and-music-pipeline
description: "[AUDIO] The house pipeline for Out Of Credits sound: write or edit a cue row in `docs/audio/SFX_LIST.md` or `docs/audio/MUSIC_LIST.md`, dry-run and generate it with ElevenLabs only through `scripts/harness/audio-gen.mjs` (credit cap, Keychain login, ffmpeg post), keep `public/sfx` and `public/music` and their manifests consistent, and map the cue to an app event or scene in `src/audio/`. Use whenever someone wants a new or better sound effect, music bed, sting or robot voice line, asks why a sound does not play, or touches the audio manifests. Read before calling any other elevenlabs-* skill."
---

# SFX and music pipeline (`sfx-and-music-pipeline`)

**Category: AUDIO.** Owner: `sound-designer`. Spec: `.kiro/specs/audio-agent/`; the playback side is `.kiro/specs/app-events-audio/`. The `elevenlabs-*` skills describe the CLI; this skill says how this project uses it. When they disagree, this skill wins.

## What lives where

| Path | What |
|---|---|
| `docs/audio/SFX_LIST.md` | One table row per sound effect and voice cue: Name, trigger, Length, Prompt. The "How to use" section holds the prompt-writing rules. |
| `docs/audio/MUSIC_LIST.md` | One row per music bed or sting, plus the tempo, key and palette rules every prompt follows. |
| `public/sfx/*.mp3`, `public/sfx/manifest.json` | One kept file per cue name (`key_press.mp3`; a kept variant is its own cue, `key_press_2.mp3`). |
| `public/music/*.mp3`, `public/music/manifest.json`, `public/music/plans/<name>.json` | Beds and stings; a stored composition plan wins over the prompt. |
| `src/audio/` | `catalog.ts` (the id lists, same order as manifests), `config.ts` (`SFX_TRIM`, `LOOP_GAINS`, `LOOP_CUE_IDS`, `TYPING_SFX`, `KEY_VARIANTS`, `TAUNT_VARIANTS`, `SPEECH_SFX`, `KEY_RATES`, `KEY_GAINS`), `loop-takes.ts` (`LOOP_TAKES`), `sfx-*.ts` (app event -> cue), `music-for.ts` (scene -> bed). |
| `src/audio-lab/`, `/audio-lab` | Browser Audio Lab workbench (`window.__audioLab`): filterable soundboard, Web Audio waveform + `SFX_TRIM` scrubber (`Play Trimmed` / `Play Raw`, copyable snippet), `LOOP_TAKES`/`LOOP_GAINS` mixer, `MusicScene` & `AppBus` tester. |

Exhaustive runtime & config schema: [references/audio-config-schema.md](./references/audio-config-schema.md).

## The loop

1. **Row first.** A cue exists only as a row in a list. Edit the Prompt cell, or add a row with the next number. Follow the list's rules: physical source first, a timeline ("first, then, finally"), pitch and perspective, ends in silence, `Total length: N seconds.`, at most 450 characters for SFX. Music names ensemble, key, tempo, bars, what must not be in it, and the length.
2. **Dry run.** `node scripts/harness/audio-gen.mjs plan <cue> [--variants N] [--text "<line>"]`. It prints each request (through the CLI's own local `--dry-run`) and the estimated credits. Nothing is sent.
3. **Generate only when the brief says generate** (in words, from the user through `lead-dev`). Add `--generate`. Before any request the wrapper checks the login and the balance and refuses a run over **15,000** estimated credits, or one that would leave fewer than **30,000**. After each request it reads the balance again and stops past the cap. Check first with `node scripts/harness/audio-gen.mjs credits`. If it is refused, report that; do not split a run to get around the cap.
4. **Post.** With `ffmpeg` installed, the wrapper trims silence at both ends of a one-shot, sets the peak to -3 dBFS, and crossfades one bar into the head of a music loop. Without it, the raw take stays, the entry gets `"post": false` and the run exits 3 ("brew install ffmpeg"). Say so in the report; installing it is the user's job.
5. **Manifest.** The wrapper patches only the cue's entry (read from disk right before the write, atomic). Never hand-rewrite a manifest. A new cue name is appended at the end.
6. **Map it.** A new cue name goes into `src/audio/catalog.ts` in manifest order, and into the event or scene table that plays it (`sfx-kernel.ts`, `sfx-app.ts`, `sfx-doors.ts`, `sfx-models.ts`, `music-for.ts`). A regenerated take of an existing cue needs no code change.
7. **Inspect & Gates.**
   - Headless acoustic & config inspect: `node scripts/harness/audio-gen.mjs inspect <cue>...|--all [--json]` (reports `durationSec`, `maxDb`, `meanDb`, `leadingSilenceSec`, `trailingSilenceSec`, `activeSec`, `trim`, `loopGain`).
   - Browser workbench: `npm start` -> `/audio-lab` (`audio-lab-unit.mjs`, `audio-lab-smoke.mjs`).
   - Required checks: `node scripts/harness/audio-gen.mjs --check`, `node scripts/harness/audio-unit.mjs`, `node scripts/harness/audio-lab-unit.mjs`, `node scripts/harness/audio-lab-smoke.mjs`, `node scripts/harness/audio-smoke.mjs`, `npm run quality`.
8. **Listen? No.** No agent judges a sound by ear. Report "not judged: needs a person listening" and name the files.

## House settings (the wrapper applies them; listed so a prompt can be reasoned about)

| Kind | Command | Settings |
|---|---|---|
| SFX | `text-to-sound-effects convert` | `eleven_text_to_sound_v3`, prompt influence 0.8, duration = listed length, at least 0.5 s (API minimum), `--loop` on loop rows |
| Music | `music compose` | `music_v2_5`, force instrumental, length in ms from the row; a plan in `public/music/plans/` is sent as the JSON body instead of the prompt |
| Voice | `text-to-speech convert` | `eleven_v4`, the voice the row names (`Laura`, `Daniel`, `Callum`, `George`, `Jessica`), filter `robot`; the line comes from `--text` and is stored in the entry |
| All | | `mp3_44100_192`; the file name is the cue name; the wrapper computes the path |

## Never

- Run `elevenlabs` directly, pass `--output`, or write an mp3 with any other tool: the shell refuses them, and the wrapper is the only path with the cap. For the CLI's machine-readable surface use `node scripts/harness/audio-gen.mjs schema <resource> [<method>]`.
- Name a commercial game, film, composer or real person's voice in a prompt; the models screen for it and it is not our look.
- Put personal data in a prompt or a voice line. The wrapper's `--intent` names only the cue.
- Change the cap, the reserve or the wrapper: `lead-dev` owns `scripts/harness/audio-gen.mjs`. Hand the change over in your report.
- Use the other ElevenLabs products (agents, dubbing, studio, webhooks, workspaces, reception) or `elevenlabs say` (it plays audio aloud on the machine).
