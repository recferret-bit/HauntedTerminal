import { absPath, resolve, type VNode } from './tree.js';

export interface ComposeServiceSpec {
  name: string;
  image: string;
  build: string;
  containerName: string;
  restart: string;
  ports: string[];
  env: Record<string, string>;
  dependsOn: string[];
  command: string;
  memLimit: string;
  deployMemoryLimit: string;
  volumes: string[];
}

export interface ComposeParseResult {
  services: Map<string, ComposeServiceSpec>;
  volumes: string[];
  parseErrors: string[];
}

export interface ComposeValidationResult {
  ok: boolean;
  errors: string[];
}

export interface ComposeOomFault {
  service: string;
  image: string;
  limitMb: number;
  requiredMb: number;
  exitCode: 137;
  reason: string;
}

export interface ComposeRuntimeResult {
  ok: boolean;
  services: string[];
  faults: ComposeOomFault[];
}

export interface BasicDockerfileInfo {
  ok: boolean;
  baseImage: string;
  hasCopy: boolean;
  exposePort: number;
  cmdTarget: string;
  errors: string[];
}

function unquoteYaml(raw: string): string {
  const s = raw.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function stripYamlComment(line: string): string {
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if ((ch === '"' || ch === "'") && (i === 0 || line[i - 1] !== '\\')) {
      quote = quote === ch ? null : quote ?? ch;
    } else if (ch === '#' && quote === null && (i === 0 || /\s/.test(line[i - 1]!))) {
      return line.slice(0, i);
    }
  }
  return line;
}

function createEmptyService(name: string): ComposeServiceSpec {
  return {
    name,
    image: '',
    build: '',
    containerName: '',
    restart: '',
    ports: [],
    env: {},
    dependsOn: [],
    command: '',
    memLimit: '',
    deployMemoryLimit: '',
    volumes: [],
  };
}

function assignEnvEntry(env: Record<string, string>, rawEntry: string): void {
  const clean = unquoteYaml(rawEntry);
  const eq = clean.indexOf('=');
  if (eq > 0) {
    env[clean.slice(0, eq).trim()] = unquoteYaml(clean.slice(eq + 1));
    return;
  }
  const colon = clean.indexOf(':');
  if (colon > 0) {
    env[clean.slice(0, colon).trim()] = unquoteYaml(clean.slice(colon + 1));
  }
}

type ServiceSubSection = '' | 'ports' | 'environment' | 'depends_on' | 'command' | 'volumes' | 'build' | 'deploy';

function applyServiceProp(
  svc: ComposeServiceSpec,
  key: string,
  rest: string,
): ServiceSubSection {
  if (key === 'image') {
    svc.image = unquoteYaml(rest);
    return '';
  }
  if (key === 'build') {
    if (!rest) return 'build';
    svc.build = unquoteYaml(rest);
    return '';
  }
  if (key === 'container_name') {
    svc.containerName = unquoteYaml(rest);
    return '';
  }
  if (key === 'restart') {
    svc.restart = unquoteYaml(rest);
    return '';
  }
  if (key === 'mem_limit') {
    svc.memLimit = unquoteYaml(rest);
    return '';
  }
  if (key === 'command') {
    if (!rest) return 'command';
    svc.command = unquoteYaml(rest.replace(/^\[|\]$/g, '').split(',').map(unquoteYaml).join(' '));
    return '';
  }
  if (key === 'ports' || key === 'environment' || key === 'depends_on' || key === 'volumes' || key === 'deploy') {
    return key;
  }
  return '';
}

function applyServiceListItem(svc: ComposeServiceSpec, sub: ServiceSubSection, rawVal: string): void {
  const val = unquoteYaml(rawVal);
  if (sub === 'ports') svc.ports.push(val);
  else if (sub === 'environment') assignEnvEntry(svc.env, val);
  else if (sub === 'depends_on') svc.dependsOn.push(val.replace(/:.*$/, '').trim());
  else if (sub === 'volumes') svc.volumes.push(val);
  else if (sub === 'command') svc.command = svc.command ? `${svc.command} ${val}` : val;
}

