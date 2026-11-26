import type { MotherboardBlock, MotherboardChannel, MotherboardTopology } from './chapter-map-model.js';
import type { MapSparkState } from './chapter-map-sparks.js';
import { el, setText } from './dom-lite.js';

function makeClasses(prefix: string, items: readonly string[]): HTMLElement[] {
  return items.map((s) => el('span', `${prefix} ${s}`));
}

function makeRepeated(cls: string, count: number): HTMLElement[] {
  return Array.from({ length: count }, () => el('span', cls));
}

function makeLed(cls: string): HTMLElement {
  return el('span', `cm-ind-led ${cls}`);
}

function hiddenBay(cls: string, title: string, leds: readonly HTMLElement[], body: HTMLElement): HTMLElement {
  const head = el('div', 'cm-hw-title', [
    el('span', '', [title]),
    el('span', 'cm-hw-leds', [...leds]),
  ]);
  const bay = el('div', `cm-hw-bay ${cls}`, [head, body]);
  bay.setAttribute('aria-hidden', 'true');
  return bay;
}

function formatPostCode(selected: MotherboardBlock): string {
  const hex = selected.level.index.toString(16).toUpperCase();
  return selected.status === 'current' ? `C${hex.slice(-1)}` : hex.padStart(2, '0');
}

function buildCurrentBeacon(): HTMLElement {
  const reticles = makeClasses('cm-reticle', ['tl', 'tr', 'bl', 'br']);
  const oscBars = makeRepeated('cm-osc-bar', 4);
  const badge = el('div', 'cm-here-badge', [
    el('span', 'cm-here-radar', [el('span', 'cm-here-dot'), el('span', 'cm-here-ring')]),
    el('span', 'cm-here-text', ['LOC // ACTIVE']),
    el('span', 'cm-osc-bars', oscBars),
  ]);
  return el('div', 'cm-current-fx', [
    el('span', 'cm-current-halo'),
    ...reticles,
    badge,
    el('div', 'cm-scan-mask', [el('span', 'cm-scanbeam')]),
  ]);
}

function buildPcbBackdropDecor(): HTMLElement {
  const decor = el('div', 'cm-pcb-decor', [
    ...makeClasses('cm-fid', ['tl', 'tr', 'bl', 'br']),
    el('span', 'cm-via-cluster va', makeRepeated('cm-via', 6)),
    el('span', 'cm-via-cluster vb', makeRepeated('cm-via', 6)),
  ]);
  decor.setAttribute('aria-hidden', 'true');
  return decor;
}

function buildVrmPowerBay(topo: MotherboardTopology): HTMLElement {
  const leds = [makeLed('amber pulse-a'), makeLed('yellow fast-a'), makeLed('teal tx-a')];
  const body = el('div', 'cm-hw-row', [
    el('div', 'cm-atx-wrap', [
      el('div', 'cm-atx-header', makeRepeated('cm-atx-pin', 12)),
      el('span', 'cm-hw-cap', ['ATX_24P']),
    ]),
    el('div', 'cm-cmos-battery', [
      el('span', 'cm-cmos-clip'),
      el('span', 'cm-cmos-plus', ['+']),
      el('span', 'cm-cmos-code', ['CR2032']),
      el('span', 'cm-cmos-volt', [topo.clearedCount > 0 ? '3.0V' : '2.9V']),
    ]),
    el('div', 'cm-vrm-bank', [
      el('div', 'cm-vrm-caps', makeRepeated('cm-cap', 3)),
      el('span', 'cm-xtal', ['66.6MHz']),
    ]),
  ]);
  return hiddenBay('cm-hw-vrm', 'VRM_12V // CMOS', leds, body);
}

