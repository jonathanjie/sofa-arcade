# The Odd Laws Society — full strategy design

Rules v0.2 are playable in the local collection. Rules v0.3 are an opt-in engine prototype. **Catalog ID** `odd-laws-society`. **Players** Two. **Design targets** 35–45 minutes once familiar and about eight minutes to teach.

This document replaces the earlier 5×5 movement-and-star prototype. That prototype lacked the lasting investments, economic tradeoffs, and competing plans requested by Jon. This revision is a city-building strategy game with a shared market and laws that both players can influence. The name and rule-changing identity remain; the movement race does not.

Human balance and playtime still need validation. See the [private turn-based integration checklist](../PARALLEL_DEVELOPMENT.md).

## 0. Rules v0.3 prototype: base game and modules (21 November 2026)

The engine supports rules v0.3 as an opt-in prototype (`options.rulesVersion: '0.3'`, `options.modules`). New matches still use v0.2 until the TV and phone screens support v0.3. The tuning history is in [the simulation README](../../games/odd-laws-society/simulation/README.md); `games/odd-laws-society/rules.mjs` is the source of truth for which rule belongs where.

**Base game.** Everything below this section, with three changes:

- **Only the winner pays.** Only the winning bid is spent. If both players bid 0, the current law stays.
- **Rebuild.** You may Build onto your own occupied plot. Pay the new cost minus the old building's printed cost, at least 1 coin. The old building leaves the game, and its street is not scored again.
- **The player who is behind chairs.** From session 2, compare prestige after income. The player with fewer prestige points is the Chair: they win council ties and take the second city action. On equal scores, the printed schedule stands. Earlier v0.3 saves keep their original pre-income Chair calculation for replay.

**Grand Market module:**

- Each term deals 8 designs from a 30-design pool, one copy each, into a hidden deck. 4 are face up, and the row refills after each purchase.
- Corner Shop and Night Market are two-copy staples, always face up in their term.
- You cannot build a design that is already in your city.
- It adds 12 effect designs: street synergy, guild diversity, coins when your opponent holds a Festival, Lobby coins, a better treasury rate, and (with Back-Room Deals) a free draw when built.
- A Festival scores 2 + 1 per Culture building (at most 4) and gains 1 influence.
- **Sponsors:** the player whose bid enacts a law sponsors it. At each Civic session end, each sponsor of an active law secures 1 prestige.

**Back-Room Deals module** (needs Grand Market):

- Once per session, as a free action, pay 1 influence to draw blind from the deck until your private reserve holds 2 cards.
- Only you see your reserve. You can build from it in any later session.

## 1. Product promise and intended weight

**Build the city. Rewrite its rules.**

Jon and Lydia lead competing miniature boroughs. Both buy from the same limited building supply, but a shared council decides which businesses receive subsidies and which civic accomplishments are fashionable. Lala presides with a rubber stamp, impeccable confidence, and questionable credentials.

The desired decision is: “Take the building you need, finish my street, or invest in influence so next session rewards the city I already have?” A good move has an immediate benefit and a visible opportunity cost.

The Citadels/7 Wonders comparison concerns decision weight, not copying their content or combining their complete rule sets. Citadels connects construction and character benefits; 7 Wonders develops an engine over successive ages. The explicitly two-player 7 Wonders Duel is also a useful reference for public supply and competing development paths [1–3]. Our distinctive interaction is the contest over laws that changes the value of investments.

### Complexity budget

- Four actions: **Build, Work, Lobby, Festival**.
- Two spendable resources: **coins and influence**. Prestige is the score.
- Four building guilds, distinguished by icon and color.
- Two active laws, never an unlimited stack.
- One spatial rule: completing a horizontal street.
- Six sessions, three actions per player per session.

The base has no dice resolution, elimination, stolen turns, demolition, reaction chains, or free-text laws. There is no office draft: another draft and initiative system would compete with the market and council before those systems have been tested. Characters can dress as builders or petitioners when acting without adding mechanical role selection.

## 2. Components and information

