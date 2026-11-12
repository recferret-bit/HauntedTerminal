#!/usr/bin/env node
// Forces an external .glb (AI-generated or exported from Blender) into the Haunted Terminal comic look.
// Dependency-free: it parses and writes GLB itself (node built-ins only).
//
//   node .kiro/skills/ai-mesh-pipeline/scripts/sanitize-glb.mjs --input raw.glb --output clean.glb \
//        --height 1.2 [--families hardware,malware,neutral] [--max-zones 5] [--max-tris 3500]
//        [--yaw 180] [--squash] [--report]
//
// What it does:
//   1. Bakes every node transform into the vertices and merges the scene into one mesh.
//   2. Throws away all PBR: textures, images, samplers, metal / roughness, normal maps, UVs, animations, skins.
//   3. Gives every TRIANGLE the nearest palette zone (ZONES in src/procgen/core/palette.ts), sampling the
//      base colour texture (PNG only) x base colour factor x vertex colour at the triangle's centre.
//      Keeps at most --max-zones zones; the rest are folded into their nearest kept zone.
//   4. Writes one primitive per zone with a material named `zone:<id>` (flat base colour, extras.zone).
//   5. Normalises the pose: yaw (default 180 deg: glTF models face +z, the game faces -z), feet at y = 0,
//      centred on x and z, scaled to --height world units.
//   6. Enforces the budgets: triangle count (--max-tris, it does NOT decimate) and depth <= 60% of the wider
//      of width and height (--squash flattens z to fit; without it a deep model is an error).
//
// What it cannot do: decimate, decode JPEG / WebP / KTX2 textures, read Draco or meshopt compressed files,
// or keep a rig. Fix those in Blender first (see ../references/glb-to-comic.md).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng, isPng } from './lib/png-read.mjs';
import { colorDistance, hex, loadZones, nearestZone } from './lib/palette.mjs';

const COMPONENT = {
  5120: { size: 1, read: (dv, o) => dv.getInt8(o), norm: (v) => Math.max(v / 127, -1) },
  5121: { size: 1, read: (dv, o) => dv.getUint8(o), norm: (v) => v / 255 },
  5122: { size: 2, read: (dv, o) => dv.getInt16(o, true), norm: (v) => Math.max(v / 32767, -1) },
  5123: { size: 2, read: (dv, o) => dv.getUint16(o, true), norm: (v) => v / 65535 },
  5125: { size: 4, read: (dv, o) => dv.getUint32(o, true), norm: (v) => v },
  5126: { size: 4, read: (dv, o) => dv.getFloat32(o, true), norm: (v) => v },
};
const TYPE_SIZE = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const UNSUPPORTED = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression'];

export class SanitizeError extends Error {}

export function parseGlb(buf) {
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) throw new SanitizeError('not a binary glTF (.glb) file');
  if (buf.readUInt32LE(4) !== 2) throw new SanitizeError(`glTF version ${buf.readUInt32LE(4)} is not supported (need 2)`);
  let json = null;
  let bin = null;
  let o = 12;
  while (o + 8 <= buf.length) {
    const len = buf.readUInt32LE(o);
    const type = buf.readUInt32LE(o + 4);
    const body = buf.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString('utf8'));
    else if (type === 0x004e4942 && !bin) bin = body;
    o += 8 + len + ((4 - (len % 4)) % 4);
  }
  if (!json) throw new SanitizeError('GLB has no JSON chunk');
  return { json, bin: bin ?? Buffer.alloc(0) };
}

function readAccessor(gltf, index) {
  const { json, bin } = gltf;
  const acc = json.accessors[index];
  if (acc.sparse) throw new SanitizeError('sparse accessors are not supported: re-export from Blender');
  const comp = COMPONENT[acc.componentType];
  const n = TYPE_SIZE[acc.type];
  const out = new Float64Array(acc.count * n);
  if (acc.bufferView === undefined) return { data: out, size: n };
  const view = json.bufferViews[acc.bufferView];
  if ((view.buffer ?? 0) !== 0 || json.buffers[0]?.uri) throw new SanitizeError('only self-contained .glb files are supported (no external .bin)');
  const stride = view.byteStride ?? comp.size * n;
  const base = bin.byteOffset + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  const dv = new DataView(bin.buffer, base, bin.byteOffset + bin.length - base);
  for (let i = 0; i < acc.count; i++) {
    for (let k = 0; k < n; k++) {
      const v = comp.read(dv, i * stride + k * comp.size);
      out[i * n + k] = acc.normalized ? comp.norm(v) : v;
    }
  }
  return { data: out, size: n };
}