function buildDimmPostBay(topo: MotherboardTopology, selected: MotherboardBlock): HTMLElement {
  const postCode = formatPostCode(selected);
  const leds = [makeLed('red rx-a'), makeLed('yellow tx-b')];
  const slots = ['DIMM_A0', 'DIMM_A1', 'DIMM_B0', 'DIMM_B1'].map((label, k) => {
    const lit = k === 0 || topo.clearedCount >= k * 3;
    const ledCls = lit ? (k % 2 === 0 ? 'teal fast-b' : 'yellow tx-a') : 'dim standby';
    return el('div', `cm-dimm-slot${lit ? ' populated' : ''}`, [
      el('span', 'cm-dimm-latch'),
      el('span', 'cm-dimm-bar', [label]),
      makeLed(`cm-dimm-led ${ledCls}`),
      el('span', 'cm-dimm-latch'),
    ]);
  });
  const body = el('div', 'cm-hw-row', [
    el('div', 'cm-dimm-slots', slots),
    el('div', 'cm-post-box', [
      el('div', 'cm-post-top', [
        el('div', 'cm-post-digits', [postCode]),
        makeLed('cm-post-led red fast-a'),
      ]),
      el('div', 'cm-post-telemetry', [
        el('span', 'cm-tel-pill', ['5.0V']),
        el('span', 'cm-tel-pill ok', [topo.clearedCount > 0 ? 'IRQ_OK' : 'POST_OK']),
      ]),
    ]),
  ]);
  return hiddenBay('cm-hw-dimm', 'DIMM // BIOS POST', leds, body);
}

function buildPciStorageBay(topo: MotherboardTopology): HTMLElement {
  const leds = [makeLed('yellow hdd'), makeLed('teal pulse-b')];
  const secondActive = topo.clearedCount >= 4;
  const slots = [
    el('div', 'cm-pci-slot active', [
      el('span', 'cm-pci-fingers'),
      el('span', 'cm-pci-tag', ['PCIe_x16 // TENSOR']),
      makeLed('cm-pci-led yellow tx-a'),
    ]),
    el('div', `cm-pci-slot${secondActive ? ' active' : ''}`, [
      el('span', 'cm-pci-fingers'),
      el('span', 'cm-pci-tag', ['ISA_16 // DMA_CH0']),
      makeLed(`cm-pci-led ${secondActive ? 'teal rx-a' : 'dim standby'}`),
    ]),
  ];
  const body = el('div', 'cm-pci-wrap', [
    el('div', 'cm-pci-slots', slots),
    el('div', 'cm-m2-heatsink', [
      el('span', 'cm-m2-fins'),
      el('span', 'cm-m2-label', ['M.2_NVME // SWAP_0']),
      makeLed('cm-nvme-led amber hdd'),
    ]),
  ]);
  return hiddenBay('cm-hw-pci', 'PCI_BUS // NVMe', leds, body);
}

function buildFanDipBay(topo: MotherboardTopology): HTMLElement {
  const leds = [makeLed('teal fast-b'), makeLed('amber rx-a')];
  const switches = [0, 1, 2, 3].map((idx) =>
    el('span', `cm-dip-sw${idx === 0 || topo.clearedCount >= idx * 3 ? ' on' : ''}`),
  );
  const fan = el('div', 'cm-fan-unit', [
    el('div', 'cm-fan-housing', [
      el('div', 'cm-fan-rotor', [
        ...makeRepeated('cm-fan-blade', 4),
        el('span', 'cm-fan-hub'),
      ]),
    ]),
    el('span', 'cm-hw-cap', [`${4600 + topo.clearedCount * 60} RPM`]),
  ]);
  const body = el('div', 'cm-hw-row', [
    fan,
    el('div', 'cm-dip-wrap', [
      el('div', 'cm-dip-switch', switches),
      el('span', 'cm-hw-cap', ['SW1_CLK']),
    ]),
    el('div', 'cm-piezo-wrap', [
      el('div', 'cm-piezo-spkr', [el('span', 'cm-piezo-hole')]),
      el('div', 'cm-piezo-foot', [makeLed('cm-piezo-led red pulse-a'), el('span', 'cm-hw-cap', ['IRQ'])]),
    ]),
  ]);
  return hiddenBay('cm-hw-fan', 'PWM_FAN // CLK', leds, body);
}

function markSparkWire(node: HTMLElement, mode: 'h' | 'v' | 'split-out' | 'split-in', state: MapSparkState): HTMLElement {
  node.dataset.sparkWire = mode;
  node.dataset.sparkState = state;
  node.dataset.baseSparkState = state;
  return node;
}

function boostState(base: MapSparkState): MapSparkState {
  if (base === 'active' || base === 'powered') return 'active';
  return 'powered';
}

