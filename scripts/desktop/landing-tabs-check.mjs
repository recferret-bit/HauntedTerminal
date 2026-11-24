// Tab switching check of landing-smoke.mjs, on the Comix page already open in headless Chrome.
import assert from 'node:assert/strict';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Tab switching is instant: once the pages are fetched a click swaps the content in the same task, with no page load. */
export async function verifyTabSwitching(evalJs) {
  await evalJs(`new Promise((ok) => { const t = setInterval(() => { if (performance.getEntriesByType('resource').filter((r) => /\\/(desktop|achievements)\\.html$|\\/$/.test(new URL(r.name).pathname)).length >= 3) { clearInterval(t); ok(true); } }, 50); setTimeout(() => ok(false), 4000); })`);
  await evalJs(`(() => { window.__alive = 'same document'; window.__headerNode = document.querySelector('#hub-header .hub-nav'); })()`);
  const steps = [
    ['/achievements.html', '.trophy-card'],
    ['/desktop.html', '.os-card, main article'],
    ['/', '#hero-telemetry-strip .telemetry-chip'],
    ['/comix.html', '.comix-tile'],
  ];
  for (const [href, ready] of steps) {
    const r = await evalJs(`(() => {
      document.querySelector('#hub-header a[href="${href}"]').click();
      return { path: location.pathname, alive: window.__alive, sameHeader: window.__headerNode === document.querySelector('#hub-header .hub-nav'),
        drawn: document.querySelectorAll('${ready}').length > 0, mains: document.querySelectorAll('body > main').length,
        current: [...document.querySelectorAll('#hub-header [aria-current="page"]')].length };
    })()`);
    assert.equal(r.path, href, `${href}: the URL follows the tab`);
    assert.equal(r.alive, 'same document', `${href}: no page load (same document)`);
    assert.equal(r.sameHeader, true, `${href}: the header node is never replaced`);
    assert.equal(r.drawn, true, `${href}: the page is drawn in the same task as the click`);
    assert.equal(r.mains, 1, `${href}: exactly one <main>`);
    assert.equal(r.current, 1, `${href}: one current tab`);
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
