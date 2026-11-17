# Declarative framework and editor: design note

(English translation of the original Russian design note. It is background reading; the shipped contract lives in `.kiro/steering/declarative-chapters.md` and `declarative-comix.md`.)

**Goal.** AI agents must not hallucinate coordinates or sprites, and the editor and the game must never drift apart. So the framework rests on a strict declarative data format and agents are forbidden to write imperative scene code. The harness generator and the visual editor read and modify the same JSON page files, and one shared player renders them for both the game and the editor.

## Declarative core

The schema describes page geometry, polygonal panel cuts (diagonal cuts and frame-breaking in the Comix Zone spirit), timeline keyframes and interactive triggers that hand over to gameplay. Types protect against invented file paths and protect manual edits made in the editor: an asset reference is either an existing registry id or a proposal for a new asset, and the page lists `lockedPaths` that an agent may not overwrite. Panels carry a polygon, actors (with a transform and an optional gutter break), bubbles (speech, thought, kernel panic, terminal prompt) and hit boxes bound to triggers.

## Asset registry and placeholders

- Agents reach game resources through a registry, not the raw file system. A builder indexes sprites, animations, sounds and shaders with sizes, durations, states and tags.
- References are strictly typed: only a valid registry id or an explicit proposal is accepted.
- Every missing asset needs a proposal with size, duration, a brief for the art or sound and a placeholder type.
- The engine renders proposals as pencil-sketch placeholders so a scene can be tested before the art exists.

## Interview mode

Discovery is a state machine with a completeness check: while the chapter draft has empty slots, spec generation is blocked. It covers the chapter frame (metaphor, levels, state flags), transitions into gameplay, storyboard and rhythm, and an audit of missing assets that the user approves before any spec folder is created.

## Specs and validation harness

After approval, a chapter folder holds the arc, the storyboard, the approved asset proposals and the acceptance invariants, plus the generated pages. The harness loops generation against a deterministic validator that returns exact errors until four checks pass:

1. Reference check: asset ids, animation states, sound keys and level ids exist in the registry or in approved proposals.
2. Geometry solver: panel polygons stay on the canvas, actor anchors stay in frame, text fits the bubbles with real font metrics.
3. Trigger graph: no dead ends; every interactive page has a path to a level start.
4. Headless frame render: key timecodes are rendered to a buffer and checked so bubbles do not cover faces or click zones.

## Visual editor

The game's own comic renderer is mounted inside the editor shell so the preview matches the game exactly. It offers a panel splitter, a multi-track timeline with interpolation curves, hit-box drawing with trigger binding, and protection of manual edits: any field changed in the editor goes into `lockedPaths` so regeneration never overwrites hand-tuned timings and coordinates.
