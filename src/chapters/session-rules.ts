import type { KernelEvent } from '../contracts/events.js';
import { giveItem, hasItem, holdItem, ITEMS, type ItemId } from '../game/inventory.js';
import { absPath, lookup, type VNode } from '../game/tree.js';
import { isNodeHidden, levelScript } from './script.js';
import type { WinRule } from './types.js';
import { evaluateComposeRuntime } from '../game/docker-compose-eval.js';
import { validateCartJs, validateDockerCompose, validateDockerfile, validatePaymentJs, validateStorefrontHtmlCss } from './validators.js';
import { splitParentAndName, type ChapterState } from './session-state.js';

/** Grants unowned items from `manifest.grants` up to `maxAfterLevel`; optionally emits reward events and text. */
export function grantManifestItemsUpTo(
  g: ChapterState,
  maxAfterLevel: number,
  emitRewards: boolean,
  events: KernelEvent[],
): string {
  if (maxAfterLevel <= 0) return '';
  const newlyGranted: ItemId[] = [];
  for (const grant of g.pack.manifest.grants ?? []) {
    if (maxAfterLevel < grant.afterLevel) continue;
    for (const item of grant.items ?? []) {
      const had = hasItem(g.inventory, item);
      g.inventory = giveItem(g.inventory, item);
      if (!had) newlyGranted.push(item);
      if (!had && (item === 'tube_transistor' || g.inventory.held === null)) {
        g.inventory = holdItem(g.inventory, item);
      }
    }
  }
  if (g.inventory.held === null && hasItem(g.inventory, 'terminal')) {
    g.inventory = holdItem(g.inventory, 'terminal');
  }
  if (!emitRewards || newlyGranted.length === 0) return '';
  let note = '';
  for (const item of newlyGranted) {
    events.push({ type: 'ITEM_GIVEN', item, model: ITEMS[item].model, held: g.inventory.held === item });
    if (item === 'tube_transistor' || item === 'laptop') {
      events.push({ type: 'PICKUP_COLLECTED', entityId: `reward:${item}`, item, amount: 1, label: ITEMS[item].label.toUpperCase() });
    }
    note += `\n[SECTOR REWARD] Obtained ${ITEMS[item].label.toUpperCase()} — ${ITEMS[item].use}\n`;
  }
  return note;
}

export function getChecklist(g: ChapterState): Array<{ description: string; done: boolean }> {
    return g.rt.spec.winRules.map((rule) => ({
      description: rule.description,
      done: evalWinRule(g, rule),
    }));
  }

/**
   * When functional validation passes on a file (e.g. `cart.js`, `index.html`, `storefront.css`, or a config file),
   * clear any leftover `BUG` comment marker so `World.sync` immediately squashes the 3D `malware.bug` entity!
   */
export function syncValidatedCodeBugs(g: ChapterState): void {
    for (const rule of g.rt.spec.winRules) {
      if (rule.kind === 'cart_js_valid') {
        const node = lookup(g.rt.root, rule.jsPath);
        if (node && node.content.includes('BUG') && validateCartJs(node.content).ok) {
          node.content = node.content.replace(/BUG/g, 'FIXED');
        }
      } else if (rule.kind === 'payment_js_valid') {
        const node = lookup(g.rt.root, rule.jsPath);
        if (node && validatePaymentJs(node.content).ok) {
          for (const e of g.rt.world.enemies) {
            if (e.type === 'bug' && e.inode === node.id && !e.dead) e.codeRuleSolved = true;
          }
        }
      } else if (rule.kind === 'html_css_valid' && evalWinRule(g, rule)) {
        for (const p of [rule.htmlPath, rule.cssPath]) {
          const node = lookup(g.rt.root, p);
          if (node && node.content.includes('BUG')) {
            node.content = node.content.replace(/BUG/g, 'FIXED');
          }
        }
      } else if (rule.kind === 'file_contains' && evalWinRule(g, rule)) {
        const node = lookup(g.rt.root, rule.path);
        if (node && node.content.includes('BUG')) {
          node.content = node.content.replace(/BUG/g, 'FIXED');
        }
      }
    }
  }

export function computeBossPhase(g: ChapterState): number {
    const bossRule = g.rt.spec.winRules.find((r) => r.kind === 'boss_defeated');
    if (!bossRule || bossRule.kind !== 'boss_defeated') return 0;

    let phase = 0;
    const streamNode = lookup(g.rt.root, bossRule.streamPath);
    if (!streamNode || streamNode.content.trim() === '' || g.rt.streamDrained) {
      phase += 1;
    }
    const sockVal = g.rt.socketInputs.get(bossRule.verifySocket) ?? '';
    if (sockVal.includes(bossRule.expectedToken)) {
      phase += 1;
    }
    const anchorNode = lookup(g.rt.root, bossRule.anchorPath);
    if (anchorNode && anchorNode.content.includes(bossRule.anchorPattern)) {
      phase += 1;
    }
    return phase;
  }

