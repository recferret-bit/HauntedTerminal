import {
  buildServiceLogs,
  createVfsDockerIo,
  dockerUsage,
  evaluateComposeRuntime,
  parseComposeFile,
  parseDockerfileBasic,
  validateDockerCompose,
  type DockerIo,
} from './docker-compose-eval.js';

export { createVfsDockerIo, type DockerIo };

export interface BuiltImage {
  tag: string;
  baseImage: string;
  exposePort: number;
}

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  service?: string;
  project?: string;
  ports: string;
  status: 'running' | 'exited';
  statusText: string;
  exitCode: number;
  oomKilled: boolean;
  logs: string[];
}

export interface DockerState {
  images: Map<string, BuiltImage>;
  containers: DockerContainer[];
  composeHealthyServices: string[];
  composeProject: string;
  volumes: string[];
  nextSeq: number;
}

export type DockerComposeOutcome =
  | { kind: 'up-healthy'; services: string[]; composePath: string }
  | { kind: 'up-oom'; services: string[]; oomServices: string[]; composePath: string; containers: DockerContainer[] }
  | { kind: 'down' }
  | { kind: 'prune'; removedContainers: number; removedImages: number; removedVolumes: number };

export interface DockerCliOutcome {
  stdout: string;
  stderr: string;
  code: number;
  builtImage?: BuiltImage;
  composeResult?: DockerComposeOutcome;
}

export function createDockerState(project = 'stack'): DockerState {
  return {
    images: new Map(),
    containers: [],
    composeHealthyServices: [],
    composeProject: project,
    volumes: ['pg_data'],
    nextSeq: 1,
  };
}

function nextShortId(state: DockerState, prefix: string): string {
  const n = state.nextSeq;
  state.nextSeq += 1;
  return `${prefix}${n.toString(16).padStart(7, '0')}`;
}

function findContainer(state: DockerState, target: string): DockerContainer | undefined {
  return state.containers.find((c) => c.name === target || c.id.startsWith(target) || c.service === target);
}

function formatPsTable(containers: readonly DockerContainer[], showAll: boolean): string {
  const list = showAll ? containers : containers.filter((c) => c.status === 'running');
  if (list.length === 0) return 'CONTAINER ID   IMAGE              COMMAND                  STATUS                   PORTS                    NAMES\n';
  const rows = list.map((c) => {
    const id = c.id.padEnd(12);
    const img = c.image.slice(0, 18).padEnd(18);
    const cmd = `"${c.service ? `start-${c.service}` : 'entrypoint'}"`.padEnd(24);
    const st = c.statusText.slice(0, 24).padEnd(24);
    const ports = (c.ports || '-').slice(0, 24).padEnd(24);
    return `${id}   ${img} ${cmd} ${st} ${ports} ${c.name}`;
  });
  return `CONTAINER ID   IMAGE              COMMAND                  STATUS                   PORTS                    NAMES\n${rows.join('\n')}\n`;
}

function parseLogsArgs(args: string[]): { target?: string; tail?: number } {
  let tail: number | undefined;
  let target: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (a === '--tail' || a === '-n') {
      const n = Number(args[i + 1]);
      if (Number.isFinite(n) && n >= 0) tail = Math.floor(n);
      i += 1;
    } else if (a.startsWith('--tail=')) {
      const n = Number(a.slice(7));
      if (Number.isFinite(n) && n >= 0) tail = Math.floor(n);
    } else if (a === '--since' || a === '--until') {
      i += 1;
    } else if (!a.startsWith('-') && !target) {
      target = a;
    }
  }
  return { target, tail };
}

function firstPositional(args: string[], valueFlags: ReadonlySet<string>): { value: string | undefined; index: number } {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (valueFlags.has(a)) { i += 1; continue; }
    if (!a.startsWith('-')) return { value: a, index: i };
  }
  return { value: undefined, index: -1 };
}