| Component | Base content |
| --- | --- |
| Personal city | One 3×3 grid per player, nine empty plots |
| Building supply | Three terms; six designs per term, two copies of each; 36 cards total |
| Laws | Six Economy laws, six Civic laws, and two neutral starting defaults |
| Resources | Coins, influence, secured prestige; nonnegative integers |
| Council Chair | Breaks equal bids but takes the second city action |
| Duration | Six sessions grouped into three two-session terms |
| Session flags | Builds completed and whether Festival has been used, per player |

Guilds: **Commerce** (shop/coin, amber), **Craft** (tool, coral), **Civic** (seal/book, teal), **Culture** (mask/flower, plum). Guild and ability are separate: a Commerce building without an income icon produces no income merely because of its guild.

Cities, resources, scores, market stock, current laws, future term catalogs, and the entire six-session law agenda are public. Future content is inspectable in a drawer without occupying the ordinary TV screen. Only unsubmitted phone drafts and locked council choices are private. Locked choices become public after both players commit.

Each building has a design ID, guild, cost, printed prestige, and at most one ability. The two copies share a design but have distinct instance IDs. A player may buy both copies if available. A built district never moves, changes guild, leaves its city, or loses printed prestige in the base game.

## 3. Setup and initiative

1. Each player starts with an empty city, **4 coins, 2 influence, 0 secured prestige**. Session 1 has no additional income.
2. Start with neutral laws: Economy has no modifier; Civic awards no prestige.
3. Randomly assign the players **A** and **B**. The Chair schedule is **A, B | B, A | A, B**, separated by terms. The non-Chair takes the first city action each session.
4. Shuffle each six-law category once using the setup seed, and deal three pairs. Economy pairs belong to sessions 1/3/5; Civic pairs to 2/4/6. Publish the whole agenda immediately. No subsequent shuffles or random resolution occur.
5. Display the six Term I stacks, two copies each. Future-term stock is public but cannot be purchased early.
6. Enter session 1 council. Teaching fixtures pin the Chair and agenda for reproducibility.

Strict A/B alternation would give one player every Economy tie-break and the other first access to every fresh term market. Swapping within a term and reversing the next term's opening Chair avoids that permanent assignment. Each player gets three Chairs and three first actions. Three terms still create a 2–1 split in opening privileges; test mirrored setups instead of assuming equal totals prove fairness. Sofa Kingdoms' opening point does not automatically apply to this different game.

## 4. Session sequence

### A. Prepare and take income

In sessions 2–6, each receives **3 coins + established income icons, capped at two extra coins**, and **1 influence**, subject to the influence cap of six. Income is simultaneous and uses buildings already constructed. No income occurs in session 1 or after session 6.

At the start of sessions 3 and 5, remove all unbought stock and display the next term's six stacks, two copies each. Built districts remain. Unbought cards never roll forward and stacks do not refill within a term.

Reset `buildsThisSession` to zero and `festivalUsed` to false. Set the Chair and new council phase ID. Laws persist. Economy laws in this catalog modify Build or Work, never the automatic income just received.

### B. Hold the council

Odd sessions consider Economy; even sessions consider Civic. Each phone receives three options: the two bills in that session's agenda pair, or **Keep current law** in that category.

Privately select an option and bid **0–3 influence**, limited by available influence. **Seal vote** commits both together; submission is final for this council. Until both submit, the TV shows readiness only. Each phone can see its own locked commitment. A disconnect does not trigger an automatic vote or countdown.

After both commit:

1. Reveal both choices and bids together.
2. Spend **both bids**, including losing bids, identical choices, and ties.
3. Higher bid wins; equal bids use the Chair's choice. If both chose the same option, enact it and still spend both bids.
4. Replace only the relevant law slot, or retain it if Keep current won. The other category stays active.
5. Retire both offered bills from future offers. An adopted bill remains active until replaced; unchosen or displaced bills never return in this match. Defaults are not agenda cards.
6. Start city actions with the non-Chair.

Every council resolves in one reveal. There is no veto, refund, second ballot, negotiation lock, or prestige award for winning. Players may discuss intentions; verbal agreements are not enforced.

