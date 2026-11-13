# Comix

Intro and outro are data. The engine in `src/cinematic/` plays whatever these folders say. It does not name a line of dialogue, a panel time or a camera move.

```
comix/<id>/
  manifest.json     identity, room, skip policy, end, keyframe stills
  marks.json        named times (seconds)
  cast.json         actors (model ids that already exist)
  set.json          named points, props, rain, bolts, vortex, part names
  pages/*.json      one file per comic page: panel rects and when each panel cuts in
  letters.json      captions, memes, bubbles, onomatopoeia, queue, card, page turns
  beats.json        one-shot events: lightning, fx, audio, looks, states
  camera.json       one shot track per panel
  poses.json        pose programs (seated, suck, emerge, flight, fling, monitor, shake, ...)
  splash.json       outro stats card (optional; the run supplies rank, time, commands, shortcuts)
```

Times in every file except `marks.json` are mark expressions: `STRIKE`, `STRIKE+0.35`, `WHITE-0.1`, or a bare number `1.5`.

The vocabulary is `src/cinematic/spec-types.ts`. A new `kind` is added there, interpreted once in `src/cinematic/`, and given a form in `src/comix-editor/schema.ts`. Humans tune the files in the Comix Editor at `/comix-editor`.

Kiroween ships two comixes: `intro` and `outro`. Do not add more until a chapter needs one.
