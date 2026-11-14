/**
 * Generic field-table types shared across schema-driven spec editors (`/editor`, `/comix-editor`).
 * Domain editors supply concrete field arrays typed against their own spec unions.
 */
export type Option = string | number;

export interface FieldBase {
  key: string;
  label: string;
  hint?: string;
  /** The key may be absent; clearing the control removes it from the JSON. */
  optional?: boolean;
}

type Base = FieldBase;

export interface ArrayItem {
  /** Plain object items. */
  fields?: Field[];
  /** Items tagged by `kind` (or `tag`); the variants are looked up lazily so recursive unions work. */
  union?: () => Record<string, Field[]>;
  /** Discriminant key. Default `kind`. */
  tag?: string;
  /** One-line title of a collapsed item. */
  title: (item: Record<string, unknown>, index: number) => string;
  /** Lets the editor preview/play this item ("steps" = a script/beat item). */
  play?: 'steps';
}

export type SuggestName =
  | 'models'
  | 'paths'
  | 'sockets'
  | 'enemies'
  | 'rooms'
  | 'cores'
  | 'actors'
  | 'points'
  | 'panels'
  | 'marks'
  | 'fixtures'
  | 'fx';

export type Field =
  | (Base & { type: 'text'; rows?: number; suggest?: SuggestName; mono?: boolean; mark?: boolean })
  | (Base & { type: 'number'; step?: number; octal?: boolean })
  | (Base & { type: 'bool'; defaultTrue?: boolean })
  | (Base & { type: 'select'; options: readonly Option[] })
  | (Base & { type: 'strings'; rows?: number; mark?: boolean })
  | (Base & { type: 'numbers' })
  | (Base & { type: 'pairs'; mark?: boolean })
  | (Base & { type: 'textOrVec' })
  | (Base & { type: 'color' })
  | (Base & { type: 'array'; item: ArrayItem })
  | (Base & { type: 'object'; fields: Field[] })
  | (Base & { type: 'record'; value: Field[] | 'string' | 'strings' | 'number'; keyLabel: string })
  | (Base & { type: 'union'; union: () => Record<string, Field[]>; tag?: string });

export const t = (key: string, label: string, extra: Partial<Extract<Field, { type: 'text' }>> = {}): Field => ({ type: 'text', key, label, ...extra });
export const n = (key: string, label: string, extra: Partial<Extract<Field, { type: 'number' }>> = {}): Field => ({ type: 'number', key, label, ...extra });
export const b = (key: string, label: string, extra: Partial<Extract<Field, { type: 'bool' }>> = {}): Field => ({ type: 'bool', key, label, ...extra });
export const sel = (key: string, label: string, options: readonly Option[], extra: Partial<Base> = {}): Field => ({ type: 'select', key, label, options, ...extra });
export const opt = <F extends Field>(f: F): F => ({ ...f, optional: true });