function runDockerBuild(state: DockerState, args: string[], io: DockerIo): DockerCliOutcome {
  let tag = 'app:latest';
  let path = '.';
  let dfOverride = '';
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (a === '-t' || a === '--tag') {
      tag = args[i + 1] ?? '';
      i += 1;
    } else if (a === '-f' || a === '--file') {
      dfOverride = args[i + 1] ?? '';
      i += 1;
    } else if (a === '--build-arg' || a === '--target' || a === '--platform') {
      i += 1;
    } else if (!a.startsWith('-')) {
      path = a;
    }
  }
  if (!tag) return { stdout: '', stderr: 'docker build: missing image tag after -t\n', code: 1 };
  const dfPath = dfOverride || (path === '.' ? 'Dockerfile' : `${path.replace(/\/+$/, '')}/Dockerfile`);
  const read = io.readFile(dfPath);
  if (!read.ok) {
    const fallback = dfOverride ? read : io.readFile('Dockerfile');
    if (!fallback.ok) return { stdout: '', stderr: `docker build: cannot open ${dfPath}: no such file\n`, code: 1 };
    return runDockerBuildOnRaw(state, tag, fallback.content, io);
  }
  return runDockerBuildOnRaw(state, tag, read.content, io);
}

function runDockerBuildOnRaw(state: DockerState, tag: string, raw: string, io: DockerIo): DockerCliOutcome {
  const parsed = io.validateDockerfile ? io.validateDockerfile(raw) : parseDockerfileBasic(raw);
  if (!parsed.ok) {
    return {
      stdout: '',
      stderr: `[docker build] FAILED for ${tag}:\n${parsed.errors.map((e) => `  x ${e}`).join('\n')}\n`,
      code: 1,
    };
  }
  const built: BuiltImage = { tag, baseImage: parsed.baseImage, exposePort: parsed.exposePort };
  state.images.set(tag, built);
  return {
    stdout: [
      `#1 [internal] load build definition from Dockerfile`,
      `#2 [1/2] FROM ${parsed.baseImage}`,
      `#3 [2/2] COPY . /app`,
      `#4 exporting to image -> naming to docker.io/library/${tag}`,
      `Built ${tag} (EXPOSE ${parsed.exposePort || 'none'})`,
      '',
    ].join('\n'),
    stderr: '',
    code: 0,
    builtImage: built,
  };
}

function runDockerRun(state: DockerState, args: string[]): DockerCliOutcome {
  let portMap = '';
  let name = '';
  let image = '';
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i]!;
    if (a === '-p' || a === '--publish') {
      portMap = args[i + 1] ?? '';
      i += 1;
    } else if (a === '--name') {
      name = args[i + 1] ?? '';
      i += 1;
    } else if (a === '-e' || a === '--env' || a === '-v' || a === '--volume' || a === '-w' || a === '--workdir' || a === '--entrypoint' || a === '-m' || a === '--memory' || a === '--cpus' || a === '--network') {
      i += 1;
    } else if (a === '-d' || a === '--detach' || a === '--rm') {
      continue;
    } else if (!a.startsWith('-')) {
      image = a;
      break;
    }
  }
  if (!image) return { stdout: '', stderr: 'usage: docker run -d -p <host>:<container> <image>\n', code: 1 };
  const built = state.images.get(image);
  const stockKnown = /^(alpine|nginx|postgres|redis|node|eclipse-temurin)/i.test(image);
  if (!built && !stockKnown) {
    return { stdout: '', stderr: `docker: Unable to find image '${image}' locally. Run 'docker build -t ${image} .' first.\n`, code: 1 };
  }
  if (built && built.exposePort > 0) {
    const containerPort = Number((portMap.split(':').pop() ?? '0').replace(/\/(tcp|udp)$/i, ''));
    if (containerPort !== built.exposePort) {
      return {
        stdout: '',
        stderr: `docker: port mismatch "${portMap || '(none)'}" — image ${image} exposes port ${built.exposePort} (use -p ${built.exposePort}:${built.exposePort}).\n`,
        code: 1,
      };
    }
  }
  const id = nextShortId(state, 'c');
  const cname = name || `${image.replace(/[^a-z0-9]/gi, '_')}_${state.nextSeq}`;
  const ports = portMap ? `0.0.0.0:${portMap}/tcp` : built?.exposePort ? `${built.exposePort}/tcp` : '-';
  state.containers.push({
    id,
    name: cname,
    image,
    ports,
    status: 'running',
    statusText: 'Up 1 second (healthy)',
    exitCode: 0,
    oomKilled: false,
    logs: [`[${cname}] listening on ${ports}`],
  });
  return { stdout: `${id} (${cname} -> ${ports})\n`, stderr: '', code: 0 };
}

