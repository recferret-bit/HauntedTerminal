// Pure-time (videoT) 1995 Comix Zone overlay director injected into captured pages.
// Zero CSS wall-clock transitions/@keyframes; heavy #110e1b ink borders, comic paper boxes, bursts, pills, dialogs & end cards.

export const SOCIAL_OVERLAY_JS = `(() => {
  if (window.__socialOverlayReady) return true;
  const SPEC = window.__SOCIAL_SPEC;
  if (!SPEC) return false;

  const isPortrait = SPEC.height > SPEC.width || SPEC.crop === 'vertical' || SPEC.look === 'vertical';
  const isSquare = SPEC.crop === 'square';
  let refW = 1280, refH = 720, scale = Math.min(SPEC.width / 1280, SPEC.height / 720);
  if (isSquare) {
    refW = 720; refH = 720;
    scale = Math.min(SPEC.width, SPEC.height) / 720;
  } else if (isPortrait) {
    refW = 1080; refH = 1920;
    scale = SPEC.height > SPEC.width ? Math.min(SPEC.width / 1080, SPEC.height / 1920) : (SPEC.height / 1920);
  }
  const safeLeft = Math.max(0, (SPEC.width / scale - refW) / 2);
  const safeTop = Math.max(0, (SPEC.height / scale - refH) / 2);
  const hasPlayHud = Boolean(document.getElementById('hero-hud'));
  const hasCaptions = Array.isArray(SPEC.scenes) && SPEC.scenes.some((sc) => sc.captions && sc.captions.length);
  const termBottomPad = hasPlayHud && hasCaptions ? Math.round((isPortrait ? 156 : 86) * scale) : 0;

  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null) continue;
      if (k === 'className') node.className = v;
      else if (k === 'text') node.textContent = String(v);
      else if (k === 'style') node.style.cssText = v;
      else node.setAttribute(k, String(v));
    }
    for (const ch of children) {
      if (ch == null) continue;
      node.appendChild(typeof ch === 'string' ? document.createTextNode(ch) : ch);
    }
    return node;
  };

  const styleEl = el('style', {
    text: \`
      #ooc-fx {
        position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; overflow: hidden;
        zoom: \${scale.toFixed(5)};
        font-family: 'IBM Plex Mono', monospace;
        color: #f4f1ea;
        --ink: #110e1b; --paper: #f4f1ea; --amber: #ffd166; --orange: #ff6a13;
        --phosphor: #3ddc84; --cyan: #39d0ff; --magenta: #ff3b8b; --panel: #171326;
      }
      #ooc-safe {
        position: absolute;
        left: \${safeLeft.toFixed(2)}px; top: \${safeTop.toFixed(2)}px;
        width: \${refW}px; height: \${refH}px;
        overflow: hidden;
      }
      .ooc-box {
        border: 4px solid var(--ink);
        box-shadow: 6px 6px 0 var(--ink);
      }
      .ooc-box-sm {
        border: 3px solid var(--ink);
        box-shadow: 4px 4px 0 var(--ink);
      }
      #ooc-top {
        position: absolute; top: 14px; left: 18px; right: 18px; height: 36px;
        display: flex; align-items: center; gap: 12px; padding: 0 12px;
        background: var(--panel); color: var(--paper);
        font-size: 11px; font-weight: 700; letter-spacing: 0.11em; text-transform: uppercase;
      }
      #ooc-brand {
        padding: 2px 9px; background: var(--amber); color: var(--ink);
        font-family: 'Chakra Petch', sans-serif; font-weight: 700; font-size: 13px; letter-spacing: 0.12em;
        border: 2px solid var(--ink); white-space: nowrap;
      }
      #ooc-ticker-wrap { flex: 1; min-width: 0; overflow: hidden; color: #d8d2c5; }
      #ooc-ticker { display: inline-block; white-space: nowrap; }
      #ooc-badge {
        padding: 3px 10px; background: var(--orange); color: var(--ink);
        font-weight: 700; font-size: 10.5px; border: 2px solid var(--ink); white-space: nowrap;
      }
      #ooc-pills {
        position: absolute; display: none; flex-wrap: wrap; gap: 8px; max-width: calc(100% - 36px);
      }
      #ooc-pills.pos-top-left { top: 60px; left: 18px; }
      #ooc-pills.pos-top-center { top: 60px; left: 196px; right: 196px; justify-content: center; }
      #ooc-pills.pos-top-right { top: 60px; right: 18px; justify-content: flex-end; }
      #ooc-pills.pos-above-caption { bottom: 136px; left: 18px; }
      .ooc-pill {
        display: inline-flex; align-items: center; gap: 8px; padding: 5px 11px;
        background: #120f1e; color: var(--paper);
        font-family: 'IBM Plex Mono', monospace; font-size: 12px; font-weight: 700;
        border-left: 6px solid var(--phosphor);
      }
      .ooc-pill.acc-amber { border-left-color: var(--amber); }
      .ooc-pill.acc-orange { border-left-color: var(--orange); }
      .ooc-pill.acc-cyan { border-left-color: var(--cyan); }
      .ooc-pill.acc-magenta { border-left-color: var(--magenta); }
      #ooc-burst {
        position: absolute; display: none; padding: 8px 18px;
        background: var(--amber); color: var(--ink);
        font-family: 'Chakra Petch', sans-serif; font-weight: 800; font-size: 32px;
        letter-spacing: 0.06em; text-transform: uppercase;
        border: 4px solid var(--ink); box-shadow: 7px 7px 0 var(--ink);
      }
      #ooc-burst.pos-top-right { top: 66px; right: 26px; }
      #ooc-burst.pos-top-left { top: 66px; left: 26px; }
      #ooc-burst.pos-center { top: 42%; left: 50%; }
      #ooc-burst.pos-bottom-right { bottom: 138px; right: 26px; }
      #ooc-burst.acc-orange { background: var(--orange); color: var(--ink); }
      #ooc-burst.acc-magenta { background: var(--magenta); color: var(--ink); }
      #ooc-burst.acc-phosphor { background: var(--phosphor); color: var(--ink); }
      #ooc-burst.acc-cyan { background: var(--cyan); color: var(--ink); }
      #ooc-bumper {
        position: absolute; left: 50%; top: 45%; z-index: 30;
        display: none; flex-direction: column; align-items: center; text-align: center;
        padding: 18px 30px 20px; min-width: min(460px, 88%); max-width: 90%;
        background: var(--paper); color: var(--ink);
      }
      #ooc-bumper-tag {
        padding: 3px 11px; margin-bottom: 8px;
        background: var(--orange); color: var(--ink); border: 2px solid var(--ink);
        font-weight: 700; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase;
      }
      #ooc-bumper-head {
        font-family: 'Chakra Petch', sans-serif; font-weight: 800; font-size: 34px;
        line-height: 1.04; text-transform: uppercase; color: var(--ink);
      }
      #ooc-bumper-sub {
        margin-top: 7px; font-size: 13.5px; font-weight: 600; color: #2b2438;
      }
      #ooc-cap {
        position: absolute; bottom: 18px; left: 18px; max-width: min(690px, calc(100% - 36px));
        display: none; flex-direction: column; padding: 10px 18px 13px 16px;
        background: var(--amber); color: var(--ink);
      }
      #ooc-cap.align-right { left: auto; right: 18px; }
      #ooc-cap.align-center { left: 50%; text-align: center; }
      #ooc-cap.acc-orange { background: #ffd9b8; }
      #ooc-cap.acc-phosphor { background: #d6ffe8; }
      #ooc-cap.acc-cyan { background: #d6f6ff; }
      #ooc-cap.acc-magenta { background: #ffd6ea; }
      #ooc-cap-eye { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
      #ooc-cap-num {
        padding: 1px 7px; background: var(--ink); color: var(--amber);
        font-size: 10.5px; font-weight: 700; letter-spacing: 0.1em;
      }
      #ooc-cap-tag {
        font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #2b1d12;
      }
      #ooc-cap-head {
        font-family: 'Chakra Petch', sans-serif; font-weight: 800; font-size: 23px;
        line-height: 1.06; text-transform: uppercase; color: var(--ink);
      }
      #ooc-cap-sub {
        margin-top: 4px; font-size: 12.5px; font-weight: 600; line-height: 1.28; color: #231c2e;
      }
      #ooc-cap-bar {
        position: absolute; left: 0; bottom: 0; height: 4px; background: var(--ink);
      }
      #ooc-dialog {
        position: absolute; display: none; flex-direction: column; gap: 8px;
        width: 430px; padding: 14px 16px; background: var(--panel); color: var(--paper);
      }
      #ooc-dialog.pos-right { top: 62px; right: 18px; }
      #ooc-dialog.pos-left { top: 62px; left: 18px; }
      #ooc-dialog.pos-center { top: 42%; left: 50%; width: 520px; }
      #ooc-dlg-kick {
        align-self: flex-start; padding: 2px 8px; background: var(--amber); color: var(--ink);
        border: 2px solid var(--ink); font-size: 10.5px; font-weight: 700; text-transform: uppercase;
      }
      #ooc-dlg-title {
        font-family: 'Chakra Petch', sans-serif; font-weight: 700; font-size: 21px; color: var(--paper);
      }
      #ooc-dlg-rows { display: flex; flex-direction: column; gap: 6px; }
      .ooc-drow {
        display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 8px;
        padding: 6px 8px; background: #221c35; border-left: 4px solid var(--amber); font-size: 12px;
      }
      .ooc-drow-k { font-weight: 700; color: var(--amber); text-transform: uppercase; }
      .ooc-drow-v { color: var(--paper); }
      #ooc-dlg-stats { display: grid; gap: 6px; }
      .ooc-dstat {
        padding: 6px; text-align: center; background: #120f1e; border: 2px solid var(--amber);
      }
      .ooc-dstat b { display: block; font-family: 'Chakra Petch', sans-serif; font-size: 20px; color: var(--amber); }
      .ooc-dstat span { font-size: 9.5px; text-transform: uppercase; color: #cfc8dc; }
      #ooc-dlg-foot { font-size: 10.5px; color: #cfc8dc; }
      #ooc-shot {
        position: absolute; display: none; flex-direction: column; background: var(--panel); overflow: hidden;
      }
      #ooc-shot.pos-center { left: 50%; top: 44%; width: 56%; max-height: 56%; }
      #ooc-shot.pos-right { right: 22px; top: 44%; width: 40%; max-height: 52%; }
      #ooc-shot.pos-left { left: 22px; top: 44%; width: 40%; max-height: 52%; }
      #ooc-shot.pos-bottom-right { right: 22px; bottom: 24px; width: 35%; max-height: 42%; }
      #ooc-shot.pos-top-right { right: 22px; top: 64px; width: 35%; max-height: 42%; }
      #ooc-shot-bar {
        padding: 5px 10px; background: var(--amber); color: var(--ink);
        font-size: 10.5px; font-weight: 700; text-transform: uppercase; border-bottom: 3px solid var(--ink);
      }
      #ooc-shot-img { width: 100%; display: block; max-height: 320px; background: #07080a; }
      #ooc-card {
        position: absolute; inset: 0; z-index: 40; display: none; align-items: center; justify-content: center;
        padding: 24px; background: rgba(11, 9, 18, 0.84);
      }
      #ooc-card-box {
        width: min(840px, 92%); padding: 26px 34px 24px; text-align: center;
        background: var(--paper); color: var(--ink);
      }
      #ooc-card-eye {
        display: inline-block; padding: 3px 12px; margin-bottom: 10px;
        background: var(--ink); color: var(--amber); font-size: 11px; font-weight: 700;
        letter-spacing: 0.14em; text-transform: uppercase;
      }
      #ooc-card-t1, #ooc-card-t2 {
        font-family: 'Chakra Petch', sans-serif; font-weight: 800; font-size: 34px;
        line-height: 1.05; text-transform: uppercase;
      }
      #ooc-card-t1 { color: var(--ink); }
      #ooc-card-t2 { color: #c84300; margin-top: 3px; }
      #ooc-card-sub { margin: 10px auto 0; max-width: 660px; font-size: 13.5px; font-weight: 600; color: #282136; }
      #ooc-card-steps { display: flex; justify-content: center; flex-wrap: wrap; gap: 8px; margin: 16px 0 18px; }
      .ooc-step {
        display: inline-flex; align-items: center; gap: 7px; padding: 6px 11px;
        background: var(--amber); color: var(--ink); border: 3px solid var(--ink);
        font-size: 11px; font-weight: 700; text-transform: uppercase;
      }
      .ooc-step b { padding: 1px 5px; background: var(--ink); color: var(--amber); }
      #ooc-card-cta {
        display: inline-block; padding: 11px 26px; background: var(--orange); color: var(--ink);
        border: 4px solid var(--ink); box-shadow: 5px 5px 0 var(--ink);
        font-family: 'Chakra Petch', sans-serif; font-weight: 800; font-size: 18px;
        letter-spacing: 0.09em; text-transform: uppercase;
      }
      #ooc-card-foot { margin-top: 13px; font-size: 11px; font-weight: 700; color: #342b45; text-transform: uppercase; }
      #ooc-flash { position: absolute; inset: 0; opacity: 0; background: #f4f1ea; }
      #ooc-whip { position: absolute; inset: 0; opacity: 0; background: linear-gradient(90deg, transparent, #ff6a13, #ffd166, #39d0ff, transparent); }
      #ooc-glitch { position: absolute; inset: 0; display: none; }
      .ooc-gbar { position: absolute; left: 0; right: 0; }
      #ooc-fx.has-play-hud:not(.is-portrait) #ooc-top { top: 42px; left: 192px; right: 18px; height: 30px; font-size: 10px; }
      #ooc-fx.has-play-hud:not(.is-portrait) #ooc-pills.pos-top-left,
      #ooc-fx.has-play-hud:not(.is-portrait) #ooc-pills.pos-top-center { top: 80px; left: 192px; right: auto; max-width: calc(100% - 530px); justify-content: flex-start; }
      #ooc-fx.has-play-hud:not(.is-portrait) #ooc-burst.pos-top-right { top: 80px; right: 340px; }
      \${termBottomPad > 0 ? \`#terminal-dock { padding-bottom: \${termBottomPad}px !important; box-sizing: border-box !important; }\` : ''}
      #ooc-fx.is-portrait #ooc-top { top: 8px; left: 18px; right: 18px; height: 34px; font-size: 11px; }
      #ooc-fx.is-portrait.has-play-hud #ooc-top { top: 8px; left: 194px; right: 18px; height: 32px; font-size: 10.5px; }
      #ooc-fx.is-portrait #ooc-brand { font-size: 12.5px; }
      #ooc-fx.is-portrait #ooc-pills.pos-top-left,
      #ooc-fx.is-portrait #ooc-pills.pos-top-center { top: 130px; left: 204px; right: 22px; max-width: none; justify-content: flex-start; }
      #ooc-fx.is-portrait .ooc-pill { font-size: 14px; padding: 6px 12px; }
      #ooc-fx.is-portrait #ooc-burst { font-size: 38px; top: 204px; right: 26px; }
      #ooc-fx.is-portrait #ooc-bumper { min-width: 88%; padding: 24px 28px; top: 42%; }
      #ooc-fx.is-portrait #ooc-bumper-head { font-size: 42px; }
      #ooc-fx.is-portrait #ooc-bumper-sub { font-size: 18px; }
      #ooc-fx.is-portrait #ooc-dialog { left: 24px; right: 24px; top: 158px; width: auto; }
      #ooc-fx.is-portrait #ooc-shot.pos-bottom-right { right: 22px; bottom: 184px; width: 46%; max-height: 30%; }
      #ooc-fx.is-portrait #ooc-shot.pos-top-right { right: 22px; top: 264px; width: 46%; max-height: 30%; }
      #ooc-fx.is-portrait #ooc-shot.pos-right { right: 22px; top: 46%; width: 46%; max-height: 32%; }
      #ooc-fx.is-portrait #ooc-shot.pos-left { left: 22px; top: 46%; width: 46%; max-height: 32%; }
      #ooc-fx.is-portrait #ooc-shot.pos-center { left: 50%; top: 46%; width: 78%; max-height: 36%; }
      #ooc-fx.is-portrait #ooc-cap { left: 22px; right: 22px; max-width: none; bottom: 16px; padding: 12px 18px 15px; text-align: center; }
      #ooc-fx.is-portrait #ooc-cap-eye { justify-content: center; }
      #ooc-fx.is-portrait #ooc-cap-head { font-size: 30px; }
      #ooc-fx.is-portrait #ooc-cap-sub { font-size: 16px; }
      #ooc-fx.is-portrait #ooc-card-t1, #ooc-fx.is-portrait #ooc-card-t2 { font-size: 38px; }
      #ooc-fx.is-square #ooc-cap-head { font-size: 20px; }
      #ooc-fx.is-square #ooc-dialog { left: 16px; right: 16px; width: auto; top: 96px; }
    \`
  });
  document.head.appendChild(styleEl);

  const tickerNode = el('div', { id: 'ooc-ticker', text: SPEC.ticker ? \`\${SPEC.ticker}   ·   \${SPEC.ticker}   ·   \${SPEC.ticker}\` : '' });
  const topBar = el('div', {
    id: 'ooc-top',
    className: 'ooc-box-sm',
    style: SPEC.ticker || SPEC.badge ? '' : 'display:none',
  }, [
    el('div', { id: 'ooc-brand', text: 'OUT OF CREDITS' }),
    el('div', { id: 'ooc-ticker-wrap' }, [tickerNode]),
    SPEC.badge ? el('div', { id: 'ooc-badge', text: SPEC.badge }) : null,
  ]);

  const pillsEl = el('div', { id: 'ooc-pills' });
  const burstEl = el('div', { id: 'ooc-burst' });
  const bumperTag = el('div', { id: 'ooc-bumper-tag' });
  const bumperHead = el('div', { id: 'ooc-bumper-head' });
  const bumperSub = el('div', { id: 'ooc-bumper-sub' });
  const bumperEl = el('div', { id: 'ooc-bumper', className: 'ooc-box' }, [bumperTag, bumperHead, bumperSub]);

  const dlgKick = el('span', { id: 'ooc-dlg-kick' });
  const dlgTitle = el('div', { id: 'ooc-dlg-title' });
  const dlgRows = el('div', { id: 'ooc-dlg-rows' });
  const dlgStats = el('div', { id: 'ooc-dlg-stats' });
  const dlgFoot = el('div', { id: 'ooc-dlg-foot' });
  const dialogEl = el('div', { id: 'ooc-dialog', className: 'ooc-box' }, [dlgKick, dlgTitle, dlgRows, dlgStats, dlgFoot]);

  const shotLbl = el('span', { id: 'ooc-shot-lbl' });
  const shotImg = el('img', { id: 'ooc-shot-img', alt: '' });
  const shotEl = el('div', { id: 'ooc-shot', className: 'ooc-box' }, [
    el('div', { id: 'ooc-shot-bar' }, [shotLbl]),
    shotImg,
  ]);

  const capNum = el('span', { id: 'ooc-cap-num' });
  const capTag = el('span', { id: 'ooc-cap-tag' });
  const capEye = el('div', { id: 'ooc-cap-eye' }, [capNum, capTag]);
  const capHead = el('div', { id: 'ooc-cap-head' });
  const capSub = el('div', { id: 'ooc-cap-sub' });
  const capBar = el('div', { id: 'ooc-cap-bar' });
  const capEl = el('div', { id: 'ooc-cap', className: 'ooc-box' }, [capEye, capHead, capSub, capBar]);

  const cardEye = el('div', { id: 'ooc-card-eye' });
  const cardT1 = el('div', { id: 'ooc-card-t1' });
  const cardT2 = el('div', { id: 'ooc-card-t2' });
  const cardSub = el('div', { id: 'ooc-card-sub' });
  const cardSteps = el('div', { id: 'ooc-card-steps' });
  const cardCta = el('div', { id: 'ooc-card-cta' });
  const cardFoot = el('div', { id: 'ooc-card-foot' });
  const cardBox = el('div', { id: 'ooc-card-box', className: 'ooc-box' }, [cardEye, cardT1, cardT2, cardSub, cardSteps, cardCta, cardFoot]);
  const cardEl = el('div', { id: 'ooc-card' }, [cardBox]);

  const glitchEl = el('div', { id: 'ooc-glitch' });
  const gbars = Array.from({ length: 6 }, (_, i) => {
    const b = el('div', { className: 'ooc-gbar', style: \`background:\${i % 2 ? 'rgba(255,106,19,0.58)' : 'rgba(57,208,255,0.5)'}\` });
    glitchEl.appendChild(b);
    return b;
  });
  const whipEl = el('div', { id: 'ooc-whip' });
  const flashEl = el('div', { id: 'ooc-flash' });

  const safeEl = el('div', { id: 'ooc-safe' }, [topBar, pillsEl, burstEl, dialogEl, bumperEl, shotEl, capEl, cardEl]);
  const rootEl = el('div', {
    id: 'ooc-fx',
    className: \`look-\${SPEC.look}\${isPortrait ? ' is-portrait' : ''}\${isSquare ? ' is-square' : ''}\${hasPlayHud ? ' has-play-hud' : ''}\`,
  }, [safeEl, glitchEl, whipEl, flashEl]);
  document.body.appendChild(rootEl);
  if (termBottomPad > 0) {
    window.dispatchEvent(new Event('resize'));
  }

  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const outCubic = (t) => 1 - (1 - clamp01(t)) ** 3;
  const outBack = (t) => { const c = 1.65, x = clamp01(t) - 1; return 1 + (c + 1) * x * x * x + c * x * x; };
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  function applyTransition(s, sceneIdx, localT) {
    flashEl.style.opacity = '0';
    whipEl.style.opacity = '0';
    glitchEl.style.display = 'none';
    const d = s.transition.dur;
    if (d > 0 && localT < d) {
      const p = localT / d;
      if (s.transition.type === 'flash' || s.transition.type === 'flash-amber') {
        flashEl.style.background = s.transition.type === 'flash-amber' ? '#ffd166' : '#f4f1ea';
        flashEl.style.opacity = ((1 - p) ** 2 * 0.9).toFixed(3);
      } else if (s.transition.type === 'whip') {
        whipEl.style.opacity = (Math.sin(p * Math.PI) * 0.85).toFixed(3);
        whipEl.style.transform = \`translateX(\${((1 - p * 2) * 55).toFixed(1)}%) skewX(-14deg)\`;
      } else if (s.transition.type === 'glitch') {
        glitchEl.style.display = 'block';
        const q = Math.floor(localT * 30);
        gbars.forEach((b, i) => {
          b.style.top = \`\${(hash(q * 11 + i) * 92).toFixed(1)}%\`;
          b.style.height = \`\${(5 + hash(q * 17 + i) * 24).toFixed(1)}px\`;
          b.style.transform = \`translateX(\${((hash(q * 23 + i) - 0.5) * 65 * (1 - p)).toFixed(1)}px)\`;
          b.style.opacity = ((1 - p) * 0.85).toFixed(3);
        });
      } else if (s.transition.type === 'dip' || s.transition.type === 'zoom' || s.transition.type === 'punch') {
        flashEl.style.background = '#110e1b';
        flashEl.style.opacity = ((1 - outCubic(p)) * 0.82).toFixed(3);
      }
    }
    const next = SPEC.scenes[sceneIdx + 1];
    if (next && next.transition.type === 'dip' && s.dur - localT < 0.22) {
      flashEl.style.background = '#110e1b';
      flashEl.style.opacity = (((0.22 - (s.dur - localT)) / 0.22) * 0.92).toFixed(3);
    }
  }

  window.__socialOverlayFrame = (sceneIdx, videoT) => {
    const s = SPEC.scenes[sceneIdx];
    if (!s) return true;
    const localT = Math.max(0, videoT - s.t0);
    if (SPEC.ticker) tickerNode.style.transform = \`translateX(\${(-(videoT * 48) % 680).toFixed(1)}px)\`;
    applyTransition(s, sceneIdx, localT);

    // Bumper
    let bumperOp = 0;
    if (s.bumper && localT >= s.bumper.at && localT <= s.bumper.at + s.bumper.dur) {
      const u = localT - s.bumper.at, rem = s.bumper.at + s.bumper.dur - localT;
      bumperOp = clamp01(u / 0.14) * (rem < 0.18 ? clamp01(rem / 0.18) : 1);
      bumperEl.style.display = 'flex';
      bumperEl.style.opacity = bumperOp.toFixed(3);
      bumperEl.style.transform = \`translate(-50%, -50%) scale(\${(0.92 + 0.08 * outBack(u / 0.22)).toFixed(4)}) rotate(-1deg)\`;
      bumperTag.style.display = s.bumper.tag ? 'inline-block' : 'none';
      bumperTag.textContent = s.bumper.tag;
      bumperHead.textContent = s.bumper.head;
      bumperSub.style.display = s.bumper.sub ? 'block' : 'none';
      bumperSub.textContent = s.bumper.sub;
    } else {
      bumperEl.style.display = 'none';
    }

    // Pills
    const pill = (s.pills || []).find((x) => localT >= x.at && localT <= x.at + x.dur);
    if (pill) {
      const u = localT - pill.at, rem = pill.at + pill.dur - localT;
      const exit = rem < 0.16 ? clamp01(rem / 0.16) : 1;
      pillsEl.style.display = 'flex';
      pillsEl.className = \`pos-\${pill.pos}\`;
      pillsEl.replaceChildren(...pill.items.map((txt, idx) => {
        const k = outCubic((u - idx * 0.06) / 0.18) * exit;
        return el('div', {
          className: \`ooc-pill ooc-box-sm acc-\${pill.accent}\`,
          style: \`opacity:\${k.toFixed(3)};transform:translateY(\${((1 - k) * -6).toFixed(1)}px)\`,
          text: txt,
        });
      }));
    } else {
      pillsEl.style.display = 'none';
    }

    // Comic SFX Burst
    const burst = (s.bursts || []).find((x) => localT >= x.at && localT <= x.at + x.dur);
    if (burst) {
      const u = localT - burst.at, rem = burst.at + burst.dur - localT;
      const enter = outBack(u / 0.18);
      const op = clamp01(u / 0.08) * (rem < 0.15 ? clamp01(rem / 0.15) : 1);
      burstEl.style.display = 'block';
      burstEl.className = \`pos-\${burst.pos} acc-\${burst.accent}\`;
      burstEl.textContent = burst.text;
      const center = burst.pos === 'center' ? 'translate(-50%, -50%) ' : '';
      burstEl.style.opacity = op.toFixed(3);
      burstEl.style.transform = \`\${center}scale(\${(0.84 + 0.16 * enter).toFixed(4)}) rotate(-4deg)\`;
    } else {
      burstEl.style.display = 'none';
    }

    // Dialog
    const dlg = (s.dialogs || []).find((x) => localT >= x.at && localT <= x.at + x.dur);
    if (dlg) {
      const u = localT - dlg.at, rem = dlg.at + dlg.dur - localT;
      const op = clamp01(u / 0.14) * (rem < 0.18 ? clamp01(rem / 0.18) : 1);
      dialogEl.style.display = 'flex';
      dialogEl.className = \`ooc-box pos-\${dlg.pos} acc-\${dlg.accent}\`;
      dialogEl.style.opacity = op.toFixed(3);
      const center = dlg.pos === 'center' ? 'translate(-50%, -50%) ' : '';
      dialogEl.style.transform = \`\${center}scale(\${(0.95 + 0.05 * outCubic(u / 0.22)).toFixed(4)})\`;
      dlgKick.style.display = dlg.kicker ? 'inline-block' : 'none';
      dlgKick.textContent = dlg.kicker;
      dlgTitle.textContent = dlg.title;
      dlgRows.replaceChildren(...dlg.rows.map((r) => el('div', { className: 'ooc-drow' }, [
        el('span', { className: 'ooc-drow-k', text: r.label }),
        el('span', { className: 'ooc-drow-v', text: r.text }),
      ])));
      if (dlg.stats && dlg.stats.length) {
        dlgStats.style.display = 'grid';
        dlgStats.style.gridTemplateColumns = \`repeat(\${dlg.stats.length}, minmax(0, 1fr))\`;
        dlgStats.replaceChildren(...dlg.stats.map((st) => el('div', { className: 'ooc-dstat' }, [
          el('b', { text: st.value }),
          el('span', { text: st.label }),
        ])));
      } else {
        dlgStats.style.display = 'none';
      }
      dlgFoot.style.display = dlg.foot ? 'block' : 'none';
      dlgFoot.textContent = dlg.foot;
    } else {
      dialogEl.style.display = 'none';
    }

    // PiP Shot
    const sh = (s.shots || []).find((x) => localT >= x.at && localT <= x.at + x.dur);
    if (sh) {
      const u = localT - sh.at, rem = sh.at + sh.dur - localT;
      shotEl.style.display = 'flex';
      shotEl.className = \`ooc-box pos-\${sh.pos}\`;
      const wantSrc = \`/__social_assets/\${encodeURIComponent(sh.name)}\`;
      if (!shotImg.src.endsWith(wantSrc)) shotImg.src = wantSrc;
      shotImg.style.objectFit = sh.fit;
      shotLbl.textContent = sh.label;
      const base = sh.pos === 'center' ? 'translate(-50%, -50%) ' : (sh.pos === 'left' || sh.pos === 'right' ? 'translateY(-50%) ' : '');
      shotEl.style.opacity = (clamp01(u / 0.14) * (rem < 0.16 ? clamp01(rem / 0.16) : 1)).toFixed(3);
      shotEl.style.transform = \`\${base}scale(\${(0.92 + 0.08 * outBack(u / 0.22)).toFixed(4)})\`;
    } else {
      shotEl.style.display = 'none';
    }

    // Caption
    const cap = (s.captions || []).find((x) => localT >= x.at && localT <= x.at + x.dur);
    if (cap) {
      const u = localT - cap.at, rem = cap.at + cap.dur - localT;
      const enter = outCubic(u / 0.2);
      const op = enter * (rem < 0.16 ? clamp01(rem / 0.16) : 1);
      capEl.style.display = 'flex';
      capEl.className = \`ooc-box align-\${cap.align} acc-\${cap.accent}\`;
      capEl.style.opacity = op.toFixed(3);
      const tx = cap.align === 'center' && !isPortrait ? '-50%' : \`\${((1 - enter) * (isPortrait ? 0 : -14)).toFixed(1)}px\`;
      capEl.style.transform = \`translate(\${tx}, \${((1 - enter) * 8).toFixed(1)}px)\`;
      capNum.style.display = cap.n ? 'inline-block' : 'none';
      capNum.textContent = cap.n;
      capTag.style.display = cap.tag ? 'inline-block' : 'none';
      capTag.textContent = cap.tag;
      capEye.style.display = cap.n || cap.tag ? 'flex' : 'none';
      const typeDur = Math.min(0.34, Math.max(0.12, cap.head.length * 0.011));
      const chars = Math.max(1, Math.floor(clamp01(u / typeDur) * cap.head.length));
      capHead.textContent = chars >= cap.head.length ? cap.head : \`\${cap.head.slice(0, chars)}▌\`;
      capSub.style.display = cap.sub ? 'block' : 'none';
      capSub.textContent = cap.sub;
      capBar.style.width = \`\${(clamp01(u / cap.dur) * 100).toFixed(1)}%\`;
    } else {
      capEl.style.display = 'none';
    }

    // End Card
    let cardOp = 0;
    if (s.card && localT >= s.card.at) {
      const u = localT - s.card.at;
      cardOp = clamp01(u / 0.24);
      cardEl.style.display = 'flex';
      cardEl.style.opacity = cardOp.toFixed(3);
      cardBox.style.transform = \`translateY(\${((1 - outCubic(u / 0.32)) * 14).toFixed(1)}px)\`;
      cardEye.style.display = s.card.eyebrow ? 'inline-block' : 'none';
      cardEye.textContent = s.card.eyebrow;
      cardT1.textContent = s.card.title[0] || '';
      cardT2.textContent = s.card.title[1] || '';
      cardSub.style.display = s.card.sub ? 'block' : 'none';
      cardSub.textContent = s.card.sub;
      cardSteps.replaceChildren(...(s.card.steps || []).map((st, idx) => el('div', { className: 'ooc-step' }, [
        el('b', { text: String(idx + 1).padStart(2, '0') }),
        el('span', { text: String(st).replace(/^0?\\d+\\s+/, '') }),
      ])));
      cardCta.textContent = s.card.cta;
      cardFoot.style.display = s.card.foot ? 'block' : 'none';
      cardFoot.textContent = s.card.foot;
    } else {
      cardEl.style.display = 'none';
    }

    if (SPEC.ticker || SPEC.badge) {
      topBar.style.opacity = (1 - Math.max(bumperOp, cardOp)).toFixed(3);
    }
    return true;
  };

  window.__socialOverlayReady = true;
  return true;
})();`;
