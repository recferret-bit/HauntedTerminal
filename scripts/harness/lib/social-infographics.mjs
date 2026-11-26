// High-DPI 1995 Comix Zone + PCB Schematic marketing infographic renderer & layout/SVG overflow verifier.
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './browser.mjs';
import { startSocialViteServer } from './social-capture.mjs';
import { listSortedPngs, renderContactSheet, saveBase64Png } from './social-ffmpeg.mjs';

const ACCENT_HEX = {
  amber: '#ffd166',
  orange: '#ff6a13',
  phosphor: '#3ddc84',
  cyan: '#39d0ff',
  magenta: '#ff3b8b',
};

export const esc = (s) => String(s ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

export const INFOGRAPHIC_SHELL_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Out Of Credits Infographic Studio</title>
  <link rel="stylesheet" href="/src/styles/fonts.css" />
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; width: 1920px; height: 1080px; background: #110e1b; color: #f4f1ea; overflow: hidden; font-family: 'IBM Plex Mono', monospace; }
    .ig-canvas {
      width: 1920px; height: 1080px; padding: 34px 42px;
      display: grid; grid-template-rows: auto 1fr auto; gap: 22px;
      background:
        radial-gradient(circle at 15% 20%, rgba(57, 208, 255, 0.08), transparent 45%),
        radial-gradient(circle at 85% 80%, rgba(255, 106, 19, 0.09), transparent 45%),
        #141022;
      border: 8px solid #f4f1ea;
    }
    .ig-head {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 24px;
      padding: 18px 24px; background: #ffd166; color: #110e1b;
      border: 5px solid #110e1b; box-shadow: 8px 8px 0 #07060c;
    }
    .ig-kicker {
      display: inline-block; padding: 3px 10px; margin-bottom: 6px;
      background: #110e1b; color: #ffd166; font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase;
    }
    .ig-title {
      margin: 0; font-family: 'Chakra Petch', sans-serif; font-weight: 800; font-size: 40px; line-height: 1.04; text-transform: uppercase;
    }
    .ig-sub { margin: 6px 0 0; font-size: 16px; font-weight: 600; color: #261f35; max-width: 1260px; }
    .ig-num {
      padding: 10px 16px; background: #ff6a13; color: #110e1b; border: 4px solid #110e1b;
      font-family: 'Chakra Petch', sans-serif; font-weight: 800; font-size: 22px; white-space: nowrap;
    }
    .ig-body { display: grid; grid-template-columns: 1.08fr 0.92fr; gap: 24px; min-height: 0; }
    .ig-left, .ig-right { display: flex; flex-direction: column; gap: 18px; min-height: 0; }
    .ig-panel {
      background: #1c162e; border: 4px solid #f4f1ea; box-shadow: 7px 7px 0 #07060c; padding: 18px 20px;
    }
    .ig-shot-wrap {
      flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 0; overflow: hidden;
    }
    .ig-shot-bar {
      padding: 8px 14px; background: #110e1b; color: #ffd166; border-bottom: 3px solid #f4f1ea;
      font-size: 12.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    }
    .ig-shot-img { width: 100%; flex: 1; min-height: 0; object-fit: contain; display: block; background: #0a0812; }
    .ig-shot-placeholder {
      flex: 1; display: grid; place-items: center; padding: 24px; background: #0e141b;
      border-top: 2px dashed #3ddc84; color: #3ddc84; text-align: center; font-size: 16px;
    }
    .ig-svg-wrap { padding: 14px 16px; background: #120e1e; }
    svg.ig-svg { width: 100%; height: 220px; display: block; }
    .ig-callouts { display: flex; flex-direction: column; gap: 12px; flex: 1; justify-content: space-between; }
    .ig-callout {
      padding: 13px 16px; background: #231c38; border-left: 8px solid #ffd166; border-top: 2px solid #f4f1ea;
    }
    .ig-callout h4 {
      margin: 0 0 5px; font-family: 'Chakra Petch', sans-serif; font-size: 20px; text-transform: uppercase; color: #ffd166;
    }
    .ig-callout p { margin: 0; font-size: 14px; line-height: 1.34; color: #f4f1ea; }
    .ig-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
    .ig-metric {
      padding: 12px 10px; background: #f4f1ea; color: #110e1b; border: 4px solid #110e1b; text-align: center;
    }
    .ig-metric b { display: block; font-family: 'Chakra Petch', sans-serif; font-size: 27px; font-weight: 800; line-height: 1.04; }
    .ig-metric span { display: block; margin-top: 4px; font-size: 11.5px; font-weight: 700; text-transform: uppercase; color: #2b223d; }
    .ig-foot {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 18px; background: #110e1b; border: 3px solid #f4f1ea;
      font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #ffd166;
    }
  </style>
</head>
<body><div id="ig-root"></div></body>
</html>`;

export function renderDiagramSvg(diagram, accentHex) {
  const nodes = diagram.nodes;
  const W = 820;
  const H = 224;
  const pad = 18;
  const gap = 20;
  const boxW = Math.floor((W - pad * 2 - gap * (nodes.length - 1)) / nodes.length);
  const baseH = diagram.kind === 'loop' ? 116 : 128;
  const baseY = diagram.kind === 'loop' ? 22 : 28;
  const midIdx = Math.floor(nodes.length / 2) - 1;

  const defs = `<defs>
    <marker id="ig-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 1 L 9 5 L 0 9 z" fill="${accentHex}" />
    </marker>
  </defs>`;

  const rects = nodes.map((n, i) => {
    const x = pad + i * (boxW + gap);
    const shrink = diagram.kind === 'funnel' ? i * 12 : 0;
    const boxH = baseH - shrink;
    const y = baseY + Math.round(shrink / 2);
    const midY = baseY + Math.round(baseH / 2);
    let connector = '';
    if (i < nodes.length - 1) {
      if (diagram.kind === 'versus' && i === midIdx) {
        const cx = x + boxW + Math.round(gap / 2);
        connector = `<rect x="${cx - 13}" y="${midY - 12}" width="26" height="24" fill="${accentHex}" stroke="#110e1b" stroke-width="2" />
          <text x="${cx}" y="${midY + 4}" text-anchor="middle" fill="#110e1b" font-family="Chakra Petch, sans-serif" font-size="11" font-weight="800">VS</text>`;
      } else {
        connector = `<line x1="${x + boxW + 2}" y1="${midY}" x2="${x + boxW + gap - 4}" y2="${midY}" stroke="${accentHex}" stroke-width="3.2" marker-end="url(#ig-arr)" />`;
      }
    }
    const lblSize = n.label.length > 16 ? 14.5 : 16.5;
    const subSize = n.sub.length > 20 ? 10.8 : 11.8;
    return `
      <g>
        <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" fill="#1d1730" stroke="#f4f1ea" stroke-width="3" />
        <rect x="${x}" y="${y}" width="${boxW}" height="26" fill="${accentHex}" />
        <text x="${x + 9}" y="${y + 18}" fill="#110e1b" font-family="IBM Plex Mono, monospace" font-size="12.5" font-weight="700">${esc(n.tag)}</text>
        <text x="${x + 9}" y="${y + 58}" fill="#f4f1ea" font-family="Chakra Petch, sans-serif" font-size="${lblSize}" font-weight="700">${esc(n.label)}</text>
        <text x="${x + 9}" y="${y + 84}" fill="#cfc8dc" font-family="IBM Plex Mono, monospace" font-size="${subSize}">${esc(n.sub)}</text>
        ${connector}
      </g>`;
  }).join('');

  const xFirst = pad + Math.round(boxW / 2);
  const xLast = pad + (nodes.length - 1) * (boxW + gap) + Math.round(boxW / 2);
  const loopBottom = baseY + baseH;
  const loopArc = diagram.kind === 'loop'
    ? `<path d="M ${xLast} ${loopBottom + 3} L ${xLast} ${loopBottom + 20} L ${xFirst} ${loopBottom + 20} L ${xFirst} ${loopBottom + 6}" fill="none" stroke="${accentHex}" stroke-width="2.5" stroke-dasharray="6 4" marker-end="url(#ig-arr)" />`
    : '';

  const capLen = diagram.caption ? diagram.caption.length : 0;
  const capSize = capLen > 84 ? 10.4 : capLen > 70 ? 11.3 : 12.2;
  const cap = diagram.caption
    ? `<text x="${pad}" y="208" fill="${accentHex}" font-family="IBM Plex Mono, monospace" font-size="${capSize}" font-weight="700">${esc(diagram.caption)}</text>`
    : '';
  return `<svg class="ig-svg" data-diagram-kind="${esc(diagram.kind)}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${defs}${rects}${loopArc}${cap}</svg>`;
}

export function renderInfographicMarkup(card, { hasScreenshot = false } = {}) {
  const accentHex = ACCENT_HEX[card.accent] ?? ACCENT_HEX.amber;
  const shotMarkup = hasScreenshot && card.screenshot
    ? `<img class="ig-shot-img" src="/__social_assets/${encodeURIComponent(card.screenshot)}" alt="${esc(card.title)}" />`
    : `<div class="ig-shot-placeholder">[ LIVE ENGINE CAPTURE · ${esc(card.category)} · OUT OF CREDITS ]</div>`;

  return `
    <article class="ig-canvas">
      <header class="ig-head" style="background:${accentHex}">
        <div>
          <span class="ig-kicker">${esc(card.category)} · ${esc(card.kicker)}</span>
          <h1 class="ig-title">${esc(card.title)}</h1>
          <p class="ig-sub">${esc(card.subtitle)}</p>
        </div>
        <div class="ig-num">${esc(card.num)}</div>
      </header>
      <section class="ig-body">
        <div class="ig-left">
          <div class="ig-panel ig-shot-wrap">
            <div class="ig-shot-bar">LIVE COMIX STAGE · ${esc(card.screenshot || card.id)}</div>
            ${shotMarkup}
          </div>
          <div class="ig-metrics">
            ${card.metrics.map((m) => `<div class="ig-metric"><b>${esc(m.value)}</b><span>${esc(m.label)}</span></div>`).join('')}
          </div>
        </div>
        <div class="ig-right">
          <div class="ig-panel ig-svg-wrap">
            ${renderDiagramSvg(card.diagram, accentHex)}
          </div>
          <div class="ig-callouts">
            ${card.callouts.map((c) => `
              <div class="ig-callout" style="border-left-color:${accentHex}">
                <h4 style="color:${accentHex}">${esc(c.head)}</h4>
                <p>${esc(c.body)}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
      <footer class="ig-foot">
        <span>OUT OF CREDITS · UNIX TERMINAL COMIX CRAWLER</span>
        <span>${esc(card.footer)}</span>
      </footer>
    </article>`;
}

export async function renderInfographicsSuite(spec, outDir, { shotsDir, filter = null, log = console.log, env = process.env } = {}) {
  const selected = filter ? spec.cards.filter((c) => c.id.includes(filter)) : spec.cards;
  if (!selected.length) throw new Error(`no infographic card matched "${filter}"`);

  const assetMap = new Map();
  for (const c of selected) {
    if (!c.screenshot || !shotsDir) continue;
    const p = path.join(shotsDir, c.screenshot);
    if (fs.existsSync(p)) assetMap.set(c.screenshot, p);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const srv = await startSocialViteServer(assetMap, { '/__infographic.html': INFOGRAPHIC_SHELL_HTML });
  const b = await launchBrowser({ width: spec.width, height: spec.height });
  await b.send('Emulation.setDeviceMetricsOverride', {
    width: spec.width,
    height: spec.height,
    deviceScaleFactor: spec.dpr,
    mobile: false,
  });

  const manifest = [];
  try {
    await b.open(`${srv.base}/__infographic.html`);
    await b.waitFor('document.readyState === "complete"', 15000, 'infographic shell');
    await b.evaluate('document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true', 10000).catch(() => {});

    for (let i = 0; i < selected.length; i++) {
      const card = selected[i];
      const hasScreenshot = Boolean(card.screenshot && assetMap.has(card.screenshot));
      const markup = renderInfographicMarkup(card, { hasScreenshot });
      const check = await b.evaluate(`(async () => {
        const root = document.getElementById('ig-root');
        const tpl = document.createElement('template');
        tpl.innerHTML = ${JSON.stringify(markup)};
        root.replaceChildren(tpl.content);
        if (document.fonts && document.fonts.ready) await document.fonts.ready;
        const imgs = [...root.querySelectorAll('img')];
        await Promise.all(imgs.map(async (im) => {
          if (!im.complete) await new Promise((res, rej) => { im.onload = res; im.onerror = () => rej(new Error('img failed: ' + im.src)); });
          if (im.decode) await im.decode().catch(() => {});
        }));
        const art = root.querySelector('.ig-canvas');
        const svg = root.querySelector('svg.ig-svg');
        const svgOverflow = [];
        if (svg) {
          const sr = svg.getBoundingClientRect();
          for (const tEl of svg.querySelectorAll('text')) {
            const tr = tEl.getBoundingClientRect();
            if (tr.width > 0 && (tr.right > sr.right + 2 || tr.left < sr.left - 2 || tr.bottom > sr.bottom + 2)) {
              svgOverflow.push((tEl.textContent || '').trim());
            }
          }
        }
        return { w: art.scrollWidth, h: art.scrollHeight, imgOk: imgs.every((im) => im.naturalWidth > 0), svgOverflow };
      })()`, 15000);

      if (!check.imgOk) throw new Error(`image decode failed on infographic ${card.id}`);
      if (check.w > spec.width + 2 || check.h > spec.height + 2) {
        throw new Error(`layout overflow on infographic ${card.id}: ${check.w}x${check.h} exceeds ${spec.width}x${spec.height}`);
      }
      if (check.svgOverflow.length) {
        throw new Error(`SVG text overflow on infographic ${card.id}: ${check.svgOverflow.join(' | ')}`);
      }

      const raw = await b.send('Page.captureScreenshot', { format: 'png' });
      const byteLen = saveBase64Png(outDir, card.id, raw.data);
      manifest.push({
        id: card.id,
        num: card.num,
        category: card.category,
        title: card.title,
        file: `${card.id}.png`,
        width: Math.round(spec.width * spec.dpr),
        height: Math.round(spec.height * spec.dpr),
        bytes: byteLen,
      });
      log(`  [${String(i + 1).padStart(2, '0')}/${selected.length}] ${card.id}.png (${(byteLen / 1024).toFixed(0)} KB) — ${card.title}`);
    }
  } finally {
    await b.close();
    await srv.close();
  }

  if (!filter) fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const pngFiles = listSortedPngs(outDir);
  if (pngFiles.length) renderContactSheet(pngFiles, path.join(outDir, 'contact.jpg'), { tileW: 560, tileH: 315, env });
  return { count: selected.length, manifest };
}
