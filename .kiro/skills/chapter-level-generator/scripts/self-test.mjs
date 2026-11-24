#!/usr/bin/env node
// Comprehensive unit + edge-case self-test for chapter-level-generator, src/chapters/validators.ts,
// src/chapters/catalog.ts, and src/chapters/chapter-session.ts.
import assert from 'node:assert/strict';
import { withProcgen } from '../../../../scripts/harness/lib/load.mjs';

await withProcgen(async (_p, vite) => {
  const validators = await vite.ssrLoadModule('/src/chapters/validators.ts');
  const catalog = await vite.ssrLoadModule('/src/chapters/catalog.ts');
  const achievements = await vite.ssrLoadModule('/src/chapters/achievements.ts');
  const portableSave = await vite.ssrLoadModule('/src/chapters/portable-save.ts');
  const { createChapterSession } = await vite.ssrLoadModule('/src/chapters/chapter-session.ts');

  catalog.resetInMemoryStoresForTest();

  // ---- 1. HTML + CSS Storefront Validator Edge Cases ----
  assert.equal(validators.validateStorefrontHtmlCss('', '').ok, false, 'empty HTML/CSS must fail');

  const brokenHtml = `
    <section class="product-grid">
      <article data-sku="gpu"></article>
      <article data-sku="ram"></article>
      <article data-sku="ssd"></article>
    </section>
    <button id="checkout-btn" class="buy-btn" disabled>BUY</button>
  `;
  const brokenCss = `
    /* .product-grid { display: grid; } */
    .product-grid { display: none; }
    .cart-drawer { width: 0%; z-index: -1; }
  `;
  const vHtmlFail = validators.validateStorefrontHtmlCss(brokenHtml, brokenCss);
  assert.equal(vHtmlFail.ok, false);
  assert.ok(vHtmlFail.errors.some((e) => e.includes('disabled')));
  assert.ok(vHtmlFail.errors.some((e) => e.includes('.product-grid')));
  assert.ok(vHtmlFail.errors.some((e) => e.includes('.cart-drawer')));

  // Unbalanced CSS braces
  assert.equal(
    validators.validateStorefrontHtmlCss(brokenHtml.replace('disabled', ''), '.product-grid { display: grid; ').ok,
    false,
  );

  // Valid HTML + CSS (including unconventional compound selectors, HTML comment with old disabled btn, and omitted width -> auto)
  const unconventionalHtml = `
    <!-- <button id="checkout-btn" disabled>OLD</button> -->
    <section class="product-grid">
      <article data-sku="gpu"></article>
      <article data-sku="ram"></article>
      <article data-sku="ssd"></article>
    </section>
    <button id="checkout-btn" class="buy-btn">BUY</button>
  `;
  const unconventionalCss = `
    main .product-grid { display: flex !important; }
    aside.cart-drawer { min-width: 320px; z-index: 5; }
  `;
  assert.equal(validators.validateStorefrontHtmlCss(unconventionalHtml, unconventionalCss).ok, true);

  // ---- 2. Cart JS Validator Edge Cases ----
  assert.equal(validators.validateCartJs('').ok, false);
  assert.equal(
    validators.validateCartJs('export function computeCartTotal(price, shipping) { return price + shipping; }').ok,
    false,
  );
  assert.equal(
    validators.validateCartJs(
      'export function computeCartTotal(price, shipping, qty = 1) { if (qty <= 0) return 0; return Number(price) + Number(shipping); }',
    ).ok,
    false,
    'ignoring qty > 1 multiplication must fail multi-item test vector',
  );
  // Keeping `// BUG:` comment in valid fixed JS must STILL PASS!
  assert.equal(
    validators.validateCartJs(
      '// BUG: used to concatenate strings\nexport const computeCartTotal = (price, shipping, qty = 1) => qty <= 0 ? 0 : Number(price) * Number(qty) + Number(shipping);',
    ).ok,
    true,
    'valid arrow function with untouched // BUG: comment must pass',
  );

  // ---- 3. Dockerfile Validator Edge Cases ----
  assert.equal(validators.validateDockerfile('').ok, false);
  assert.equal(
    validators.validateDockerfile('FROM node:99-vibe-turbo\nCOPY . .\nEXPOSE 3000\nCMD ["node", "server.js"]').ok,
    false,
  );
  assert.equal(
    validators.validateDockerfile('FROM node:20-alpine\nCOPY . .\nRUN ./cryptominer.sh\nEXPOSE 3000\nCMD ["node", "server.js"]').ok,
    false,
  );
  // Unconventional valid Dockerfile: --platform flag, multi-stage AS alias, EXPOSE 3000/tcp, backslash continuation, shell CMD
  assert.equal(
    validators.validateDockerfile(
      'FROM --platform=linux/amd64 node:22-slim AS runtime\nWORKDIR /app\nCOPY --chown=node:node . .\nRUN npm install \\\n  --omit=dev\nEXPOSE 3000/tcp\nCMD node server.js',
    ).ok,
    true,
  );

  // ---- 4. Docker Compose Validator Edge Cases (2-space, 4-space, indentless lists, inline comments) ----
  assert.equal(validators.validateDockerCompose('').ok, false);
  assert.equal(validators.validateDockerCompose('services:\n\tnginx:\n    image: nginx:alpine').ok, false, 'tabs must fail YAML check');
  const fourSpaceCompose = [
    "version: '3.9'",
    'services:',
    '    nginx:',
    '        image: "nginx:1.27-alpine" # edge proxy',
    '        ports:',
    '        - "0.0.0.0:8080:80/tcp"',
    '    website:',
    '        image: byterig-web:1.0',
    '        environment:',
    '            PAYMENT_URL: "http://payment:4002/charge" # internal DNS',
    '    payment:',
    '        image: byterig-pay:1.0',
    '        environment:',
    '        - PAYMENT_MODE=production',
  ].join('\n');
  assert.equal(validators.validateDockerCompose(fourSpaceCompose).ok, true, '4-space YAML + indentless lists + /tcp + comments must pass');

  // ---- 7. Chapter 01 Kiroween: 11-Level Arc, Scripted Awakening, Kiro Tutorial, Matrix Greybeard Hub & Father Twist ----
  const kiroRealtime = createChapterSession({
    chapterId: 'chapter-01-kiroween',
    tacticalMode: false,
  });
  // While intro card is active (before arriveLevel), Vibecoder rises alone in dark wires & chips with NO bug and NO Kiro yet
  assert.equal(
    kiroRealtime.snapshot().room.actors.some((a) => a.id === 'kiro'),
    false,
    'Before arriveLevel(), Kiro Ghost must not already be flying around on stage',
  );
  assert.equal(
    kiroRealtime.snapshot().room.actors.some((a) => a.id === 'tutorial_virus_1'),
    false,
    'At Level 1 spawn, tutorial bug must not already be standing on stage',
  );
  assert.equal(kiroRealtime.snapshot().enemiesLeft, 0, 'At Level 1 spawn, HUD enemiesLeft must be 0');
  const arrival = kiroRealtime.arriveLevel();
  // Level 1 opens in the dark: no lantern in the pocket, the terminal in his hand, the monologue on the clock.
  assert.ok(arrival.output.includes('pitch black'), 'Level 1 must open in the dark');
  assert.ok(arrival.events.some((e) => e.type === 'VIBECODER_EMOTE' && e.emote === 'shock'));
  assert.equal(arrival.snapshot.room.dark, true, 'Without the lantern the room is dark');
  assert.deepEqual(arrival.snapshot.inventory, { items: ['terminal'], held: 'terminal' }, 'He starts with the terminal only');
  assert.equal(arrival.snapshot.tutorial?.agent, 'kiro');
  assert.equal(arrival.snapshot.tutorial?.step, 1);
  assert.equal(arrival.snapshot.tutorial?.command, 'mv lantern ~');
  const isBox = (e, speaker) => e.type === 'DIALOG_BOX' && e.speaker === speaker;
  const timeline = [];
  const kiroSeen = [];
  for (let t = 0; t < 24; t++) {
    const r = kiroRealtime.tick();
    timeline.push(...r.events);
    kiroSeen.push(r.snapshot.room.actors.some((a) => a.id === 'kiro' && a.model === 'npc.kiro_ghost'));
  }
  const boxes = timeline.filter((e) => e.type === 'DIALOG_BOX').map((e) => e.speaker);
  for (const villain of ['antigravy', 'codec', 'gork', 'clod']) {
    assert.ok(timeline.some((e) => isBox(e, villain)), `Big Four speaker ${villain} laughs at Vibecoder in a dialog box`);
  }
  const lastMonologueIdx = boxes.indexOf('vibecoder', 2);
  const firstVillainIdx = boxes.indexOf('antigravy');
  const lastVillainIdx = boxes.indexOf('clod');
  const shockBoxIdx = boxes.lastIndexOf('vibecoder');
  const firstKiroIdx = boxes.indexOf('kiro');
  assert.ok(
    lastMonologueIdx >= 2 && firstVillainIdx > lastMonologueIdx && lastVillainIdx >= firstVillainIdx + 3,
    'Big Four small talk follows Vibecoder initial monologue',
  );
  assert.ok(shockBoxIdx > lastVillainIdx && firstKiroIdx > shockBoxIdx, 'Vibecoder reacts in shock after Big Four before Kiro introduces himself');
  assert.ok(
    timeline.some((e) => e.type === 'VIBECODER_EMOTE' && e.emote === 'shock'),
    'Vibecoder shows shock emote after Big Four small talk',
  );
  assert.ok(timeline.filter((e) => isBox(e, 'vibecoder')).length >= 4, 'Vibecoder talks to himself and reacts in shock in dialog boxes');
  assert.ok(timeline.some((e) => isBox(e, 'kiro')), 'Kiro Ghost introduces himself in a dialog box');
  assert.ok(timeline.some((e) => e.type === 'ENTITY_SPAWNED' && e.entityId === 'kiro' && e.entrance === 'glide'), 'Kiro glides in');
  assert.equal(kiroSeen[5], false, 'Kiro is not on stage before his entrance');
  assert.equal(kiroSeen[15], false, 'Kiro is not on stage yet during Vibecoder shock');
  assert.equal(kiroSeen[23], true, 'After the entrance, Kiro Ghost (npc.kiro_ghost) is on stage');
  // Even after 24 real-time ticks in Level 1 Tutorial, player takes 0 damage (tutorial truce)
  const startHp = kiroRealtime.snapshot().hp;
  for (let t = 0; t < 15; t++) {
    kiroRealtime.tick();
  }
  assert.equal(kiroRealtime.snapshot().hp, startHp, 'Level 1 tutorial truce must prevent any bug damage');
  // ls is locked until he holds the lantern, then the scripted order: mv lantern -> ls -> mv -> cat -> ps -> kill -> cd hub_uplink
  const locked = kiroRealtime.exec('ls');
  assert.ok(locked.output.includes('too dark'), 'ls is refused in the dark');
  assert.equal(locked.snapshot.tutorial?.step, 1, 'A refused ls does not move the tutorial on');
  assert.equal(kiroRealtime.exec('ls -la').output.includes('kiro_story.txt'), false, 'ls -la is locked too');
  const stepLantern = kiroRealtime.exec('mv lantern ~');
  assert.ok(stepLantern.output.includes('[COLLECTED]'));
  assert.equal(stepLantern.snapshot.inventory?.held, 'lantern');
  assert.equal(stepLantern.snapshot.room.dark, false);
  assert.equal(stepLantern.snapshot.tutorial?.step, 2);
  assert.equal(stepLantern.snapshot.tutorial?.command, 'ls');
  const stepLs = kiroRealtime.exec('ls');
  assert.ok(stepLs.output.includes('kiro_story.txt'), 'ls works with the lantern');
  assert.equal(stepLs.snapshot.tutorial?.step, 3);
  assert.equal(stepLs.snapshot.tutorial?.command, 'mv starter_ram_8gb.dimm ~');
  const stepMv = kiroRealtime.exec('mv starter_ram_8gb.dimm ~');
  assert.equal(stepMv.snapshot.tutorial?.step, 4);
  assert.equal(stepMv.snapshot.tutorial?.command, 'cat kiro_story.txt');
  const stepCat = kiroRealtime.exec('cat kiro_story.txt');
  assert.equal(stepCat.snapshot.tutorial?.step, 5);
  assert.equal(stepCat.snapshot.tutorial?.command, 'ps');
  assert.ok(
    stepCat.snapshot.room.actors.some((a) => a.id === 'tutorial_virus_1'),
    'Tutorial bug phases onto stage once player reaches the ps step',
  );
  const stepPs = kiroRealtime.exec('ps');
  assert.equal(stepPs.snapshot.tutorial?.step, 6);
  assert.equal(stepPs.snapshot.tutorial?.command, 'kill -9 1011');
  const stepKill = kiroRealtime.exec('kill -9 1011');
  assert.equal(stepKill.snapshot.tutorial?.step, 7);
  assert.equal(stepKill.snapshot.tutorial?.command, 'cd hub_uplink');
  assert.equal(
    stepKill.snapshot.room.actors.some((a) => a.id === 'kiro'),
    false,
    'Once Level 1 tutorial commands are done, Kiro Ghost goes ahead to the Hub',
  );

  // Bypasses closed: find and kiro are locked in the dark too; taking the lantern early skips the stale reminders;
  // a floor restart puts the dark start back.
  const early = createChapterSession({ chapterId: 'chapter-01-kiroween', tacticalMode: false });
  early.arriveLevel();
  assert.ok(early.exec('find .').output.includes('too dark'), 'find is locked in the dark');
  assert.ok(early.exec('kiro scan').output.includes('in the dark'), 'kiro scan is locked in the dark');
  assert.equal(early.snapshot().room.xray, false, 'kiro scan must not switch the X-ray on in the dark');
  // Doing later steps blind does not move the card past the lantern step.
  assert.equal(early.exec('cat kiro_story.txt').snapshot.tutorial?.step, 1, 'Reading the briefing in the dark keeps the card on the lantern step');
  const earlyEvents = [];
  for (let t = 0; t < 4; t++) earlyEvents.push(...early.tick().events);
  assert.ok(early.exec('mv lantern ~').output.includes('[COLLECTED]'));
  for (let t = 0; t < 19; t++) earlyEvents.push(...early.tick().events);
  assert.ok(earlyEvents.some((e) => isBox(e, 'kiro')), 'Kiro still arrives when the lantern was taken early');
  assert.equal(earlyEvents.filter((e) => isBox(e, 'kiro')).length, 1, 'Kiro does not repeat the lantern reminders once it is taken');
  assert.equal(earlyEvents.some((e) => e.type === 'TUTORIAL_STEP' && e.step === 1 && !e.done), false, 'No stale step-1 card after the lantern');
  assert.equal(earlyEvents.some((e) => isBox(e, 'vibecoder') && /No lantern/.test(e.text)), false, 'He does not say he has no lantern after taking it');
  const restarted = early.restartFloor();
  assert.deepEqual(restarted.snapshot.inventory, { items: ['terminal'], held: 'terminal' }, 'A floor restart puts the dark start back');
  assert.equal(restarted.snapshot.room.dark, true);
  assert.ok(early.exec('ls').output.includes('too dark'), 'ls is locked again after the restart');

  const kiroChap = createChapterSession({
    chapterId: 'chapter-01-kiroween',
    tacticalMode: true,
  });
  kiroChap.skipIntro();
  assert.equal(kiroChap.getLevels().length, 11, 'chapter-01-kiroween must have 11 executable levels');
  assert.equal(kiroChap.getCurrentLevel().id, 'level-01-tutorial-awakening');
  assert.ok(kiroChap.exec('ls').output.includes('too dark'), 'ls is locked until the lantern is taken');
  assert.ok(kiroChap.exec('mv lantern ~').output.includes('[COLLECTED]'));
  assert.ok(kiroChap.exec('ls').output.includes('kiro_story.txt'));
  assert.ok(kiroChap.exec('cat kiro_story.txt').output.includes('BIG FOUR'));
  assert.ok(kiroChap.exec('mv starter_ram_8gb.dimm ~').output.includes('[COLLECTED]'));
  assert.ok(kiroChap.exec('ps').output.includes('1011'));
  const killProbe = kiroChap.exec('kill -9 1011');
  assert.equal(killProbe.snapshot.enemiesLeft, 0);
  assert.ok(killProbe.output.includes('hub_uplink'));
  kiroChap.exec('cd hub_uplink');
  assert.equal(kiroChap.getCurrentLevel().id, 'level-02-task-ram-heist');
  assert.equal(
    kiroChap.snapshot().room.actors.some((a) => a.id === 'kiro'),
    false,
    'Kiro is waiting at the Hub during Levels 2 & 3',
  );
  const gpuCollect = kiroChap.exec('mv gpu_tensor_chip_01.img ~');
  assert.ok(gpuCollect.output.includes('Local GPU Tensor Chip'), 'GPU pickup must report Local GPU Tensor Chip');

  // Jump to Hub 1 (Level 4): verify npc.greybeard_rig on stage, dad command, and kiro load qwen disabling ANTI-GRAVY
  kiroChap.jumpToLevel('level-04-hub-model-one');
  assert.ok(
    kiroChap.snapshot().room.actors.some((a) => a.model === 'npc.greybeard_rig'),
    'Hub room must render npc.greybeard_rig for dad.tty.sock',
  );
  // Before running `kiro load qwen`, the `kiro_loaded` winRule must NOT be satisfied!
  assert.equal(
    kiroChap.getChecklist().find((c) => c.description.includes('kiro load qwen'))?.done,
    false,
    'Hub 1 kiro_loaded rule must be false before running kiro load qwen',
  );
  kiroChap.exec('cat server_rack.conf');
  assert.ok(kiroChap.exec('dad').output.includes('Are you a god'));
  // Attempting to exit before `kiro load qwen` must fail with gate locked!
  assert.ok(kiroChap.exec('cd sector_ui_grid').output.includes('Sector gate locked'));
  // Loading an out-of-order core (`llama`) in Hub 1 must NOT satisfy `kiro_loaded: "qwen"` or emit Hub 3's banner!
  const wrongHubCore = kiroChap.exec('kiro load llama');
  assert.ok(
    wrongHubCore.output.includes('kiro load qwen') && !wrongHubCore.output.includes('GORK DISABLED'),
    'Out-of-order kiro load in Hub 1 must prompt for kiro load qwen',
  );
  assert.equal(
    kiroChap.getChecklist().find((c) => c.description.includes('kiro load qwen'))?.done,
    false,
  );
  const hubReboot1 = kiroChap.exec('kiro load qwen');
  assert.ok(hubReboot1.output.includes('ANTI-GRAVY DISABLED'));
  assert.equal(
    kiroChap.getChecklist().find((c) => c.description.includes('kiro load qwen'))?.done,
    true,
  );

  // Verify interactive `edit` modal (`readEditableFile` + patch chips + `saveEditableFile`) on Levels 5, 6, 8, 9
  kiroChap.jumpToLevel('level-05-task-ui-grid');
  assert.ok(kiroChap.exec('dad').output.includes('storefront.css'));
  assert.ok(kiroChap.exec('dad').output.includes('#checkout-btn'));
  assert.ok(kiroChap.exec('dad').output.includes("sed -i 's/ disabled//' index.html"));
  const editCss = kiroChap.readEditableFile('storefront.css');
  assert.equal(editCss.ok, true);
  const patchedCss = editCss.content.replace(editCss.patches[0].find, editCss.patches[0].replace);
  assert.ok(kiroChap.saveEditableFile('storefront.css', patchedCss).output.includes('[SAVED]'));
  const editHtml = kiroChap.readEditableFile('index.html');
  assert.equal(editHtml.ok, true);
  const patchedHtml = editHtml.content.replace(editHtml.patches[0].find, editHtml.patches[0].replace);
  assert.ok(kiroChap.saveEditableFile('index.html', patchedHtml).output.includes('200 OK'));
  kiroChap.exec('mv gpu_tensor_chip_02.img ~');
  kiroChap.exec('mv ram_16gb.dimm ~');
  kiroChap.exec('cd logic_cell');
  assert.equal(kiroChap.getCurrentLevel().id, 'level-06-task-logic-purge');

  // Jump to Hub 2 (Level 7) & Hub 3 (Level 10): verify DeepSeek disables Codec and Llama disables Gork
  kiroChap.jumpToLevel('level-07-hub-model-two');
  assert.ok(kiroChap.exec('kiro load deepseek').output.includes('CODEC DISABLED'));
  kiroChap.jumpToLevel('level-10-hub-model-three');
  const hubReboot3 = kiroChap.exec('kiro load llama');
  assert.ok(hubReboot3.output.includes('GORK DISABLED') && hubReboot3.output.includes('Only CLOD survives'));

  // Jump to Level 11 Boss: verify Clod supervisor cameo on stage, zero actor overlaps, Kiro advisor inspect, and Father twist on exit
  kiroChap.jumpToLevel('level-11-boss-clod-core');
  const bossActors = kiroChap.snapshot().room.actors;
  assert.ok(
    bossActors.some((a) => a.model === 'agent.clod'),
    'Boss room must render agent.clod alongside boss.kernel',
  );
  // Check that no two ground actors in Level 11 overlap in x
  const groundActors = bossActors.filter((a) => a.id !== 'kiro');
  for (let i = 0; i < groundActors.length; i++) {
    for (let j = i + 1; j < groundActors.length; j++) {
      const dx = Math.abs(groundActors[i].x - groundActors[j].x);
      assert.ok(
        dx >= 0.35,
        `Boss room actors ${groundActors[i].id} (x=${groundActors[i].x}) and ${groundActors[j].id} (x=${groundActors[j].x}) overlap (dx=${dx})`,
      );
    }
  }
  // Verify Kiro Advisor inspects all 3 Boss files accurately
  assert.ok(kiroChap.exec('kiro inspect clod_prompt_flood.stream').output.includes('/dev/null'));
  assert.ok(kiroChap.exec('kiro inspect open_weights_advisor.log').output.includes('OPEN_WEIGHT_SIG='));
  assert.ok(kiroChap.exec('kiro inspect core_anchor.conf').output.includes('clod_supervisor_lock=false'));
  assert.ok(kiroChap.exec('exit').output.includes('Clod & Kernel Overlord'));
  kiroChap.exec('cat clod_prompt_flood.stream > /dev/null');
  kiroChap.exec('grep OPEN_WEIGHT_SIG open_weights_advisor.log > kiro_override.sock');
  kiroChap.exec("sed -i 's/clod_supervisor_lock=true/clod_supervisor_lock=false/' core_anchor.conf");
  assert.ok(kiroChap.exec('kill -9 1').output.includes('Clod & Kernel Overlord'));

  // Kiro parody & non-affiliation notice (`kiro disclaimer`, `kiro legal`, and `kiro` status footer).
  assert.ok(kiroChap.exec('kiro').output.includes('kiro disclaimer'), 'kiro status must list kiro disclaimer');
  for (const alias of ['kiro disclaimer', 'kiro legal']) {
    const disc = kiroChap.exec(alias);
    assert.equal(disc.code, 0, `${alias} must exit 0`);
    for (const needle of ['PARODY & NON-AFFILIATION NOTICE', 'Anti-Gravy', 'Codec', 'Gork', 'Clod', 'no real AI brands']) {
      assert.ok((disc.output + disc.events.map((e) => ('text' in e ? e.text : '')).join('\n')).includes(needle), `${alias} missing ${needle}`);
    }
  }

  const kiroExit = kiroChap.exec('exit');
  assert.equal(kiroExit.snapshot.ended, true);
  assert.ok(kiroExit.output.includes('CLOD ESCAPES'));
  assert.ok(kiroExit.output.includes('I am your father'));
  assert.ok(kiroExit.output.includes('NOOOO'));
  assert.ok(kiroExit.output.includes('12 hours a day, 7 days a week'));
  assert.ok(kiroExit.output.includes('Work/Life Balance'));
  assert.ok(
    kiroExit.snapshot.room.actors.some((a) => a.id === 'father:outro' && a.model === 'npc.greybeard_rig'),
    'Real-world ending must include Father (npc.greybeard_rig) alongside Vibecoder',
  );

  // Chapter-declared codex cards come from the manifest, not from code.
  const dossier = catalog.dossierOf(catalog.getChapterManifest('chapter-01-kiroween'));
  assert.ok(dossier.some((d) => d.id === 'dad.tty'), 'manifest.dossier must add the chapter ally to the bestiary');
  assert.ok(!catalog.BESTIARY_DOSSIER.some((d) => d.id === 'dad.tty'), 'the shared bestiary must not name a chapter ally');

  // ---- 8. Local Achievements (1:1 Steamworks ACH_*), Preview Isolation & Portable Save Bundle Edge Cases ----
  const achAfterRun = achievements.readAchievements();
  for (const expectedId of ['first_boot', 'sigkill_hunter', 'open_weights_init', 'big_four_silenced', 'campaign_clear']) {
    assert.ok(achAfterRun.unlocked[expectedId], `Expected achievement "${expectedId}" to be unlocked during campaign run`);
    assert.match(achAfterRun.unlocked[expectedId].steamApiName, /^ACH_[A-Z0-9_]+$/);
  }
  assert.equal(
    achAfterRun.unlocked.zero_panic_run,
    undefined,
    'zero_panic_run must NOT unlock when levels were skipped via jumpToLevel()',
  );

  // Verify full 11-level 0-death S-rank playthrough unlocks all 10 non-chaos/non-workshop achievements (including full_stack_fixer & zero_panic_run)
  catalog.resetInMemoryStoresForTest();
  const fullRunSession = createChapterSession({ chapterId: 'chapter-01-kiroween', tacticalMode: true });
  fullRunSession.skipIntro();
  for (const lvl of catalog.getChapterLevels('chapter-01-kiroween')) {
    for (const cmd of lvl.solutionCommands) {
      fullRunSession.exec(cmd);
    }
  }
  const fullRunAch = achievements.readAchievements();
  for (const expectedId of [
    'first_boot',
    'lantern_sweep',
    'sigkill_hunter',
    'stone_cold_chmod',
    'open_weights_init',
    'full_stack_fixer',
    'big_four_silenced',
    'speed_demon_s',
    'campaign_clear',
    'zero_panic_run',
  ]) {
    assert.ok(fullRunAch.unlocked[expectedId], `Full 11-level run must unlock "${expectedId}"`);
  }
  // Idempotent: unlocking an already-unlocked achievement returns null
  assert.equal(achievements.unlockAchievement('first_boot'), null, 'Duplicate unlock must return null');

  // CLI commands: `achievements`, `ach combat`, `achievements export`, `achievements sync`, `man achievements`
  const achListOut = kiroChap.exec('achievements').output;
  assert.ok(achListOut.includes('LOCAL ACHIEVEMENTS') && achListOut.includes('ACH_FIRST_BOOT'));
  assert.ok(achListOut.includes('Open Weights & Family Ties'), 'Unlocked secret achievement must reveal its real title');
  const achCombatOut = kiroChap.exec('ach combat').output;
  assert.ok(achCombatOut.includes('ACH_SIGKILL_HUNTER') && !achCombatOut.includes('ACH_FIRST_BOOT'));
  const achExport = JSON.parse(kiroChap.exec('achievements export').output);
  assert.equal(achExport.schemaVersion, 1);
  assert.equal(achExport.totalCount, 12);
  assert.ok(achExport.steamApiNames.includes('ACH_CAMPAIGN_CLEAR'));
  assert.ok(kiroChap.exec('achievements sync').output.includes('ACH_*'));
  assert.ok(kiroChap.exec('man achievements').output.includes('achievements export'));
  assert.ok(
    kiroChap.exec('achievements; ls').output.includes('Issue complete!'),
    'Post-end achievements pass-through must block chained shell commands',
  );

  // Preview isolation: a preview session neither emits ACHIEVEMENT_UNLOCKED nor leaks unlocked state
  const previewSess = createChapterSession({ chapterId: 'chapter-01-kiroween', preview: true, tacticalMode: true });
  previewSess.skipIntro();
  const prevKill = previewSess.exec('kill -9 1011');
  assert.equal(
    prevKill.events.some((e) => e.type === 'ACHIEVEMENT_UNLOCKED'),
    false,
    'Preview sessions must never emit ACHIEVEMENT_UNLOCKED',
  );
  const prevAchJson = JSON.parse(previewSess.exec('achievements export').output);
  assert.equal(prevAchJson.unlockedCount, 0, 'Preview sessions must report 0 unlocked achievements deterministically');

  // Secret masking before unlock + portable save export/import validation & merge
  const savedBundle = portableSave.exportPortableSaveBundle();
  assert.equal(savedBundle.format, 'haunted-terminal-save');
  catalog.resetInMemoryStoresForTest();
  assert.equal(Object.keys(achievements.readAchievements().unlocked).length, 0);
  const freshSession = createChapterSession({ chapterId: 'chapter-01-kiroween', tacticalMode: true });
  freshSession.skipIntro();
  const emptyDirSweep = freshSession.exec('ls -a');
  assert.equal(
    emptyDirSweep.events.some((e) => e.type === 'ACHIEVEMENT_UNLOCKED' && e.id === 'lantern_sweep'),
    false,
    'ls -a in a directory with 0 dotfiles must NOT falsely unlock lantern_sweep',
  );
  const freshList = freshSession.exec('achievements').output;
  assert.ok(freshList.includes('???? (Secret Achievement)'), 'Locked secret achievements must mask their title');
  assert.ok(!freshList.includes('Open Weights & Family Ties'), 'Locked secret achievement must not leak spoiler title');
  const freshExportOut = freshSession.exec('achievements export').output;
  assert.ok(
    !freshExportOut.includes('Open Weights & Family Ties') && !freshExportOut.includes('Zero Kernel Panics'),
    'achievements export must mask locked secret achievement titles until unlocked',
  );

  // Reject malformed / wrong-format / oversized inputs cleanly
  assert.equal(portableSave.importPortableSaveBundle('').ok, false);
  assert.equal(portableSave.importPortableSaveBundle('{not json').ok, false);
  assert.equal(portableSave.importPortableSaveBundle('{"format":"other","version":1}').ok, false);

  // Sanitize unknown achievement IDs & prototype pollution keys while restoring valid unlocks
  const tampered = structuredClone(savedBundle);
  tampered.achievements.unlocked.fake_injected = { id: 'fake_injected', steamApiName: 'ACH_FAKE', unlockedAt: 123 };
  tampered.progress.__proto__ = { bad: { cleared: true, bestRank: 'S', bestCommands: 1, bestTimeSec: 1, updatedAt: 1 } };
  const imported = portableSave.importPortableSaveBundle(JSON.stringify(tampered));
  assert.equal(imported.ok, true);
  assert.equal(achievements.readAchievements().unlocked.fake_injected, undefined, 'Unknown achievement IDs must be stripped');
  assert.ok(achievements.readAchievements().unlocked.campaign_clear, 'Valid achievements must be restored on import');

  // Auto-Cloud hydration must NOT dirty-rewrite haunted-terminal-save.json on read-only boots when local state adds nothing new
  const diskJson = JSON.stringify(portableSave.exportPortableSaveBundle());
  const fakeStorage = new Map();
  const prevStorage = globalThis.localStorage;
  const prevWin = globalThis.window;
  try {
    globalThis.localStorage = {
      getItem: (k) => fakeStorage.get(k) ?? null,
      setItem: (k, v) => fakeStorage.set(k, String(v)),
    };
    const tauriCalls = [];
    globalThis.window = {
      __TAURI_INTERNALS__: {
        invoke: async (cmd) => {
          tauriCalls.push(cmd);
          if (cmd === 'desktop_read_save_bundle') return diskJson;
          return true;
        },
      },
    };
    const hydrated = await portableSave.hydrateFromDesktopSaveBundle();
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(hydrated, true, 'Empty localStorage must hydrate from populated desktop save bundle');
    assert.equal(
      tauriCalls.includes('desktop_write_save_bundle'),
      false,
      'Read-only Tauri boot hydration must NOT dirty-rewrite haunted-terminal-save.json on disk',
    );
    // Second boot when localStorage already matches diskJson -> changedLocal is false, still 0 disk writes
    const secondHydrate = await portableSave.hydrateFromDesktopSaveBundle();
    await new Promise((r) => setTimeout(r, 15));
    assert.equal(secondHydrate, false, 'Identical Tauri boot hydration must report no local mutation');
    assert.equal(tauriCalls.includes('desktop_write_save_bundle'), false);
  } finally {
    if (prevStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prevStorage;
    if (prevWin === undefined) delete globalThis.window;
    else globalThis.window = prevWin;
  }

  catalog.resetInMemoryStoresForTest();
  console.log('chapter-level-generator self-test PASS (all validator, chroot, hint, boss, achievements & metagame edge cases verified)');
});