// ---- small matrix helpers (column-major 4x4, as in glTF) ----
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function fromTrs(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  return [
    (1 - 2 * (y * y + z * z)) * s[0], 2 * (x * y + z * w) * s[0], 2 * (x * z - y * w) * s[0], 0,
    2 * (x * y - z * w) * s[1], (1 - 2 * (x * x + z * z)) * s[1], 2 * (y * z + x * w) * s[1], 0,
    2 * (x * z + y * w) * s[2], 2 * (y * z - x * w) * s[2], (1 - 2 * (x * x + y * y)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
function nodeMatrix(node) {
  return node.matrix ?? fromTrs(node.translation, node.rotation, node.scale);
}
function det3(m) {
  return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
}
/** Inverse of the upper 3x3, row-major. Multiply a normal by its TRANSPOSE (see collectTriangles). */
function normalMatrix(m) {
  const d = det3(m) || 1;
  return [
    (m[5] * m[10] - m[9] * m[6]) / d, (m[8] * m[6] - m[4] * m[10]) / d, (m[4] * m[9] - m[8] * m[5]) / d,
    (m[9] * m[2] - m[1] * m[10]) / d, (m[0] * m[10] - m[8] * m[2]) / d, (m[8] * m[1] - m[0] * m[9]) / d,
    (m[1] * m[6] - m[5] * m[2]) / d, (m[4] * m[2] - m[0] * m[6]) / d, (m[0] * m[5] - m[4] * m[1]) / d,
  ];
}

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const linearToSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055);

function loadTexture(gltf, textureIndex, warnings) {
  const { json, bin } = gltf;
  const tex = json.textures?.[textureIndex];
  const image = json.images?.[tex?.source];
  if (!image) return null;
  let bytes = null;
  if (image.bufferView !== undefined) {
    const view = json.bufferViews[image.bufferView];
    bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  } else if (typeof image.uri === 'string' && image.uri.startsWith('data:')) {
    bytes = Buffer.from(image.uri.slice(image.uri.indexOf(',') + 1), 'base64');
  }
  if (!bytes || !isPng(bytes)) {
    warnings.push(`texture ${textureIndex} (${image.mimeType ?? image.uri ?? 'unknown'}) is not an embedded PNG and was ignored; its material falls back to the base colour factor. Re-export with PNG textures to quantize from the texture.`);
    return null;
  }
  return decodePng(bytes);
}

/** Collects the scene as world-space triangles with one sRGB colour each. */
function collectTriangles(gltf, warnings) {
  const { json } = gltf;
  for (const ext of json.extensionsRequired ?? []) {
    if (UNSUPPORTED.includes(ext)) throw new SanitizeError(`${ext} is not supported: re-export without mesh compression`);
  }
  if (json.animations?.length) warnings.push(`${json.animations.length} animation(s) dropped: motion comes from AnimTags, not from the file`);
  if (json.skins?.length) warnings.push('skin(s) dropped: the mesh is baked in its bind pose');
  const textures = new Map();
  const tris = [];
  const scene = json.scenes?.[json.scene ?? 0];
  if (!scene) throw new SanitizeError('GLB has no scene');

  const visit = (nodeIndex, parent) => {
    const node = json.nodes[nodeIndex];
    const world = mul(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      const nm = normalMatrix(world);
      const flip = det3(world) < 0;
      for (const prim of json.meshes[node.mesh].primitives) {
        if ((prim.mode ?? 4) !== 4) { warnings.push(`a primitive with mode ${prim.mode} (not triangles) was skipped`); continue; }
        if (prim.attributes.POSITION === undefined) continue;
        const pos = readAccessor(gltf, prim.attributes.POSITION).data;
        const nrm = prim.attributes.NORMAL !== undefined ? readAccessor(gltf, prim.attributes.NORMAL).data : null;
        const col = prim.attributes.COLOR_0 !== undefined ? readAccessor(gltf, prim.attributes.COLOR_0) : null;
        const mat = json.materials?.[prim.material] ?? {};
        const pbr = mat.pbrMetallicRoughness ?? {};
        const factor = pbr.baseColorFactor ?? [1, 1, 1, 1];
        let tex = null;
        let uv = null;
        if (pbr.baseColorTexture) {
          const ti = pbr.baseColorTexture.index;
          if (!textures.has(ti)) textures.set(ti, loadTexture(gltf, ti, warnings));
          tex = textures.get(ti);
          const set = `TEXCOORD_${pbr.baseColorTexture.texCoord ?? 0}`;
          if (tex && prim.attributes[set] !== undefined) uv = readAccessor(gltf, prim.attributes[set]).data;
        }
        const count = pos.length / 3;
        const index = prim.indices !== undefined ? readAccessor(gltf, prim.indices).data : Float64Array.from({ length: count }, (_, i) => i);
        for (let t = 0; t + 2 < index.length; t += 3) {
          const ids = flip ? [index[t], index[t + 2], index[t + 1]] : [index[t], index[t + 1], index[t + 2]];
          const p = [];
          const n = [];
          for (const i of ids) {
            const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
            p.push([
              world[0] * x + world[4] * y + world[8] * z + world[12],
              world[1] * x + world[5] * y + world[9] * z + world[13],
              world[2] * x + world[6] * y + world[10] * z + world[14],
            ]);
            if (nrm) {
              const a = nrm[i * 3], b = nrm[i * 3 + 1], c = nrm[i * 3 + 2];
              n.push([nm[0] * a + nm[3] * b + nm[6] * c, nm[1] * a + nm[4] * b + nm[7] * c, nm[2] * a + nm[5] * b + nm[8] * c]);
            }
          }
          // Linear base colour at the triangle's centre.
          const lin = [factor[0], factor[1], factor[2]];
          if (tex && uv) {
            const u = (uv[ids[0] * 2] + uv[ids[1] * 2] + uv[ids[2] * 2]) / 3;
            const v = (uv[ids[0] * 2 + 1] + uv[ids[1] * 2 + 1] + uv[ids[2] * 2 + 1]) / 3;
            const px = Math.min(tex.width - 1, Math.floor((u - Math.floor(u)) * tex.width));
            const py = Math.min(tex.height - 1, Math.floor((v - Math.floor(v)) * tex.height));
            const o = (py * tex.width + px) * 4;
            for (let k = 0; k < 3; k++) lin[k] *= srgbToLinear(tex.data[o + k] / 255);
          }
          if (col) {
            for (let k = 0; k < 3; k++) lin[k] *= (col.data[ids[0] * col.size + k] + col.data[ids[1] * col.size + k] + col.data[ids[2] * col.size + k]) / 3;
          }
          const rgb = lin.map((c) => Math.round(Math.min(1, linearToSrgb(c)) * 255));
          tris.push({ p, n: nrm ? n : null, rgb });
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of scene.nodes ?? []) visit(root, IDENTITY);
  if (!tris.length) throw new SanitizeError('the scene contains no triangles');
  return tris;
}

function triArea(p) {
  const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
  const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
  const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
  return { area: Math.hypot(cx, cy, cz) / 2, normal: [cx, cy, cz] };
}

function boundsOf(tris) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const t of tris) for (const v of t.p) for (let a = 0; a < 3; a++) { if (v[a] < min[a]) min[a] = v[a]; if (v[a] > max[a]) max[a] = v[a]; }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/**
 * @param {Buffer} input  bytes of a .glb
 * @param {object} opts   { height?, families?, maxZones?, maxTris?, yaw?, squash?, name? }
 * @returns {{ glb: Buffer, report: object }}
 */
export function sanitizeGlb(input, opts = {}) {
  const warnings = [];
  const families = opts.families ?? ['hardware', 'signal', 'glass', 'neutral'];
  const maxZones = opts.maxZones ?? 5;
  const maxTris = opts.maxTris ?? 3500;
  const zones = loadZones().filter((z) => families.includes(z.family));
  if (!zones.length) throw new SanitizeError(`no palette zones in families: ${families.join(', ')}`);

  const tris = collectTriangles(parseGlb(input), warnings);
  if (tris.length > maxTris) {
    throw new SanitizeError(`${tris.length} triangles is over the budget of ${maxTris}. This script does not decimate: reduce the mesh in Blender (Decimate modifier) and export again.`);
  }

  // Pose: yaw, then fit.
  const yaw = ((opts.yaw ?? 180) * Math.PI) / 180;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const rotY = (v) => [cy * v[0] + sy * v[2], v[1], -sy * v[0] + cy * v[2]];
  for (const t of tris) { t.p = t.p.map(rotY); if (t.n) t.n = t.n.map(rotY); }
  let b = boundsOf(tris);
  if (!(b.size[1] > 0)) throw new SanitizeError('the model has no height');
  const scale = opts.height ? opts.height / b.size[1] : 1;
  const wider = Math.max(b.size[0], b.size[1]);
  let zScale = 1;
  const depthRatio = b.size[2] / wider;
  if (depthRatio > 0.6) {
    if (!opts.squash) throw new SanitizeError(`depth is ${(depthRatio * 100).toFixed(0)}% of the wider of width and height (limit 60%). Pass --squash to flatten it into a relief, or fix the model.`);
    zScale = 0.6 / depthRatio;
    warnings.push(`squashed z by ${zScale.toFixed(2)} to meet the 60% depth rule`);
  }
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  for (const t of tris) {
    t.p = t.p.map((v) => [(v[0] - cx) * scale, (v[1] - b.min[1]) * scale, (v[2] - cz) * scale * zScale]);
    const flat = triArea(t.p);
    t.area = flat.area;
    const ns = t.n ? t.n.map((n) => [n[0], n[1], n[2] / zScale]) : [flat.normal, flat.normal, flat.normal];
    t.n = ns.map((n) => { const l = Math.hypot(n[0], n[1], n[2]) || 1; return [n[0] / l, n[1] / l, n[2] / l]; });
  }
  b = boundsOf(tris);

  // Quantize: nearest zone per triangle, then keep the biggest zones by area.
  const areaByZone = new Map();
  let totalArea = 0;
  for (const t of tris) {
    t.zone = nearestZone(t.rgb, zones).zone;
    areaByZone.set(t.zone.id, (areaByZone.get(t.zone.id) ?? 0) + t.area);
    totalArea += t.area;
  }
  const ranked = [...areaByZone.entries()].sort((a, c) => c[1] - a[1]);
  const kept = zones.filter((z) => ranked.slice(0, maxZones).some(([id]) => id === z.id));
  if (ranked.length > maxZones) {
    warnings.push(`${ranked.length} zones found, keeping the ${maxZones} largest: ${ranked.slice(maxZones).map(([id]) => id).join(', ')} folded into their nearest kept zone`);
    for (const t of tris) {
      if (kept.includes(t.zone)) continue;
      let best = kept[0], bestD = Infinity;
      for (const k of kept) { const d = colorDistance(t.zone.rgb, k.rgb); if (d < bestD) { bestD = d; best = k; } }
      t.zone = best;
    }
  }

  // Build one welded primitive per zone.
  const chunks = [];
  let offset = 0;
  const push = (typed) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    const view = { buffer: 0, byteOffset: offset, byteLength: bytes.length };
    chunks.push(bytes, Buffer.alloc(pad));
    offset += bytes.length + pad;
    return view;
  };
  const out = { accessors: [], bufferViews: [], materials: [], primitives: [] };
  const zoneShare = {};
  for (const z of kept) {
    const mine = tris.filter((t) => t.zone === z);
    if (!mine.length) continue;
    const lookup = new Map();
    const positions = [];
    const normals = [];
    const indices = [];
    let area = 0;
    for (const t of mine) {
      area += t.area;
      for (let k = 0; k < 3; k++) {
        const key = [...t.p[k], ...t.n[k]].map((v) => v.toFixed(4)).join(',');
        let id = lookup.get(key);
        if (id === undefined) { id = positions.length / 3; lookup.set(key, id); positions.push(...t.p[k]); normals.push(...t.n[k]); }
        indices.push(id);
      }
    }
    zoneShare[z.id] = area / totalArea;
    const pos32 = new Float32Array(positions);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos32.length; i++) { const a = i % 3; if (pos32[i] < min[a]) min[a] = pos32[i]; if (pos32[i] > max[a]) max[a] = pos32[i]; }
    const base = out.accessors.length;
    out.bufferViews.push({ ...push(pos32), target: 34962 }, { ...push(new Float32Array(normals)), target: 34962 }, { ...push(new Uint32Array(indices)), target: 34963 });
    out.accessors.push(
      { bufferView: base, componentType: 5126, count: pos32.length / 3, type: 'VEC3', min, max },
      { bufferView: base + 1, componentType: 5126, count: normals.length / 3, type: 'VEC3' },
      { bufferView: base + 2, componentType: 5125, count: indices.length, type: 'SCALAR' },
    );
    out.primitives.push({ attributes: { POSITION: base, NORMAL: base + 1 }, indices: base + 2, material: out.materials.length, mode: 4 });
    out.materials.push({
      name: `zone:${z.id}`,
      pbrMetallicRoughness: { baseColorFactor: [...z.rgb.map((c) => Number(srgbToLinear(c / 255).toFixed(5))), 1], metallicFactor: 0, roughnessFactor: 1 },
      extras: { zone: z.id },
    });
  }

  const name = opts.name ?? 'model';
  const report = {
    name,
    triangles: tris.length,
    size: b.size.map((v) => Number(v.toFixed(3))),
    minY: Number(b.min[1].toFixed(4)),
    depthRatio: Number((b.size[2] / Math.max(b.size[0], b.size[1])).toFixed(3)),
    zones: Object.fromEntries(Object.entries(zoneShare).map(([id, s]) => [id, Number(s.toFixed(3))])),
    warnings,
  };
  const json = {
    asset: { version: '2.0', generator: 'haunted-terminal sanitize-glb' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name, mesh: 0, extras: { hauntedTerminal: { facing: '-z', feetY: 0, triangles: tris.length, zones: report.zones } } }],
    meshes: [{ name, primitives: out.primitives }],
    materials: out.materials,
    accessors: out.accessors,
    bufferViews: out.bufferViews,
    buffers: [{ byteLength: offset }],
  };
  let jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
  const binBytes = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBytes.length + 8 + binBytes.length, 8);
  const chunkHead = (len, type) => { const h = Buffer.alloc(8); h.writeUInt32LE(len, 0); h.writeUInt32LE(type, 4); return h; };
  const glb = Buffer.concat([header, chunkHead(jsonBytes.length, 0x4e4f534a), jsonBytes, chunkHead(binBytes.length, 0x004e4942), binBytes]);
  return { glb, report };
}

