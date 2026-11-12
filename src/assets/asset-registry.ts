import * as THREE from 'three';

export interface ManifestEntry {
  textureUrl: string;
  anchor: [number, number];
  targetHeight: number;
  tintFallback: string;
}

export type ManifestMap = Record<string, ManifestEntry>;

export interface AssetStatus {
  key: string;
  source: 'PNG' | 'PROCEDURAL';
}

/**
 * Procedural meshes are the default. A PNG in the manifest is an optional
 * albedo map on that mesh, hot-reloaded from /assets/manifest.json.
 */
export class AssetRegistry {
  private readonly textures = new Map<string, THREE.Texture>();
  private readonly statuses: AssetStatus[] = [];
  private readonly loader = new THREE.TextureLoader();

  async reloadAll(): Promise<AssetStatus[]> {
    this.textures.forEach((tex) => tex.dispose());
    this.textures.clear();
    this.statuses.length = 0;

    const res = await fetch(`/assets/manifest.json?t=${Date.now()}`);
    const manifest = (await res.json()) as ManifestMap;

    for (const [key, entry] of Object.entries(manifest)) {
      const tex = await this.tryLoadPng(`${entry.textureUrl}?t=${Date.now()}`);
      if (tex) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.userData.keep = true;
        this.textures.set(key, tex);
        this.statuses.push({ key, source: 'PNG' });
      } else {
        this.statuses.push({ key, source: 'PROCEDURAL' });
      }
    }
    return this.listStatuses();
  }

  getTexture(key: string): THREE.Texture | null {
    return this.textures.get(key) ?? null;
  }

  listStatuses(): AssetStatus[] {
    return this.statuses.map((s) => ({ ...s }));
  }

  private async tryLoadPng(url: string): Promise<THREE.Texture | null> {
    try {
      const check = await fetch(url, { method: 'HEAD' });
      if (!check.ok) return null;
      const contentType = check.headers.get('content-type') ?? '';
      if (!contentType.includes('image')) return null;
      return await this.loader.loadAsync(url);
    } catch {
      return null;
    }
  }
}
