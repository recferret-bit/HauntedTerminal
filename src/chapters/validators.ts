/**
 * Deterministic, zero-DOM, zero-LLM validators for HTML/CSS Storefront, JS Cart Math,
 * Dockerfile Image Forge, and Docker Compose Multi-Service Stack tasks.
 */

import { parseDockerfileBasic, validateDockerCompose } from '../game/docker-compose-eval.js';
export { validateDockerCompose };

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Strip C-style CSS/JS block comments so commented-out bugs do not false-trigger. */
function stripBlockComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Parse flat CSS rule blocks into selector -> lowercase property map (last declaration wins). */
function parseCssSubset(rawCss: string): Map<string, Map<string, string>> {
  const clean = stripBlockComments(rawCss);
  const rules = new Map<string, Map<string, string>>();
  const blockRx = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = blockRx.exec(clean)) !== null) {
    const selectors = (match[1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const body = match[2] ?? '';
    for (const sel of selectors) {
      // Normalize compound selectors ending in known target classes so `section.product-grid` or `.store .cart-drawer` match too.
      const keys = [sel];
      for (const target of ['.product-grid', '.cart-drawer', '.buy-btn']) {
        if (sel !== target && sel.endsWith(target)) keys.push(target);
      }
      for (const key of keys) {
        const props = rules.get(key) ?? new Map<string, string>();
        for (const decl of body.split(';')) {
          const colon = decl.indexOf(':');
          if (colon < 0) continue;
          const prop = decl.slice(0, colon).trim().toLowerCase();
          const val = decl
            .slice(colon + 1)
            .replace(/!important/gi, '')
            .trim()
            .toLowerCase();
          if (prop && val) props.set(prop, val);
        }
        rules.set(key, props);
      }
    }
  }
  return rules;
}

/** Validate the ByteRig PC Parts & Games HTML + CSS Landing Page (Level 04). */
export function validateStorefrontHtmlCss(html: string, css: string): ValidationResult {
  const errors: string[] = [];
  const cleanHtml = html.replace(/<!--[\s\S]*?-->/g, '');

  if (!cleanHtml.trim()) {
    return { ok: false, errors: ['index.html is empty.'] };
  }
  for (const sku of ['gpu', 'ram', 'ssd']) {
    if (!new RegExp(`data-sku=["']${sku}["']`, 'i').test(cleanHtml)) {
      errors.push(`index.html is missing the ${sku.toUpperCase()} product card (data-sku="${sku}").`);
    }
  }

  const btnMatch = /<button\b([^>]*\bid=["']checkout-btn["'][^>]*)>/i.exec(cleanHtml);
  if (!btnMatch) {
    errors.push('index.html is missing <button id="checkout-btn">.');
  } else if (/\bdisabled\b/i.test(btnMatch[1] ?? '')) {
    errors.push('index.html: #checkout-btn still has the "disabled" attribute.');
  }

  if (!css.trim()) {
    errors.push('storefront.css is empty.');
    return { ok: false, errors };
  }
  const cleanCss = stripBlockComments(css);
  const openBraces = (cleanCss.match(/\{/g) ?? []).length;
  const closeBraces = (cleanCss.match(/\}/g) ?? []).length;
  if (openBraces !== closeBraces || openBraces === 0) {
    errors.push('storefront.css has unbalanced or missing { } rule blocks.');
    return { ok: false, errors };
  }

  const rules = parseCssSubset(css);
  const grid = rules.get('.product-grid');
  if (!grid) {
    errors.push('storefront.css is missing the .product-grid rule.');
  } else {
    const disp = grid.get('display') ?? 'block';
    const vis = grid.get('visibility') ?? 'visible';
    const op = Number(grid.get('opacity') ?? '1');
    if (disp === 'none' || vis === 'hidden' || op <= 0) {
      errors.push('storefront.css: .product-grid is still hidden (change display: none to display: grid or flex).');
    }
  }

  const cart = rules.get('.cart-drawer');
  if (!cart) {
    errors.push('storefront.css is missing the .cart-drawer rule.');
  } else {
    const width = cart.get('width');
    const minWidth = cart.get('min-width');
    const zeroValueRx = /^0([a-z%]+)?$/i;
    const widthCollapsed =
      width !== undefined &&
      (zeroValueRx.test(width) || (width !== 'auto' && width !== 'fit-content' && width !== 'max-content' && (Number.isNaN(parseFloat(width)) || parseFloat(width) <= 0)));
    const minWidthRescues = minWidth !== undefined && !zeroValueRx.test(minWidth) && parseFloat(minWidth) > 0;
    if (widthCollapsed && !minWidthRescues) {
      errors.push('storefront.css: .cart-drawer width is still 0 (set width: 100%, auto, or >= 280px).');
    }
    const z = Number(cart.get('z-index') ?? '1');
    if (Number.isNaN(z) || z < 0) {
      errors.push('storefront.css: .cart-drawer z-index is negative (set z-index: 10 or >= 0).');
    }
  }

  const buyBtn = rules.get('.buy-btn');
  if (buyBtn?.get('pointer-events') === 'none' || buyBtn?.get('display') === 'none') {
    errors.push('storefront.css: .buy-btn blocks clicks or is hidden.');
  }

  return { ok: errors.length === 0, errors };
}

/** Validate the ByteRig Cart Calculator JS file (Level 05) against string-concatenation & quantity bugs. */
export function validateCartJs(js: string): ValidationResult {
  const errors: string[] = [];
  const noBlock = stripBlockComments(js);
  const noComments = noBlock.replace(/\/\/.*$/gm, '');

  const declaresFn =
    /\bfunction\s+computeCartTotal\b/.test(noComments) ||
    /\b(?:const|let|var)\s+computeCartTotal\s*=/.test(noComments);
  if (!declaresFn) {
    return { ok: false, errors: ['cart.js must define computeCartTotal(price, shipping, qty).'] };
  }
  if (/\breturn\s+price\s*\+\s*shipping\b/.test(noComments)) {
    errors.push("cart.js still returns raw `price + shipping` ('549' + '15' === '54915'!). Convert with Number().");
  }

  // Deterministic sandboxed test-vector evaluation on the function body (comments never penalize valid code!)
  try {
    const executable = js
      .replace(/\bexport\s+default\s+function\s+computeCartTotal\b/, 'function computeCartTotal')
      .replace(/\bexport\s+(?=(?:function|const|let|var)\s+computeCartTotal\b)/g, '');
    const runner = new Function(`${executable}\nreturn computeCartTotal;`) as () => (
      price: string | number,
      shipping: string | number,
      qty?: string | number,
    ) => unknown;
    const fn = runner();
    const case1 = fn('549', '15', 1);
    if (case1 !== 564) {
      errors.push(
        `Test vector failed: computeCartTotal("549", "15", 1) returned ${JSON.stringify(case1)} (expected 564).`,
      );
    }
    const caseMulti = fn('100', '15', 2);
    if (caseMulti !== 215) {
      errors.push(
        `Multi-item test failed: computeCartTotal("100", "15", 2) returned ${JSON.stringify(caseMulti)} (expected 215 = Number(price) * Number(qty) + Number(shipping)).`,
      );
    }
    const caseZero = fn('549', '15', 0);
    if (caseZero !== 0) {
      errors.push(
        `Zero-quantity guard failed: computeCartTotal("549", "15", 0) returned ${JSON.stringify(caseZero)} (expected 0).`,
      );
    }
  } catch (err) {
    errors.push(`cart.js syntax/runtime error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { ok: errors.length === 0, errors };
}

const SILENT_CONSOLE = { log: () => {}, warn: () => {}, error: () => {}, info: () => {} };

/** Validate a payment processing JS program (minors/majors conversion: divide by 100 and round down). */
export function validatePaymentJs(js: string): ValidationResult {
  const errors: string[] = [];
  const noComments = stripBlockComments(js).replace(/\/\/.*$/gm, '');
  const declaresFn =
    /\bfunction\s+processPayment\b/.test(noComments) ||
    /\b(?:const|let|var)\s+processPayment\s*=/.test(noComments);
  if (!declaresFn) {
    return { ok: false, errors: ['payment.js must define processPayment(amountMinor).'] };
  }
  try {
    const executable = js
      .replace(/\bexport\s+default\s+function\s+processPayment\b/, 'function processPayment')
      .replace(/\bexport\s+(?=(?:function|const|let|var)\s+processPayment\b)/g, '');
    const runner = new Function('console', `${executable}\nreturn processPayment;`) as (
      con: typeof SILENT_CONSOLE,
    ) => (amountMinor: number) => unknown;
    const fn = runner(SILENT_CONSOLE);
    const cases: Array<[number, number, string]> = [
      [100, 1, '100 minor units must equal 1 major unit (divide by 100)'],
      [199, 1, '199 minor units must round down to 1 (use Math.floor)'],
      [250, 2, '250 minor units must round down to 2'],
      [99, 0, '99 minor units must round down to 0'],
      [0, 0, '0 minor units must return 0'],
      [1050, 10, '1050 minor units must round down to 10'],
    ];
    for (const [input, expected, reason] of cases) {
      const got = fn(input);
      if (got !== expected) {
        errors.push(`Test vector failed: processPayment(${input}) returned ${JSON.stringify(got)} (expected ${expected} — ${reason}).`);
      }
    }
  } catch (err) {
    errors.push(`payment.js syntax/runtime error: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { ok: errors.length === 0, errors };
}

export interface DockerfileValidation extends ValidationResult {
  baseImage: string;
  exposePort: number;
  cmdTarget: string;
}

/** Validate the ByteRig Dockerfile (Level 08). */
export function validateDockerfile(raw: string): DockerfileValidation {
  const basic = parseDockerfileBasic(raw);
  if (!raw.trim()) return { ok: false, baseImage: '', exposePort: 0, cmdTarget: '', errors: basic.errors };
  const errors = basic.errors.filter((e) => !e.startsWith('Invalid base image '));
  const { baseImage, hasCopy, exposePort, cmdTarget } = basic;

  if (
    baseImage &&
    (/99-vibe|turbo|hallucinat|broken/i.test(baseImage) ||
      !/^node:(18|20|22|24|lts)([-a-z0-9.]*)?$/i.test(baseImage))
  ) {
    errors.push(`Invalid or hallucinated base image "${baseImage}" (use official LTS e.g. node:20-alpine).`);
  }

  if (baseImage && !hasCopy) {
    errors.push('Dockerfile is missing `COPY . .` (app source files are never copied into /app).');
  }
  if (exposePort !== 3000) {
    errors.push(`Dockerfile EXPOSE is ${exposePort || '(missing)'}; ByteRig server listens on port 3000 (use EXPOSE 3000).`);
  }
  const validStartCmd =
    Boolean(cmdTarget) &&
    !/broken_server/i.test(cmdTarget) &&
    (/server\.js/.test(cmdTarget) || (/\bnpm\b/.test(cmdTarget) && /\bstart\b/.test(cmdTarget)));
  if (!validStartCmd) {
    errors.push('Dockerfile CMD still points to broken_server.js (use CMD ["node", "server.js"]).');
  }

  return { ok: errors.length === 0, baseImage, exposePort, cmdTarget, errors };
}
