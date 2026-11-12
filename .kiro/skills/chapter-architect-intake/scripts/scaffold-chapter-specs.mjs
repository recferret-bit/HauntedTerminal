#!/usr/bin/env node
// Scaffolds a complete, schema-valid Haunted Terminal chapter folder under chapters/<id>/
// from CLI flags or --config <json>.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs, projectRoot } from '../../../../scripts/harness/lib/load.mjs';

const args = parseArgs(process.argv.slice(2), [
  '--id',
  '--issue',
  '--title',
  '--subtitle',
  '--client',
  '--levels',
  '--pages',
  '--ally',
  '--boss',
  '--mechanics',
  '--enemies',
  '--out-root',
]);

const id = args.val('--id', '');
if (!id || !/^chapter-\d{2}-[a-z0-9-]+$/.test(id)) {
  console.error('usage: scaffold-chapter-specs.mjs --id chapter-NN-slug [--issue N] [--title "..."] [--levels 6] [--pages 4] [--out-root chapters]');
  process.exit(2);
}

const issueNumber = Number(args.val('--issue', id.slice(8, 10)));
const title = args.val('--title', id.replace(/^chapter-\d{2}-/, '').replace(/-/g, ' ').toUpperCase());
const subtitle = args.val('--subtitle', ' Clean the Configs, Purge Malware & Ship the Stack');
const clientName = args.val('--client', 'Client Marty — Hardware & Indie Games');
const levelCount = Math.max(2, Number(args.val('--levels', 6)));
const pageCount = Math.max(1, Number(args.val('--pages', 3)));
const allyName = args.val('--ally', 'hank.tty');
const bossName = args.val('--boss', 'Slop-Weaver Code-X');
const mechanicsPool = args
  .val('--mechanics', 'hub,terminal,html-css,terminal-code,docker-image,docker-compose,boss')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const enemyPool = args
  .val('--enemies', 'bug,worm,virus,trojan,ransomware,exploit,kernel')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const outRoot = resolve(projectRoot, args.val('--out-root', 'chapters'));
const chapterDir = resolve(outRoot, id);

const ROOM_CYCLE = ['desk', 'attic', 'crypt_entrance', 'lab_hall', 'crypt_hall', 'catwalk', 'furnace', 'core'];
const MECHANIC_LABELS = {
  hub: 'Home / Hub Sanctuary',
  terminal: 'POSIX Terminal Triage',
  'html-css': 'HTML + CSS Storefront Task',
  'terminal-code': 'JS Logic & Trojan Cleanup',
  'docker-image': 'Docker Task 1: Image Build',
  'docker-compose': 'Docker Task 2: Compose Stack',
  boss: '3-Phase Boss Siege',
};