function runDockerPrune(state: DockerState, includeAll: boolean, includeVolumes: boolean): DockerCliOutcome {
  const beforeC = state.containers.length;
  state.containers = state.containers.filter((c) => c.status === 'running');
  const removedContainers = beforeC - state.containers.length;

  let removedImages = 0;
  if (includeAll) {
    const inUse = new Set(state.containers.map((c) => c.image));
    for (const tag of Array.from(state.images.keys())) {
      if (!inUse.has(tag)) {
        state.images.delete(tag);
        removedImages += 1;
      }
    }
  }

  let removedVolumes = 0;
  if (includeVolumes) {
    const activeProject = state.containers.some((c) => c.status === 'running');
    if (!activeProject && state.volumes.length > 0) {
      removedVolumes = state.volumes.length;
      state.volumes = [];
    }
  }

  return {
    stdout: [
      `Deleted Containers: ${removedContainers}`,
      `Deleted Images: ${removedImages}`,
      `Deleted Volumes: ${removedVolumes}`,
      `Total reclaimed space: ${(removedContainers * 48 + removedImages * 112 + removedVolumes * 24)}MB`,
      '',
    ].join('\n'),
    stderr: '',
    code: 0,
    composeResult: { kind: 'prune', removedContainers, removedImages, removedVolumes },
  };
}

function resetComposeProject(state: DockerState, io: DockerIo): string {
  const project = state.composeProject || io.projectName?.() || 'stack';
  state.containers = state.containers.filter((c) => c.project !== project);
  return project;
}

function recordComposeContainer(
  state: DockerState,
  project: string,
  name: string,
  svc: { containerName: string; image: string; ports: string[] },
  fault: { limitMb: number } | null,
  oomMode: boolean,
): DockerContainer {
  const image = svc.image || `${name}:latest`;
  const ports = svc.ports[0] ? `0.0.0.0:${svc.ports[0]}` : '-';
  const container: DockerContainer = {
    id: nextShortId(state, oomMode ? 'k' : 'c'),
    name: svc.containerName || `${project}-${name}-1`,
    image,
    service: name,
    project,
    ports,
    status: oomMode ? 'exited' : 'running',
    statusText: oomMode ? (fault ? 'Exited (137) OOMKilled' : 'Exited (143) Aborted') : 'Up 1 second (healthy)',
    exitCode: oomMode ? (fault ? 137 : 143) : 0,
    oomKilled: Boolean(fault),
    logs: buildServiceLogs(name, image, Boolean(fault), fault?.limitMb),
  };
  state.containers.push(container);
  return container;
}

function runComposeUp(state: DockerState, args: string[], io: DockerIo, composePathOverride?: string): DockerCliOutcome {
  const wantBuild = args.includes('--build');
  const compose = io.findComposeFile(composePathOverride);
  if (!compose) {
    return { stdout: '', stderr: 'no configuration file provided: docker-compose.yml not found\n', code: 1 };
  }

  const parsed = parseComposeFile(compose.content);
  if (wantBuild) {
    for (const [name, svc] of parsed.services.entries()) {
      if (svc.build) {
        const df = io.readOptional(`${svc.build.replace(/\/+$/, '')}/Dockerfile`) ?? io.readOptional('Dockerfile');
        if (df) {
          const b = runDockerBuildOnRaw(state, svc.image || `${name}:latest`, df, io);
          if (b.code !== 0) return b;
        }
      }
    }
  }

  const validation = validateDockerCompose(compose.content);
  if (!validation.ok) {
    state.composeHealthyServices = [];
    return {
      stdout: '',
      stderr: `Compose validation failed (${compose.path}):\n${validation.errors.map((e) => `  x ${e}`).join('\n')}\n`,
      code: 1,
    };
  }

  const project = resetComposeProject(state, io);
  for (const svc of parsed.services.values()) {
    const tag = svc.image || `${project}-${svc.name}:latest`;
    if (!state.images.has(tag)) {
      state.images.set(tag, { tag, baseImage: tag, exposePort: 0 });
    }
  }

  const runtime = evaluateComposeRuntime(compose.content);
  const serviceNames = Array.from(parsed.services.keys());
  const created: DockerContainer[] = [];

  if (!runtime.ok) {
    const oomMap = new Map(runtime.faults.map((f) => [f.service, f]));
    const banner = [`[+] Running ${serviceNames.length}/${serviceNames.length}`, ` - Network ${project}_default  Created`];
    for (const [name, svc] of parsed.services.entries()) {
      const container = recordComposeContainer(state, project, name, svc, oomMap.get(name) ?? null, true);
      created.push(container);
      banner.push(` - Container ${container.name}  Started`);
    }
    state.composeHealthyServices = [];
    const faultLines = runtime.faults.map((f) => `! ${f.service} exited with code 137 (OOMKilled): ${f.reason}`);
    return {
      stdout: `${banner.join('\n')}\n\n[COMPOSE RUNTIME CRASH]\n`,
      stderr: `${faultLines.join('\n')}\nStack crashed under startup load. Inspect logs or raise JVM heap / mem_limit (>= 256m) and retry.\n`,
      code: 1,
      composeResult: { kind: 'up-oom', services: serviceNames, oomServices: runtime.faults.map((f) => f.service), composePath: compose.path, containers: created },
    };
  }

  const lines = [`[+] Running ${serviceNames.length}/${serviceNames.length}`, ` - Network ${project}_default  Created`];
  for (const [name, svc] of parsed.services.entries()) {
    const container = recordComposeContainer(state, project, name, svc, null, false);
    lines.push(` - Container ${container.name}  Healthy`);
  }
  state.composeHealthyServices = serviceNames;
  return {
    stdout: `${lines.join('\n')}\nCompose stack online [${serviceNames.join(' -> ')}]\n`,
    stderr: '',
    code: 0,
    composeResult: { kind: 'up-healthy', services: serviceNames, composePath: compose.path },
  };
}