export function evalWinRule(g: ChapterState, rule: WinRule): boolean {
    switch (rule.kind) {
      case 'read_file':
        return g.rt.filesRead.has(rule.path);
      case 'talk_ally':
        return g.rt.talkedSockets.has(rule.socket);
      case 'riddle_solved':
        return g.rt.lab.solved.has(rule.riddleId);
      case 'file_absent':
        return lookup(g.rt.root, rule.path) === null;
      case 'file_contains': {
        const node = lookup(g.rt.root, rule.path);
        return Boolean(node && node.content.includes(rule.pattern));
      }
      case 'dir_accessible': {
        const node = lookup(g.rt.root, rule.path);
        return Boolean(node && node.kind === 'dir' && (node.mode & 0o500) === 0o500);
      }
      case 'kiro_decrypted':
        return g.kiro.isUnlocked(rule.path);
      case 'kiro_loaded': {
        // `script.kiro.coreAliases` lists other cores that count for this one ("Other names that count as a core").
        const names = [rule.core, ...(levelScript(g).kiro?.coreAliases?.[rule.core] ?? [])];
        return names.some(
          (n) =>
            (g.rt.loadedCores.has(n) || Array.from(g.rt.loadedCores).some((c) => c.includes(n))) &&
            (g.kiro.activeCore.id === n || g.kiro.activeCore.gguf.includes(n)),
        );
      }
      case 'enemy_neutralized': {
        const e = g.rt.world.get(rule.enemyId);
        return !e || e.dead || g.rt.world.petrified(e);
      }
      case 'html_css_valid': {
        const h = lookup(g.rt.root, rule.htmlPath);
        const c = lookup(g.rt.root, rule.cssPath);
        if (!h || !c) return false;
        return validateStorefrontHtmlCss(h.content, c.content).ok;
      }
      case 'cart_js_valid': {
        const j = lookup(g.rt.root, rule.jsPath);
        if (!j) return false;
        return validateCartJs(j.content).ok;
      }
      case 'payment_js_valid': {
        const j = lookup(g.rt.root, rule.jsPath);
        if (!j) return false;
        return validatePaymentJs(j.content).ok;
      }
      case 'laptop_tasks_done':
        return rule.tasks.every((id) => g.laptopDone.has(id));
      case 'docker_image_running':
        return g.rt.containers.some(
          (c) => c.image === rule.imageTag && c.ports.replace(/\/(tcp|udp)$/i, '').endsWith(`:${rule.port}`),
        );
      case 'docker_compose_healthy':
        return rule.services.every((s) => g.rt.composeHealthyServices.has(s));
      case 'boss_defeated': {
        const b = g.rt.world.get(rule.bossId);
        return computeBossPhase(g) >= 3 && (!b || b.dead);
      }
    }
  }

export function allWinRulesMet(g: ChapterState): boolean {
    return g.rt.spec.winRules.every((r) => evalWinRule(g, r));
  }

export function refreshExitGates(g: ChapterState, events: KernelEvent[]): void {
    if (!g.rt.spec.exitDir) return;
    const gate = lookup(g.rt.root, g.rt.spec.exitDir);
    if (!gate) return;
    const shouldOpen = allWinRulesMet(g);
    const targetMode = shouldOpen ? 0o755 : 0;
    if (gate.mode !== targetMode) {
      const old = gate.mode;
      gate.mode = targetMode;
      events.push({ type: 'INODE_MODE_CHANGED', inodeId: gate.id, oldMode: old, newMode: targetMode });
      if (targetMode === 0o755 && !g.rt.completionEmitted) {
        g.rt.completionEmitted = true;
        const rewardNote =
          !g.lab && (g.rt.levelCommands > 0 || g.rt.levelTicks > 0)
            ? grantManifestItemsUpTo(g, g.rt.spec.index, true, events)
            : '';
        const comp = g.rt.dialog?.completion;
        const skipRedundantTutorialComp = Boolean(levelScript(g).tutorial) && !g.rt.tutorialSkipped;
        const exitBase = splitParentAndName(g.rt.spec.exitDir).name;
        g.rt.completionNote += `${rewardNote}${comp && !skipRedundantTutorialComp ? `\n${comp}\n` : ''}[EXIT GATE UNLOCKED] \`cd ${exitBase}\` is now open!\n`;
      }
    }
  }

