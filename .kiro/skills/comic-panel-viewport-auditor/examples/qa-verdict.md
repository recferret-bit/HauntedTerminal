# Worked example: a written verdict

Produced with `node .kiro/skills/comic-panel-viewport-auditor/scripts/lab-qa.mjs malware.bug`, then
reading each PNG in `scripts/harness/out/lab-malware.bug-*.png`. The point is the form: one line per
test, the rule it touches, what was actually seen, and a concrete fix. Your model will differ.

```
malware.bug  seed 1  (lab, default post chain, 58 px/unit, dpr 1)

 1 silhouette   PASS  Beetle reads: low body, six pin legs, two antenna traces, spikes on top.
 2 facing       PASS  Cracked eye and corrupted trace face the camera, eye on the screen-right end.
 3 depth        PASS  depth ratio 0.39 (info panel).
 4 ink          PASS  One weight. Legs keep their outline at game scale.
 5 cel bands    PASS  post=0: three bands on the body, flat legs.
 6 60/30/10     WARN  silicon body + solder legs carry the shape; under COMIX the dark silicon body
                      drops to the backdrop's plum and the bug reads as an outline with legs.
 7 detail       PASS  Detail is pins and a trace, no texture noise.
 8 light        PASS  One focal glow (the eye). In lantern-dark it is the last thing visible.
 9 small        WARN  The zig-zag trace on the body is ~2 px wide at 58 px/unit: survives at dpr 1,
                      flickers when it jitters.
10 backdrops    FAIL  floor1..floor5 look the same under COMIX (all dark backdrops quantize to one
                      plum), and the body vanishes into all five. Only the light legs separate.
11 states       PASS  hidden is faint; petrified / frozen keep the silhouette; attack (t 0.3) lunges.
12 size         PASS  Minion size, under the vibecoder line, same scale as malware.zombie.

Fix: raise the body's luma (silicon -> a lighter hardware zone for the shell, keep silicon for the
underside) or add a light rim part along the top edge, so the body separates from a dark floor by
brightness. Re-run tests 1, 6, 10.
```

Test 10 also showed a pipeline fact worth knowing: with `palette=4` (COMIX) the five floor backdrops
are nearly identical, so to compare floors check `palette=0` as well, and judge separation by luma.