function runDockerCompose(state: DockerState, rawArgs: string[], io: DockerIo): DockerCliOutcome {
  let fileOverride: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < rawArgs.length; i += 1) {
    const a = rawArgs[i]!;
    if ((a === '-f' || a === '--file') && rest.length === 0) {
      fileOverride = rawArgs[i + 1];
      i += 1;
    } else {
      rest.push(a);
    }
  }
  const sub = rest[0] ?? 'help';
  const subArgs = rest.slice(1);
  if (sub === 'help' || sub === '--help' || sub === '-h') {
    return {
      stdout: 'usage: docker compose [-f <file>] <up [-d] [--build] | down [-v] | ps [-a] | build | logs [svc] | top | restart | prune>\n',
      stderr: '',
      code: 0,
    };
  }
  if (sub === 'up') return runComposeUp(state, subArgs, io, fileOverride);
  if (sub === 'down') {
    const project = resetComposeProject(state, io);
    state.composeHealthyServices = [];
    if (subArgs.includes('-v') || subArgs.includes('--volumes')) state.volumes = [];
    return { stdout: `[+] Stopped and removed compose containers for ${project}\n`, stderr: '', code: 0, composeResult: { kind: 'down' } };
  }
  if (sub === 'ps') {
    const project = state.composeProject || io.projectName?.() || 'stack';
    const list = state.containers.filter((c) => c.project === project || c.service);
    return { stdout: formatPsTable(list, subArgs.includes('-a') || list.some((c) => c.oomKilled)), stderr: '', code: 0 };
  }
  if (sub === 'logs') {
    const { target: svc, tail } = parseLogsArgs(subArgs);
    const targets = state.containers.filter((c) => c.service && (!svc || c.service === svc));
    if (targets.length === 0) return { stdout: '', stderr: 'no compose container logs recorded yet\n', code: 1 };
    const out = targets
      .map((c) => (tail !== undefined ? c.logs.slice(-tail) : c.logs).map((l) => `${c.name} | ${l}`).join('\n'))
      .join('\n');
    return { stdout: `${out}\n`, stderr: '', code: 0 };
  }
  if (sub === 'top') {
    const { value: svc } = firstPositional(subArgs, new Set());
    const running = state.containers.filter((c) => c.service && c.status === 'running' && (!svc || c.service === svc));
    if (running.length === 0) return { stdout: '', stderr: 'no running compose containers\n', code: 1 };
    const blocks = running.map((c) => `${c.name}\nPID   USER   TIME   COMMAND\n101   root   0:01   start-${c.service}`);
    return { stdout: `${blocks.join('\n')}\n`, stderr: '', code: 0 };
  }
  if (sub === 'build') {
    const compose = io.findComposeFile(fileOverride);
    if (!compose) return { stdout: '', stderr: 'no compose file found\n', code: 1 };
    const df = io.readOptional('Dockerfile');
    if (df) return runDockerBuildOnRaw(state, `${state.composeProject || 'stack'}:latest`, df, io);
    return { stdout: 'Compose services use prebuilt registry images; nothing to build.\n', stderr: '', code: 0 };
  }
  if (sub === 'config') {
    const compose = io.findComposeFile(fileOverride);
    if (!compose) return { stdout: '', stderr: 'no compose file found\n', code: 1 };
    const v = validateDockerCompose(compose.content);
    if (!v.ok) return { stdout: '', stderr: `${v.errors.join('\n')}\n`, code: 1 };
    return { stdout: compose.content.endsWith('\n') ? compose.content : `${compose.content}\n`, stderr: '', code: 0 };
  }
  if (sub === 'stop' || sub === 'start' || sub === 'restart') {
    if (sub === 'restart') return runComposeUp(state, ['-d'], io, fileOverride);
    if (sub === 'start') {
      const hasCompose = state.containers.some((c) => c.service);
      if (!hasCompose) return { stdout: '', stderr: 'no compose containers to start; run docker compose up first\n', code: 1 };
      return runComposeUp(state, ['-d'], io, fileOverride);
    }
    for (const c of state.containers) {
      if (!c.service) continue;
      c.status = 'exited';
      c.statusText = 'Exited (0) Stopped';
      c.exitCode = 0;
    }
    state.composeHealthyServices = [];
    return { stdout: 'compose stop: ok\n', stderr: '', code: 0 };
  }
  if (sub === 'rm') {
    if (subArgs.includes('-s') || subArgs.includes('--stop')) {
      for (const c of state.containers) {
        if (c.service) { c.status = 'exited'; c.statusText = 'Exited (0) Stopped'; }
      }
      state.composeHealthyServices = [];
    }
    state.containers = state.containers.filter((c) => !c.service || (c.status === 'running' && !subArgs.includes('-f')));
    return { stdout: 'Removed stopped compose containers.\n', stderr: '', code: 0 };
  }
  if (sub === 'prune') return runDockerPrune(state, subArgs.includes('-a'), subArgs.includes('--volumes'));
  if (sub === 'images') return runDockerCli(state, ['images'], io);
  return { stdout: '', stderr: `docker compose: unknown subcommand '${sub}'\n`, code: 1 };
}