function buildLevelTemplate(idx, total) {
  const isFirst = idx === 1;
  const isLast = idx === total;
  const mechanic = isFirst
    ? 'hub'
    : isLast
      ? 'boss'
      : mechanicsPool[(idx - 1) % Math.max(1, mechanicsPool.length - 1)] === 'hub'
        ? 'terminal'
        : mechanicsPool[(idx - 1) % mechanicsPool.length] || 'terminal';

  const padded = String(idx).padStart(2, '0');
  const slug = isFirst ? `level-${padded}-home-hub` : isLast ? `level-${padded}-boss-core` : `level-${padded}-${mechanic}`;
  const roomKind = isFirst ? 'desk' : isLast ? 'core' : ROOM_CYCLE[(idx - 1) % (ROOM_CYCLE.length - 1)] || 'attic';
  const floorTheme = Math.min(5, Math.max(1, Math.ceil((idx / total) * 5)));
  const cwd = isFirst ? '/home/dev' : `/srv/${id.replace(/^chapter-\d{2}-/, '')}/sector_${padded}`;
  const nextGate = `${cwd}/next_gate`;

  if (isFirst) {
    return {
      summaryEntry: {
        index: idx,
        id: slug,
        title: 'Sanctuary Rig & Contract Brief',
        cwd,
        roomKind,
        floorTheme,
        mechanic: 'hub',
        mechanicLabel: MECHANIC_LABELS.hub,
        difficulty: 1,
        teaches: ['ls', 'cat', 'source'],
        enemies: [],
        specPath: `levels/${slug}/level.spec.json`,
      },
      spec: {
        id: slug,
        index: idx,
        title: 'Sanctuary Rig & Contract Brief',
        cwd,
        roomKind,
        floorTheme,
        mechanic: 'hub',
        exitDir: nextGate,
        summary: `Read the client brief, consult ${allyName}.sock, and enter ${nextGate}.`,
        files: [
          { path: `${cwd}/client_brief.txt`, kind: 'file', mode: 420, questCritical: true, content: `CLIENT: ${clientName}\nMISSION: ${title}\n` },
          { path: `${cwd}/${allyName}.sock`, kind: 'socket', mode: 438 },
          { path: `${cwd}/spare_ram.dimm`, kind: 'file', mode: 493, content: '#!/bin/dimm\n' },
          { path: nextGate, kind: 'dir', mode: 0 },
        ],
        enemies: [],
        pickups: [{ id: `${id}-l${idx}-ram`, type: 'ram', path: `${cwd}/spare_ram.dimm` }],
        patches: [],
        winRules: [
          { kind: 'read_file', path: `${cwd}/client_brief.txt`, description: 'Read client_brief.txt' },
          { kind: 'talk_ally', socket: `${allyName}.sock`, description: `Consult ${allyName}.sock` },
        ],
        solutionCommands: ['cat client_brief.txt', `cat ${allyName}.sock`, 'source spare_ram.dimm', 'cd next_gate'],
      },
    };
  }

  if (isLast) {
    return {
      summaryEntry: {
        index: idx,
        id: slug,
        title: `BOSS: ${bossName}`,
        cwd,
        roomKind: 'core',
        floorTheme: 5,
        mechanic: 'boss',
        mechanicLabel: MECHANIC_LABELS.boss,
        difficulty: 5,
        teaches: ['/dev/null', 'grep >', 'sed -i', 'exit'],
        enemies: ['kernel'],
        specPath: `levels/${slug}/level.spec.json`,
      },
      spec: {
        id: slug,
        index: idx,
        title: `BOSS: ${bossName}`,
        cwd,
        roomKind: 'core',
        floorTheme: 5,
        mechanic: 'boss',
        exitCommand: 'exit',
        summary: `Defeat ${bossName} in 3 phases: sink chaos_webhook.stream, pipe ORDER_SIG to payment_verify.sock, disarm slop_override=false, and exit.`,
        files: [
          { path: `${cwd}/chaos_webhook.stream`, kind: 'file', mode: 420, content: 'ERR 500 NOISE\n' },
          { path: `${cwd}/stripe_audit.log`, kind: 'file', mode: 420, questCritical: true, content: 'noise\nORDER_SIG=BYTERIG_PAID_200\n' },
          { path: `${cwd}/payment_verify.sock`, kind: 'socket', mode: 438 },
          { path: `${cwd}/checkout_anchor.conf`, kind: 'file', mode: 420, questCritical: true, content: 'slop_override=true\n' },
          { path: `${cwd}/slop_supervisor.ko`, kind: 'file', mode: 256, uid: 0, content: `ELF ${bossName}\n` },
          { path: `${cwd}/${allyName}.sock`, kind: 'socket', mode: 438 },
          { path: `${cwd}/energy.cell`, kind: 'file', mode: 493, content: '#!/bin/energy\n' },
        ],
        enemies: [{ id: `${id}-boss`, type: 'kernel', path: `${cwd}/slop_supervisor.ko`, pid: 1, ppid: 0 }],
        pickups: [{ id: `${id}-l${idx}-energy`, type: 'energy', path: `${cwd}/energy.cell` }],
        patches: [{ file: 'checkout_anchor.conf', label: 'Set slop_override=false', find: 'slop_override=true', replace: 'slop_override=false' }],
        winRules: [
          {
            kind: 'boss_defeated',
            bossId: `${id}-boss`,
            streamPath: `${cwd}/chaos_webhook.stream`,
            verifySocket: 'payment_verify.sock',
            expectedToken: 'BYTERIG_PAID_200',
            anchorPath: `${cwd}/checkout_anchor.conf`,
            anchorPattern: 'slop_override=false',
            description: `Shatter ${bossName} across 3 phases`,
          },
        ],
        solutionCommands: [
          'cat chaos_webhook.stream > /dev/null',
          'grep ORDER_SIG stripe_audit.log > payment_verify.sock',
          "sed -i 's/slop_override=true/slop_override=false/' checkout_anchor.conf",
          'exit',
        ],
      },
    };
  }

  const midMechanics = mechanicsPool.filter((m) => m !== 'hub' && m !== 'boss');
  const effectiveMech = midMechanics.length > 0 ? midMechanics[(idx - 2) % midMechanics.length] : 'terminal';
  const difficulty = Math.min(4, Math.max(2, Math.ceil((idx / total) * 4)));

  if (effectiveMech === 'html-css') {
    const pid = 400 + idx;
    return {
      summaryEntry: {
        index: idx,
        id: `level-${padded}-html-css`,
        title: `Sector ${padded}: ${MECHANIC_LABELS['html-css']}`,
        cwd,
        roomKind,
        floorTheme,
        mechanic: 'html-css',
        mechanicLabel: MECHANIC_LABELS['html-css'],
        difficulty,
        teaches: ['ps', 'kill -9', 'edit', 'CSS grid'],
        enemies: ['virus'],
        specPath: `levels/level-${padded}-html-css/level.spec.json`,
      },
      spec: {
        id: `level-${padded}-html-css`,
        index: idx,
        title: `Sector ${padded}: ${MECHANIC_LABELS['html-css']}`,
        cwd,
        roomKind,
        floorTheme,
        mechanic: 'html-css',
        exitDir: nextGate,
        summary: 'Kill virus.exe, restore .product-grid & .cart-drawer in storefront.css, and enable #checkout-btn in index.html.',
        files: [
          {
            path: `${cwd}/index.html`,
            kind: 'file',
            mode: 420,
            questCritical: true,
            content: '<main><section class="product-grid"><article data-sku="gpu">GPU</article><article data-sku="ram">RAM</article><article data-sku="ssd">SSD</article></section><aside class="cart-drawer"><button id="checkout-btn" class="buy-btn" disabled>Checkout</button></aside></main>\n',
          },
          {
            path: `${cwd}/storefront.css`,
            kind: 'file',
            mode: 420,
            questCritical: true,
            content: '.product-grid { display: none; }\n.cart-drawer { width: 0%; z-index: -1; }\n.buy-btn { pointer-events: auto; }\n',
          },
          { path: `${cwd}/virus.exe`, kind: 'file', mode: 493, content: 'ELF virus\n' },
          { path: `${cwd}/${allyName}.sock`, kind: 'socket', mode: 438 },
          { path: `${cwd}/energy.cell`, kind: 'file', mode: 493, content: '#!/bin/energy\n' },
          { path: nextGate, kind: 'dir', mode: 0 },
        ],
        enemies: [{ id: `${id}-l${idx}-virus`, type: 'virus', path: `${cwd}/virus.exe`, pid }],
        pickups: [{ id: `${id}-l${idx}-energy`, type: 'energy', path: `${cwd}/energy.cell` }],
        patches: [
          { file: 'storefront.css', label: 'Show .product-grid as CSS grid', find: 'display: none;', replace: 'display: grid;' },
          { file: 'storefront.css', label: 'Expand .cart-drawer width & z-index', find: 'width: 0%; z-index: -1;', replace: 'width: 100%; z-index: 10;' },
          { file: 'index.html', label: 'Enable #checkout-btn', find: ' disabled>', replace: '>' },
        ],
        winRules: [
          { kind: 'enemy_neutralized', enemyId: `${id}-l${idx}-virus`, description: 'Terminate virus.exe with kill -9' },
          { kind: 'html_css_valid', htmlPath: `${cwd}/index.html`, cssPath: `${cwd}/storefront.css`, description: 'Restore HTML+CSS storefront visibility and enable checkout button' },
        ],
        solutionCommands: [
          `kill -9 ${pid}`,
          "sed -i 's/display: none/display: grid/' storefront.css",
          "sed -i 's/width: 0%/width: 100%/' storefront.css",
          "sed -i 's/z-index: -1/z-index: 10/' storefront.css",
          "sed -i 's/ disabled//' index.html",
          'source energy.cell',
          'cd next_gate',
        ],
      },
    };
  }

  if (effectiveMech === 'terminal-code') {
    return {
      summaryEntry: {
        index: idx,
        id: `level-${padded}-terminal-code`,
        title: `Sector ${padded}: ${MECHANIC_LABELS['terminal-code']}`,
        cwd,
        roomKind,
        floorTheme,
        mechanic: 'terminal-code',
        mechanicLabel: MECHANIC_LABELS['terminal-code'],
        difficulty,
        teaches: ['chmod -x', 'edit', 'sed -i'],
        enemies: ['trojan', 'bug'],
        specPath: `levels/level-${padded}-terminal-code/level.spec.json`,
      },
      spec: {
        id: `level-${padded}-terminal-code`,
        index: idx,
        title: `Sector ${padded}: ${MECHANIC_LABELS['terminal-code']}`,
        cwd,
        roomKind,
        floorTheme,
        mechanic: 'terminal-code',
        exitDir: nextGate,
        summary: 'Petrify price_skimmer.bin with chmod -x and fix string concatenation in cart.js.',
        files: [
          {
            path: `${cwd}/cart.js`,
            kind: 'file',
            mode: 420,
            questCritical: true,
            content: 'export function computeCartTotal(price, shipping, qty = 1) {\n  if (qty <= 0) return 0;\n  // BUG: string concatenation!\n  return price + shipping;\n}\n',
          },
          { path: `${cwd}/price_skimmer.bin`, kind: 'file', mode: 365, content: 'ELF trojan\n' },
          { path: `${cwd}/${allyName}.sock`, kind: 'socket', mode: 438 },
          { path: nextGate, kind: 'dir', mode: 0 },
        ],
        enemies: [
          { id: `${id}-l${idx}-trojan`, type: 'trojan', path: `${cwd}/price_skimmer.bin`, pid: 500 + idx },
          { id: `${id}-l${idx}-bug`, type: 'bug', path: `${cwd}/cart.js`, pid: 550 + idx },
        ],
        pickups: [],
        patches: [
          { file: 'cart.js', label: 'Fix numeric cart formula', find: 'return price + shipping;', replace: 'return Number(price) * Number(qty) + Number(shipping);' },
        ],
        winRules: [
          { kind: 'enemy_neutralized', enemyId: `${id}-l${idx}-trojan`, description: 'Petrify price_skimmer.bin with chmod -x' },
          { kind: 'cart_js_valid', jsPath: `${cwd}/cart.js`, description: 'Fix numeric total math in cart.js' },
        ],
        solutionCommands: [
          'chmod -x price_skimmer.bin',
          "sed -i 's/price + shipping/Number(price) * Number(qty) + Number(shipping)/' cart.js",
          'cd next_gate',
        ],
      },
    };
  }

  if (effectiveMech === 'docker-image') {
    const pid = 600 + idx;
    return {
      summaryEntry: {
        index: idx,
        id: `level-${padded}-docker-image`,
        title: `Sector ${padded}: ${MECHANIC_LABELS['docker-image']}`,
        cwd,
        roomKind,
        floorTheme,
        mechanic: 'docker-image',
        mechanicLabel: MECHANIC_LABELS['docker-image'],
        difficulty,
        teaches: ['kill -9', 'edit Dockerfile', 'docker build', 'docker run'],
        enemies: ['ransomware'],
        specPath: `levels/level-${padded}-docker-image/level.spec.json`,
      },
      spec: {
        id: `level-${padded}-docker-image`,
        index: idx,
        title: `Sector ${padded}: ${MECHANIC_LABELS['docker-image']}`,
        cwd,
        roomKind,
        floorTheme,
        mechanic: 'docker-image',
        exitDir: nextGate,
        summary: 'Kill ransom.exe, repair Dockerfile, build byterig-web:1.0, and run on port 3000.',
        files: [
          {
            path: `${cwd}/Dockerfile`,
            kind: 'file',
            mode: 420,
            questCritical: true,
            content: 'FROM node:99-vibe-turbo\nWORKDIR /app\nRUN ./cryptominer.sh\nEXPOSE 1337\nCMD ["node", "broken_server.js"]\n',
          },
          { path: `${cwd}/ransom.exe`, kind: 'file', mode: 493, content: 'ELF ransomware\n' },
          { path: `${cwd}/${allyName}.sock`, kind: 'socket', mode: 438 },
          { path: nextGate, kind: 'dir', mode: 0 },
        ],
        enemies: [{ id: `${id}-l${idx}-ransom`, type: 'ransomware', path: `${cwd}/ransom.exe`, pid }],
        pickups: [],
        patches: [
          { file: 'Dockerfile', label: 'Use node:20-alpine & COPY . .', find: 'FROM node:99-vibe-turbo\nWORKDIR /app\nRUN ./cryptominer.sh', replace: 'FROM node:20-alpine\nWORKDIR /app\nCOPY . .' },
          { file: 'Dockerfile', label: 'Expose 3000 & run server.js', find: 'EXPOSE 1337\nCMD ["node", "broken_server.js"]', replace: 'EXPOSE 3000\nCMD ["node", "server.js"]' },
        ],
        winRules: [
          { kind: 'enemy_neutralized', enemyId: `${id}-l${idx}-ransom`, description: 'Terminate ransom.exe' },
          { kind: 'docker_image_running', imageTag: 'byterig-web:1.0', port: 3000, description: 'Build and run byterig-web:1.0 on port 3000' },
        ],
        solutionCommands: [
          `kill -9 ${pid}`,
          "sed -i 's/node:99-vibe-turbo/node:20-alpine/' Dockerfile",
          "sed -i 's|RUN ./cryptominer.sh|COPY . .|' Dockerfile",
          "sed -i 's/1337/3000/' Dockerfile",
          "sed -i 's/broken_server.js/server.js/' Dockerfile",
          'docker build -t byterig-web:1.0 .',
          'docker run -d -p 3000:3000 byterig-web:1.0',
          'cd next_gate',
        ],
      },
    };
  }

  if (effectiveMech === 'docker-compose') {
    return {
      summaryEntry: {
        index: idx,
        id: `level-${padded}-docker-compose`,
        title: `Sector ${padded}: ${MECHANIC_LABELS['docker-compose']}`,
        cwd,
        roomKind,
        floorTheme,
        mechanic: 'docker-compose',
        mechanicLabel: MECHANIC_LABELS['docker-compose'],
        difficulty,
        teaches: ['chmod -w', 'edit docker-compose.yml', 'docker compose up -d'],
        enemies: ['exploit'],
        specPath: `levels/level-${padded}-docker-compose/level.spec.json`,
      },
      spec: {
        id: `level-${padded}-docker-compose`,
        index: idx,
        title: `Sector ${padded}: ${MECHANIC_LABELS['docker-compose']}`,
        cwd,
        roomKind,
        floorTheme,
        mechanic: 'docker-compose',
        exitDir: nextGate,
        summary: 'Lock proxy.buf read-only and wire nginx + website + payment in docker-compose.yml.',
        files: [
          {
            path: `${cwd}/docker-compose.yml`,
            kind: 'file',
            mode: 420,
            questCritical: true,
            content: 'services:\n  nginx:\n    image: nginx:alpine\n    ports:\n      - "8080:9999"\n  website:\n    image: byterig-web:0.0-broken\n    environment:\n      PAYMENT_URL: http://localhost:9999\n  payment:\n    image: byterig-pay:1.0\n    environment:\n      PAYMENT_MODE: broken\n',
          },
          { path: `${cwd}/proxy.buf`, kind: 'file', mode: 438, content: 'HTTP_PROXY_RING_BUFFER\n' },
          { path: `${cwd}/port_hijack.bin`, kind: 'file', mode: 493, uid: 0, content: 'ELF exploit\n' },
          { path: `${cwd}/${allyName}.sock`, kind: 'socket', mode: 438 },
          { path: nextGate, kind: 'dir', mode: 0 },
        ],
        enemies: [{ id: `${id}-l${idx}-exploit`, type: 'exploit', path: `${cwd}/port_hijack.bin`, pid: 700 + idx, buffer: `${cwd}/proxy.buf` }],
        pickups: [],
        patches: [
          { file: 'docker-compose.yml', label: 'Forward nginx 8080:80', find: '8080:9999', replace: '8080:80' },
          { file: 'docker-compose.yml', label: 'Point website to byterig-web:1.0 & payment:4002', find: '    image: byterig-web:0.0-broken\n    environment:\n      PAYMENT_URL: http://localhost:9999', replace: '    image: byterig-web:1.0\n    environment:\n      PAYMENT_URL: http://payment:4002' },
          { file: 'docker-compose.yml', label: 'Enable live payment gateway', find: 'PAYMENT_MODE: broken', replace: 'PAYMENT_MODE: live' },
        ],
        winRules: [
          { kind: 'enemy_neutralized', enemyId: `${id}-l${idx}-exploit`, description: 'Starve port_hijack.bin with chmod -w proxy.buf' },
          { kind: 'docker_compose_healthy', services: ['nginx', 'website', 'payment'], description: 'Start healthy nginx, website, and payment services' },
        ],
        solutionCommands: [
          'chmod -w proxy.buf',
          "sed -i 's/8080:9999/8080:80/' docker-compose.yml",
          "sed -i 's/0.0-broken/1.0/' docker-compose.yml",
          "sed -i 's|http://localhost:9999|http://payment:4002|' docker-compose.yml",
          "sed -i 's/PAYMENT_MODE: broken/PAYMENT_MODE: live/' docker-compose.yml",
          'docker compose up -d',
          'cd next_gate',
        ],
      },
    };
  }

  const chosenEnemy = enemyPool[(idx - 2) % Math.max(1, enemyPool.length)] === 'kernel' ? 'bug' : enemyPool[(idx - 2) % enemyPool.length] || 'bug';
  const bugMode = chosenEnemy === 'virus' ? 'virus' : 'bug';

  return {
    summaryEntry: {
      index: idx,
      id: `level-${padded}-terminal`,
      title: `Sector ${padded}: ${MECHANIC_LABELS.terminal}`,
      cwd,
      roomKind,
      floorTheme,
      mechanic: 'terminal',
      mechanicLabel: MECHANIC_LABELS.terminal,
      difficulty,
      teaches: ['ps', 'kill -9', 'sed -i', 'edit'],
      enemies: [bugMode],
      specPath: `levels/level-${padded}-terminal/level.spec.json`,
    },
    spec: {
      id: `level-${padded}-terminal`,
      index: idx,
      title: `Sector ${padded}: ${MECHANIC_LABELS.terminal}`,
      cwd,
      roomKind,
      floorTheme,
      mechanic: 'terminal',
      exitDir: nextGate,
      summary: 'Neutralize the room threat and patch service.conf before advancing.',
      files: [
        { path: `${cwd}/service.conf`, kind: 'file', mode: 420, questCritical: true, content: 'PORT=0000\n# BUG: misconfigured port\n' },
        ...(bugMode === 'virus'
          ? [{ path: `${cwd}/virus.exe`, kind: 'file', mode: 493, content: 'ELF virus\n' }]
          : []),
        { path: `${cwd}/${allyName}.sock`, kind: 'socket', mode: 438 },
        { path: `${cwd}/energy.cell`, kind: 'file', mode: 493, content: '#!/bin/energy\n' },
        { path: nextGate, kind: 'dir', mode: 0 },
      ],
      enemies:
        bugMode === 'virus'
          ? [{ id: `${id}-l${idx}-virus`, type: 'virus', path: `${cwd}/virus.exe`, pid: 400 + idx }]
          : [{ id: `${id}-l${idx}-bug`, type: 'bug', path: `${cwd}/service.conf`, pid: 300 + idx }],
      pickups: [{ id: `${id}-l${idx}-energy`, type: 'energy', path: `${cwd}/energy.cell` }],
      patches: [
        { file: 'service.conf', label: 'Set PORT=3000', find: 'PORT=0000', replace: 'PORT=3000' },
        { file: 'service.conf', label: 'Fix BUG -> FIXED', find: 'BUG', replace: 'FIXED' },
      ],
      winRules: [
        { kind: 'enemy_neutralized', enemyId: bugMode === 'virus' ? `${id}-l${idx}-virus` : `${id}-l${idx}-bug`, description: 'Eliminate room malware' },
        { kind: 'file_contains', path: `${cwd}/service.conf`, pattern: 'PORT=3000', description: 'Set PORT=3000 in service.conf' },
      ],
      solutionCommands: [
        ...(bugMode === 'virus' ? [`kill -9 ${400 + idx}`] : []),
        "sed -i 's/0000/3000/' service.conf",
        "sed -i 's/BUG/FIXED/' service.conf",
        'source energy.cell',
        'cd next_gate',
      ],
    },
  };
}