Example: Jon is Chair and bids 1 on Keep current; Lydia bids 2 on Public Grants. Both pay, Public Grants becomes law, and Lydia takes the first city action. On a 1–1 tie, Jon's option would prevail and Lydia would still act first. A 0–0 council is valid: the Chair chooses the outcome for free.

### C. Take city actions

Order is non-Chair, Chair, non-Chair, Chair, non-Chair, Chair. Each player receives three actions even if their city is full. Base cards and laws never grant extra actions.

| Action | Exact effect | Opportunity cost |
| --- | --- | --- |
| **Build** | Pay for one available current-term card; place it in any empty city plot; resolve immediate effects and street completion | Coins, an irreplaceable plot, and another possible action |
| **Work** | Gain 3 coins, or 4 under Honest Wages | Gives the opponent another chance to take desired stock |
| **Lobby** | Gain 2 influence up to cap 6; discard excess | Gives up economic/scoring progress for later political power |
| **Festival** | Pay 3 coins; secure 3 prestige plus at most 1 from an existing Festival icon; once per player per session | Coins and a Build/Lobby opportunity |

Work is always legal. Lobby at the cap is legal but gains zero and shows that preview. Build needs stock, space, and enough coins. Festival needs three coins and an unused Festival flag. Work provides a fallback without requiring a separate Pass action.

### D. Score the Civic law

After all six city actions, evaluate the active Civic law for both cities from the same final snapshot. Each player secures at most **2 Civic prestige** this session. Prior awards remain secured when a law changes.

The neutral law gives zero, so the first possible award is at the end of session 2. There are five possible Civic scoring events, for a maximum **10 prestige per player**, not twelve.

After session 6, calculate the result. Otherwise advance, performing income/reset/market replacement once in the authoritative transition. Reconnects and animation-complete events must not repeat preparation or scoring.

## 5. Construction, streets, and timing

### Cost calculation

Compute eligible discounts from the **pre-action** city and law. Use the single largest discount; never add discounts. Effective cost is at least one coin. Preview printed cost, selected discount, and actual payment.

A workshop icon gives **1 coin off the player's first Build each session**. Multiple workshops do not increase it. First Build means first successful construction, not first use of a discount. If a stronger law supplies that first Build's discount, the workshop cannot be saved for the second. A newly built workshop cannot discount itself; constructing it first consumes that session's first-Build opportunity.

Guild subsidies apply to every qualifying Build while active; Open Tender applies only to the first Build of a session. No law discounts Festival. Coins have no gameplay cap; influence caps at six.

### Build resolution

Atomically validate stock, empty plot, payment, and actor. Pay; decrement stack; place a distinct instance; increment the Build counter; grant any one-time influence up to cap; evaluate the completed street; then advance the action. Income, workshop, and Festival icons become properties of the city, not immediate coin or prestige triggers.

### Streets

A street is one horizontal row. Filling its third plot secures **2 prestige** if the three buildings share one guild or have three different guilds. A two-plus-one guild combination earns zero. Mark the row evaluated either way; it cannot earn another completion bonus.

Columns and diagonals have no bonus. There is no connectivity requirement, Town Hall, terrain, adjacency bonus, or movement. Columns within a row are strategically equivalent; the meaningful placement decision is which street receives the building.

Commerce–Craft–Civic and Culture–Culture–Culture each secure 2. Commerce–Commerce–Culture secures 0. Show the consequence before confirmation. The Fashionable Streets law can later award Civic points for qualifying rows; those capped awards are separate from the one-time completion bonus.

## 6. Complete prototype building catalog

There are two copies of every design. Printed prestige contributes to scoring through the city; it is not also added to the secured ledger on construction.

Four ability templates suffice: income icon, workshop icon, one-time influence grant, Festival icon. Citywide caps are +2 income coins, a single 1-coin first-Build workshop discount, and +1 Festival prestige. Duplicates can still contribute printed prestige and complete streets when an ability is capped.

### Term I — Foundations, sessions 1–2

