import type { KernelEvent } from '../contracts/events.js';
import { SSD_PER_BACKUP, maxHpFor } from '../game/bestiary.js';
import { absPath, lookup, type VNode } from '../game/tree.js';
import { levelScript } from './script.js';
import type { WinRule } from './types.js';
import { validateCartJs, validateDockerCompose, validateDockerfile, validateStorefrontHtmlCss } from './validators.js';
import { splitParentAndName, type ChapterState } from './session-state.js';
import { rebootLevel } from './session-level.js';

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
      case 'kiro_loaded':
        return (
          (g.rt.loadedCores.has(rule.core) ||
            Array.from(g.rt.loadedCores).some((c) => c.includes(rule.core))) &&
          (g.kiro.activeCore.id === rule.core || g.kiro.activeCore.gguf.includes(rule.core))
        );
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
        const comp = g.pack.dialogs?.levels[g.rt.spec.id]?.completion;
        const skipRedundantTutorialComp = Boolean(levelScript(g).tutorial) && !g.rt.tutorialSkipped;
        const exitBase = splitParentAndName(g.rt.spec.exitDir).name;
        g.rt.completionNote += `${comp && !skipRedundantTutorialComp ? `\n${comp}\n` : ''}[EXIT GATE UNLOCKED] \`cd ${exitBase}\` is now open!\n`;
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
      return res.ok
        ? '[COMPOSE LINT: OK — ready for `docker compose up -d`]\n'
        : `[COMPOSE LINT: ${res.errors[0]}]\n`;
    }
    return '';
  }

export function playEventsSfx(g: ChapterState, events: KernelEvent[]): void {
    for (const ev of events) {
      if (ev.type === 'ENEMY_KILLED') {
        g.sfx.play('kill');
        return;
      }
      if (ev.type === 'FLOOR_CLEARED' || ev.type === 'ROOM_TRANSITION') {
        g.sfx.play('page');
        return;
      }
      if (ev.type === 'PERMISSION_DENIED_RATTLE') {
        g.sfx.play('denied');
        return;
      }
      if (ev.type === 'LANTERN_REVEAL') {
        g.sfx.play('reveal');
        return;
      }
      if (ev.type === 'KIRO_ACTION') {
        g.sfx.play(ev.action === 'crack_done' || ev.action === 'scan' ? 'reveal' : 'hop');
        return;
      }
      if (ev.type === 'PICKUP_COLLECTED') {
        g.sfx.play('hop');
        return;
      }
      if (ev.type === 'INODE_MODE_CHANGED') {
        g.sfx.play('gate');
        return;
      }
    }
    if (events.length > 0) g.sfx.play('type');
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

export function hurt(g: ChapterState, amount: number, source: string, events: KernelEvent[]): string {
    if (g.rt.spec.mechanic === 'hub' || levelScript(g).safe || amount <= 0) {
      return '';
    }
    const { amount: mitigated } = g.kiro.mitigateDamage(amount);
    g.hp = Math.max(0, g.hp - mitigated);
    events.push({
      type: 'PLAYER_DAMAGED',
      amount: mitigated,
      hpRemaining: g.hp,
      sourceName: source,
    });

    if (g.hp > 0) return '';

    g.deaths += 1;
    g.rt.levelDeaths += 1;
    g.deadNow = true;
    if (g.ssd >= SSD_PER_BACKUP) {
      g.ssd -= SSD_PER_BACKUP;
      g.hp = Math.ceil(maxHpFor(g.ram) * 0.6);
      events.push({ type: 'PLAYER_RESPAWNED', from: 'ssd_backup', hp: g.hp });
      g.deathText = `\n[SSD SNAPSHOT RESTORED] ${source} crashed your shell, but your 256GB NVMe backup restored you in place!\n`;
      return g.deathText;
    }

    const arrival = rebootLevel(g, events);
    events.push({ type: 'PLAYER_RESPAWNED', from: 'floor_restart', hp: g.hp });
    g.deathText = `\n[KERNEL PANIC] ${source} wiped your session! Rebooted at ${g.rt.spec.cwd}.\n${arrival}`;
    return g.deathText;
  }