const builtLevels = [];
for (let i = 1; i <= levelCount; i++) {
  builtLevels.push(buildLevelTemplate(i, levelCount));
}

const manifest = {
  id,
  issueNumber,
  title,
  subtitle,
  status: 'playable',
  badge: `ISSUE #${issueNumber}`,
  estimatedMinutes: levelCount * 4,
  clientName,
  summary: `${clientName}: repair ${levelCount} haunted sectors alongside ${allyName} and defeat ${bossName}.`,
  allyNpc: {
    id: allyName,
    name: `${allyName} (Veteran Bus Spirit)`,
    role: 'Socratic UNIX & Container Mentor',
    model: 'door.socket',
    paletteFamily: 'hardware+signal',
  },
  boss: {
    id: 'slop_supervisor',
    name: bossName,
    processName: 'slop_supervisor.ko',
    pid: 1,
    model: 'boss.kernel',
  },
  comix: {
    specPath: 'story/comix.spec.json',
    dialogsPath: 'story/dialogs.json',
    pageCount,
  },
  mechanicsSummary: builtLevels.map((l) => l.summaryEntry.mechanicLabel),
  levels: builtLevels.map((l) => l.summaryEntry),
};

const pages = [];
for (let p = 1; p <= pageCount; p++) {
  pages.push({
    pageNumber: p,
    title: p === 1 ? 'COLD OPEN' : p === pageCount ? 'DAWN DEPLOY' : `ESCALATION P.${p}`,
    panels: [
      {
        id: `p${p}-1`,
        rect: [0.03, 0.04, 0.94, 0.44],
        bgHex: '#211a36',
        room: p === 1 ? 'room.desk' : 'room.furnace',
        caption: `ISSUE #${issueNumber} // PAGE ${p}: ${title}`,
        cast: [
          { model: 'vibecoder.dev', x: -0.45, scale: 1.0 },
          { model: 'door.socket', x: 0.45, scale: 0.9 },
        ],
        bubbles: [
          { speaker: allyName, style: 'normal', text: 'Check the logs before touching production, kid.', x: 0.62, y: 0.24 },
        ],
      },
      {
        id: `p${p}-2`,
        rect: [0.03, 0.51, 0.94, 0.45],
        bgHex: '#2e1720',
        room: p === pageCount ? 'room.core' : 'room.catwalk',
        caption: `${bossName.toUpperCase()} SEIZES THE PIPELINE!`,
        cast: [
          { model: 'vibecoder.dev', x: -0.5, scale: 1.0 },
          { model: p === pageCount ? 'boss.kernel' : 'malware.virus', x: 0.42, scale: 1.05 },
        ],
        bubbles: [
          { speaker: 'codec', style: 'shout', text: 'ZERO LINTER ERRORS IF WE DELETE THE TESTS!', x: 0.6, y: 0.22 },
        ],
        sfx: { text: p === pageCount ? 'SIGKILL!' : 'KRAKOOM!', x: 0.5, y: 0.82, color: '#ffd166' },
      },
    ],
  });
}