export function runDockerCli(state: DockerState, args: string[], io: DockerIo): DockerCliOutcome {
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h' || args[0] === 'help') {
    return { stdout: dockerUsage(), stderr: '', code: 0 };
  }
  const sub = args[0]!;
  const rest = args.slice(1);
  if (sub === 'compose') return runDockerCompose(state, rest, io);
  if (sub === 'up') return runDockerCompose(state, ['up', ...rest], io);
  if (sub === 'down') return runDockerCompose(state, ['down', ...rest], io);
  if (sub === 'build') return runDockerBuild(state, rest, io);
  if (sub === 'run') return runDockerRun(state, rest);
  if (sub === 'ps') return { stdout: formatPsTable(state.containers, rest.includes('-a') || rest.includes('--all')), stderr: '', code: 0 };
  if (sub === 'images') {
    const imgs = Array.from(state.images.values());
    if (imgs.length === 0) return { stdout: 'REPOSITORY   TAG       IMAGE ID       CREATED        SIZE\n(none)\n', stderr: '', code: 0 };
    const rows = imgs.map((i) => {
      const [repo, tag = 'latest'] = i.tag.split(':');
      return `${repo!.padEnd(18)} ${tag.padEnd(10)} a9b2c1d4   Just now   128MB`;
    });
    return { stdout: `REPOSITORY         TAG        IMAGE ID   CREATED    SIZE\n${rows.join('\n')}\n`, stderr: '', code: 0 };
  }
  if (sub === 'prune') return runDockerPrune(state, rest.includes('-a') || rest.includes('--all'), rest.includes('--volumes'));
  if (sub === 'system' && rest[0] === 'prune') {
    return runDockerPrune(state, rest.includes('-a') || rest.includes('--all'), rest.includes('--volumes'));
  }
  if ((sub === 'container' || sub === 'image' || sub === 'volume') && rest[0] === 'prune') {
    return runDockerPrune(state, sub === 'image' || rest.includes('-a'), sub === 'volume');
  }
  if (sub === 'logs') {
    const { target, tail } = parseLogsArgs(rest);
    if (!target) return { stdout: '', stderr: 'usage: docker logs <container>\n', code: 1 };
    const c = findContainer(state, target);
    if (!c) return { stdout: '', stderr: `Error response from daemon: No such container: ${target}\n`, code: 1 };
    const lines = tail !== undefined ? c.logs.slice(-tail) : c.logs;
    return { stdout: `${lines.join('\n')}\n`, stderr: '', code: 0 };
  }
  if (sub === 'stop' || sub === 'start' || sub === 'restart') {
    const target = rest[0];
    if (!target) return { stdout: '', stderr: `usage: docker ${sub} <container>\n`, code: 1 };
    const c = findContainer(state, target);
    if (!c) return { stdout: '', stderr: `Error response from daemon: No such container: ${target}\n`, code: 1 };
    if (sub === 'stop') {
      c.status = 'exited';
      c.statusText = 'Exited (0) Stopped';
      c.exitCode = 0;
      state.composeHealthyServices = state.composeHealthyServices.filter((s) => s !== c.service);
    } else if (c.oomKilled) {
      return {
        stdout: '',
        stderr: `Error response from daemon: Cannot ${sub} ${c.name}: exited with code 137 (OOMKilled). Fix memory limit and run 'docker compose up'.\n`,
        code: 1,
      };
    } else {
      c.status = 'running';
      c.statusText = 'Up 1 second (healthy)';
      c.exitCode = 0;
    }
    return { stdout: `${c.name}\n`, stderr: '', code: 0 };
  }
  if (sub === 'rm') {
    const force = rest.includes('-f') || rest.includes('--force');
    const targets = rest.filter((a) => !a.startsWith('-'));
    if (targets.length === 0) return { stdout: '', stderr: 'usage: docker rm [-f] <container>\n', code: 1 };
    const removed: string[] = [];
    for (const t of targets) {
      const c = findContainer(state, t);
      if (!c) return { stdout: '', stderr: `Error response from daemon: No such container: ${t}\n`, code: 1 };
      if (c.status === 'running' && !force) {
        return { stdout: '', stderr: `You cannot remove a running container ${c.name}. Stop it or use -f.\n`, code: 1 };
      }
      state.containers = state.containers.filter((x) => x.id !== c.id);
      removed.push(c.name);
    }
    return { stdout: `${removed.join('\n')}\n`, stderr: '', code: 0 };
  }
  if (sub === 'rmi') {
    const target = rest.find((a) => !a.startsWith('-'));
    if (!target) return { stdout: '', stderr: 'usage: docker rmi <image>\n', code: 1 };
    if (!state.images.delete(target)) return { stdout: '', stderr: `Error: No such image: ${target}\n`, code: 1 };
    return { stdout: `Untagged: ${target}\n`, stderr: '', code: 0 };
  }
  if (sub === 'inspect') {
    const target = rest[0];
    const c = target ? findContainer(state, target) : undefined;
    if (!c) return { stdout: '', stderr: `Error: No such object: ${target ?? ''}\n`, code: 1 };
    return {
      stdout: `${JSON.stringify([{ Id: c.id, Name: `/${c.name}`, State: { Status: c.status, ExitCode: c.exitCode, OOMKilled: c.oomKilled } }], null, 2)}\n`,
      stderr: '',
      code: 0,
    };
  }
  if (sub === 'stats') {
    const list = state.containers.filter((c) => c.status === 'running');
    const rows = list.map((c) => `${c.id.padEnd(10)} ${c.name.padEnd(24)} 1.2%    184MiB / 512MiB`);
    return { stdout: `CONTAINER  NAME                     CPU %   MEM USAGE / LIMIT\n${rows.join('\n')}\n`, stderr: '', code: 0 };
  }
  if (sub === 'exec') {
    const { value: target, index: idx } = firstPositional(rest, new Set(['-u', '--user', '-w', '--workdir', '-e', '--env']));
    const c = target ? findContainer(state, target) : undefined;
    if (!c) return { stdout: '', stderr: `Error: No such container: ${target ?? ''}\n`, code: 1 };
    if (c.status !== 'running') return { stdout: '', stderr: `Error response from daemon: Container ${c.name} is not running\n`, code: 1 };
    const inner = rest.slice(idx + 1).join(' ');
    return { stdout: `[${c.name}] executed: ${inner || 'sh'}\n`, stderr: '', code: 0 };
  }
  return { stdout: '', stderr: `docker: '${sub}' is not a docker command. See 'docker --help'.\n`, code: 1 };
}
