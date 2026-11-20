/** Public decision plans only. No private full-state fixture is copied to a browser/runtime. */
export const SCENARIOS = Object.freeze({
  chairs: Object.freeze(['jon', 'lydia']),
  richActions: Object.freeze({
    1: Object.freeze(['build', 'work', 'build']),
    2: Object.freeze(['festival', 'lobby', 'build']),
    3: Object.freeze(['build', 'work', 'build']),
    4: Object.freeze(['festival', 'lobby', 'build']),
    5: Object.freeze(['build', 'work', 'build']),
    6: Object.freeze(['festival', 'work', 'build']),
  }),
  bids: Object.freeze([
    Object.freeze({ sameChoice: false, jon: 1, lydia: 0 }),
    Object.freeze({ sameChoice: true, jon: 1, lydia: 1 }),
    Object.freeze({ sameChoice: false, jon: 1, lydia: 1 }),
    Object.freeze({ sameChoice: true, keep: true, jon: 0, lydia: 0 }),
    Object.freeze({ sameChoice: false, jon: 1, lydia: 2 }),
    Object.freeze({ sameChoice: false, jon: 2, lydia: 1 }),
  ]),
});

export const MATCH_CHECKLIST = Object.freeze([
  'Two full six-session matches with mirrored initial Chairs',
  'Both commitment arrival orders, different winning/losing bids, identical choices, ties, zeros',
  'Both players pay exactly once; balances remain unchanged until reveal',
  'Public/TV/opponent HTTP and SSE projections; reconnect restores only the right seat',
  'Build, Work, Lobby, Festival and all three finite term markets',
  'Stale phase, stale/future revision, duplicate ID, changed-content ID, forged actor rejection',
  'Completed full cities, exhausted stacks and legal fallback actions',
  'Exactly 18 city actions per player; independently recomputed score and tie match',
  'Lost final response retry and old-match request rejection after rematch',
  'Sealed state and credentials restored from real SQLite after host restart',
]);
