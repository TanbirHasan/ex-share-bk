export type RepCounts = {
  reviews: number;
  problems: number;
  solutions: number;
  helpfulReceived: number;
};

/** A simple weighted contribution score. */
export function reputationScore(c: RepCounts): number {
  return c.reviews * 3 + c.problems * 2 + c.solutions * 4 + c.helpfulReceived;
}

export const REP_LEVELS = [
  { min: 150, key: "expert", label: "Community expert" },
  { min: 50, key: "top", label: "Top contributor" },
  { min: 15, key: "trusted", label: "Trusted contributor" },
  { min: 1, key: "contributor", label: "Contributor" },
  { min: 0, key: "new", label: "New here" },
] as const;

export function reputationLevel(score: number) {
  return REP_LEVELS.find((l) => score >= l.min)!;
}
