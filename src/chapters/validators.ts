/**
 * Deterministic, zero-DOM, zero-LLM validators for HTML/CSS Storefront, JS Cart Math,
 * Dockerfile Image Forge, and Docker Compose Multi-Service Stack tasks.
 */

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** Strip C-style CSS/JS block comments so commented-out bugs do not false-trigger. */
function stripBlockComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Strip YAML inline `#` comments only when `#` occurs outside single/double quotes. */
function stripYamlComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle && line[i - 1] !== '\\') inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(line[i - 1]!))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function unquoteYaml(val: string): string {
  const t = val.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).trim();
  }
  return t;
}

/** Parse flat CSS rule blocks into selector -> lowercase property map (last declaration wins). */
export function parseCssSubset(rawCss: string): Map<string, Map<string, string>> {
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

export interface DockerfileValidation extends ValidationResult {
  baseImage: string;
  exposePort: number;
  cmdTarget: string;
}

/** Validate the ByteRig Dockerfile (Level 06). */
export function validateDockerfile(raw: string): DockerfileValidation {
  const errors: string[] = [];
  let baseImage = '';
  let hasCopy = false;
  let exposePort = 0;
  let cmdTarget = '';

  const joined = raw.replace(/\\\r?\n/g, ' ');
  const lines = joined
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  if (lines.length === 0) {
    return { ok: false, baseImage: '', exposePort: 0, cmdTarget: '', errors: ['Dockerfile is empty.'] };
  }

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith('FROM ')) {
      const tokens = line
        .slice(5)
        .trim()
        .split(/\s+/)
        .filter((t) => !t.startsWith('--'));
      baseImage = tokens[0] ?? '';
    } else if (upper.startsWith('COPY ') || upper.startsWith('ADD ')) {
      hasCopy = true;
    } else if (upper.startsWith('RUN ')) {
      if (/cryptominer|ransom|malware/i.test(line)) {
        errors.push(`Dockerfile contains malicious layer: "${line}" (remove it!).`);
      }
    } else if (upper.startsWith('EXPOSE ')) {
      const rawPort = (line.slice(7).trim().split(/\s+/)[0] ?? '0').replace(/\/(tcp|udp)$/i, '');
      exposePort = Number(rawPort);
    } else if (upper.startsWith('CMD ') || upper.startsWith('ENTRYPOINT ')) {
      const kwLen = upper.startsWith('ENTRYPOINT ') ? 11 : 4;
      cmdTarget = line.slice(kwLen).trim();
    }
  }

  if (!baseImage) {
    errors.push('Dockerfile is missing a FROM instruction.');
  } else if (
    /99-vibe|turbo|hallucinat|broken/i.test(baseImage) ||
    !/^node:(18|20|22|24|lts)([-a-z0-9.]*)?$/i.test(baseImage)
  ) {
    errors.push(`Invalid or hallucinated base image "${baseImage}" (use official LTS e.g. node:20-alpine).`);
  }

  if (!hasCopy) {
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

export interface ComposeServiceParsed {
  image: string;
  ports: string[];
  env: Record<string, string>;
}

/** Flexible indentation-aware parser for docker-compose.yml `services:` blocks (supports 2-space, 4-space, and indentless sequences). */
export function parseComposeServices(raw: string): { services: Map<string, ComposeServiceParsed>; parseErrors: string[] } {
  const services = new Map<string, ComposeServiceParsed>();
  const parseErrors: string[] = [];
  const lines = raw.split(/\r?\n/);

  let servicesIndent = -1;
  let serviceIndent = -1;
  let propIndent = -1;
  let currentSvc = '';
  let currentSub: '' | 'ports' | 'environment' | 'depends_on' = '';

  for (let idx = 0; idx < lines.length; idx++) {
    const rawLine = lines[idx] ?? '';
    if (rawLine.includes('\t')) {
      parseErrors.push(`Line ${idx + 1}: YAML forbids tab characters; use spaces.`);
      continue;
    }
    const stripped = stripYamlComment(rawLine).trimEnd();
    if (!stripped.trim()) continue;

    const indent = stripped.length - stripped.trimStart().length;
    const text = stripped.trim();

    if (servicesIndent >= 0 && indent <= servicesIndent && text !== 'services:') {
      servicesIndent = -1;
      serviceIndent = -1;
      propIndent = -1;
      currentSvc = '';
      currentSub = '';
    }

    if (text === 'services:') {
      servicesIndent = indent;
      serviceIndent = -1;
      propIndent = -1;
      currentSvc = '';
      currentSub = '';
      continue;
    }

    if (servicesIndent < 0) continue;

    if (serviceIndent < 0 && indent > servicesIndent && text.endsWith(':') && !text.startsWith('-')) {
      serviceIndent = indent;
    }

    if (indent === serviceIndent && text.endsWith(':') && !text.startsWith('-')) {
      currentSvc = text.slice(0, -1).trim();
      propIndent = -1;
      currentSub = '';
      if (!services.has(currentSvc)) {
        services.set(currentSvc, { image: '', ports: [], env: {} });
      }
      continue;
    }

    const svc = services.get(currentSvc);
    if (!svc || indent <= serviceIndent) continue;

    // Sequence item `- ...` (valid at `>= propIndent` so both indented and indentless YAML lists work!)
    if (text.startsWith('-') && currentSub && (propIndent < 0 || indent >= propIndent)) {
      const val = unquoteYaml(text.slice(1));
      if (currentSub === 'ports') {
        svc.ports.push(val);
      } else if (currentSub === 'environment') {
        const eq = val.indexOf('=');
        if (eq > 0) {
          svc.env[val.slice(0, eq).trim()] = unquoteYaml(val.slice(eq + 1));
        } else if (val.includes(':')) {
          const colon = val.indexOf(':');
          svc.env[val.slice(0, colon).trim()] = unquoteYaml(val.slice(colon + 1));
        }
      }
      continue;
    }

    if (propIndent < 0 || indent === propIndent) {
      propIndent = indent;
      if (text.startsWith('image:')) {
        svc.image = unquoteYaml(text.slice(6));
        currentSub = '';
      } else if (text === 'ports:') {
        currentSub = 'ports';
      } else if (text === 'environment:') {
        currentSub = 'environment';
      } else if (text === 'depends_on:') {
        currentSub = 'depends_on';
      } else {
        currentSub = '';
      }
      continue;
    }

    if (indent > propIndent && currentSub === 'environment' && text.includes(':')) {
      const colon = text.indexOf(':');
      svc.env[text.slice(0, colon).trim()] = unquoteYaml(text.slice(colon + 1));
    }
  }

  return { services, parseErrors };
}

/** Validate the 3-service ByteRig docker-compose.yml stack (nginx + website + payment, Level 07). */
export function validateDockerCompose(raw: string): ValidationResult {
  const { services, parseErrors } = parseComposeServices(raw);
  const errors = [...parseErrors];

  for (const req of ['nginx', 'website', 'payment']) {
    if (!services.has(req)) errors.push(`docker-compose.yml is missing required service "${req}".`);
  }
  if (errors.length > 0) return { ok: false, errors };

  const nginx = services.get('nginx')!;
  if (!/^nginx(:|$)/i.test(nginx.image)) {
    errors.push(`nginx.image "${nginx.image || '(empty)'}" must be a valid nginx image (e.g. nginx:alpine).`);
  }
  const mapsPort80 = nginx.ports.some((p) => {
    const clean = p.replace(/\/(tcp|udp)$/i, '');
    const parts = clean.split(':');
    const hostPort = parts.length >= 2 ? parts[parts.length - 2] : '';
    const containerPort = parts.length >= 2 ? parts[parts.length - 1] : '';
    return (hostPort === '8080' || hostPort === '80') && containerPort === '80';
  });
  if (!mapsPort80) {
    errors.push(`nginx.ports [${nginx.ports.join(', ')}] does not forward to container port 80 (use "8080:80").`);
  }

  const web = services.get('website')!;
  if (/broken|0\.0/i.test(web.image) || web.image !== 'byterig-web:1.0') {
    errors.push(`website.image is "${web.image || '(empty)'}" (set to built image "byterig-web:1.0").`);
  }
  const payUrl = web.env.PAYMENT_URL ?? '';
  if (!/^http:\/\/payment:4002(\/.*)?$/i.test(payUrl)) {
    errors.push(
      `website PAYMENT_URL is "${payUrl || '(missing)'}" (inside Compose, localhost is the website container itself—use "http://payment:4002").`,
    );
  }

  const pay = services.get('payment')!;
  if (!pay.image) {
    errors.push('payment.image is missing (use "byterig-pay:1.0").');
  }
  const payMode = (pay.env.PAYMENT_MODE ?? '').toLowerCase();
  if (payMode !== 'live' && payMode !== 'production') {
    errors.push(`payment PAYMENT_MODE is "${pay.env.PAYMENT_MODE || '(missing)'}" (set PAYMENT_MODE=live so cart orders settle).`);
  }

  return { ok: errors.length === 0, errors };
}
