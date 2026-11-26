// Tab switching check of landing-smoke.mjs, on the Comix page already open in headless Chrome.
import assert from 'node:assert/strict';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tab switching is instant: once the pages are fetched a click swaps the content in the same task, with no page load. */
export async function verifyTabSwitching(evalJs, cdp = null) {
  await evalJs(`new Promise((ok) => { const t = setInterval(() => { if (performance.getEntriesByType('resource').filter((r) => /\\/(desktop|achievements)\\.html$|\\/$/.test(new URL(r.name).pathname)).length >= 3) { clearInterval(t); ok(true); } }, 50); setTimeout(() => ok(false), 4000); })`);
  await evalJs(`(() => { window.__alive = 'same document'; window.__headerNode = document.querySelector('#hub-header .hub-nav'); })()`);
  const steps = [
    ['/achievements.html', '.trophy-card'],
    ['/desktop.html', '.os-card, main article'],
    ['/', '#hero-telemetry-strip .telemetry-chip'],
    ['/comix.html', '.comix-tile'],
  ];
  const measureAll = async (label) => {
    let baselineBox = null;
    for (const [href, ready] of steps) {
      const r = await evalJs(`(() => {
        document.querySelector('#hub-header a[href="${href}"]').click();
        const hdr = document.getElementById('hub-header').getBoundingClientRect();
        const main = document.querySelector('body > main.hub-shell').getBoundingClientRect();
        return { path: location.pathname, alive: window.__alive, sameHeader: window.__headerNode === document.querySelector('#hub-header .hub-nav'),
          drawn: document.querySelectorAll('${ready}').length > 0, mains: document.querySelectorAll('body > main').length,
          current: [...document.querySelectorAll('#hub-header [aria-current="page"]')].length,
          box: {
            clientW: document.documentElement.clientWidth,
            hdrLeft: Math.round(hdr.left),
            hdrW: Math.round(hdr.width),
            mainLeft: Math.round(main.left),
            mainW: Math.round(main.width),
          } };
      })()`);
      assert.equal(r.path, href, `${href}: the URL follows the tab`);
      assert.equal(r.alive, 'same document', `${href}: no page load (same document)`);
      assert.equal(r.sameHeader, true, `${href}: the header node is never replaced`);
      assert.equal(r.drawn, true, `${href}: the page is drawn in the same task as the click`);
      assert.equal(r.mains, 1, `${href}: exactly one <main>`);
      assert.equal(r.current, 1, `${href}: one current tab`);
      if (!baselineBox) baselineBox = r.box;
      else assert.deepEqual(r.box, baselineBox, `${href} (${label}): view width and alignment must stay constant regardless of vertical scrollbar`);
    }
  };
  await measureAll('1440x900');
  if (cdp) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
    await measureAll('1024x768');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  }
  await evalJs(`history.back()`);
  await sleep(300);
  assert.equal(await evalJs(`location.pathname + ':' + Boolean(document.querySelector('#hero-telemetry-strip .telemetry-chip')) + ':' + window.__alive`), '/:true:same document', 'Back returns to Home inside the same document');
  assert.equal(await evalJs(`(() => { document.querySelector('#hub-header [data-open-waitlist]').click(); const o = document.getElementById('steam-waitlist-dialog').open; document.getElementById('steam-waitlist-dialog').close(); return o; })()`), true, 'The Steam dialog still opens after tab switches');
}

/** The header's Steam button opens the waitlist dialog on the page itself. */
export async function verifySteamOpensInPlace(evalJs, path) {
  const steam = await evalJs(`(() => {
    const before = location.href;
    document.querySelector('#hub-header [data-open-waitlist]').click();
    const dlg = document.getElementById('steam-waitlist-dialog');
    const out = { open: dlg.open, same: location.href === before, email: Boolean(document.getElementById('waitlist-email')) };
    dlg.close();
    return out;
  })()`);
  assert.deepEqual(steam, { open: true, same: true, email: true }, `${path}: Steam Coming Soon opens the dialog without leaving the page`);
}

/** Verify Home hides Field Manual links before obtained (`ACH_FIELD_MANUAL`), and exposes them with WCAG AA contrast once unlocked. */
export async function verifyLandingManualLinks(evalJs, measureContrast, unlocked = false) {
  const links = await evalJs(`(() => ({
    tty: Boolean(document.querySelector('.tty-mini-card a[href="/manual.html"]')),
    ttyLockedNote: /locked/i.test(document.getElementById('home-manual-tty')?.textContent || ''),
    demo: Boolean(document.querySelector('.edition-card a.comic-btn[href="/manual.html"]')),
    door: Boolean(document.querySelector('section[aria-labelledby="entry-doors"] a.door-card[href="/manual.html"]')),
  }))()`);
  if (!unlocked) {
    assert.deepEqual(
      { tty: links.tty, demo: links.demo, door: links.door },
      { tty: false, demo: false, door: false },
      'Landing / must NOT expose Field Manual links before the Old Coder gifts it at Server Hub #1',
    );
    assert.equal(links.ttyLockedNote, true, 'Landing / TTY card must explain Field Manual unlocks at Server Hub #1');
    return;
  }
  assert.deepEqual(
    { tty: links.tty, demo: links.demo, door: links.door },
    { tty: true, demo: true, door: true },
    'Once ACH_FIELD_MANUAL is unlocked, Landing / must expose Field Manual links in TTY preview card, Demo card, and Entry Doors',
  );
  const demoRatio = await measureContrast(evalJs, '.edition-card a[href="/manual.html"]');
  assert.ok(demoRatio >= 4.5, `.edition-card a[href="/manual.html"] contrast must be >= 4.5, got ${demoRatio.toFixed(2)}`);
}

export async function verifyManualTargetPage(openPage, cdp, evalJs, base) {
  await openPage(cdp, base, '/manual.html', `document.getElementById('manual-locked-panel')`);
  const lockedOk = await evalJs(`(() => Boolean(document.getElementById('manual-locked-panel') && !document.querySelector('.mb-book-shell')))()`);
  assert.equal(lockedOk, true, '/manual.html must show locked state before ACH_FIELD_MANUAL is earned');

  await evalJs(`(() => {
    const raw = JSON.parse(localStorage.getItem('out-of-credits:achievements:v1') || '{"schemaVersion":1,"unlocked":{},"stats":{}}');
    raw.unlocked = raw.unlocked || {};
    raw.unlocked.field_manual = { id: 'field_manual', steamApiName: 'ACH_FIELD_MANUAL', unlockedAt: 1700000002000 };
    localStorage.setItem('out-of-credits:achievements:v1', JSON.stringify(raw));
  })()`);
  await openPage(cdp, base, '/manual.html', `document.querySelector('#mb-search-input')`);
  const ok = await evalJs(`(() => Boolean(document.querySelector('.mb-book-shell') && document.documentElement.scrollWidth <= window.innerWidth))()`);
  assert.equal(ok, true, 'After ACH_FIELD_MANUAL unlocks, /manual.html must load standalone Field Manual cleanly without overflow');
}
