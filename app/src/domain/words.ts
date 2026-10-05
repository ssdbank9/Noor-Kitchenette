// The yes/no words Noor can pick in Settings (D-18: default Haan / Nahi).
export type WordsId = 'haan' | 'jee' | 'yes';
export const WORD_PAIRS: { id: WordsId; yes: string; no: string }[] = [
  { id: 'haan', yes: 'Haan', no: 'Nahi' },
  { id: 'jee', yes: 'Jee', no: 'Nahi' },
  { id: 'yes', yes: 'Yes', no: 'No' },
];
export const wordsFor = (id: WordsId | undefined) => WORD_PAIRS.find(p => p.id === id) ?? WORD_PAIRS[0];
