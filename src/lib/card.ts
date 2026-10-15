// The data a summary card shows. Parsers build it; the UI only draws it.

export type Tone = 'ok' | 'warn' | 'bad' | 'muted';

export interface Pill {
  text: string;
  tone: Tone;
}

/** A line in a list: + added, ↑ upgraded/changed, − removed, ~ other. */
export interface Item {
  sign: '+' | '↑' | '−' | '~';
  name: string;
  detail?: string;
  tone?: Tone;
}

export type Section =
  | { type: 'list'; title?: string; items: Item[] }
  | { type: 'rows'; title?: string; rows: { key: string; value: string; mono?: boolean; was?: string }[] }
  | { type: 'flow'; title?: string; steps: { name: string; detail?: string; highlight?: boolean }[] }
  | { type: 'tables'; title?: string; tables: { name: string; note?: string; columns: Item[] }[] };

export interface Card {
  title: string;
  pills: Pill[];
  sections: Section[];
  /** Pass/fail facts a parser can establish for certain. */
  checks: Pill[];
}

export const pill = (text: string, tone: Tone): Pill => ({ text, tone });

/** "1 job", "2 jobs". */
export const count = (n: number, word: string, plural = `${word}s`) => `${n} ${n === 1 ? word : plural}`;
