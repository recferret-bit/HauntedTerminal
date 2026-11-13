import { n, opt, t, type Field } from '../chapter-editor/schema.js';

type TextExtra = Partial<Extract<Field, { type: 'text' }>>;
type NumExtra = Partial<Extract<Field, { type: 'number' }>>;

/** A mark expression: `NAME`, `NAME+n`, `NAME-n`, or a numeric string. */
export const mark = (key: string, label: string, extra: TextExtra = {}): Field => t(key, label, { mark: true, mono: true, suggest: 'marks', ...extra });

export const optMark = (key: string, label: string): Field => opt(mark(key, label));

export const num = (key: string, label: string, extra: NumExtra = {}): Field => n(key, label, { step: 0.001, ...extra });

export const panel = (): Field => t('panel', 'Panel', { suggest: 'panels', mono: true });

export const VEC: Field[] = [num('x', 'X'), num('y', 'Y'), num('z', 'Z')];

export const SHOT: Field[] = [num('x', 'X'), num('y', 'Y'), num('w', 'W'), num('h', 'H')];
