# Afterglow Market — provisional PRD and design

**Status:** design draft; not implemented. **Catalog ID:** `afterglow-market`. **Mode:** trading and economic rivalry. **Target:** 25–35 minutes. **Branch:** `feature/afterglow-market`.

Read [parallel development](../PARALLEL_DEVELOPMENT.md). Sealed bids, prices, and demand hints require its private-information and simultaneous-submission gates before this game can ship.

## Experience and core idea

Run two little stalls at a lantern-lit night market. Buy scarce ingredients, negotiate a useful exchange, and decide what to make and how much to charge before the next wave of customers appears. The most satisfying decision is recognizing that a modest trade helps both stalls, then competing over timing and price.

The game is discrete and conversational. There is no twitch auction timer, external economy, real money, or runtime AI customer behavior. The first implementation should make six rounds of trading pleasant before adding a large catalogue of upgrades.

## MVP economy

The market lasts **six rounds**. Each player begins with **eight coins**, zero reputation, one unit of each raw ingredient, and a basic stall. Raw ingredients are tea, grain, paper, and thread.

| Product | Recipe for one item | Reason to stock it |
| --- | --- | --- |
| Tea | One tea | Simple supply chain; tea-seeking customers |
| Bun | One grain | Simple supply chain; snack-seeking customers |
| Lantern | One paper and one thread | More expensive recipe; matching customers have higher budget possibilities |
| Charm | One thread | Competes with lanterns for thread |

Each player may hold at most twelve raw units and six prepared items total. No debt, borrowing, negative stock, or involuntary trade. Unsold prepared goods carry forward; ingredients do not spoil in the MVP. At the end, **score = coins + 2 × reputation**; leftover goods have no score. Each completed sale earns its price in coins and one reputation. Equal final scores share the win.

## Round sequence

### 1. Read the forecast and buy supplies

The TV shows a broad theme for this round's customer wave, such as “a crafty crowd.” Each phone receives one different private hint, such as a guaranteed product preference or a budget bound. Hints must be generated from the authored demand card, never independently invented. The combined hints narrow uncertainty but do not reveal every customer.

Four public supply lots each contain two units of one ingredient. Each player privately commits a bid of **one to three coins on one lot**, or passes. Bids cannot exceed available coins or the inventory space needed for the lot. Both commitments reveal together:

- Different lots: each bidder pays their own bid and takes their selected lot.
- Same lot: the higher bid wins and pays their own bid; the other pays nothing.
- Equal bids on the same lot: the round's visible priority token breaks the tie; the loser pays nothing.
- Unclaimed lots leave the market. There is no second auction in that round.

Randomize initial priority and alternate it each round. The auction is a first-price sealed bid, not an English auction or an automatic bid up to a maximum.

### 2. Offer a trade

Each player gets one opportunity to offer a trade, in priority-token order. An offer exchanges **one or two units of one raw ingredient** for either one or two units of another raw ingredient or one/two coins. Prepared goods and reputation are not tradable in v1.

The recipient explicitly accepts or rejects; the offerer may pass instead of proposing. Then the other player gets their offer opportunity. No chained counteroffer UI is needed: the second opportunity is sufficient for a counterproposal. Cap this phase at two proposals so declining a negotiation does not stall the game.

Check ownership, money, inventory capacity, match/phase, and unchanged offer identity when accepting. Exchange both sides atomically. An accepted trade must never debit only one player, apply twice on retry, or proceed after either side's resources have changed. No acceptance can be inferred from silence.

### 3. Prepare and set prices

Both phones privately choose one of:

- **Open the stall:** choose a product, prepare zero to two units of that product from owned raw goods, and set a price of one to four coins. Previously prepared items of that product can also sell. A basic stall can complete at most two sales this round.
- **Expand the stall:** pay three coins, serve no customers this round, and permanently raise the production and sale limits from two to three. This upgrade can be purchased once. Existing stock remains owned.

The two plans reveal together. Deduct production ingredients and upgrade costs exactly once, then reveal the customer wave. A player cannot see the opponent's committed price before choosing their own. Committed plans are immutable for that round.

### 4. Serve the wave

Resolve **five authored customers in a fixed displayed queue**. Each customer has one desired product and a coin budget. They buy one prepared item from an open stall offering that product at an affordable price and still below its sales limit. If both qualify, the lower price wins. A price tie uses the current sales-priority token, which flips only after a tied sale; initialize it from this round's priority token.

If neither stall qualifies, the customer leaves. Customers do not substitute products or buy twice. Apply coin/reputation gains, show a short sales ledger, advance priority, and begin the next round. After round six, show the final score and inventory summary.

