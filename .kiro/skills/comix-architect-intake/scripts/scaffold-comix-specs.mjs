#!/usr/bin/env node
// Scaffolds a connected, schema-valid comix/<slug>/ directory:
//   comix/<slug>/README.md
//   comix/<slug>/comix.manifest.json
//   comix/<slug>/pages/page-01-.../page.spec.json .. page-NN-.../page.spec.json
//
// Supports --out-root <dir> so tests and drafts can scaffold outside repo comix/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stringifyComixJson } from '../../../../scripts/harness/lib/comix-json.mjs';
import { parseArgs, projectRoot } from '../../../../scripts/harness/lib/load.mjs';

const args = parseArgs(process.argv.slice(2), [
  '--id',
  '--title',
  '--subtitle',
  '--summary',
  '--role',
  '--status',
  '--room',
  '--background',
  '--cast',
  '--pages',
  '--panels-per-page',
  '--duration',
  '--out-root',
]);

const id = args.val('--id', 'sample-comix');
if (!/^[a-z0-9-]+$/.test(id)) {
  console.error(`Invalid --id "${id}": expected kebab-case [a-z0-9-]+`);
  process.exit(1);
}

const VALID_ROLES = ['opening', 'ending', 'interlude', 'standalone'];
const VALID_STATUSES = ['playable', 'draft'];

const title = args.val('--title', id.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase()));
const subtitle = args.val('--subtitle', `${title} — Declarative 3D Comix Sequence`);
const summary = args.val('--summary', `Animated 3D comic sequence "${title}" authored with connected page specs.`);
const role = args.val('--role', 'standalone');
if (!VALID_ROLES.includes(role)) {
  console.error(`Invalid --role "${role}": expected one of ${VALID_ROLES.join(', ')}`);
  process.exit(1);
}
const status = args.val('--status', 'playable');
if (!VALID_STATUSES.includes(status)) {
  console.error(`Invalid --status "${status}": expected one of ${VALID_STATUSES.join(', ')}`);
  process.exit(1);
}
const room = args.val('--room', 'room.desk');
const background = args.val('--background', '#161124');
if (!/^#[0-9a-fA-F]{6}$/.test(background)) {
  console.error(`Invalid --background "${background}": expected #rrggbb`);
  process.exit(1);
}
const castModels = String(args.val('--cast', 'vibecoder.dev,npc.kiro_ghost'))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const pageCount = Math.max(1, Number(args.val('--pages', 2)));
const durationSec = Math.max(2, Number(args.val('--duration', pageCount * 8)));
const holdAtEnd = args.flag('--hold-at-end');
const outRoot = resolve(args.val('--out-root', resolve(projectRoot, 'comix')));

const panelCountsRaw = String(args.val('--panels-per-page', ''))
  .split(',')
  .map((n) => Number(n.trim()))
  .filter((n) => Number.isFinite(n) && n >= 1);

function layoutPresets(count) {
  if (count === 1) {
    return [{ landscape: [0, 0, 1, 1], portrait: [0, 0, 1, 1] }];
  }
  if (count === 2) {
    return [
      { landscape: [0, 0, 0.56, 1], portrait: [0, 0, 1, 0.52] },
      { landscape: [0.56, 0, 0.44, 1], portrait: [0, 0.52, 1, 0.48] },
    ];
  }
  if (count === 3) {
    return [
      { landscape: [0, 0, 0.55, 0.56], portrait: [0, 0, 1, 0.34] },
      { landscape: [0.55, 0, 0.45, 0.56], portrait: [0, 0.34, 1, 0.32] },
      { landscape: [0, 0.56, 1, 0.44], portrait: [0, 0.66, 1, 0.34] },
    ];
  }
  const rows = [];
  const step = Number((1 / count).toFixed(4));
  for (let i = 0; i < count; i += 1) {
    const y = Number((i * step).toFixed(4));
    const h = i === count - 1 ? Number((1 - y).toFixed(4)) : step;
    rows.push({ landscape: [0, y, 1, h], portrait: [0, y, 1, h] });
  }
  return rows;
}

const points = {
  center: { x: 0, y: 0, z: 0 },
  stageLeft: { x: -1.1, y: 0, z: 0.1 },
  stageRight: { x: 1.1, y: 0, z: 0.1 },
  focusHigh: { x: 0, y: 1.4, z: 0 },
};

const cast = castModels.map((model, idx) => {
  const short = model.split('.').pop() || `actor_${idx + 1}`;
  const actorId = idx === 0 ? 'lead' : `${short}_${idx + 1}`;
  const pointKey = idx === 0 ? 'stageLeft' : idx === 1 ? 'stageRight' : 'center';
  return {
    id: actorId,
    model,
    label: short.toUpperCase(),
    at: pointKey,
    scale: 1,
    visible: true,
  };
});

const rootCues = {
  START: 0,
  END: durationSec,
};

const pageDur = durationSec / pageCount;
const pageSpecs = [];
const pageSummaries = [];