| ID / name | Guild | Cost | Prestige | Ability |
| --- | --- | ---: | ---: | --- |
| `corner-shop` — Corner Shop | Commerce | 3 | 1 | Income icon: +1 coin at each later income, city cap +2 |
| `tea-stall` — Tea Stall | Commerce | 2 | 2 | None |
| `button-workshop` — Button Workshop | Craft | 3 | 2 | Workshop icon: first eligible Build costs 1 less |
| `petition-kiosk` — Petition Kiosk | Civic | 3 | 2 | Gain 2 influence when built, cap 6 |
| `pocket-theatre` — Pocket Theatre | Culture | 3 | 2 | Festival icon: +1 prestige per Festival, city cap +1 |
| `community-garden` — Community Garden | Culture | 2 | 2 | None |

### Term II — Institutions, sessions 3–4

| ID / name | Guild | Cost | Prestige | Ability |
| --- | --- | ---: | ---: | --- |
| `night-market` — Night Market | Commerce | 4 | 3 | Income icon, city cap +2 |
| `clockwork-studio` — Clockwork Studio | Craft | 4 | 4 | Workshop icon, no stacking |
| `public-library` — Public Library | Civic | 4 | 4 | Gain 2 influence when built, cap 6 |
| `debate-hall` — Debate Hall | Civic | 3 | 2 | Gain 3 influence when built, cap 6 |
| `concert-pavilion` — Concert Pavilion | Culture | 4 | 4 | Festival icon, no stacking |
| `quilt-bridge` — Quilt Bridge | Craft | 3 | 3 | None |

### Term III — Landmarks, sessions 5–6

| ID / name | Guild | Cost | Prestige | Ability |
| --- | --- | ---: | ---: | --- |
| `grand-bazaar` — Grand Bazaar | Commerce | 6 | 7 | None |
| `grand-clock` — Grand Clock | Craft | 6 | 7 | None |
| `high-court` — High Court | Civic | 5 | 5 | Gain 2 influence when built, cap 6 |
| `observatory` — Observatory | Civic | 7 | 9 | None |
| `opera-house` — Opera House | Culture | 6 | 7 | Festival icon, city cap +1 |
| `lala-monument` — Lala Monument | Culture | 8 | 10 | None |

Later terms shift value toward printed prestige. Late income has fewer payout opportunities. Civic buildings never generate recurring influence. Filling the city blocks Build but does not end the game; Work, Lobby, and Festival remain possible. Early completion is a commitment rather than an instant victory.

## 7. Complete law catalog

Every law is a known enum with one bounded effect. The table is authoritative; flavor text adds no rules. Both players obey the same two active laws. Adoption replaces one category, never an accumulated stack.

### Economy

| ID / law | Exact rule | Strategic pressure |
| --- | --- | --- |
| `small-shop-supremacy` — Small-Shop Supremacy | Commerce Buildings cost 2 less, minimum 1 | Cheap economic development or Commerce streets |
| `workshop-week` — Workshop Week | Craft Buildings cost 2 less, minimum 1 | Workshop investment and Craft landmarks |
| `public-grants` — Public Grants | Civic Buildings cost 2 less, minimum 1 | Political resources and Civic construction |
| `everything-is-art` — Everything Is Art | Culture Buildings cost 2 less, minimum 1 | Festival infrastructure and Culture streets |
| `open-tender` — Open Tender | Each player's first Build per session costs 2 less, minimum 1 | Flexible purchasing; sequencing the expensive Build first |
| `honest-wages` — Honest Wages | Work gains 4 coins instead of 3 | Saving for later purchases; no automatic income |

The single-largest-discount rule applies throughout. There are no refunds, free Builds, or negative costs. Effects apply prospectively from enactment until replaced.

### Civic

| ID / law | Prestige at each session end while active |
| --- | --- |
| `shop-local` — Shop Local | 0 for 0–1 Commerce buildings; 1 for 2–3; 2 for 4 or more |
| `industrial-pride` — Industrial Pride | 0 for 0–1 Craft buildings; 1 for 2–3; 2 for 4 or more |
| `public-service-day` — Public Service Day | 0 for 0–1 Civic buildings; 1 for 2–3; 2 for 4 or more |
| `mandatory-applause` — Mandatory Applause | 0 for 0–1 Culture buildings; 1 for 2–3; 2 for 4 or more |
| `fashionable-streets` — Fashionable Streets | 1 per qualifying completed street, cap 2 |
| `diversity-parade` — Diversity Parade | 0 for fewer than three guilds represented; 1 for three; 2 for all four |

