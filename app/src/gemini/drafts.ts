// What Gemini hands back, as DRAFTS (never saved directly). The review screens turn a draft
// into events or recipes only after Noor confirms each line. Two separate operations share
// the client but not their prompts or drafts (Codex review, section 2):
//   1. Photo reading   -> PhotoDraft   (Snap pantry)
//   2. Dish discovery  -> DishCandidate[] then RecipeDraft   (Add a new dish)

/** What the photo is, chosen by Noor BEFORE the picture is taken. It decides what a line means. */
export type PhotoKind =
  | 'groceries'   // new groceries just bought: proposes a purchase
  | 'receipt'     // a shopping receipt: proposes a purchase
  | 'pantry';     // a look at what is in the pantry or fridge: proposes remaining amounts

export type Certainty = 'sure' | 'unsure';

export interface DetectedItem {
  /** What the photo or receipt says, as read, e.g. "Tomatoes", "Dalda 5 kg". */
  label: string;
  /** How many were seen or bought, e.g. 2 packets. Null when unclear. */
  count: number | null;
  /**
   * The size printed on the package or receipt line, e.g. 5 kg. This is the PACKAGE size, not
   * how much remains in an opened bag, and must never be saved as a remaining amount.
   */
  packageSize: { amount: number; unit: string } | null;
  /** An amount Gemini reads or estimates for the item as a whole (not a package label). */
  amount: { amount: number; unit: string } | null;
  certainty: Certainty;
  /** From a receipt only; the line total in rupees. Never a quantity estimate. */
  priceRs: number | null;
}

export interface PhotoDraft {
  kind: PhotoKind;
  items: DetectedItem[];
  /** Anything Gemini could not read, shown to Noor as a short note. */
  note: string;
}

/** One dish found online (step 1 of Add a new dish). */
export interface DishCandidate {
  title: string;
  /** Always a page the search actually found (sanitize.urlWasFound), never an invented link. */
  sourceUrl: string;
  sourceName: string;
  /** Confirmed video link, or null; the screen then offers a YouTube search link instead. */
  videoUrl: string | null;
  /** null means "not checked": say so, never guess (F78). */
  rating: number | null;
  ratingCount: number | null;
  views: number | null;
  /** One short sentence in the model's own words. */
  summary: string;
  /** Local date (YYYY-MM-DD) the evidence was read. */
  checkedOn: string;
}

export interface RecipeDraftIngredient {
  /** As written, e.g. "boneless chicken". Matched to Noor's ingredients on the phone. */
  name: string;
  amount: number | null;
  unit: string | null;
  optional: boolean;
}

/** The recipe chosen from the candidates (step 2). Instructions are brief and in the model's own words. */
export interface RecipeDraft {
  title: string;
  serves: number;
  time: string;
  ingredients: RecipeDraftIngredient[];
  steps: string[];
  sourceUrl: string;
  videoUrl: string | null;
  checkedOn: string;
}