for (let p = 0; p < pageCount; p += 1) {
  const pNum = String(p + 1).padStart(2, '0');
  const pageId = `page-${pNum}-act-${p + 1}`;
  const pFrom = Number((p * pageDur).toFixed(2));
  const pUntil = p === pageCount - 1 ? durationSec : Number(((p + 1) * pageDur).toFixed(2));
  const pCount = panelCountsRaw[p] ?? (p === pageCount - 1 ? 1 : 2);
  const layouts = layoutPresets(pCount);
  const panelDur = (pUntil - pFrom) / pCount;
  const cuePrefix = `P${p + 1}`;
  const pageCues = { [`${cuePrefix}_OPEN`]: pFrom };

  const panels = [];
  for (let k = 0; k < pCount; k += 1) {
    const fromSec = Number((pFrom + k * panelDur).toFixed(2));
    const untilSec = k === pCount - 1 ? pUntil : Number((pFrom + (k + 1) * panelDur).toFixed(2));
    const panelId = `p${p + 1}_panel_${k + 1}`;
    const cueName = `${cuePrefix}_BEAT_${k + 1}`;
    const beatSec = Number((fromSec + Math.min(0.4, (untilSec - fromSec) * 0.25)).toFixed(2));
    pageCues[cueName] = beatSec;

    panels.push({
      id: panelId,
      title: `Page ${p + 1} Shot ${k + 1}`,
      from: String(fromSec),
      until: String(untilSec),
      layout: layouts[k],
      camera: {
        from: { x: k % 2 === 0 ? -0.2 : 0.2, y: 1.35, w: 4.4, h: 2.8 },
        to: { x: 0, y: 1.4, w: 3.9, h: 2.5 },
        span: [String(fromSec), String(untilSec)],
        ease: 'out',
      },
      letters: [
        {
          kind: 'caption',
          text: `${title.toUpperCase()} — PAGE ${p + 1}, PANEL ${k + 1}.`,
          from: '+0.15',
          typeDur: 0.6,
        },
        ...(k === 0
          ? [
              {
                kind: 'sfx',
                text: 'KRZZT!',
                at: cueName,
                hold: 0.8,
                color: '#ffd166',
                tilt: -7,
                anchor: 'frac',
                x: 0.72,
                y: 0.26,
                size: 0.11,
                activePanelOnly: true,
              },
            ]
          : []),
      ],
      beats: [
        ...(cast[0]
          ? [
              {
                kind: 'look',
                at: cueName,
                actors: [cast[0].id],
                x: k % 2 === 0 ? 1 : -1,
                y: 0.1,
              },
            ]
          : []),
      ],
      tracks: [
        ...(cast[0]
          ? [
              {
                kind: 'actor_visibility',
                actor: cast[0].id,
                from: String(fromSec),
                until: String(untilSec),
                visible: true,
              },
            ]
          : []),
      ],
    });
  }

  const specPath = `pages/${pageId}/page.spec.json`;
  const pageSpec = {
    id: pageId,
    index: p,
    title: `Act ${p + 1}`,
    summary: `Page ${p + 1} of ${title} (${pFrom}s to ${pUntil}s).`,
    from: pFrom,
    until: pUntil,
    cues: pageCues,
    ...(p < pageCount - 1
      ? {
          turn: {
            from: String(Number((pUntil - Math.min(0.6, (pUntil - pFrom) * 0.15)).toFixed(2))),
            to: String(pUntil),
            ease: 'in',
          },
        }
      : {}),
    panels,
  };

  pageSpecs.push({ specPath, spec: pageSpec });
  pageSummaries.push({
    index: p,
    id: pageId,
    title: pageSpec.title,
    from: pFrom,
    until: pUntil,
    panelCount: panels.length,
    specPath,
  });
}

const manifest = {
  id,
  title,
  subtitle,
  summary,
  role,
  status,
  durationSec,
  ...(holdAtEnd ? { holdAtEnd: true, acceptsKeyFrom: String(Math.max(0, durationSec - 0.5)) } : {}),
  inputGraceMs: 400,
  skip: 'end',
  cues: rootCues,
  stage: {
    room,
    background,
    clampToRoom: true,
    points,
  },
  cast,
  pages: pageSummaries,
};

const seqDir = resolve(outRoot, id);
mkdirSync(seqDir, { recursive: true });
writeFileSync(resolve(seqDir, 'comix.manifest.json'), stringifyComixJson(manifest));

for (const page of pageSpecs) {
  const fullPath = resolve(seqDir, page.specPath);
  mkdirSync(resolve(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, stringifyComixJson(page.spec));
}

const readmeLines = [
  `# Comix — ${title} (\`${id}\`)`,
  '',
  `- **Status:** Playable (\`${durationSec}s\`, \`${pageCount}\` pages, \`${pageSpecs.reduce((n, p) => n + p.spec.panels.length, 0)}\` panels)`,
  `- **Stage:** \`${room}\` (\`${background}\`)`,
  `- **Cast:** ${cast.map((c) => `\`${c.id}\` (\`${c.model}\`)`).join(', ') || 'none'}`,
  '',
  '## Page & Panel Timeline',
  '',
  '| Page | Window | Panel | Timing | Content |',
  '| :--- | :---: | :--- | :---: | :--- |',
];
for (const { spec } of pageSpecs) {
  spec.panels.forEach((panel, idx) => {
    readmeLines.push(
      `| ${idx === 0 ? `**Page ${String(spec.index + 1).padStart(2, '0')}** (\`${spec.id}\`)` : ''} | ${idx === 0 ? `\`${spec.from}s – ${spec.until}s\`` : ''} | \`${panel.id}\` | \`${panel.from}s – ${panel.until}s\` | ${panel.title} |`,
    );
  });
}
writeFileSync(resolve(seqDir, 'README.md'), `${readmeLines.join('\n')}\n`);

console.log(`scaffolded comix/${id} at ${seqDir} (${pageCount} pages)`);
