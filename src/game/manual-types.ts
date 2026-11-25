/** Pure data types for the Interactive Field Manual Book and search engine. */

export type ManualSectionId =
  | 'cover'
  | 'guides'
  | 'look-move'
  | 'files-perms'
  | 'text-pipes'
  | 'procs-signals'
  | 'code-tools'
  | 'game-meta';

export type ManualSkillFilter =
  | 'all'
  | 'beginner'
  | 'flags-numbers'
  | 'combat'
  | 'files'
  | 'text'
  | 'procs'
  | 'code-docker'
  | 'game';

export type ManualWidgetKind = 'chmod-calc' | 'kill-signals' | 'shell-ops';

export interface ManualFlagDoc {
  /** Flag, signal, numeric code, or subcommand token (e.g. "-9", "-a", "755", "compose up -d"). */
  flag: string;
  /** Optional long form or alias (e.g. "--force / -f", "SIGKILL"). */
  alias?: string;
  /** Short badge label like "SIGNAL", "OCTAL", "FLAG", "SUBCOMMAND", "SYMBOLIC". */
  kind: 'flag' | 'signal' | 'octal' | 'symbolic' | 'subcommand' | 'operator';
  /** Clear explanation for any user (beginner to power user). */
  meaning: string;
  /** Practical Linux / in-game effect or why it matters. */
  detail?: string;
  /** Short runnable example snippet for this specific flag. */
  example?: string;
}

export interface ManualExample {
  /** Concrete runnable command (or template with <placeholder>). */
  command: string;
  /** What happens when you run it. */
  outcome: string;
  /** Optional beginner annotation. */
  note?: string;
}

export interface ManualCommandEntry {
  /** Primary command name (must match COMMANDS / CHAPTER_COMMANDS). */
  command: string;
  aliases: readonly string[];
  section: ManualSectionId;
  categoryLabel: string;
  filters: readonly ManualSkillFilter[];
  /** Classic, Chapter, or Both shells. */
  availability: 'both' | 'chapter';
  syntax: string;
  /** One-line beginner summary. */
  summary: string;
  /** Plain-English deep explanation of how and why it works. */
  realWorld: string;
  /** Specific gameplay mechanics and combat/puzzle notes. */
  inGame: string;
  /** Every supported flag, subcommand, signal, or numeric mode. */
  flags: readonly ManualFlagDoc[];
  /** Common mistakes & shell-specific differences. */
  pitfalls: readonly string[];
  examples: readonly ManualExample[];
  related: readonly string[];
  /** Search tags & synonyms (e.g. "permissions", "octal", "force kill"). */
  keywords: readonly string[];
  /** Optional interactive widget embedded directly on this command's page. */
  widget?: ManualWidgetKind;
}

export interface ManualGuideRow {
  token: string;
  title: string;
  summary: string;
  detail: string;
  example?: string;
}

export interface ManualGuideEntry {
  id: string;
  title: string;
  subtitle: string;
  section: ManualSectionId;
  filters: readonly ManualSkillFilter[];
  intro: string;
  rows: readonly ManualGuideRow[];
  takeaways: readonly string[];
  keywords: readonly string[];
  widget?: ManualWidgetKind;
}

export interface ManualSectionInfo {
  id: ManualSectionId;
  code: string;
  title: string;
  shortTitle: string;
  startPage: number;
}

export type BookPage =
  | { index: number; kind: 'cover'; section: 'cover'; title: string }
  | { index: number; kind: 'toc'; section: 'cover'; title: string }
  | { index: number; kind: 'guide'; section: ManualSectionId; title: string; guide: ManualGuideEntry }
  | { index: number; kind: 'command'; section: ManualSectionId; title: string; entry: ManualCommandEntry };

export interface ManualSearchHit {
  pageIndex: number;
  title: string;
  kind: 'command' | 'guide';
  sectionLabel: string;
  badge: string;
  snippet: string;
  matchedTokens: readonly string[];
  score: number;
  entry?: ManualCommandEntry;
  guide?: ManualGuideEntry;
}
