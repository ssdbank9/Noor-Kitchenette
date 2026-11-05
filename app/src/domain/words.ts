// The yes/no words Noor can pick in Settings (D-18: default Haan / Nahi).
// Two pairs only (Aly, 2026-10-07: remove the third option). Old backups that say 'jee'
// restore fine — backup.ts maps them to the default, and wordsFor falls back for anything unknown.
export type WordsId = 'haan' | 'yes';
export const WORD_PAIRS: { id: WordsId; yes: string; no: string }[] = [
  { id: 'haan', yes: 'Haan', no: 'Nahi' },
  { id: 'yes', yes: 'Yes', no: 'No' },
];
export const wordsFor = (id: WordsId | undefined) => WORD_PAIRS.find(p => p.id === id) ?? WORD_PAIRS[0];
