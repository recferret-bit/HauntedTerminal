const LAB_CSS = `
.pd-light{display:flex;flex-direction:column;gap:6px;margin:0 0 10px;padding:0 0 10px;border-bottom:1px solid #2a3140}
.pd-radios{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}
.pd-radios label{position:relative;display:block;cursor:pointer}
.pd-radios input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.pd-radios span{display:flex;align-items:center;gap:6px;padding:6px 7px;border:1px solid #2a3140;background:#0c0e12;color:#aab3c2;
  font:600 10px/1 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.1em}
.pd-radios span::before{content:"";width:9px;height:9px;border-radius:50%;border:2px solid #5b6577;flex:none}
.pd-radios input:checked+span{border-color:#ff6a13;color:#ffd166;background:rgba(255,106,19,.14)}
.pd-radios input:checked+span::before{border-color:#ff6a13;background:#ffd166;box-shadow:0 0 0 2px #0c0e12 inset}
.pd-radios input:focus-visible+span{outline:2px solid #ff6a13;outline-offset:1px}
#shader-strip{display:flex;flex-direction:row;align-items:center;gap:4px}
#shader-strip.hl-float{position:fixed;right:12px;bottom:12px;z-index:60}
#shader-strip button{
  appearance:none;display:flex;align-items:center;gap:6px;margin:0;cursor:pointer;
  font:600 11px/1 "IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.12em;text-transform:uppercase;color:#f2f4f7;
  background:#111318;border:1px solid #2a3140;border-top:2px solid #ff6a13;
  padding:6px 8px 6px 7px;
  clip-path:polygon(6px 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%,0 6px)}
#shader-strip button:hover,#shader-strip button:focus-visible{border-color:#ff6a13;color:#f2f4f7}
#shader-strip button[aria-pressed="true"]{background:rgba(255,106,19,.16);color:#ff8a3d;border-color:#ff6a13}
#shader-strip button:focus-visible{outline:2px solid #ff6a13;outline-offset:2px}
#pixel-dlg{position:fixed;left:28px;bottom:196px;z-index:80;width:min(420px,calc(100vw - 24px));
  display:none;flex-direction:column;
  font:500 11px/1.35 "IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;color:#f2f4f7;
  background:#111318;border:1px solid #2a3140;border-top:3px solid #ff6a13;
  box-shadow:0 16px 40px rgba(0,0,0,.65);user-select:none;
  clip-path:polygon(10px 0,100% 0,100% calc(100% - 10px),calc(100% - 10px) 100%,0 100%,0 10px)}
#pixel-dlg.open{display:flex}
#pixel-dlg button{font-family:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace}
#pixel-dlg .pd-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;
  background:#07080a;border-bottom:1px solid #232936;cursor:move;letter-spacing:.14em;touch-action:none}
#pixel-dlg .pd-title{font-weight:700;color:#f2f4f7;display:flex;align-items:center;gap:7px}
#pixel-dlg .pd-title i{width:7px;height:7px;background:#ff6a13;display:inline-block}
#pixel-dlg .pd-sub{font-size:10px;color:#8a93a6;letter-spacing:.1em}
#pixel-dlg .pd-close{background:none;border:1px solid transparent;color:#8a93a6;cursor:pointer;font:inherit;padding:2px 6px}
#pixel-dlg .pd-close:hover,#pixel-dlg .pd-close:focus-visible{color:#f2f4f7;border-color:#ff6a13}
#pixel-dlg .pd-body{padding:12px;display:flex;flex-direction:column;gap:9px}
#pixel-dlg .pd-tabs{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}
#pixel-dlg .pd-tab{appearance:none;background:#141820;border:1px solid #262c3a;color:#8a93a6;padding:6px 2px;
  font:600 9px/1.15 "IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.04em;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;text-transform:uppercase}
#pixel-dlg .pd-tab:hover,#pixel-dlg .pd-tab:focus-visible{border-color:#ff6a13;color:#f2f4f7}
#pixel-dlg .pd-tab.on{background:rgba(255,106,19,.16);border-color:#ff6a13;color:#ff8a3d}
#pixel-dlg .pd-dot,#shader-strip .pd-dot{width:5px;height:5px;border-radius:50%;background:#3a4152;display:inline-block;flex:none}
#pixel-dlg .pd-dot.live,#shader-strip .pd-dot.live{background:#3ddc84;box-shadow:0 0 6px #3ddc84}
#pixel-dlg .pd-top{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:8px;border-bottom:1px solid #1e232e}
#pixel-dlg .pd-toggle{appearance:none;background:#181c24;border:1px solid #2a3140;color:#cfd6e4;padding:5px 10px;
  font:600 10px/1 "IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.14em;cursor:pointer;
  clip-path:polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px)}
#pixel-dlg .pd-toggle[aria-pressed="true"]{background:#ff6a13;border-color:#ff6a13;color:#07080a}
#pixel-dlg .pd-sliders{display:flex;flex-direction:column;gap:8px;max-height:min(440px,calc(100vh - 220px));overflow-y:auto;padding-right:3px}
#pixel-dlg .pd-row{display:flex;flex-direction:column;gap:3px}
#pixel-dlg .pd-lbl{display:flex;justify-content:space-between;gap:8px;font-size:10px;letter-spacing:.1em;color:#cfd6e4}
#pixel-dlg .pd-lbl b{color:#ff8a3d;font-weight:600;font-variant-numeric:tabular-nums}
#pixel-dlg input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:5px;background:#1d222d;outline:none;margin:2px 0}
#pixel-dlg input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;background:#ff6a13;border:1px solid #07080a;cursor:pointer}
#pixel-dlg input[type=range]::-moz-range-thumb{width:12px;height:12px;background:#ff6a13;border:1px solid #07080a;cursor:pointer;border-radius:0}
#pixel-dlg .pd-foot{display:flex;justify-content:space-between;align-items:center;padding-top:6px;border-top:1px solid #1e232e}
#pixel-dlg .pd-reset{appearance:none;background:none;border:1px solid #2a3140;color:#8a93a6;padding:4px 9px;
  font:600 10px/1 "IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.12em;cursor:pointer}
#pixel-dlg .pd-reset:hover,#pixel-dlg .pd-reset:focus-visible{border-color:#ff6a13;color:#f2f4f7}
`;

export function ensureStyle(): void {
  if (document.getElementById('haunted-lab-css')) return;
  const style = document.createElement('style');
  style.id = 'haunted-lab-css';
  style.textContent = LAB_CSS;
  document.head.appendChild(style);
}

export function switchButton(id: 'crt' | 'pixel' | 'ink' | 'storm', label: string): string {
  return `<button type="button" class="hl-sw" data-fx="${id}" role="switch" aria-pressed="false"><i class="pd-dot" data-dot="${id}"></i><span>${label}</span></button>`;
}
