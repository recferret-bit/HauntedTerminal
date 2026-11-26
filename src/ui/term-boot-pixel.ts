import { buildPixelOverlayFrag, type PixelArtParams } from '../shaders/pixel-art.js';

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/** Draws a 2D canvas through the game's pixel-art quantizer onto a 2D canvas the page can show crisply. */
export interface PixelBlit {
  draw(source: HTMLCanvasElement, dest: HTMLCanvasElement): void;
  dispose(): void;
}

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return sh;
  gl.deleteShader(sh);
  return null;
}

/** Binds `tex` with nearest filtering, edge clamping and a flipped upload (the pixel pass samples it 1:1). */
function bindNearestTexture(gl: WebGLRenderingContext, tex: WebGLTexture): void {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
}

/** Full-screen pass. Null when WebGL or the shader will not start; the caller draws the canvas plain. */
export function mountPixelBlit(params: PixelArtParams, pixelRatio: number): PixelBlit | null {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: false,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  if (!gl) return null;
  // Three injects this for the stage pass. A raw fragment shader will not compile without it.
  const frag = `precision mediump float;\n${buildPixelOverlayFrag()}`;
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, frag);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'aPos');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  const buf = gl.createBuffer();
  const tex = gl.createTexture();
  if (!buf || !tex) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  bindNearestTexture(gl, tex);
  const loc = (name: string): WebGLUniformLocation | null => gl.getUniformLocation(prog, name);
  const uRes = loc('uResolution');
  const uSize = loc('uPixelSize');
  const uLevels = loc('uColorLevels');
  const uDither = loc('uDither');
  const uEdge = loc('uEdgeStrength');
  const uSat = loc('uSaturation');
  const uCon = loc('uContrast');
  const uGrid = loc('uGridStrength');
  const uMode = loc('uPaletteMode');
  const uTex = loc('tDiffuse');
  // Setting canvas width wipes GL state, so each frame binds the pass again.
  const bind = (nw: number, nh: number): void => {
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    bindNearestTexture(gl, tex);
    gl.uniform1f(uSize, params.pixelSize * Math.max(0.5, pixelRatio));
    gl.uniform1f(uLevels, params.colorLevels);
    gl.uniform1f(uDither, params.dither);
    gl.uniform1f(uEdge, params.edgeStrength);
    gl.uniform1f(uSat, params.saturation);
    gl.uniform1f(uCon, params.contrast);
    gl.uniform1f(uGrid, params.gridStrength);
    gl.uniform1f(uMode, params.paletteMode);
    gl.uniform1i(uTex, 0);
    gl.uniform2f(uRes, nw, nh);
    gl.viewport(0, 0, nw, nh);
  };
  return {
    draw(source, dest) {
      const nw = source.width;
      const nh = source.height;
      if (nw < 1 || nh < 1) return;
      if (canvas.width !== nw || canvas.height !== nh) {
        canvas.width = nw;
        canvas.height = nh;
      }
      bind(nw, nh);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const ctx = dest.getContext('2d');
      if (!ctx) return;
      if (dest.width !== nw || dest.height !== nh) {
        dest.width = nw;
        dest.height = nh;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, nw, nh);
      ctx.drawImage(canvas, 0, 0);
    },
    dispose() {
      gl.deleteTexture(tex);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