function cli(argv) {
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--squash' || a === '--report') opt[a.slice(2)] = true;
    else if (a.startsWith('--')) opt[a.slice(2)] = argv[++i];
  }
  if (!opt.input || (!opt.output && !opt.report)) {
    console.error('usage: sanitize-glb.mjs --input raw.glb --output clean.glb [--height 1.2] [--families hardware,signal,glass,neutral]');
    console.error('       [--max-zones 5] [--max-tris 3500] [--yaw 180] [--squash] [--report]   (--report alone: analyse, write nothing)');
    console.error(`zones: ${loadZones().map((z) => `${z.id}(${z.family})`).join(' ')}`);
    return 2;
  }
  try {
    const { glb, report } = sanitizeGlb(readFileSync(resolve(opt.input)), {
      height: opt.height ? Number(opt.height) : undefined,
      families: opt.families ? opt.families.split(',') : undefined,
      maxZones: opt['max-zones'] ? Number(opt['max-zones']) : undefined,
      maxTris: opt['max-tris'] ? Number(opt['max-tris']) : undefined,
      yaw: opt.yaw !== undefined ? Number(opt.yaw) : undefined,
      squash: opt.squash === true,
      name: basename(opt.output ?? opt.input).replace(/\.glb$/i, ''),
    });
    const zones = loadZones();
    console.log(`${report.name}: ${report.triangles} triangles, w ${report.size[0]} h ${report.size[1]} d ${report.size[2]} (depth ${(report.depthRatio * 100).toFixed(0)}%), feet at y = ${report.minY}`);
    for (const [id, share] of Object.entries(report.zones).sort((a, b) => b[1] - a[1])) {
      const z = zones.find((q) => q.id === id);
      console.log(`  ${(share * 100).toFixed(1).padStart(5)}%  ${id.padEnd(15)} ${hex(z.color)}  ${z.family}`);
    }
    for (const w of report.warnings) console.log(`warn: ${w}`);
    if (opt.output) {
      const outPath = resolve(opt.output);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, glb);
      console.log(`wrote ${outPath} (${(glb.length / 1024).toFixed(1)} KB)`);
    }
    return 0;
  } catch (e) {
    if (!(e instanceof SanitizeError)) throw e;
    console.error(`ERROR: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) process.exitCode = cli(process.argv.slice(2));