export function parseComposeFile(raw: string): ComposeParseResult {
  const services = new Map<string, ComposeServiceSpec>();
  const topVolumes: string[] = [];
  const parseErrors: string[] = [];
  const lines = raw.split(/\r?\n/);

  let section: '' | 'services' | 'volumes' = '';
  let sectionIndent = -1;
  let serviceIndent = -1;
  let propIndent = -1;
  let currentSvc = '';
  let currentSub: ServiceSubSection = '';
  let deployStage: '' | 'resources' | 'limits' | 'other' = '';

  for (let idx = 0; idx < lines.length; idx += 1) {
    const rawLine = lines[idx] ?? '';
    if (rawLine.includes('\t')) {
      parseErrors.push(`Line ${idx + 1}: YAML forbids tab characters; use spaces.`);
      continue;
    }
    const stripped = stripYamlComment(rawLine).trimEnd();
    if (!stripped.trim()) continue;
    const indent = stripped.length - stripped.trimStart().length;
    const text = stripped.trim();

    if (section && indent <= sectionIndent && text !== `${section}:`) {
      section = '';
      sectionIndent = -1;
      serviceIndent = -1;
      propIndent = -1;
      currentSvc = '';
      currentSub = '';
      deployStage = '';
    }

    if (text === 'services:' || (text === 'volumes:' && !(section === 'services' && indent > sectionIndent))) {
      section = text === 'services:' ? 'services' : 'volumes';
      sectionIndent = indent;
      serviceIndent = -1;
      propIndent = -1;
      currentSvc = '';
      currentSub = '';
      deployStage = '';
      continue;
    }

    if (section === 'volumes') {
      if (indent > sectionIndent && text.endsWith(':') && !text.startsWith('-')) topVolumes.push(text.slice(0, -1).trim());
      continue;
    }
    if (section !== 'services') continue;

    if (serviceIndent < 0 && indent > sectionIndent && text.endsWith(':') && !text.startsWith('-')) serviceIndent = indent;
    if (indent === serviceIndent && text.endsWith(':') && !text.startsWith('-')) {
      currentSvc = text.slice(0, -1).trim();
      propIndent = -1;
      currentSub = '';
      deployStage = '';
      if (!services.has(currentSvc)) services.set(currentSvc, createEmptyService(currentSvc));
      continue;
    }

    const svc = services.get(currentSvc);
    if (!svc || indent <= serviceIndent) continue;

    if (text.startsWith('-') && currentSub && (propIndent < 0 || indent >= propIndent)) {
      applyServiceListItem(svc, currentSub, text.slice(1));
      continue;
    }

    if (propIndent < 0 || indent === propIndent) {
      propIndent = indent;
      deployStage = '';
      const colon = text.indexOf(':');
      currentSub = colon >= 0 ? applyServiceProp(svc, text.slice(0, colon).trim(), text.slice(colon + 1).trim()) : '';
      continue;
    }

    if (indent > propIndent) {
      const colon = text.indexOf(':');
      if (currentSub === 'environment' && colon > 0) {
        svc.env[text.slice(0, colon).trim()] = unquoteYaml(text.slice(colon + 1));
      } else if (currentSub === 'depends_on' && text.endsWith(':') && !text.startsWith('-')) {
        svc.dependsOn.push(text.slice(0, -1).trim());
      } else if (currentSub === 'build' && text.startsWith('context:')) {
        svc.build = unquoteYaml(text.slice(8));
      } else if (currentSub === 'deploy') {
        if (text === 'resources:') deployStage = 'resources';
        else if ((deployStage === 'resources' || deployStage === 'other') && text === 'limits:') deployStage = 'limits';
        else if (text === 'reservations:' || (text.endsWith(':') && text !== 'resources:' && text !== 'limits:')) {
          deployStage = text === 'reservations:' ? 'other' : '';
        } else if (deployStage === 'limits' && text.startsWith('memory:')) {
          svc.deployMemoryLimit = unquoteYaml(text.slice(7));
        }
      }
    }
  }

  return { services, volumes: topVolumes, parseErrors };
}

function validateWebPaymentMesh(services: Map<string, ComposeServiceSpec>, errors: string[]): void {
  for (const req of ['nginx', 'website', 'payment']) {
    if (!services.has(req)) errors.push(`docker-compose.yml is missing required service "${req}".`);
  }
  if (errors.length > 0) return;

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
}

