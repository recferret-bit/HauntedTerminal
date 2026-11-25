import type { MotherboardBlock, MotherboardTopology } from './chapter-map-model.js';
import { el } from './dom-lite.js';

function makeClasses(prefix: string, items: readonly string[]): HTMLElement[] {
  return items.map((s) => el('span', `${prefix} ${s}`));
}

function makeRepeated(cls: string, count: number): HTMLElement[] {
  return Array.from({ length: count }, () => el('span', cls));
}

function hiddenBay(cls: string, title: string, body: HTMLElement): HTMLElement {
  const bay = el('div', `cm-hw-bay ${cls}`, [el('div', 'cm-hw-title', [title]), body]);
  bay.setAttribute('aria-hidden', 'true');
  return bay;
}

/**
 * Multi-layered diagnostic beacon rendered inside the player's current sector IC block:
 * corner reticles, radar clock-pulse + oscilloscope bars, and horizontal scanbeam sweep.
 */
export function buildCurrentBeacon(): HTMLElement {
  const reticles = makeClasses('cm-reticle', ['tl', 'tr', 'bl', 'br']);
  const oscBars = makeRepeated('cm-osc-bar', 4);
  const badge = el('div', 'cm-here-badge', [
    el('span', 'cm-here-radar', [el('span', 'cm-here-dot'), el('span', 'cm-here-ring')]),
    el('span', 'cm-here-text', ['LOC // ACTIVE PROBE']),
    el('span', 'cm-osc-bars', oscBars),
  ]);
  return el('div', 'cm-current-fx', [...reticles, badge, el('div', 'cm-scan-mask', [el('span', 'cm-scanbeam')])]);
}

/** Background PCB alignment fiducials, via clusters, and SMD resistor silkscreen labels. */
export function buildPcbBackdropDecor(): HTMLElement {
  const decor = el('div', 'cm-pcb-decor', [
    ...makeClasses('cm-fid', ['tl', 'tr', 'bl', 'br']),
    el('span', 'cm-smd smd-a', ['RN1 103']),
    el('span', 'cm-smd smd-b', ['RN2 472']),
    el('span', 'cm-smd smd-c', ['U08 BIOS_MUX']),
    el('span', 'cm-via-cluster va', makeRepeated('cm-via', 6)),
    el('span', 'cm-via-cluster vb', makeRepeated('cm-via', 6)),
    el('span', 'cm-silk-trace trace-l', ['GND_SHIELD // 3.3V_SB']),
    el('span', 'cm-silk-trace trace-r', ['PCI_CLK // 66.6MHz']),
  ]);
  decor.setAttribute('aria-hidden', 'true');
  return decor;
}

/** Top-left PCB bay: 24-pin ATX header, CR2032 CMOS coin cell, VRM capacitors, and clock crystal. */
export function buildVrmPowerBay(topo: MotherboardTopology): HTMLElement {
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
  return hiddenBay('cm-hw-vrm', 'VRM_12V // ATX & CMOS', body);
}

/** Top-right PCB bay: 4 DDR DIMM banks + 7-segment BIOS POST hex display & bus telemetry. */
export function buildDimmPostBay(topo: MotherboardTopology, selected: MotherboardBlock): HTMLElement {
  const hex = selected.level.index.toString(16).toUpperCase();
  const postCode = selected.status === 'current' ? `C${hex.slice(-1)}` : hex.padStart(2, '0');
  const slots = ['DIMM_A0', 'DIMM_A1', 'DIMM_B0', 'DIMM_B1'].map((label, k) => {
    const lit = k === 0 || topo.clearedCount >= k * 3;
    return el('div', `cm-dimm-slot${lit ? ' populated' : ''}`, [
      el('span', 'cm-dimm-latch'),
      el('span', 'cm-dimm-bar', [label]),
      el('span', 'cm-dimm-latch'),
    ]);
  });
  const body = el('div', 'cm-hw-row', [
    el('div', 'cm-dimm-slots', slots),
    el('div', 'cm-post-box', [
      el('div', 'cm-post-digits', [postCode]),
      el('div', 'cm-post-telemetry', [
        el('span', 'cm-tel-pill', ['VCC 5.0V']),
        el('span', 'cm-tel-pill', ['66MHz']),
        el('span', 'cm-tel-pill ok', [topo.clearedCount > 0 ? 'IRQ_OK' : 'POST_OK']),
      ]),
    ]),
  ]);
  return hiddenBay('cm-hw-dimm', 'DIMM_BANK // BIOS POST', body);
}

/** Bottom-left PCB bay: PCIe/ISA gold-finger expansion slots and finned M.2 NVMe heatshield. */
export function buildPciStorageBay(topo: MotherboardTopology): HTMLElement {
  const slots = [
    el('div', 'cm-pci-slot active', [
      el('span', 'cm-pci-fingers'),
      el('span', 'cm-pci-tag', ['PCIe_x16 // TENSOR_BUS']),
    ]),
    el('div', `cm-pci-slot${topo.clearedCount >= 4 ? ' active' : ''}`, [
      el('span', 'cm-pci-fingers'),
      el('span', 'cm-pci-tag', ['ISA_16 // DMA_CH0']),
    ]),
  ];
  const body = el('div', 'cm-pci-wrap', [
    el('div', 'cm-pci-slots', slots),
    el('div', 'cm-m2-heatsink', [
      el('span', 'cm-m2-fins'),
      el('span', 'cm-m2-label', ['M.2_NVME // SWAP_0']),
    ]),
  ]);
  return hiddenBay('cm-hw-pci', 'PCI_BUS // M.2 NVMe', body);
}

/** Bottom-right PCB bay: spinning Northbridge PWM cooling fan, 4-bit DIP switch, and piezo buzzer. */
export function buildFanDipBay(topo: MotherboardTopology): HTMLElement {
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
      el('span', 'cm-hw-cap', ['SPKR1']),
    ]),
  ]);
  return hiddenBay('cm-hw-fan', 'PWM_FAN // CLK_DIP', body);
}
