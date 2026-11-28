/**
 * Small broken files the code-task templates start from: a storefront page, a cart calculator, a Dockerfile and a compose file.
 * Each is one fix away from passing its validator in `src/chapters/validators.ts`, so a task template is playable as placed.
 */
export const STOREFRONT_HTML = '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8" />\n  <title>Telemetry Grid</title>\n  <link rel="stylesheet" href="storefront.css" />\n</head>\n<body>\n  <header class="site-header">\n    <h1>HARDWARE MONITOR</h1>\n  </header>\n  <main class="product-grid">\n    <article class="gpu-card" data-sku="gpu">\n      <h2>RTX 4090 24GB Tensor Core</h2>\n      <span class="price">$1599</span>\n    </article>\n    <article class="gpu-card" data-sku="ram">\n      <h2>64GB DDR5 ECC Server Kit</h2>\n      <span class="price">$249</span>\n    </article>\n    <article class="gpu-card" data-sku="ssd">\n      <h2>2TB Gen5 NVMe Weights Vault</h2>\n      <span class="price">$189</span>\n    </article>\n  </main>\n  <!-- BUG: the checkout button is disabled -->\n  <aside id="cart-drawer" class="cart-drawer">\n    <h3>Mounted Parts</h3>\n    <p>Total Power: <span data-bind="cart-total">$0.00</span></p>\n    <button id="checkout-btn" type="button" disabled>Mount to Server</button>\n  </aside>\n</body>\n</html>\n';

export const STOREFRONT_CSS = '/* Telemetry stylesheet */\nbody {\n  background: #0d0814;\n  color: #f4f0e8;\n}\n/* BUG: the whole grid is hidden */\n.product-grid {\n  display: none;\n  gap: 16px;\n}\n.cart-drawer {\n  width: 320px;\n  z-index: 10;\n  border: 2px solid #00f5d4;\n}\n';

export const CART_JS = "// VRAM allocation calculator (cart.js)\nexport function computeCartTotal(price, shipping, qty = 1) {\n  if (qty <= 0) return 0;\n  // BUG: raw string concatenation so ('549', '15', 1) returns '54915'!\n  return price + shipping;\n}\n";

export const PAYMENT_JS = "// Payment processor (code/payment.js)\nfunction processPayment(amountMinor) {\n  // BUG: entered 100 minor units returns 100 instead of dividing by 100 and rounding down!\n  return amountMinor;\n}\n\nconsole.log('100 minor ->', processPayment(100));\n";

export const DOCKERFILE = '# Inference worker container\nFROM node:99-vibe-turbo\nWORKDIR /app\nCOPY . .\nEXPOSE 9999\nCMD ["node", "broken_server.js"]\n';

export const SERVER_JS = "// Worker HTTP node (port 3000)\nconsole.log('worker listening on :3000');\n";

export const COMPOSE_YML = 'services:\n  nginx:\n    image: nginx:alpine\n    ports:\n      - "8080:80"\n    depends_on:\n      - website\n  website:\n    image: byterig-web:1.0\n    environment:\n      - PAYMENT_URL=http://localhost:9999\n    depends_on:\n      - payment\n  payment:\n    image: byterig-pay:1.0\n    environment:\n      - PAYMENT_MODE=live\n    ports:\n      - "4002:4002"\n';
