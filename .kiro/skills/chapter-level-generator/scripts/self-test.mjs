#!/usr/bin/env node
// Comprehensive unit + edge-case self-test for chapter-level-generator, src/chapters/validators.ts,
// src/chapters/catalog.ts, and src/chapters/chapter-session.ts.
import assert from 'node:assert/strict';
import { withProcgen } from '../../../../scripts/harness/lib/load.mjs';

await withProcgen(async (_p, vite) => {
  const validators = await vite.ssrLoadModule('/src/chapters/validators.ts');
  const catalog = await vite.ssrLoadModule('/src/chapters/catalog.ts');
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
  assert.ok(arrival.output.includes('Where am I') && arrival.output.includes('KIRO GHOST FOUND YOU'));
  assert.ok(arrival.events.some((e) => e.type === 'VIBECODER_EMOTE' && e.emote === 'shock'));
  assert.ok(arrival.events.some((e) => e.type === 'AGENT_TAUNT' && e.agent === 'kiro'));
  assert.ok(
    arrival.events.some((e) => e.type === 'TUTORIAL_STEP' && e.agent === 'kiro' && e.step === 1 && e.command === 'ls'),
  );
  assert.equal(arrival.snapshot.tutorial?.agent, 'kiro');
  assert.equal(arrival.snapshot.tutorial?.step, 1);
  assert.ok(
    arrival.snapshot.room.actors.some((a) => a.id === 'kiro' && a.model === 'npc.kiro_ghost'),
    'After arriveLevel(), Kiro Ghost (npc.kiro_ghost) must materialize on stage',
  );
  // Even after 15 real-time ticks in Level 1 Tutorial, player takes 0 damage (tutorial truce)
  const startHp = kiroRealtime.snapshot().hp;
  for (let t = 0; t < 15; t++) {
    kiroRealtime.tick();
  }
  assert.equal(kiroRealtime.snapshot().hp, startHp, 'Level 1 tutorial truce must prevent any bug damage');
  // Follow the scripted tutorial order: ls -> mv -> cat -> ps -> kill -> cd hub_uplink
  const stepLs = kiroRealtime.exec('ls');
  assert.equal(stepLs.snapshot.tutorial?.step, 2);
  assert.equal(stepLs.snapshot.tutorial?.command, 'mv starter_ram_8gb.dimm ~');
  const stepMv = kiroRealtime.exec('mv starter_ram_8gb.dimm ~');
  assert.equal(stepMv.snapshot.tutorial?.step, 3);
  assert.equal(stepMv.snapshot.tutorial?.command, 'cat kiro_story.txt');
  const stepCat = kiroRealtime.exec('cat kiro_story.txt');
  assert.equal(stepCat.snapshot.tutorial?.step, 4);
  assert.equal(stepCat.snapshot.tutorial?.command, 'ps');
  assert.ok(
    stepCat.snapshot.room.actors.some((a) => a.id === 'tutorial_virus_1'),
    'Tutorial bug phases onto stage once player reaches Step 4 (ps)',
  );
  const stepPs = kiroRealtime.exec('ps');
  assert.equal(stepPs.snapshot.tutorial?.step, 5);
  assert.equal(stepPs.snapshot.tutorial?.command, 'kill -9 1011');
  const stepKill = kiroRealtime.exec('kill -9 1011');
  assert.equal(stepKill.snapshot.tutorial?.step, 6);
  assert.equal(stepKill.snapshot.tutorial?.command, 'cd hub_uplink');
  assert.equal(
    stepKill.snapshot.room.actors.some((a) => a.id === 'kiro'),
    false,
    'Once Level 1 tutorial commands are done, Kiro Ghost goes ahead to the Hub',
  );

  const kiroChap = createChapterSession({
    chapterId: 'chapter-01-kiroween',
    tacticalMode: true,
  });
  kiroChap.skipIntro();
  assert.equal(kiroChap.getLevels().length, 11, 'chapter-01-kiroween must have 11 executable levels');
  assert.equal(kiroChap.getCurrentLevel().id, 'level-01-tutorial-awakening');
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

  // Jump to Hub 1 (Level 4): verify npc.greybeard_rig on stage, dad command, and kiro load qwen disabling GRAVY-9
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
    wrongHubCore.output.includes('kiro load qwen') && !wrongHubCore.output.includes('GR0NK DISABLED'),
    'Out-of-order kiro load in Hub 1 must prompt for kiro load qwen',
  );
  assert.equal(
    kiroChap.getChecklist().find((c) => c.description.includes('kiro load qwen'))?.done,
    false,
  );
  const hubReboot1 = kiroChap.exec('kiro load qwen');
  assert.ok(hubReboot1.output.includes('AGY-9 DISABLED'));
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

  // Jump to Hub 2 (Level 7) & Hub 3 (Level 10): verify DeepSeek disables C0D3X and Llama disables GR0NK
  kiroChap.jumpToLevel('level-07-hub-model-two');
  assert.ok(kiroChap.exec('kiro load deepseek').output.includes('C0D3X DISABLED'));
  kiroChap.jumpToLevel('level-10-hub-model-three');
  const hubReboot3 = kiroChap.exec('kiro load llama');
  assert.ok(hubReboot3.output.includes('GR0NK DISABLED') && hubReboot3.output.includes('Only CLAUDE survives'));

  // Jump to Level 11 Boss: verify Claude supervisor cameo on stage, zero actor overlaps, Kiro advisor inspect, and Father twist on exit
  kiroChap.jumpToLevel('level-11-boss-claude-core');
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
  assert.ok(kiroChap.exec('kiro inspect claude_prompt_flood.stream').output.includes('/dev/null'));
  assert.ok(kiroChap.exec('kiro inspect open_weights_advisor.log').output.includes('OPEN_WEIGHT_SIG='));
  assert.ok(kiroChap.exec('kiro inspect core_anchor.conf').output.includes('claude_supervisor_lock=false'));
  assert.ok(kiroChap.exec('exit').output.includes('Claude & Kernel Overlord'));
  kiroChap.exec('cat claude_prompt_flood.stream > /dev/null');
  kiroChap.exec('grep OPEN_WEIGHT_SIG open_weights_advisor.log > kiro_override.sock');
  kiroChap.exec("sed -i 's/claude_supervisor_lock=true/claude_supervisor_lock=false/' core_anchor.conf");
  assert.ok(kiroChap.exec('kill -9 1').output.includes('Claude & Kernel Overlord'));
  const kiroExit = kiroChap.exec('exit');
  assert.equal(kiroExit.snapshot.ended, true);
  assert.ok(kiroExit.output.includes('CLAUDE ESCAPES'));
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

  catalog.resetInMemoryStoresForTest();
  console.log('chapter-level-generator self-test PASS (all validator, chroot, hint, boss & metagame edge cases verified)');
});
