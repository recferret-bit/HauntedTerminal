/**
 * Every module that registers entries in ModelCatalog / TextureCatalog / FxCatalog. They are loaded one
 * by one so a broken archetype file costs its own models, not the whole lab; the error is shown on the page.
 */
const REGISTERING = import.meta.glob([
  '../../procgen/textures/index.ts',
  '../../procgen/archetypes/*.ts',
  '../../procgen/fx/presets.ts',
]);

export interface LoadReport {
  loaded: string[];
  errors: string[];
}

function shortPath(path: string): string {
  return path.replace('../../procgen/', 'src/procgen/');
}

/** Textures first: models name them, and build.ts looks them up lazily either way. */
function loadOrder(a: string, b: string): number {
  return Number(b.includes('/textures/')) - Number(a.includes('/textures/')) || a.localeCompare(b);
}

export async function loadProcgen(): Promise<LoadReport> {
  const report: LoadReport = { loaded: [], errors: [] };
  for (const path of Object.keys(REGISTERING).sort(loadOrder)) {
    try {
      await REGISTERING[path]!();
      report.loaded.push(shortPath(path));
    } catch (err) {
      report.errors.push(`${shortPath(path)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return report;
}