These rules use one evaluation time and small secured awards. They never multiply an entire city's final value. The last Civic law changes at most two points per player in that final evaluation. Political play matters through repeated awards and construction savings, while earlier points remain intact.

The four-building threshold is deliberate: a nine-plot city cannot maximize all four guild laws. An earlier two-building threshold would have let a routine 2/2/2/3 city maximize nearly every Civic option, making late councils inconsequential. Specialization and diversity now retain distinct incentives. These thresholds still require playtesting; correcting that structural saturation does not establish numerical balance.

## 8. Final score

**Final prestige = printed building prestige + secured prestige + treasury bonus.**

Secured prestige comprises Festivals, street completion, and Civic laws. Treasury is **min(4, floor(coins / 3))**. Unspent influence scores zero. There is no extra full-city, citywide-set, law-victory, or secret-objective bonus.

Highest prestige wins; an exact tie is shared victory. Show Buildings, Streets, Festivals, Civic laws, and Treasury separately. During play, show printed building prestige plus secured prestige as the current score and keep potential treasury conversion separately labeled. Never count a building twice.

## 9. Strategic depth and counterplay

**Investments persist.** Early income or a workshop can fund landmarks, but costs an action, coins, and a permanent city plot. A cheap district might be efficient today and occupy a slot wanted for a ten-point monument later.

**Market access is contested.** Each design has only two copies. An opponent may buy both. Working or Lobbying lets them purchase first. A card may matter because it finishes their street, not just because of its value to you.

**Laws apply to both cities.** A subsidy is less attractive if the opponent can use it twice before you can. A broadly beneficial Civic law can be worth accepting for zero rather than spending influence for almost the same score difference. Future agendas are public, so players can prepare for a law or preserve influence to resist it.

**Placement shapes future options.** Matching streets can align with a subsidy and guild-scoring law. Diverse streets tolerate more different market purchases. Taking a fourth card from a favored guild can leave an awkward final street. Irreversible placement makes earlier choices relevant later.

### Approaches to seek in playtests

| Approach | Typical plan | Counterpressure |
| --- | --- | --- |
| Merchant | Buy early income and finance valuable landmarks | Early low-scoring actions; limited payout time; rival can take desired stock |
| Civic strategist | Buy one-time influence rewards; contest only high-value councils | Lobby consumes a scoring/economic action; opponent can concede cheap councils and build |
| Festival patron | Establish a Festival icon, fund celebrations, support Culture streets | Festivals consume actions and coins; rival can compete for stock and outscore with landmarks |
| Flexible builder | Buy efficient prestige, complete varied streets, accept useful laws | Specialization can earn a recurring Civic advantage; flexibility may lack a favored subsidy |

These are emergent approaches, not starting classes or proven winning routes. Either player should be able to pivot after a poor opening.

Suppose Public Grants would save four coins on two intended purchases, while Open Tender would save two. The incremental advantage is about two coins plus timing/stock consequences. Spending three influence that required a Lobby action may be worse than accepting Open Tender and buying first. The UI can show exact known prices; it cannot assign a definitive optimal bid when the opponent's future actions are unknown.

Losing bids cost resources, so bluffing has a price. A player benefiting from the current law can credibly bid zero. An obvious Culture city is easy to read, but its owner might exploit that expectation by saving influence and buying a different landmark.

## 10. Worked opening and arithmetic bounds

Assume Jon is Chair in session 1; the options are Small-Shop Supremacy, Honest Wages, and the neutral current law. Both start with four coins and two influence. Jon seals Small-Shop Supremacy / 1; Lydia seals Honest Wages / 0. Both pay, leaving Jon one influence and Lydia two. Small-Shop Supremacy wins; Lydia acts first.

