import { ModelCatalog, TextureCatalog } from '../../procgen/core/catalog.js';
import { FxCatalog } from '../../procgen/fx/catalog.js';
import type { LabOptions } from '../domain/options.js';
import { ANIMATOR_SOURCE } from '../subjects/part-animator.js';
import type { LabApp } from './lab-app.js';

/** `window.__storybook`: how scripts (scripts/harness/screenshot-lab.mjs, the skills) drive the lab. */
export interface LabApi {
  ready: Promise<void>;
  list(): {
    models: { id: string; category: string; label: string }[];
    textures: { id: string; label: string; usage: string }[];
    fx: { id: string; label: string; family: string }[];
    errors: string[];
  };
  inspect(id: string | null, options?: Record<string, unknown>): Promise<unknown>;
  setOption(key: string, value: unknown): Promise<unknown>;
  stats(): unknown;
  options(): LabOptions;
  /** Not API: the live stage and views, for debugging the lab itself from the console. */
  internals(): unknown;
}

declare global {
  interface Window {
    __storybook: LabApi;
  }
}

function galleryStats(app: LabApp): unknown {
  return (app.gallery?.cells ?? []).map((c) => ({
    id: c.item.id,
    painted: c.painted,
    error: c.error,
    toScale: c.framing?.toScale ?? null,
    pxPerUnit: c.framing?.ppu ?? null,
  }));
}

function subjectStats(app: LabApp): unknown {
  const subject = app.inspect?.mounted ?? null;
  return subject
    ? { kind: subject.kind, id: subject.id, category: subject.category, bounds: subject.bounds, sockets: subject.sockets, info: subject.info }
    : null;
}

function stats(app: LabApp): unknown {
  const { opts, stage } = app;
  const inspecting = Boolean(opts.inspect);
  return {
    mode: inspecting ? 'inspect' : 'gallery',
    id: opts.inspect,
    frames: app.state.frames,
    options: { ...opts },
    time: app.state.time,
    animator: ANIMATOR_SOURCE,
    errors: app.errorLines,
    loaded: app.report.loaded,
    camera: stage?.cameraFrame() ?? null,
    canvas: stage ? { ...stage.size, pixelRatio: stage.pixelRatio } : null,
    draw: stage?.drawStats() ?? null,
    framing: inspecting ? app.inspect?.framing ?? null : null,
    subject: subjectStats(app),
    gallery: inspecting ? null : galleryStats(app),
  };
}

export function installLabApi(app: LabApp): void {
  window.__storybook = {
    ready: app.gate.ready,
    list: () => ({
      models: ModelCatalog.list().map((e) => ({ id: e.id, category: e.category, label: e.label })),
      textures: TextureCatalog.list().map((e) => ({ id: e.id, label: e.label, usage: e.usage })),
      fx: FxCatalog.list().map((p) => ({ id: p.id, label: p.label, family: p.family })),
      errors: [...app.report.errors],
    }),
    inspect: async (id, options = {}) => {
      for (const [key, value] of Object.entries(options)) app.setOption(key, value);
      app.setOption('inspect', id);
      await app.gate.afterPaint();
      return stats(app);
    },
    setOption: async (key, value) => {
      if (!app.setOption(key, value)) throw new Error(`unknown storybook option "${key}"`);
      await app.gate.afterPaint();
      return stats(app);
    },
    stats: () => stats(app),
    options: () => ({ ...app.opts }),
    internals: () => ({ stage: app.stage, gallery: app.gallery, inspect: app.inspect }),
  };
}