## Strategic decisions and balance hypotheses

Buying thread may enable either cheap charms or valuable lantern demand, while also restricting the other stall's choices. A trade can rescue a mismatched inventory and create a plausible mutually beneficial bargain. Raising a price increases margin but risks losing the wave; price one is not automatically best because a higher accepted sale is worth more. Expanding trades away an entire selling round for later capacity.

The numbers require playtesting. Lantern budgets must justify its two-ingredient cost, and demand cards must not leave a player with no plausible product for several consecutive rounds. Inspect complete demand decks for ingredient starvation and dominant price strategies. Do not claim the auction, upgrade, or first-price tie rule is already balanced.

## Screens, onboarding, and presentation

**TV:** two illustrated stalls, public coins/reputation, visible inventory icons, four supply lots during the auction, and the customer queue only after plans reveal. Show short phase names—Supplies, Trade, Prepare, Serve—with two ready indicators. Keep the round ledger collapsible.

**Phone:** show the current private hint and the controls for the current phase only. Bidding needs four large lot cards and a small one/two/three coin selector. Trading needs a concrete “you give / you receive” confirmation. Preparation shows recipe costs, remaining inventory, and a price selector. No persistent spreadsheet or full rules panel.

**Tutorial:** a scripted two-round fixture teaches a bid, a consented exchange, a price decision, and why a customer chooses one stall. Show the resulting coin/reputation difference. It must not pretend the other live player accepted a trade; tutorial actions use an explicit simulated partner.

**Art/motion/music:** cloth awnings, warm lanterns, little recipe signs, and animated customers with simple visible preferences. Jon and Lydia arrange stock; Lala may curl up beside the market but does not randomly destroy inventory. Use a composed evening-market melody with light brushed/plucked accompaniment. Animate the queue in order, then allow Skip animation; results are committed independently of playback.

## State, actions, and privacy

Own `games/afterglow-market/` and `ui/games/afterglow-market/`. Full state includes `rulesVersion`, `matchId`, server-private seed/demand deck, round/stage/phase ID, priority token, coins/reputation/raw/prepared inventories, upgrade status, supply lots, pending bids, trade opportunity/current offer, pending selling plans, revealed customers, sale events, and final scores.

Bounded action families:

- `commitBid({ phaseId, lotId, amount })` or `passBid({ phaseId })`.
- `offerTrade({ phaseId, give: { ingredient, quantity }, receive: { ingredient, quantity } | { coins } })`, `passTrade`, and `respondTrade({ phaseId, offerId, accept })`.
- `commitStall({ phaseId, plan: { type: 'serve', productId, quantity, price } | { type: 'expand' } })`.

Normalize every meaningful field for retry identity. Validate recipe costs against the authoritative inventory after trading. The public projection includes revealed bids only after the auction, revealed plans only after both commit, and demand only once serving begins. Each player can see their own commitment/hint; the TV host cannot see both phones' hints. Do not send the private seed or future demand order to any browser.

Simultaneous commits must resolve identically whichever network request arrives first. Phone UI can show a locally drafted bid or price immediately; it must not run the private full-state engine in the browser. Reconnection must restore the same offer or own committed plan, not silently pass a player.

## Scope and acceptance

MVP: four ingredients/products, six rounds, one stall upgrade, one lot bid per player, two bounded trade offers per round, private hints, five customers per wave, tutorial, complete scoring. Later: more recipes, optional public contracts, cosmetic stalls, and richer upgrades. No free-text contract parsing, indefinite negotiation, loan system, or live economy.

Acceptance criteria:

- Currency and stock changes have an auditable ledger; no action creates negative balances, bypasses capacity, or sells nonexistent items.
- All bid tie cases, separate-lot wins, rejected/accepted trades, changed-offer retries, inventory-full cases, and both expansion plans are tested.
- Customer fixtures cover affordability, product mismatch, lower price, alternating tied sales, sale caps, and empty inventory.
- Both arrival orders and duplicate requests produce the same outcome for every simultaneous phase.
- Serialized host/public/opponent responses contain no hidden bid, price, hint, deck order, or reconstructive private seed.
- Six rounds complete with no negotiation deadlock; refresh at each phase preserves legal continuation.
- Two players can complete a fair-feeling trade and understand a lost sale from the displayed ledger without a permanent tutorial overlay.

Key design risks: too many phases for a relaxed evening, one player never trading, overpowered reputation relative to margin, and lantern ingredients becoming a trap. First simplify phase transitions and tune the deck; do not respond by adding more resources.