| Action pair | Lydia | Jon |
| --- | --- | --- |
| First | Buy Corner Shop for 1; 3 coins remain | Buy the other Corner Shop for 1; 3 remain |
| Second | Buy Pocket Theatre for 3; 0 remain | Buy Button Workshop for 3; 0 remain |
| Third | Work for 3; finish at 3 coins | Work for 3; finish at 3 coins |

No Civic award occurs under the neutral law. Lydia has three printed prestige and Festival support; Jon has three printed prestige and a workshop. Each gets four coins at session 2 income (three base plus one shop), reaching seven coins. Influence becomes Jon two, Lydia three. Lydia is now Chair and Jon takes the first action. Jon's new workshop did not discount itself or another session-1 Build.

This is an accounting fixture, not a recommended opening or evidence of equal strength.

### Bounds, not balance findings

- Exactly **18 city actions per player**; at most nine Builds fit.
- Without Work or buildings, total money is **19 coins**: four initially plus five incomes of three. Two income icons built in session 1 can add at most **10** more coins.
- A session-1 workshop can save at most five coins on later first Builds; stronger law discounts may make those savings redundant.
- Influence without Lobby/buildings totals **7**: two initially plus five incomes. Contesting every council heavily requires investment. Session 1's maximum bid is two because that is the starting budget.
- A boosted Festival yields four prestige for three coins and one action. Work plus Festival uses two actions for four prestige; the Festival still cannot repeat that session.
- A Theatre plus six boosted Festivals costs 21 coins and seven actions. One Work can cover that total against 19 base coins, for eight actions and 26 prestige from the Theatre/Festivals. Timing is feasible by Building, Working, and celebrating in session 1. This is a meaningful route to compare with construction, not proof of dominance.
- Street completion caps at **6** prestige, Civic awards at **10**, Treasury at **4**.
- **35–60 final prestige** is a provisional tuning range, not an observed distribution.

## 11. TV, phones, teaching, sound, and motion

### TV

Display both nine-plot boroughs with the active city emphasized. Keep the six market stacks readable: guild, price, prestige, ability icon, and stock. Two concise active-law cards and a short session/Chair/action strip complete the ordinary board. No permanent instructional paragraphs.

At council, temporarily expand the proposal area to show both bills and the current law. Show exact public effects where possible, keep choices/bids sealed, then reveal envelopes together. Lala stamps the adopted law; affected prices or score icons respond. Collapse back to the ordinary board afterward.

The future agenda, future term stock, score explanation, and full rules belong in optional drawers. Public Build selections may highlight the TV market, but private draft bills and bids must never appear on the TV.

### Phones

Ordinary controls show four large actions, resources, and three action pips. Build opens six designs, then a 3×3 placement grid. Confirmation displays payment, influence, and street result. Work/Lobby display actual gains; Festival displays cost and prestige. Unavailable actions give a concise reason on demand.

Council replaces those controls with three choices, a bounded bid selector, and **Seal vote**. Confirmation explicitly says the bid is spent even if it loses. Locked mode shows only the player's own commitment and the opponent's readiness. No time-critical taps or tiny TV coordinate selection.

Use 44–48 CSS-pixel primary touch targets, visible focus, icon-plus-text guild labels, strong contrast, and reduced-motion alternatives. The main action menu should fit narrow phone viewports; detail sheets may scroll. Animations do not delay acceptance of a legal command.

### Optional tutorial

An isolated resumable fixture teaches: Build and place; Work to afford a card; complete a street; receive income; compare a law's effect on both cities; seal a bid and see both bids paid; Lobby for a later council; hold a Festival; inspect the score breakdown. Target an eight-minute introduction, with Skip and Replay.

Scripted resources belong only in labeled practice. A one-screen teaching sandbox can expose both hands, but that does not satisfy production bid privacy. After tutorial, rules remain in Help and contextual detail sheets.

### Art and motion

Keep the warm illustrated Jon/Lydia/Lala style. Build a civic diorama with tea awnings, workshop wheels, library lamps, an overly dignified opera house, and Lala's monument. Jon and Lydia visit buildings and react to decisions without movement rules.

