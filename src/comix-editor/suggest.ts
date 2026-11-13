import { isRec, type Rec } from '../chapter-editor/dom.js';
import { markTable } from './marks.js';
import type { ComixModel } from './model.js';

function list(model: ComixModel, path: string, key: string): Rec[] {
  const value = model.file(path)?.value;
  if (!isRec(value) || !Array.isArray(value[key])) return [];
  return value[key].filter(isRec);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

/** Names offered by the form datalists, taken from the comix being edited. */
export function suggestions(model: ComixModel, name: string): string[] {
  switch (name) {
    case 'marks':
      return Object.keys(markTable(model.file('marks.json')?.value)).sort();
    case 'actors':
      return unique(list(model, 'cast.json', 'actors').map((actor) => String(actor.id ?? '')).filter(Boolean));
    case 'points': {
      const set = model.file('set.json')?.value;
      return isRec(set) && isRec(set.points) ? Object.keys(set.points).sort() : [];
    }
    case 'panels':
      return unique(model.files.filter((file) => file.path.startsWith('pages/')).flatMap((file) => {
        if (!isRec(file.value) || !Array.isArray(file.value.panels)) return [];
        return file.value.panels.filter(isRec).map((panel) => String(panel.id ?? '')).filter(Boolean);
      }));
    case 'models':
      return unique([
        ...list(model, 'cast.json', 'actors').map((actor) => String(actor.model ?? '')),
        ...list(model, 'set.json', 'props').map((prop) => String(prop.model ?? '')),
      ].filter(Boolean));
    default:
      return [];
  }
}