function buildBlockButton(
  block: MotherboardBlock,
  selectedId: string,
  onSelect: (id: string) => void,
  onQuickDeploy: (id: string) => void,
): HTMLButtonElement {
  const { level, status, chipPackage, record, grants } = block;
  const selected = level.id === selectedId;
  const cls = `cm-block pkg-${level.mechanic} status-${status}${selected ? ' selected' : ''}`;
  const numText = `LVL ${String(level.index).padStart(2, '0')}`;
  const threatLabel =
    level.enemies.length > 0
      ? `${level.enemies.length} THREAT${level.enemies.length > 1 ? 'S' : ''}`
      : 'SAFE';
  const stateTag =
    status === 'current'
      ? '◉ ACTIVE'
      : status === 'cleared'
        ? `RANK ${record?.bestRank ?? 'S'}`
        : status === 'ready'
          ? `OPEN · ${threatLabel}`
          : 'LOCKED';
  const txCls =
    status === 'current'
      ? 'yellow fast-a'
      : status === 'cleared'
        ? 'teal tx-b'
        : status === 'ready'
          ? 'amber rx-a'
          : 'dim standby';

  const top = el('div', 'cm-block-top', [
    el('span', 'cm-led'),
    makeLed(`cm-led-tx ${txCls}`),
    el('span', 'cm-block-num', [numText]),
    el('span', 'cm-block-pkg', [chipPackage]),
  ]);
  const footChildren: (Node | string)[] = [el('span', `cm-block-state ${status}`, [stateTag])];
  if (grants.length > 0) footChildren.push(el('span', 'cm-block-grant', [grants[0]!]));

  const btn = el('button', cls, [
    el('span', 'cm-pins-l'),
    el('span', 'cm-pins-r'),
    ...(status === 'current' ? [buildCurrentBeacon()] : []),
    top,
    el('strong', 'cm-block-title', [level.title]),
    el('code', 'cm-block-cwd', [level.cwd]),
    el('div', 'cm-block-foot', footChildren),
  ]) as HTMLButtonElement;
  btn.type = 'button';
  btn.dataset.levelId = level.id;
  btn.dataset.levelIndex = String(level.index);
  btn.setAttribute('aria-pressed', selected ? 'true' : 'false');
  btn.setAttribute('aria-label', `${numText}: ${level.title} (${status})`);
  btn.onclick = () => onSelect(level.id);
  btn.ondblclick = () => onQuickDeploy(level.id);
  return btn;
}

function buildWire(
  label: string,
  fromId: string,
  toId: string,
  powered: boolean,
  toHub: boolean,
  activeFlow: boolean,
): HTMLElement {
  const sparkState: MapSparkState = activeFlow ? 'active' : powered ? 'powered' : 'standby';
  const line = markSparkWire(el('span', 'cm-wire-line'), 'h', sparkState);
  line.dataset.fromLevel = fromId;
  line.dataset.toLevel = toId;
  const cls = `cm-wire${powered ? ' powered' : ''}${toHub ? ' to-hub' : ''}${activeFlow ? ' active-flow' : ''}`;
  const wire = el('div', cls, [
    el('span', 'cm-wire-tag', [label]),
    line,
    el('span', 'cm-wire-arrow', ['>']),
  ]);
  wire.dataset.fromLevel = fromId;
  wire.dataset.toLevel = toId;
  return wire;
}

