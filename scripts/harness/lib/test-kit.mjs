// Tiny helpers shared by the harness test scripts: a named test runner, a check collector for smoke runs, and a fake
// Node request for the dev-API handlers.
import { Readable } from 'node:stream';

/** `await test('name', fn)` runs `fn` and prints `ok  name`; a throw stops the script (assert style). `count()` is how many passed. */
export function testRunner() {
  let passed = 0;
  const test = async (name, fn) => {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  };
  return { test, count: () => passed };
}

/** `check(ok, what)` prints `ok`/`FAIL` and keeps going; `finish(label)` exits 1 when anything failed. */
export function checkCollector() {
  const failures = [];
  const check = (ok, what) => {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok) failures.push(what);
  };
  const finish = (label) => {
    if (failures.length) {
      console.error(`\n${failures.length} check(s) failed`);
      process.exit(1);
    }
    console.log(`\n${label} OK`);
  };
  return { check, finish, failures };
}

/** An `IncomingMessage`-like stream for calling an API handler without a server. `origin` or `contentType` null: no such header. */
export function fakeReq({ method = 'PUT', host = '127.0.0.1:5173', origin, contentType = 'application/json', body = '' } = {}) {
  const stream = Readable.from(body === null ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8')]);
  stream.method = method;
  stream.headers = { host, ...(origin != null ? { origin } : {}), ...(contentType != null ? { 'content-type': contentType } : {}) };
  return stream;
}

/** A `ServerResponse`-like sink; `json()` parses what was sent. */
export function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    text: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(text) { this.text = text ?? ''; },
    json() { return JSON.parse(this.text); },
  };
}
