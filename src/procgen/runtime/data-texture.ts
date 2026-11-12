import * as THREE from 'three';
import type { PixelBuffer } from '../core/types.js';

/**
 * Albedo texture for the comic material (`uMap`). Nearest filtering keeps ink lines crisp
 * under the pixel-art pass. Rows are flipped so buffer row 0 is the top of the image.
 */
export function toDataTexture(buf: PixelBuffer, tileable = true): THREE.DataTexture {
  const flipped = new Uint8Array(buf.data.length);
  const row = buf.width * 4;
  for (let y = 0; y < buf.height; y++) {
    flipped.set(buf.data.subarray(y * row, (y + 1) * row), (buf.height - 1 - y) * row);
  }
  const tex = new THREE.DataTexture(flipped, buf.width, buf.height, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = tileable ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.userData.keep = true;
  tex.needsUpdate = true;
  return tex;
}