function buildChannelRow(
  channel: MotherboardChannel,
  selectedId: string,
  onSelect: (id: string) => void,
  onQuickDeploy: (id: string) => void,
): HTMLElement {
  const chState = channel.hasCurrent ? '◉ ACTIVE' : channel.powered ? 'ONLINE' : 'OFFLINE';
  const chCls = channel.hasCurrent ? ' active' : channel.powered ? ' online' : ' offline';
  const ledBank = el('span', 'cm-led-bank', [
    makeLed(channel.hasCurrent ? 'yellow fast-a' : channel.powered ? 'teal pulse-a' : 'red standby'),
    makeLed(channel.hasCurrent ? 'teal tx-a' : channel.powered ? 'yellow rx-a' : 'dim standby'),
    makeLed(channel.hasCurrent ? 'amber hdd' : channel.powered ? 'teal tx-b' : 'dim standby'),
  ]);
  const head = el('div', 'cm-channel-head', [
    ledBank,
    el('span', 'cm-channel-code', [channel.code]),
    el('span', 'cm-channel-bus', [channel.busLabel]),
    el('span', `cm-channel-state${chCls}`, [chState]),
  ]);

  const trackNodes: HTMLElement[] = [];
  channel.taskBlocks.forEach((b, i) => {
    if (i > 0) {
      const prev = channel.taskBlocks[i - 1]!;
      const wirePowered = channel.hasCurrent || b.status !== 'unknown' || prev.status !== 'unknown';
      const wireFlow = b.status === 'current' || prev.status === 'current' || (b.status !== 'unknown' && prev.status !== 'unknown');
      trackNodes.push(buildWire('BUS', prev.level.id, b.level.id, wirePowered, false, wireFlow));
    }
    trackNodes.push(buildBlockButton(b, selectedId, onSelect, onQuickDeploy));
  });
  if (channel.hubBlock) {
    if (channel.taskBlocks.length > 0) {
      const grantText = channel.hubBlock.coreGrant ?? 'UPGRADE';
      const lastTask = channel.taskBlocks[channel.taskBlocks.length - 1]!;
      const hubPowered = channel.hasCurrent || channel.hubBlock.status !== 'unknown' || lastTask.status !== 'unknown';
      const hubFlow = channel.hubBlock.status === 'current' || lastTask.status === 'current';
      trackNodes.push(buildWire(grantText, lastTask.level.id, channel.hubBlock.level.id, hubPowered, true, hubFlow));
    }
    trackNodes.push(buildBlockButton(channel.hubBlock, selectedId, onSelect, onQuickDeploy));
  }

  const track = el('div', 'cm-channel-track', trackNodes);
  return el('section', `cm-channel${channel.powered ? ' powered' : ' unpowered'}${channel.hasCurrent ? ' has-current' : ''}`, [
    head,
    track,
  ]);
}

function buildBusBridge(merge: boolean, active: boolean): HTMLElement {
  const sparkState: MapSparkState = active ? 'active' : 'powered';
  const stem = markSparkWire(el('span', 'cm-bus-stem'), 'v', sparkState);
  const rail = markSparkWire(el('span', 'cm-bus-rail'), merge ? 'split-in' : 'split-out', sparkState);
  const ledL = makeLed(`cm-bridge-led ${active ? 'yellow fast-b' : 'amber pulse-a'}`);
  const ledC = makeLed(`cm-bridge-center ${active ? 'yellow hdd' : 'teal tx-b'}`);
  const ledR = makeLed(`cm-bridge-led ${active ? 'teal tx-a' : 'yellow rx-a'}`);
  const railRow = el('div', 'cm-bus-rail-row', [ledL, rail, ledC, ledR]);
  return el('div', `cm-bus-bridge${merge ? ' merge' : ''}${active ? ' active-flow' : ''}`, merge ? [railRow, stem] : [stem, railRow]);
}

function buildDeckFeeder(side: 'left' | 'right', active: boolean): HTMLElement {
  const sparkState: MapSparkState = active ? 'active' : 'powered';
  const trace = markSparkWire(el('span', 'cm-deck-trace'), 'h', sparkState);
  return el('div', `cm-deck-wire ${side}${active ? ' active-flow' : ''}`, [trace]);
}

function buildTrunkRail(
  side: 'left' | 'right',
  channels: readonly MotherboardChannel[],
  state: MapSparkState,
): HTMLElement {
  const leds = channels.map((ch, idx) => {
    const cls = ch.hasCurrent
      ? side === 'left'
        ? 'yellow fast-a'
        : 'yellow hdd'
      : ch.powered
        ? side === 'left'
          ? 'teal tx-a'
          : 'yellow rx-a'
        : side === 'left'
          ? idx % 2 === 0
            ? 'amber pulse-a'
            : 'yellow tx-b'
          : idx % 2 === 0
            ? 'red pulse-b'
            : 'amber rx-a';
    return el('span', 'cm-trunk-node', [makeLed(`cm-trunk-led ${cls}`)]);
  });
  const rail = markSparkWire(el('span', `cm-trunk-rail ${side}`, leds), 'v', state);
  rail.setAttribute('aria-hidden', 'true');
  return rail;
}

