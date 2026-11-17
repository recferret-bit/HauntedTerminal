/** What an app window holds, and what the laptop gives every app. */
import type { AppId } from '../../domain/apps.js';
import type { Progress } from '../../domain/progress.js';
import type { CodeFiles } from '../../domain/run.js';
import type { LaptopTask } from '../../domain/tasks.js';
import type { LaptopSound } from '../../runtime/sound.js';

export interface AppView {
  el: HTMLElement;
  /** The window came to the front. */
  shown?(): void;
  /** The window was closed or unmounted. */
  dispose?(): void;
}

/** An app that can take a task: the code editors. */
export interface TaskApp extends AppView {
  loadTask(task: LaptopTask, files: CodeFiles): void;
}

export interface LaptopContext {
  progress(): Progress;
  setProgress(next: Progress): void;
  onProgress(fn: (p: Progress) => void): void;
  /** Opens the task's app with the task (and its saved draft) loaded. */
  startTask(id: string): void;
  open(app: AppId): void;
  shutdown(): void;
  /** A comic word bursting off the screen: `SOLVED!`. */
  pow(word: string): void;
  sound: LaptopSound;
}
