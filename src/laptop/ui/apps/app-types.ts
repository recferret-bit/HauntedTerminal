/** What an app window holds, and what the laptop gives every app. */
import type { AppId } from '../../domain/apps.js';
import type { CheckResult } from '../../domain/checks.js';
import type { Progress } from '../../domain/progress.js';
import type { CodeFiles, RunReport, RunRequest } from '../../domain/run.js';
import type { LaptopTask, TaskApp as TaskAppId } from '../../domain/tasks.js';
import type { LaptopSound } from '../../runtime/sound.js';

export interface WorkbenchInspectEvent {
  app: TaskAppId;
  taskId: string | null;
  taskTitle: string | null;
  mode: RunRequest['mode'];
  report: RunReport | null;
  checks: CheckResult[] | null;
}

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
  /** Optional observer for /laptop-lab's Quest Check & RunReport Inspector. */
  onInspect?(ev: WorkbenchInspectEvent): void;
  sound: LaptopSound;
}