Coins settle into purses; buildings fold open; a qualifying street lights; sealed envelopes open together; Lala stamps. Idle steam and a cat tail keep the scene alive. Reduced motion uses highlights and brief fades instead of travel/zoom.

### Music

Write a recognizable chamber-comedy theme in AABA form, with a clarinet-like melody, pizzicato accompaniment, and cadences. Use restrained term variations and a quieter council arrangement of the same motif. No random-note generator or fanfare on every action. Reuse independent music/effects/volume settings, host-only music by default, and gesture-based audio unlocking.

## 12. Engine and privacy contract

The examples below describe the design. See the [engine](../../games/odd-laws-society/engine.mjs) and [room adapter](../../games/registry.mjs) for the implemented interfaces. Retain its outer `phase: playing | finished` field; use a game-specific `stage` internally.

Full state includes `rulesVersion`, `matchId`, public setup seed/agenda, session/term/stage/phase ID, Chair schedule, active player/actions, two laws, term stock, city instances/positions, resources, score ledger, evaluated streets, Build/Festival flags, private commitments, and result. Derive actor identity from verified credentials, never from action payloads.

Proposed actions:

```text
commitCouncil({ matchId, phaseId, choiceId, bid })
build({ matchId, phaseId, designId, row, col })
work({ matchId, phaseId })
lobby({ matchId, phaseId })
festival({ matchId, phaseId })
```

Use stable action IDs in the shared envelope. Normalize every meaningful field for idempotency. Bids/coordinates are bounded integers; reject unknown IDs, wrong actors, stale phases, unavailable stock, occupied plots, and unaffordable choices. Pure helpers should include `buildQuote`, `streetOutcome`, `civicAward`, `scoreBreakdown`, `chairForSession`, `legalActions`, and `project`.

Council uses one shared phase ID for both submissions. City actions use a **new phase ID for each individual turn**, incorporating session and action index 0–5; do not use one ID for the whole six-action stage. Advance it after each successful action, never after a rejection or idempotent duplicate. This prevents a delayed command from a player's first turn being accepted on that player's later turn. Once reveal completes, the old council phase cannot accept a new commitment. Known identical action retries still return their safely projected outcome under the shared retry contract rather than spending again.

Law evaluation dispatches over explicit data templates, never evaluated strings. Public previews may compute Build results and hypothetical law effects. Council outcomes remain authoritative.

### Requirements for sealed choices

- The TV host can manage the room but cannot read unexposed commitments.
- Before reveal, publish the same pre-council influence totals to all viewers. **Deducting the first bid publicly would reveal it.** Reserve internally or defer both deductions until atomic resolution; no resource-changing city action is legal during council.
- A submitting player sees its own locked choice and bid. Others see readiness only. The public setup seed must never encode human commitments.
- Both same-phase legal submissions must succeed through serialized authority or bounded phase-aware retry, even if they began at the same revision. Arrival order cannot change the result. Stale votes never become next-session votes.
- Reveal, payment, enactment, and stage advance happen once. Retried action IDs preserve results; reusing an ID with different content fails.
- Apply projection to GET, join/rejoin, start/rematch, acknowledgments, retry responses, errors, history, LAN SSE, future WebSockets, and reconnect snapshots. Full state stays on the authoritative host/backend.
- Before reveal, TV/opponent payloads expose neither chosen law, bid amount, post-bid balance, nor bid-specific error details. After reveal both commitments enter public history.
- Client feedback may be optimistic, but never distribute secrets for client prediction. LAN play trusts the household's authoritative Mac; it is not protection against someone inspecting that process.
- Disconnects wait for the needed player and restore their own commitment. No automatic vote, refund, forfeit, or phase restart; explicit room abandonment is separate.

The same engine serves LAN and supported online backends. Tauri and Pages are delivery adapters, not separate rule implementations.

## 13. Local release history

The 20 November [dispatch](../archive/DISPATCH_LOCAL.md) split engine, private multiplayer, views, media, desktop and integration work. The [integration report](../archive/workstreams/integration.md) records the software acceptance at merge. Use the protocol below for human playtests.

