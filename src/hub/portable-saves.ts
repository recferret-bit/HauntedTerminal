import { ACHIEVEMENT_SPECS } from '../chapters/achievements.js';
import { exportPortableSaveFile, importPortableSaveBundle } from '../chapters/portable-save.js';

export function wirePortableSaves(refreshAll: () => void): void {
  const exportBtn = document.getElementById('export-save-btn') as HTMLButtonElement | null;
  const importBtn = document.getElementById('import-save-btn') as HTMLButtonElement | null;
  const importInput = document.getElementById('import-save-input') as HTMLInputElement | null;
  const feedback = document.getElementById('save-portability-feedback');

  const showFeedback = (msg: string, isErr = false): void => {
    if (!feedback) return;
    feedback.hidden = false;
    feedback.classList.toggle('err', isErr);
    feedback.textContent = msg;
  };

  if (exportBtn) {
    exportBtn.onclick = async () => {
      const { bundle, savedPath } = await exportPortableSaveFile('out-of-credits-save.json');
      if (!savedPath) {
        showFeedback('Could not export save bundle to the Downloads directory.', true);
        return;
      }
      const unlocked = Object.keys(bundle.achievements.unlocked).length;
      const fileLabel = savedPath.split(/[\\/]/).pop() ?? savedPath;
      showFeedback(`Exported ${fileLabel} (${unlocked}/${ACHIEVEMENT_SPECS.length} ACH_* trophies & campaign progress).`);
    };
  }

  if (importBtn && importInput) {
    importBtn.onclick = () => importInput.click();
    importInput.onchange = async () => {
      const file = importInput.files?.[0];
      importInput.value = '';
      if (!file) return;
      const text = await file.text();
      const res = importPortableSaveBundle(text);
      showFeedback(res.message, !res.ok);
      if (res.ok) refreshAll();
    };
  }
}
