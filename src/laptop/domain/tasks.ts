/**
 * The laptop's coding tasks: plain data. Each names the app it opens in, the starter code, the checks
 * that decide it and a reference solution that must pass them (the smoke test proves it, the way every
 * level has a solution that must clear with 0 deaths).
 */
import type { Check } from './checks.js';
import type { CodeFiles, PageAction, RunRequest } from './run.js';

export type TaskApp = 'jspad' | 'weaver';

export interface LaptopTask {
  id: string;
  title: string;
  app: TaskApp;
  brief: string;
  hint: string;
  starter: CodeFiles;
  solution: CodeFiles;
  checks: Check[];
  /** What the checker does to the page before measuring it. */
  actions?: PageAction[];
}

export const modeOf = (app: TaskApp): RunRequest['mode'] => (app === 'jspad' ? 'script' : 'page');

const js = (code: string): CodeFiles => ({ html: '', css: '', js: code });
const page = (html: string, css = '', code = ''): CodeFiles => ({ html, css, js: code });

const NO_ERROR: Check = { kind: 'noError', label: 'Runs without an error' };

export const TASKS: readonly LaptopTask[] = [
  {
    id: 'js-hello',
    title: 'Hello, World!',
    app: 'jspad',
    brief: 'Every machine says it first. Print exactly Hello, World! to the console.',
    hint: 'console.log("...") prints a line.',
    starter: js('// Print a greeting to the console.\n'),
    solution: js('console.log("Hello, World!");\n'),
    checks: [NO_ERROR, { kind: 'log', equals: 'Hello, World!', label: 'The console says Hello, World!' }],
  },
  {
    id: 'js-add',
    title: 'Add two numbers',
    app: 'jspad',
    brief: 'Write a function add(a, b) that returns the sum of its two arguments.',
    hint: 'function add(a, b) { return ... }',
    starter: js('function add(a, b) {\n  // your code\n}\n\nconsole.log(add(2, 3));\n'),
    solution: js('function add(a, b) {\n  return a + b;\n}\n\nconsole.log(add(2, 3));\n'),
    checks: [
      NO_ERROR,
      { kind: 'value', expr: 'add(2, 3)', equals: '5', label: 'add(2, 3) is 5' },
      { kind: 'value', expr: 'add(-4, 10)', equals: '6', label: 'add(-4, 10) is 6' },
    ],
  },
  {
    id: 'js-countdown',
    title: 'Countdown',
    app: 'jspad',
    brief: 'Use a for loop to print 3, 2, 1, one per line, then Liftoff!',
    hint: 'for (let i = 3; i >= 1; i--) { ... }',
    starter: js('// Count down from 3, then print Liftoff!\n'),
    solution: js('for (let i = 3; i >= 1; i--) {\n  console.log(i);\n}\nconsole.log("Liftoff!");\n'),
    checks: [
      NO_ERROR,
      { kind: 'source', file: 'js', includes: 'for', label: 'Uses a for loop' },
      { kind: 'logs', lines: ['3', '2', '1', 'Liftoff!'], label: 'Prints 3, 2, 1, Liftoff!' },
    ],
  },
  {
    id: 'web-hello',
    title: 'Hello, Page!',
    app: 'weaver',
    brief: 'Make a page with one big heading: an <h1> that reads Hello, Page!',
    hint: '<h1>...</h1> is the biggest heading.',
    starter: page('<!-- Write your page here -->\n'),
    solution: page('<h1>Hello, Page!</h1>\n'),
    checks: [{ kind: 'element', selector: 'h1', text: 'Hello, Page!', label: 'An <h1> says Hello, Page!' }],
  },
  {
    id: 'web-style',
    title: 'Paint it',
    app: 'weaver',
    brief: 'Style the heading: color #ff6a13 (hoodie orange), and give the page body a #140f12 background.',
    hint: 'h1 { color: ...; }  body { background: ...; }',
    starter: page('<h1>Haunted Terminal</h1>\n', '/* Your styles */\n'),
    solution: page('<h1>Haunted Terminal</h1>\n', 'body { background: #140f12; }\nh1 { color: #ff6a13; }\n'),
    checks: [
      { kind: 'element', selector: 'h1', label: 'The page has an <h1>' },
      { kind: 'style', selector: 'h1', prop: 'color', equals: 'rgb(255, 106, 19)', label: 'The heading is #ff6a13' },
      { kind: 'style', selector: 'body', prop: 'background-color', equals: 'rgb(20, 15, 18)', label: 'The body is #140f12' },
    ],
  },
  {
    id: 'web-list',
    title: 'Inventory list',
    app: 'weaver',
    brief: 'List what you carry: a <ul id="inventory"> with one <li> for lantern and one for laptop.',
    hint: '<ul id="inventory"><li>...</li></ul>',
    starter: page('<h2>My inventory</h2>\n'),
    solution: page('<h2>My inventory</h2>\n<ul id="inventory">\n  <li>lantern</li>\n  <li>laptop</li>\n</ul>\n'),
    checks: [
      { kind: 'element', selector: 'ul#inventory', label: 'There is a <ul id="inventory">' },
      { kind: 'element', selector: '#inventory li', min: 2, label: 'It holds at least two items' },
      { kind: 'element', selector: '#inventory li:first-child', text: 'lantern', label: 'The lantern comes first' },
    ],
  },
  {
    id: 'web-button',
    title: 'Light switch',
    app: 'weaver',
    brief: 'Add a <button id="lamp">. Clicking it must add the class lit to the <body>. Style body.lit with a yellow (#ffd166) background.',
    hint: 'document.getElementById("lamp").addEventListener("click", () => document.body.classList.add("lit"));',
    starter: page('<button id="lamp">Light</button>\n', 'body.lit { }\n', '// Make the button light the room.\n'),
    solution: page(
      '<button id="lamp">Light</button>\n',
      'body.lit { background: #ffd166; }\n',
      'document.getElementById("lamp").addEventListener("click", () => {\n  document.body.classList.add("lit");\n});\n',
    ),
    actions: [{ click: '#lamp' }],
    checks: [
      NO_ERROR,
      { kind: 'element', selector: 'button#lamp', label: 'There is a <button id="lamp">' },
      { kind: 'element', selector: 'body.lit', label: 'A click lights the body' },
      { kind: 'style', selector: 'body.lit', prop: 'background-color', equals: 'rgb(255, 209, 102)', label: 'body.lit is #ffd166' },
    ],
  },
];

export function taskById(id: string): LaptopTask | undefined {
  return TASKS.find((t) => t.id === id);
}