/** Builds the complete motherboard PCB DOM tree for `#cm-board`. */
export function buildBoardNodes(
  topo: MotherboardTopology,
  selectedId: string,
  onSelect: (id: string) => void,
  onQuickDeploy: (id: string) => void,
): HTMLElement[] {
  const { manifest, bootBlock, channels, coreBlocks } = topo;
  const selectedBlock = topo.orderedBlocks.find((b) => b.level.id === selectedId) ?? topo.orderedBlocks[0]!;
  const nodes: HTMLElement[] = [
    buildPcbBackdropDecor(),
    el('span', 'cm-screw tl'),
    el('span', 'cm-screw tr'),
    el('span', 'cm-screw bl'),
    el('span', 'cm-screw br'),
  ];

  if (bootBlock) {
    const bootActive = bootBlock.status === 'current' || bootBlock.status === 'cleared';
    const bootStage = el('section', 'cm-stage cm-stage-boot', [
      el('div', 'cm-socket-tag', ['SOCKET 00 // BOOT ROM']),
      buildBlockButton(bootBlock, selectedId, onSelect, onQuickDeploy),
    ]);
    nodes.push(
      el('div', 'cm-top-deck', [
        buildVrmPowerBay(topo),
        buildDeckFeeder('left', bootActive),
        bootStage,
        buildDeckFeeder('right', bootActive),
        buildDimmPostBay(topo, selectedBlock),
      ]),
    );
    if (channels.length > 0) {
      nodes.push(buildBusBridge(false, bootActive || channels.some((c) => c.hasCurrent)));
    }
  }

  if (channels.length > 0) {
    const trunkState: MapSparkState = channels.some((c) => c.hasCurrent) ? 'active' : 'powered';
    const leftTrunk = buildTrunkRail('left', channels, trunkState);
    const rightTrunk = buildTrunkRail('right', channels, trunkState);
    const channelList = el(
      'div',
      'cm-channels',
      channels.map((ch) => buildChannelRow(ch, selectedId, onSelect, onQuickDeploy)),
    );
    nodes.push(el('div', 'cm-channels-wrap', [leftTrunk, channelList, rightTrunk]));
  }

  if (coreBlocks.length > 0) {
    const mergeActive = coreBlocks.some((b) => b.status === 'current' || b.status === 'cleared' || b.status === 'ready');
    const coreSocket = el('div', 'cm-core-socket', [
      ...coreBlocks.map((b) => buildBlockButton(b, selectedId, onSelect, onQuickDeploy)),
      el('span', 'cm-zif-lever'),
    ]);
    const coreStage = el('section', 'cm-stage cm-stage-core', [
      el('div', 'cm-socket-tag core', [`CPU CORE // PID ${manifest.boss.pid}`]),
      coreSocket,
    ]);
    nodes.push(
      buildBusBridge(true, mergeActive),
      el('div', 'cm-core-deck', [
        buildPciStorageBay(topo),
        buildDeckFeeder('left', mergeActive),
        coreStage,
        buildDeckFeeder('right', mergeActive),
        buildFanDipBay(topo),
      ]),
    );
  }
  return nodes;
}

/** Updates selection highlight, BIOS POST hex readout, and wire spark boost in place without DOM rebuild. */
export function syncBoardSelection(boardInner: HTMLElement, block: MotherboardBlock): void {
  const selectedId = block.level.id;
  for (const btn of boardInner.querySelectorAll<HTMLButtonElement>('.cm-block')) {
    const isSel = btn.dataset.levelId === selectedId;
    btn.classList.toggle('selected', isSel);
    btn.setAttribute('aria-pressed', isSel ? 'true' : 'false');
  }
  const postDigits = boardInner.querySelector<HTMLElement>('.cm-post-digits');
  if (postDigits) setText(postDigits, formatPostCode(block));
  for (const wire of boardInner.querySelectorAll<HTMLElement>('.cm-wire')) {
    const linked = wire.dataset.fromLevel === selectedId || wire.dataset.toLevel === selectedId;
    wire.classList.toggle('selected-path', linked);
    const line = wire.querySelector<HTMLElement>('.cm-wire-line');
    if (!line) continue;
    const base = (line.dataset.baseSparkState as MapSparkState | undefined) ?? 'standby';
    line.dataset.sparkState = linked ? boostState(base) : base;
  }
}