export function liveLintFeedback(g: ChapterState, node: VNode): string {
    if (node.name === 'index.html' || node.name === 'storefront.css') {
      const html = lookup(g.rt.root, `${absPath(g.rt.cwd)}/index.html`)?.content ?? '';
      const css = lookup(g.rt.root, `${absPath(g.rt.cwd)}/storefront.css`)?.content ?? '';
      const res = validateStorefrontHtmlCss(html, css);
      return res.ok
        ? '[STOREFRONT PREVIEW: 200 OK — GPU/RAM/SSD Grid & Cart Drawer Live!]\n'
        : `[STOREFRONT LINT: ${res.errors.length} issue(s) remaining -> ${res.errors[0]}]\n`;
    }
    const nodePath = absPath(node);
    const hasPaymentRule = g.rt.spec.winRules.some((r) => r.kind === 'payment_js_valid' && r.jsPath === nodePath);
    if (hasPaymentRule) {
      const res = validatePaymentJs(node.content);
      return res.ok
        ? '[PAYMENT TEST SUITE: PASS — processPayment(100) === 1, (199) === 1 & (250) === 2]\n'
        : `[PAYMENT TEST SUITE: FAIL -> ${res.errors[0]}]\n`;
    }
    if (node.name === 'cart.js') {
      const res = validateCartJs(node.content);
      return res.ok
        ? '[CART TEST SUITE: PASS — computeCartTotal("549", "15", 1) === 564 & ("100", "15", 2) === 215]\n'
        : `[CART TEST SUITE: FAIL -> ${res.errors[0]}]\n`;
    }
    if (node.name === 'Dockerfile') {
      const res = validateDockerfile(node.content);
      return res.ok
        ? '[DOCKERFILE LINT: OK — ready for `docker build -t byterig-web:1.0 .`]\n'
        : `[DOCKERFILE LINT: ${res.errors[0]}]\n`;
    }
    if (node.name === 'docker-compose.yml') {
      const res = validateDockerCompose(node.content);
      if (!res.ok) return `[COMPOSE LINT: ${res.errors[0]}]\n`;
      const rt = evaluateComposeRuntime(node.content);
      return rt.ok
        ? '[COMPOSE LINT: OK — ready for `docker compose up -d`]\n'
        : `[COMPOSE LINT: WARN — ${rt.faults[0]!.reason}; raise heap/mem_limit >= 256m]\n`;
    }
    return '';
  }

export function unfinishedObjectives(g: ChapterState): string {
  return getChecklist(g).filter((c) => !c.done).map((c) => `  - ${c.description}`).join('\n');
}

export function sinkIntoNull(g: ChapterState, events: KernelEvent[], inodeId: number): void {
  events.push({
    type: 'OBJECT_MOVED',
    inodeId,
    fromDir: g.rt.cwd.id,
    toDir: 0,
    formedBridge: false,
    suckedIntoNull: true,
  });
  g.rt.world.sync(events);
  refreshExitGates(g, events);
}

/** Records visible nodes observed via `ls`, `cd`, `cat`, `tree`, or `grep` for `appearWhen` discovery checks. */
export function markDiscovered(g: ChapterState, target: VNode, children: readonly VNode[] = []): void {
  if (!isNodeHidden(g, target)) g.rt.discoveredPaths.add(absPath(target));
  for (const child of children) {
    if (!isNodeHidden(g, child)) g.rt.discoveredPaths.add(absPath(child));
  }
}

/** True when `targetPath` is visible and any `appearWhen`-gated ancestor/file along it has been discovered via terminal listing/navigation. */
export function isPathDiscovered(g: ChapterState, targetPath: string): boolean {
  const node = lookup(g.rt.root, targetPath);
  if (!node || isNodeHidden(g, node)) return false;
  const cwd = g.rt.spec.cwd;
  const gated: string[] = [];
  if (targetPath.startsWith(`${cwd}/`)) {
    let cur = cwd;
    for (const seg of targetPath.slice(cwd.length + 1).split('/')) {
      cur = `${cur}/${seg}`;
      if (g.rt.filesByPath.get(cur)?.appearWhen) gated.push(cur);
    }
  } else if (g.rt.filesByPath.get(targetPath)?.appearWhen) {
    gated.push(targetPath);
  }
  return gated.length === 0 || gated.some((p) => g.rt.discoveredPaths.has(p));
}