export function validateDockerCompose(raw: string): ComposeValidationResult {
  const { services, parseErrors } = parseComposeFile(raw);
  const errors = [...parseErrors];

  if (services.size === 0) {
    errors.push('docker-compose.yml defines no services under services:.');
    return { ok: false, errors };
  }

  if (services.has('website') || services.has('payment')) {
    validateWebPaymentMesh(services, errors);
    return { ok: errors.length === 0, errors };
  }

  const hostPorts = new Map<string, string>();
  for (const [name, svc] of services.entries()) {
    if (!svc.image && !svc.build) {
      errors.push(`Service "${name}" must define an "image:" or "build:" configuration.`);
    }
    for (const dep of svc.dependsOn) {
      if (!services.has(dep)) {
        errors.push(`Service "${name}" depends_on unknown service "${dep}".`);
      }
    }
    for (const mapping of svc.ports) {
      const clean = mapping.replace(/\/(tcp|udp)$/i, '');
      const parts = clean.split(':');
      if (parts.length >= 2) {
        const hostPort = parts[parts.length - 2] ?? '';
        const containerPort = parts[parts.length - 1] ?? '';
        if (!/^\d+$/.test(hostPort) || !/^\d+$/.test(containerPort)) {
          errors.push(`Service "${name}" has invalid port mapping "${mapping}".`);
        } else {
          const prevOwner = hostPorts.get(hostPort);
          if (prevOwner && prevOwner !== name) {
            errors.push(`Host port ${hostPort} is mapped by both "${prevOwner}" and "${name}".`);
          } else {
            hostPorts.set(hostPort, name);
          }
        }
      } else if (!/^\d+$/.test(clean)) {
        errors.push(`Service "${name}" has invalid port entry "${mapping}".`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

export function parseMemoryMb(raw: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*([kmgtb]?i?b?)?\s*$/i.exec(raw);
  if (!m) return null;
  const num = Number(m[1]);
  if (!Number.isFinite(num) || num < 0) return null;
  const unit = (m[2] ?? '').toLowerCase();
  if (unit.startsWith('g')) return Math.round(num * 1024);
  if (unit.startsWith('t')) return Math.round(num * 1024 * 1024);
  if (unit.startsWith('m')) return Math.round(num);
  if (unit.startsWith('k')) return Math.round(num / 1024);
  if (unit === 'b' || num >= 1024 * 1024) return Math.round(num / (1024 * 1024));
  return Math.round(num / 1024);
}

function extractXmxMb(text: string): number | null {
  let latest: number | null = null;
  const rx = /-Xmx\s*([0-9]+(?:\.[0-9]+)?(?:[kmgt]i?b?|b)?)/gi;
  let match: RegExpExecArray | null = rx.exec(text);
  while (match !== null) {
    const parsed = parseMemoryMb(match[1] ?? '');
    if (parsed !== null) latest = parsed;
    match = rx.exec(text);
  }
  return latest;
}

export function evaluateComposeRuntime(raw: string): ComposeRuntimeResult {
  const { services } = parseComposeFile(raw);
  const serviceNames = Array.from(services.keys());
  const faults: ComposeOomFault[] = [];

  for (const svc of services.values()) {
    const jvmEnv = `${svc.env.JAVA_OPTS ?? ''} ${svc.env.JAVA_TOOL_OPTIONS ?? ''} ${svc.env.JDK_JAVA_OPTIONS ?? ''}`;
    const cmdText = svc.command;
    const isJvm =
      Boolean(svc.env.JAVA_OPTS || svc.env.JAVA_TOOL_OPTIONS || svc.env.JDK_JAVA_OPTIONS) ||
      /-Xm[xs]|\bjava\b/i.test(cmdText) ||
      /java|jvm|spring|openjdk|temurin|jre|jdk/i.test(`${svc.name} ${svc.image}`);
    if (!isJvm) continue;

    const heapMb = extractXmxMb(`${jvmEnv} ${cmdText}`);
    const memLimitMb = svc.memLimit
      ? parseMemoryMb(svc.memLimit)
      : svc.deployMemoryLimit
        ? parseMemoryMb(svc.deployMemoryLimit)
        : null;
    const effectiveMb =
      heapMb !== null && memLimitMb !== null
        ? Math.min(heapMb, memLimitMb)
        : (heapMb ?? memLimitMb ?? 512);

    if (effectiveMb < 256) {
      faults.push({
        service: svc.name,
        image: svc.image || `${svc.name}:latest`,
        limitMb: effectiveMb,
        requiredMb: 256,
        exitCode: 137,
        reason: `java.lang.OutOfMemoryError: Java heap space (configured ${effectiveMb}m < 256m minimum)`,
      });
    }
  }

  return { ok: faults.length === 0, services: serviceNames, faults };
}

export function parseDockerfileBasic(raw: string): BasicDockerfileInfo {
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
    return { ok: false, baseImage: '', hasCopy: false, exposePort: 0, cmdTarget: '', errors: ['Dockerfile is empty.'] };
  }

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper.startsWith('FROM ')) {
      const tokens = line.slice(5).trim().split(/\s+/).filter((t) => !t.startsWith('--'));
      baseImage = tokens[0] ?? '';
    } else if (upper.startsWith('COPY ') || upper.startsWith('ADD ')) {
      hasCopy = true;
    } else if (upper.startsWith('RUN ') && /cryptominer|ransom|malware/i.test(line)) {
      errors.push(`Dockerfile contains malicious layer: "${line}" (remove it!).`);
    } else if (upper.startsWith('EXPOSE ')) {
      const rawPort = (line.slice(7).trim().split(/\s+/)[0] ?? '0').replace(/\/(tcp|udp)$/i, '');
      exposePort = Number(rawPort) || 0;
    } else if (upper.startsWith('CMD ') || upper.startsWith('ENTRYPOINT ')) {
      cmdTarget = line.slice(upper.startsWith('ENTRYPOINT ') ? 11 : 4).trim();
    }
  }

  if (!baseImage) errors.push('Dockerfile is missing a FROM instruction.');
  else if (/99-vibe|hallucinat|broken/i.test(baseImage)) {
    errors.push(`Invalid base image "${baseImage}" in Dockerfile.`);
  }
  return { ok: errors.length === 0, baseImage, hasCopy, exposePort, cmdTarget, errors };
}

export interface DockerIo {
  cwd: string;
  readFile(relOrAbs: string): { ok: true; content: string; path: string } | { ok: false; error: string };
  readOptional(relOrAbs: string): string | null;
  findComposeFile(explicit?: string): { path: string; content: string } | null;
  projectName?(): string;
  validateDockerfile?(raw: string): { ok: boolean; baseImage: string; exposePort: number; errors: string[] };
}

export function createVfsDockerIo(opts: {
  cwd: () => VNode;
  isHidden?: (node: VNode) => boolean;
  projectName?: () => string;
  validateDockerfile?: (raw: string) => { ok: boolean; baseImage: string; exposePort: number; errors: string[] };
}): DockerIo {
  const readFile = (relOrAbs: string): { ok: true; content: string; path: string } | { ok: false; error: string } => {
    const res = resolve(opts.cwd(), relOrAbs, true);
    if (!res.node || opts.isHidden?.(res.node)) {
      return { ok: false, error: `${relOrAbs}: ${res.error ?? 'No such file or directory'}` };
    }
    if (res.node.kind !== 'file') return { ok: false, error: `${relOrAbs}: Not a regular file` };
    if ((res.node.mode & 0o400) === 0) return { ok: false, error: `${relOrAbs}: Permission denied` };
    return { ok: true, content: res.node.content, path: absPath(res.node) };
  };

  return {
    get cwd() {
      return absPath(opts.cwd());
    },
    readFile,
    readOptional(relOrAbs) {
      const r = readFile(relOrAbs);
      return r.ok ? r.content : null;
    },
    findComposeFile(explicit) {
      const candidates = explicit ? [explicit] : ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
      for (const cand of candidates) {
        const r = readFile(cand);
        if (r.ok) return { path: r.path, content: r.content };
      }
      return null;
    },
    projectName: opts.projectName,
    validateDockerfile: opts.validateDockerfile,
  };
}

export function dockerUsage(): string {
  return [
    'Usage: docker <command> [options]',
    '',
    'Commands:',
    '  ps [-a]                       List running (or all) containers',
    '  images                        List local Docker images',
    '  build [-t <tag>] [.]          Build an image from a Dockerfile',
    '  run [-d] [-p h:c] <image>     Run a container',
    '  logs [--tail N] <container>   Fetch logs of a container',
    '  start|stop|restart <target>   Manage container lifecycle',
    '  rm [-f] <container>           Remove a container',
    '  rmi <image>                   Remove an image',
    '  inspect <container>           Display container JSON summary',
    '  stats [--no-stream]           Show resource usage snapshot',
    '  prune / system prune [-af]    Remove stopped containers and unused data',
    '  up / down / compose <subcmd>  Manage multi-container stacks (up, down, ps, logs, build, top, prune)',
    '',
  ].join('\n');
}

export function buildServiceLogs(svcName: string, image: string, oomFault: boolean, limitMb?: number): string[] {
  if (oomFault) {
    return [
      `Starting ${svcName} (${image}) ...`,
      `JVM heap cap: -Xmx${limitMb ?? 64}m`,
      `FATAL java.lang.OutOfMemoryError: Java heap space`,
      `  at io.cluster.cache.SessionStore.allocate(SessionStore.java:142)`,
      `Kernel cgroup OOM killer invoked: Exit 137 (OOMKilled)`,
    ];
  }
  return [
    `Starting ${svcName} (${image}) ...`,
    `${svcName} initialized cleanly; readiness probe passing (200 OK).`,
  ];
}