const comixSpec = {
  chapterId: id,
  issueNumber,
  title: `ISSUE #${issueNumber}: ${title}`,
  subtitle,
  pages,
};

const dialogs = {
  chapterId: id,
  cast: {
    dev: { displayName: 'DEV', color: '#ff8a3d' },
    [allyName]: { displayName: allyName.toUpperCase(), color: '#ffd166' },
    codec: { displayName: bossName.toUpperCase(), color: '#ef476f' },
  },
  levels: Object.fromEntries(
    builtLevels.map(({ spec }) => [
      spec.id,
      {
        banner: `LEVEL ${String(spec.index).padStart(2, '0')} // ${spec.cwd} — ${spec.title}`,
        hankRungs: [
          `Inspect the directory first with \`ls -la\` and check processes with \`ps\`.`,
          spec.summary,
          `Exact sequence: ${spec.solutionCommands.map((c) => `\`${c}\``).join(' -> ')}.`,
        ],
        agentTaunt: `${bossName.toUpperCase()}: My vibe-generated config compiled on the zeroth try!`,
      },
    ]),
  ),
};

mkdirSync(resolve(chapterDir, 'story'), { recursive: true });
writeFileSync(resolve(chapterDir, 'chapter.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(resolve(chapterDir, 'story/comix.spec.json'), JSON.stringify(comixSpec, null, 2) + '\n');
writeFileSync(resolve(chapterDir, 'story/dialogs.json'), JSON.stringify(dialogs, null, 2) + '\n');
writeFileSync(
  resolve(chapterDir, 'README.md'),
  `# Issue #${issueNumber}: ${title}\n\n> ${subtitle}\n\n- **Client:** ${clientName}\n- **Ally:** \`${allyName}\`\n- **Boss:** ${bossName}\n- **Levels:** ${levelCount}\n`,
);

for (const { spec } of builtLevels) {
  const lDir = resolve(chapterDir, 'levels', spec.id);
  mkdirSync(lDir, { recursive: true });
  writeFileSync(resolve(lDir, 'level.spec.json'), JSON.stringify(spec, null, 2) + '\n');
  writeFileSync(
    resolve(lDir, 'LEVEL.md'),
    `# Level ${String(spec.index).padStart(2, '0')} — ${spec.title} (\`${spec.cwd}\`)\n\n${spec.summary}\n`,
  );
}

console.log(`scaffolded ${chapterDir} (${levelCount} levels, ${pageCount} comix pages)`);