## 14. Acceptance and balance protocol

### Integrity gates

1. Exactly 18 actions and three Chairs/first-action sessions per player; mirrored initial draws work.
2. Exactly twelve distinct agenda laws and three six-design/two-copy stocks; transitions never duplicate instances or leave stale stock purchasable.
3. Council resolves identical/different choices, ties, zeros, all legal budgets, and both submission orders, with exactly-once payment.
4. First-Build discounts cannot self-apply, recur later, stack, or make cost below one; use pre-action state.
5. Income, caps, Festival use, treasury conversion, and scoring times match independent fixtures. No income in session 1 or after session 6.
6. Streets score once for horizontal triples with one or three represented guilds. A nonqualifying completed row never changes later.
7. Every law pair terminates without recursive actions/scoring; changing laws never revises earlier secured prestige.
8. Full cities, exhausted stock, zero coins, and full influence still allow Work. No match deadlocks for lack of construction.
9. Serialized TV/opponent outputs never leak a sealed choice through budgets, history, errors, retries, or streams. Reconnect restores only the correct seat's commitment.
10. TV, phones, authority, and replay agree on score breakdown; exact ties remain possible.

### Risks to test

| Risk | What to examine first |
| --- | --- |
| Opening income dominates | Subsidized Corner Shops and payoff time; tune cost/points/cap before adding attacks |
| Culture double reward | Festival plus Culture-law efficiency after accounting for actions and money |
| Politics is irrelevant | Too many inevitable zero bids; inspect agenda, law duration, and differentiated opportunities |
| Politics dominates | Public Grants plus one-time influence rewards; tune political costs/grants, never recurring influence |
| Nine slots fill too early | Whether late Festival/Work turns are a chosen tempo plan or dull forced filler |
| Term initiative favors one seat | Paired initial Chairs on identical agendas; equal total turns alone are insufficient |
| Late choices become obvious | Price/guild/street/subsidy interactions before adding one new landmark template |

### Initial playtest program

1. Hand-check the worked opening and late-subsidy, full-city, exhausted-market, and mixed-street fixtures without animation. Then account for one full match.
2. Sweep deterministic Merchant, Festival, Civic, and efficient-building policies on identical public agendas with seats swapped. Use these to find broken arithmetic and gross outliers, not to claim human fairness.
3. Play at least six human matches as three mirrored pairs. Rotate styles and initial Chair. Record duration, resource sources/spending, cards, festivals, score categories, unspent resources, bids, and each player's pivotal decision.
4. Investigate a plausible policy winning above 65% in a substantial bot sweep or one opening dominating most human pairs. These are investigation triggers, not statistical proof. Six human games cannot establish a reliable win rate.
5. Observe whether players can teach the action loop, choose a useful move after tutorial, and explain a plausible alternative after losing. Measure actual familiar-match duration before presenting 35–45 minutes as an established result.

Every change receives a data/rules version and rationale. Keep actual play logs separate from design review. **No human playtests or complete engine simulations were performed when this specification was written.**

## 15. Base scope and follow-on modules

The MVP includes all six sessions, eighteen designs, twelve laws, sealed councils, full scoring, tutorial, reconnect, online/LAN integration, and accessible sound/motion. A catalog card or isolated demonstration is not that MVP.

After the base is supported by play, consider a six-office draft, alternative term catalogs, another bounded law pack, or public long-term commissions. Add one module for an identified missing decision, not all at once. Arbitrary rule writing, AI adjudication, destructible cities, and unlimited modifier stacks remain outside scope.

## Sources and relationship to existing games

These references anchor the complexity discussion. Sofa Arcade's card names, numerical values, council rules, and implementation plan above are original project proposals.

1. Z-Man Games, [Become the Master Builder](https://www.zmangames.com/announcements/become-the-master-builder/) — Citadels construction and character synergies.
2. Repos Production, [7 Wonders](https://www.rprod.com/en/games/7-wonders) — official game and rules for the user's benchmark.
3. Repos Production, [7 Wonders Duel](https://www.rprod.com/en/games/7-wonders-duel) — two-player development paths and public competition.
