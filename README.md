# Bid Brawl 🎴

> **Codex-ready product requirements, UX specification, technical design, and implementation roadmap.**
>
> **Status:** Local Secret Bid and Live Auction are playable. Live Auction includes a portrait Creator view and replay export. Online Secret Bid has passed two-browser tests against embedded PostgreSQL. Live Vercel, Neon, and Pusher verification is pending.

## Quick start

Use Node.js 22.22.2+ on the 22.x line, 24.15.0+ on the 24.x line, or 26+. No `.env` file, API keys, or database are required.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Choose **Start Local Game**, select a category, enter two names, and take turns bidding on the same device. Play until both lineups have five picks, then share the result as an image or text, vote locally, or rematch. To try refresh recovery, reload on the handoff screen and choose **Resume privately** before continuing. The speaker button enables optional sounds, and the game follows your system’s reduced-motion setting.

On local setup, choose **Live Auction** to take turns with visible offers. Use **Creator View** above the table for a 9:16 frame with manual reveals. After the showdown, download the public auction history as JSON or open **Replay Studio** to review it and save a portrait video. [Live Auction rules and Creator view](docs/phase-5.md)

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run preview
```

The production build is written to `dist/`. In PowerShell environments where script execution is disabled, use `npm.cmd` in place of `npm`.

Run the browser smoke tests with `npx playwright install chromium` and `npm run test:e2e`. To test with an installed Microsoft Edge instead, set `PLAYWRIGHT_CHANNEL=msedge` in your shell before running the tests.

## Deploy to Vercel

Use a Vercel account with access to the target project. The checked-in `vercel.json` selects Vite, runs `npm run build`, serves `dist/`, and rewrites the setup, match, results, Live Auction, and online URLs so they work on refresh. Use Node.js 24.x in the project settings. Local play runs without a database, app secrets, or custom environment variables. To enable hosted rooms, follow the [online deployment steps](docs/online-multiplayer.md#deploy-and-verify). Vercel’s system-provided production domain makes the social image URL absolute at build time. [Vite on Vercel](https://vercel.com/docs/frameworks/frontend/vite) · [Vercel system variables](https://vercel.com/docs/environment-variables/system-environment-variables)

```bash
npx vercel login
npx vercel deploy
```

When prompted, select your existing project or create one. In the preview, start a game and reload `/match` during handoff, finish a draft, and download its result. Once verified, run `npx vercel deploy --prod` from the same workspace. You can also import the repository in the Vercel dashboard. [Vercel CLI deployment guide](https://vercel.com/docs/projects/deploy-from-cli)

## 0. Codex operating instructions (read first)

You are building **Bid Brawl**, a mobile-first, silent, two-player mystery-item auction game. This README is the **single source of truth** for scope, logic, layout, quality, and completion criteria.

**Implementation policy:**
- Build in phases; **finish and verify a phase before starting the next**. Phase 0–3 constitute the playable MVP.
- Use TypeScript strictly; no `any` for game state, actions, or persisted data.
- Build the rules as **pure, deterministic functions** before wiring UI. Avoid duplicating rules in React components.
- Do not silently change game rules, invent extra abilities, or add external services without documenting the decision.
- Use local static category data for MVP. Do **not** require accounts, database, keys, or subscriptions to play locally.
- Write and run tests; fix failures before calling a phase complete.
- Make accessible, mobile-first UI with keyboard support and reduced-motion support.
- At the end of each coding phase: describe what changed, commands run, test results, notable limitations, and the next phase.

## 1. Product vision

Two players compete to draft the **best five-item roster** in a themed category using only **$20 each**. A mystery card is revealed, both players secretly choose how much to bid, and the winner gets the card. Neither knows what is coming next. The fun comes from overpaying for mediocre cards, passing on incredible items, bluffing, and debating who built the better team.

**Examples of categories:** Dream Vacation, Dream Backyard, Superpowers, Avengers-Style Heroes (use original fictional characters in bundled data), Ultimate Fast Food Menu, Worst Roommates, Zombie Survival Kit, Dream Wedding, Best Road Trip, and Your Ideal Gaming Setup.

**Target experience:** A full match should feel quick (approximately 3–5 minutes with two engaged players), surprising, fair, and fun to share with friends or record vertically. There is **no universal objective score**; the audience decides the best roster.

### Non-negotiable product principles

1. **Simple identity:** $20 budget, 5 slots per player, mystery reveals.
2. **Mute-first:** No voice chat or text chat during the draft; use reactions and visual signals.
3. **Hidden information:** Bids remain private until both players lock them in.
4. **Enforced fairness:** Rules prevent unfillable rosters and budget violations.
5. **Responsive:** Works great on a phone; desktop has a polished two-column view.
6. **One delightful loop:** Reveal → secretly bid → resolve → react → next reveal → final showdown.

## 2. Scope, priorities, and feature boundaries

| Priority | Feature | Exact scope |
|---|---|---|
| P0 | Local Secret Bid | Two people share one device and privately enter bids using a handoff screen. **First playable mode.** |
| P0 | Category picker | At least 8 hand-authored categories with 20–30 items each (no copyrighted character images). |
| P0 | Deterministic auction | 12 drawn cards, $20 per player, 5 slots each, tie-break, protected budgets, up to 2 discards, forced assignments. |
| P0 | Final showdown | Compare 5-item rosters, spend, and remaining cash; optional local winner selection. |
| P0 | Responsive design | 320px mobile and up; attractive portrait and desktop layouts. |
| P0 | Game tests | Rules, randomized simulations, persistence, and key UI flows. |
| P1 | Polish & sharing | Smooth animations, emoji reactions, sound toggle, result-card image export, share text. |
| P2 | Online multiplayer | Private rooms/invite link, server-authoritative bids, reconnect, timers. |
| P2 | Live Auction variant | Ascending visible offers with raise/pass; clearly separate mode from Secret Bid. |
| P3 | Creator Mode | 9:16 capture-friendly presentation, manual reveal pacing, overlay controls. |
| P3 | Chaos Mode | Opt-in limited abilities after core mechanics are proven. |
| Later | Ranked & accounts | Not part of MVP. Only after strong retention and abuse protections. |

**Out of scope for MVP:** sign-up, payments, AI-generated categories, real-time networking, leaderboards, monetization, friend systems, native mobile apps, generative images, chat, and recording/uploading other users' content.

## 3. Exact game rules (authoritative specification)

### 3.1 Match creation

- Two players, initially labelled **Player 1** and **Player 2**, can edit display names (max 20 characters).
- Each starts with **$20**, **0/5 slots**, and an empty roster.
- Choose a theme with at least 12 **distinct, active** items. Randomly sample **12 unique items** to create the ordered hidden deck. Never show remaining items in advance.
- Exactly **10 items** will be acquired by the two players in total (five each). **Up to two** of the 12 may be discarded. If both rosters fill early, unused deck cards remain unrevealed.
- Each item is a *subjective choice* (not automatically scored or priced). Optional flavor descriptors do not reveal an item's future value.
- Initial **tie-priority player = Player 1**; initial **forced-assignment priority = Player 1**. The implementation may randomize starting priorities if shown clearly to both participants, but MVP should use predictable defaults for testing.
- Each assigned item normally costs the winning bid. A **mandatory assignment** after a double pass costs $1.

### 3.2 Round flow: Secret Bid

1. **Reveal:** Display the next item and an indication of the current round. The revealed item is public; future cards are hidden.
2. **Player 1 private turn:** Show bid slider/stepper from $0 to their legal maximum. $0 means **Pass**. Player locks the bid; it must not remain visible on the handoff screen.
3. **Privacy handoff:** Full-screen privacy overlay: “Pass the device to Player 2,” with a “I'm ready” button. Never expose Player 1's bid through text, input default, browser history, accessibility labels, or animation.
4. **Player 2 private turn:** Same bid controls and legal range; lock bid.
5. **Resolve:** Display both bids simultaneously and show the winning player, item, and amount; if both pass, either discard or mandatory assignment (details below).
6. **Continue:** Tap “Next Card”; skip the prior private bid state and reveal the next mystery item.
7. **Finish:** When both rosters have five cards, transition to Final Showdown. Do not reveal any unused deck cards before the match ends.

**If one player is full:** They are ineligible. Only the other player enters a bid; no unnecessary handoff. They may enter $0, but the card becomes a mandatory $1 assignment if they must take it to finish. Discard is allowed only if enough deck cards remain to fill the remaining slots (see below).

**No speech is required by the app.** The app cannot enforce real-world silence, so explain it as an honor rule.

### 3.3 Protected budget and legal bid

A player with `s` unfilled roster slots and `b` dollars remaining must preserve $1 for **every future slot after the current item**.

```ts
maxLegalBid = b - (s - 1); // if s > 0
// valid bids: integers 0..maxLegalBid; 0 = pass
// for a valid active player, b >= s at every stable state
```

Example: At the start, $20 and five empty slots => maximum bid of **$16**. If they win at $16, they have $4 for four future items. A $17 opening bid is invalid. If the current item is acquired for $1, four slots remain and there is still enough money to complete.

**Do not lock out a player for reaching $0 before their roster is complete; that state must be impossible.** A player can have $0 only after acquiring the fifth item.

### 3.4 Resolution rules

| Player 1 bid | Player 2 bid | Result |
|---|---|---|
| Positive | Zero | Player 1 wins, pays their bid. |
| Zero | Positive | Player 2 wins, pays their bid. |
| Different positive bids | Different positive bids | Higher bidder wins and pays their bid. |
| Equal positive bids | Equal positive bids | Current **tie-priority player** wins, pays that bid; then toggle tie priority. |
| Zero | Zero | Apply double-pass logic below. |
| One player full | Other player legal bid | Only eligible player can receive the item; positive bid wins, or zero follows double-pass/discard logic. |

The **tie priority only flips after a positive-bid tie**, not after ordinary wins. A player whose roster is full cannot win a tie.

### 3.5 Double pass, discards, and guaranteed completion

Let `openSlots = (5 - p1.roster.length) + (5 - p2.roster.length)`. Let `cardsRemainingIncludingCurrent` be the count of items from the **current revealed card through the end of the deck**.

- **Discard the current card** if and only if `cardsRemainingIncludingCurrent > openSlots` and both eligible players passed. Record it as discarded; do not charge anyone.
- Otherwise, **mandatory assign** the item to an eligible player for **$1**. Choose the player with **more empty slots**. On an equal number of empty slots, choose **forced-assignment priority**, then toggle that priority after using the tiebreak.
- A full player is never eligible for an assignment.
- A player with an open slot always has at least $1 under the protected-budget invariant.
- Never discard when doing so would leave fewer remaining cards than open slots.

**Example A:** Round 1: 12 cards and 10 open slots. Both pass ⇒ discard (11 cards, 10 slots).

**Example B:** After two discards: 10 cards remain for 10 slots. Both pass ⇒ mandatory assign for $1.

**Example C:** Player 1 full, Player 2 has one slot, and two cards remain. Player 2 passes ⇒ discard is allowed once; the final card is mandatory if they pass again.

The core engine must guarantee that, with a valid starting deck and legal bids, the match **always ends with five items per player**. If all 12 cards have been processed without completion, that is an implementation error, not a normal game outcome.

### 3.6 Endgame, voting, and rematch

- End as soon as **both rosters reach exactly five items**.
- Show lineups side-by-side with item names, optional icons, individual bid prices, total spent, money remaining, discarded count, and the chosen theme.
- Do not automatically determine a winner. Offer **Vote for Player 1**, **Vote for Player 2**, and **It's a tie** for an optional, informal single-device vote. Label it **local opinion**, not a public poll.
- Include **Rematch** (same category, shuffled new deck and reset everything) and **New Category**.
- A later version can add public voting with secure share links, limits, and expiration.

### 3.7 Later mode: Live Auction (separate rule set)

Do **not** confuse Secret Bid with raising bids. In the later Live Auction option: players alternate **Raise** or **Pass**, starting at $1; the current highest bidder can win after the opponent passes; reject invalid raises and respect the protected budget. Specify who opens, when bidding closes, and how a no-bid card is handled before implementation. Keep this mode independent of the Secret Bid reducer to avoid accidental rule mixing.

### 3.8 Later mode: Chaos (not MVP)

Possible opt-in abilities: **Poison Gift** (one mandatory $1 assignment to opponent with an open slot), **Blind Bid** (one bid submitted before reveal), and **Propose Swap** (opponent must accept). Every ability needs documented timing, eligibility, consent/cost rules, conflict priority, tests, and UI. Do not implement until core mode is playtested.

## 4. UI/UX specification

### 4.1 Visual direction

- **Mood:** playful premium party game, slightly arcade-like, confident typography, strong contrast, satisfying card reveals.
- **Primary surfaces:** midnight navy `#0B1020`, card surface `#171F35`, elevated `#202A46`.
- **Accent colors:** electric violet `#8B5CF6`, cyan `#22D3EE`, warm yellow `#FBBF24`, success green `#34D399`, danger coral `#FB7185`.
- **Text:** `#F8FAFC` primary, `#A6B2CA` secondary. Maintain WCAG AA contrast.
- **Font:** `Inter` or a reliable system sans-serif; optional display type (e.g. `Space Grotesk`) for large headings.
- **Radius:** 16–24px major cards, 10–14px controls. Clear focus rings, not glow as the only focus indicator.
- **Motion:** 150–300ms micro-interactions; one 500–700ms reveal sequence maximum; respect `prefers-reduced-motion`.
- **Audio:** optional and off by default; never required to understand the game.
- **Touch:** controls minimum ~44px touch target; do not rely on hover interactions.

Use Tailwind design tokens or CSS variables rather than scattered hard-coded colors. Dark theme for MVP; light theme optional.

### 4.2 Information hierarchy in a live match

1. **The current mystery card** (the visual hero).
2. **Your current decision:** bid / pass / lock in.
3. **Your private available budget and max legal bid**.
4. **Shared match status:** both players' budgets, slots, rounds, remaining deck/discards.
5. **Optional emoji reactions** that never leak private bids.

When a bid is private, **do not show the other player's previous bid or reveal the current locked amount**. Avoid revealing bids in accessibility text, state-dependent URLs, tooltips, and handoff screens.

### 4.3 UI screens and ASCII wireframes

#### Screen A — Home (`/`)

```text
┌──────────────────────────────────┐
│ 🎴 Bid Brawl                     │
│                                  │
│  BUILD YOUR DREAM LINEUP         │
│  $20 • 5 PICKS • NO TALKING      │
│                                  │
│   [ START LOCAL GAME         ]   │
│   [ HOW TO PLAY              ]   │
│                                  │
│   ✨ Quick • Competitive • Funny  │
│   Online play: Coming later      │
└──────────────────────────────────┘
```

Actions: start setup; show short rules dialog; optional sound/reduced-motion settings.

#### Screen B — Category & players (`/setup`)

```text
┌──────────────────────────────────┐
│ ← Back       CHOOSE A CATEGORY   │
│ [🏝️ Dream Vacation] [⚡ Powers]  │
│ [🍔 Fast Food]      [🏡 Backyard]  │
│ [🧟 Survival]       [🎮 Gaming]    │
│                                  │
│ Player 1  [ Alex             ]   │
│ Player 2  [ Sam              ]   │
│                                  │
│  12 reveals • 5 picks each       │
│  $20 each • secret bids          │
│                                  │
│ [ START MATCH                 ]  │
└──────────────────────────────────┘
```

Category cards show emoji, title, short description, and visually distinct backgrounds. Start disabled until category is selected and player names are valid. Local mode clearly labelled.

#### Screen C — Reveal + private bid (`/match`)

```text
┌──────────────────────────────────┐
│ ← Exit             CARD 04 / 12  │
│ ALEX  $14  ■■□□□   SAM $11 ■■■□□ │
│                                  │
│      ┌──────────────────┐        │
│      │       🏝️         │        │
│      │  PRIVATE ISLAND  │        │
│      │  Dream Vacation  │        │
│      └──────────────────┘        │
│                                  │
│     ALEX — PRIVATE BID           │
│        $05    (max $12)          │
│     [−] ━━━━━●━━━━━━ [+]        │
│                                  │
│   [ PASS ]   [ LOCK IN $5 ]      │
│   No talking • 10 open slots*    │
└──────────────────────────────────┘
```

`*` Illustrative data only; actual count derived from current state. Use an accessible stepper (+/−) and/or native range with a visible integer; $0 means Pass. Never enable a bid above max legal. Separate public budgets and slots from private bid entry. The reveal card can visually flip; its text must always be accessible.

#### Screen D — Private handoff (`/match`, overlay)

```text
┌──────────────────────────────────┐
│                                  │
│          🔒 BID LOCKED           │
│                                  │
│    PASS THE DEVICE TO SAM        │
│                                  │
│ Your opponent's bid is hidden.   │
│                                  │
│      [ I'M SAM — READY ]         │
│                                  │
└──────────────────────────────────┘
```

**Critical:** Full-screen opaque cover. No amount or bid-selected control underneath visible. Keep focus trapped in overlay and restore it correctly.

#### Screen E — Round outcome (`/match`, stage)

```text
┌──────────────────────────────────┐
│          BIDS REVEALED           │
│   ALEX $5       vs      SAM $3   │
│                                  │
│       🏆 ALEX WON THIS CARD      │
│          PRIVATE ISLAND          │
│             PAID $5              │
│                                  │
│ [😂] [😮] [😭] [👏]              │
│                                  │
│       [ NEXT MYSTERY CARD ]      │
└──────────────────────────────────┘
```

If discarded, show “Both passed — card discarded”; if mandatory assignment, show “No skips left — assigned for $1” or a precise explanation tied to remaining deck capacity. React buttons animate, but don't modify game results.

#### Screen F — Final Showdown (`/results`)

```text
┌──────────────────────────────────┐
│         FINAL SHOWDOWN           │
│        DREAM VACATION            │
│                                  │
│ ALEX                 SAM         │
│ 🏝️ Island    $5     🏔️ Alps $4   │
│ 🚁 Helicopter $3     🏨 Hotel $6 │
│ 🍣 Sushi     $2     🚗 Roadtrip  │
│ ... (five each)                  │
│                                  │
│ Spent $18            Spent $17   │
│ Left  $2             Left  $3    │
│                                  │
│ WHO BUILT THE BETTER LINEUP?     │
│ [ Vote Alex ] [ Vote Sam ] [Tie] │
│                                  │
│ [ REMATCH ]  [ NEW CATEGORY ]    │
└──────────────────────────────────┘
```

Treat as a design mock, not literal sample results. Always render accurate 5-card rosters with correct total spent. On small phones, stack rosters; on tablets/desktops, use a fair side-by-side layout.

#### Screen G — Rules modal

Use three illustrated steps with small plain text: **Reveal mystery item → Place private bids → Complete five slots and compare.** Explain $16 maximum opening bid, double passes, tie priority, and why mandatory $1 assignments exist. Include a lightweight detailed-rules expansion, not a giant unreadable modal.

### 4.4 Layout and accessibility

- Mobile baseline: 320–430px viewport; single-column interface, fixed/safe-area-aware primary actions as appropriate.
- Tablet: 768px; more breathing room and balanced header.
- Desktop: 1024px+; centered max-width content, roster/score panels left and right with card in the middle where space permits.
- Use CSS safe area padding; avoid horizontal scrolling and text clipping at 200% zoom.
- Provide semantic headings, button labels, aria-live updates for reveal and winner, and sufficient contrast.
- Keyboard users can select bids, pass, lock, advance, rematch, and navigate category selection.
- Avoid showing a bid through `aria-live` until the reveal stage; local privacy isn't a security boundary, but do not leak information in normal UI.
- Respect reduced motion, handle losing focus/refresh cleanly, and never unexpectedly reset an active match.

## 5. Technology stack and deployment

**MVP (fastest reliable local-first path):**

| Layer | Choice | Rationale |
|---|---|---|
| App | **Vite + React + TypeScript** | Fast feedback, simple static deployment, clean game engine. |
| Styling | **Tailwind CSS** | Responsive tokens and consistent component styling. |
| UI primitives | **shadcn/ui** or lightweight accessible hand-built controls | Dialogs, buttons, slider, toasts. Avoid overengineering. |
| Animation | **Motion** (Framer Motion successor package) | Flip and outcome animations; can defer until game works. |
| Icons | **lucide-react** and category emoji | Easy, lightweight visual language. |
| State | `useReducer` with a pure game reducer | Predictable state and testability; no global store needed initially. |
| Persistence | `localStorage` (versioned) | Restore an unfinished local game; no cloud bill. |
| Tests | **Vitest**, React Testing Library, **Playwright** | Pure rules plus critical user flows. |
| Deployment | **Vercel static Vite site** | Suitable for initial client-only game. |

**Later online multiplayer:** Vercel for web app; **Neon PostgreSQL** for durable match/room records if needed; **Ably or Pusher** for realtime messaging; a server-authoritative API/service for game commands. Do not assume Vercel static hosting or a Vercel serverless function provides a persistent WebSocket server. Use authoritative transactional validation and do not send a private bid to the opponent before reveal. Determine exact service architecture and free-tier limits when implementing P2, not now.

**Image storage:** MVP uses emoji, icon assets, and optionally bundled, licensed illustrations in `/public`; **no image hosting service required**. Later user-uploaded artwork could use Vercel Blob or object storage with moderation, size limits, and explicit cost review. Do not scrape TikTok videos or copyrighted characters into the bundled assets.

### Development commands (after scaffold)

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
# P2+ if configured:
npm run test:e2e
```

Implement these scripts in `package.json` (for `typecheck`, e.g. `tsc --noEmit`). Document environment variables in `.env.example`; **MVP should run without any `.env` file**.

## 6. Proposed code organization

```text
bid-brawl/
├── README.md                        # this document, source of truth
├── CODEX_PROMPTS.md                 # copy/paste phase prompts
├── package.json
├── index.html
├── vite.config.ts
├── tailwind.config.*                # if required by installed Tailwind version
├── tsconfig.json
├── public/
│   └── favicon.svg
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── assets/
│   ├── components/
│   │   ├── ui/
│   │   ├── AppShell.tsx
│   │   ├── PlayerStatus.tsx
│   │   ├── MysteryCard.tsx
│   │   ├── BidControl.tsx
│   │   ├── PrivacyHandoff.tsx
│   │   ├── RoundOutcome.tsx
│   │   ├── RosterPanel.tsx
│   │   └── ConfirmExitDialog.tsx
│   ├── screens/
│   │   ├── HomeScreen.tsx
│   │   ├── SetupScreen.tsx
│   │   ├── MatchScreen.tsx
│   │   ├── ResultsScreen.tsx
│   │   └── HowToPlay.tsx
│   ├── data/
│   │   ├── categories.ts
│   │   └── validateCategories.ts
│   ├── game/
│   │   ├── types.ts
│   │   ├── deck.ts
│   │   ├── rules.ts
│   │   ├── reducer.ts
│   │   ├── selectors.ts
│   │   ├── persistence.ts
│   │   └── __tests__/
│   │       ├── rules.test.ts
│   │       ├── reducer.test.ts
│   │       └── simulation.test.ts
│   └── test/
│       └── setup.ts
└── e2e/
    └── local-match.spec.ts
```

This is a suggested structure, not a requirement to create empty placeholder files. Group by domain, not by framework abstractions.

## 7. Data contracts (guide for Codex)

Use TypeScript interfaces or discriminated unions similar to the following. Adjust details where necessary, but preserve the intent and state invariants.

```ts
type PlayerId = 'p1' | 'p2';
type GameStage = 'setup' | 'reveal' | 'bid-p1' | 'handoff' |
  'bid-p2' | 'outcome' | 'finished';

type Item = {
  id: string;              // unique within the category
  title: string;
  emoji: string;
  description?: string;
  tags?: string[];
};

type Category = {
  id: string;
  title: string;
  emoji: string;
  description: string;
  items: Item[];           // >=12 distinct ids; target 20–30
};

type RosterPick = {
  itemId: string;
  paid: number;           // integer dollars 1..20
  roundNumber: number;
  acquisition: 'bid' | 'mandatory';
};

type PlayerState = {
  id: PlayerId;
  name: string;
  budgetRemaining: number;
  roster: RosterPick[];
};

type Outcome =
  | { kind: 'won'; itemId: string; winner: PlayerId; p1Bid: number; p2Bid: number; paid: number; tied: boolean }
  | { kind: 'discarded'; itemId: string }
  | { kind: 'mandatory'; itemId: string; winner: PlayerId; paid: 1 };

type MatchState = {
  schemaVersion: 1;
  matchId: string;
  categoryId: string;
  deck: string[];           // sampled item IDs in reveal order
  deckIndex: number;        // index of current card, not next card
  players: Record<PlayerId, PlayerState>;
  stage: GameStage;
  pendingP1Bid: number | null;
  pendingP2Bid: number | null;
  tiePriority: PlayerId;
  forcedPriority: PlayerId;
  outcomes: Outcome[];
  localVote: PlayerId | 'tie' | null;
};
```

**Sensitive local state note:** `pendingP1Bid` is private *only in the UI*, not cryptographically hidden. In a shared-device game, conceal it through the handoff flow. Never claim local secret bids are secure against someone opening browser storage/devtools. In online mode, store unrevealed bids server-side with appropriate authorization.

**Recommended actions** (`GameAction` discriminated union): `START_MATCH`, `REVEAL_NEXT`, `LOCK_P1_BID`, `ACK_HANDOFF`, `LOCK_P2_BID`, `RESOLVE_ROUND`, `RESTART_SAME_CATEGORY`, `SET_LOCAL_VOTE`, `RESET_MATCH`. A single reducer call must not apply the same round outcome twice.

### 7.1 Game engine functions

```ts
createDeck(category: Category, random?: () => number): string[];
getOpenSlots(player: PlayerState): number;
getMaxLegalBid(player: PlayerState): number;
validateBid(player: PlayerState, bid: number): boolean;
canDiscard(state: MatchState): boolean;
resolveRound(state: MatchState): MatchState;  // pure + idempotence guard
isComplete(state: MatchState): boolean;
validateMatchState(state: MatchState): string[];
```

Use deterministic injection for deck shuffle (e.g., seeded RNG in tests). Validate categories before match creation. Keep `deckIndex` and stage transitions explicit. Never rely on React render timing to decide a winner.

### 7.2 Match state machine

```text
SETUP
  └─ START_MATCH ─► REVEAL
                       ├─ (both active) ─► BID_P1 ─► HANDOFF ─► BID_P2
                       └─ (only one active) ─► BID_ELIGIBLE_PLAYER
                                              │
                                              ▼
                                         RESOLVE_ROUND
                                              │
                                              ▼
                                           OUTCOME
                                              ├─ complete ─► FINISHED
                                              └─ continue ─► REVEAL
```

`BID_ELIGIBLE_PLAYER` is a conceptual substate; implementation may reuse `bid-p1` / `bid-p2`. When only Player 2 is eligible, skip the Player 1 handoff entirely. On `LOCK_P2_BID`, guard against accidental double-submit. During result animation, disable further submissions.

### 7.3 Persistence and refresh

- Persist game state on successful transitions to versioned `localStorage` match key.
- On reload, validate stored state before restoring. Corrupt/old data must fail gracefully with “Start a new game.”
- **Privacy-first refresh behavior:** if previously in a private bid or handoff phase, restore to an opaque “Resume match privately” screen before showing any bid controls. Never replay the previous player's locked number on screen.
- Persist only minimum state; no analytics, tracking, or user profiles in MVP.
- “Quit match” requires confirmation; “New match” clears old match state.

### 7.4 Implementation Decisions (Phase 1)

- Setup is represented by a `null` match. The caller supplies an unsigned 32-bit seed and a unique match ID when starting or restarting. A rematch retains player names and rotates the draw once if a repeated seed or coincidental shuffle produces the exact previous order.
- Round actions carry a match ID and round number. The final eligible bid resolves the round in the same reducer action, and the outcome clears the pending bid. Resolved bids use `null` for a full player and `$0` for a pass. The final outcome remains available until continuing to the showdown.
- Display names are trimmed, normalized to NFC, and limited to 20 graphemes. Blank names and control characters are rejected. Render names as plain text.
- The versioned storage adapter replays resolved rounds to validate a save. An invalid save yields a fresh-start result and can be replaced by a new save. Refreshing in a private stage returns an opaque resume gate. The match screen uses `getMatchView` to display the current item and resolved bids.

### 7.5 Local session behavior (Phase 2)

- The browser saves one draft per origin. A refresh restores the latest committed round state. A bid still being edited resets to $0. A locked bid remains in the local save and stays concealed in the game UI until resolution.
- The handoff and private resume screens mount by themselves, and confirmation is required to clear an active match. When storage is blocked, the current tab remains playable and shows a save warning.

### 7.6 Sharing and privacy (Phase 3)

- Hiding the tab during bid entry covers the turn and clears the unsubmitted input. Resume privately to re-enter it. Completed outcomes can show a local reaction until the next reveal.
- Sound is off when the app opens. Opting in plays short cues for public reveals, outcomes, and the final showdown. Reactions and sound preferences are session-only.
- The showdown dialog can generate a portrait PNG, copy text, or open the system text share sheet when available. The export includes player names and settled picks, prices, and spending. It excludes losing and pending bids, unrevealed cards, and local votes. If clipboard access is blocked, the text can be selected manually.

## 8. Category content specification

Bundle at least 8 curated categories (20–30 item choices each) with a **mix of aspirational, average, weird, and hilariously bad choices**. Each item should be short (roughly 2–5 words) and evocative; no objective price labels or stats because value is subjective.

**Starter themes (examples):**

| Category | Example cards |
|---|---|
| Dream Vacation | Private Island, Northern Lights, Luxury Train, Rainy Camping Trip, Windowless Hotel |
| Dream Backyard | Infinity Pool, Fire Pit, Treehouse, Outdoor Cinema, Mosquito Swarm |
| Superpowers | Teleportation, Invisibility, Perfect Memory, Talking to Plants, Sneezing Glitter |
| Fast Food Feast | Crispy Fries, Spicy Chicken Sandwich, Milkshake, Cold Soggy Nuggets, Mystery Sauce |
| Worst Roommates | Never Washes Dishes, Loud Midnight Drummer, Steals Snacks, Labels Everything, Friendly Ghost |
| Zombie Survival | Water Filter, Medical Kit, Bunker, Unreliable Flashlight, Loud Toy Trumpet |
| Dream Wedding | Mountain Ceremony, Live Band, Photo Booth, Luxury Honeymoon, Uninvited Clown |
| Gaming Setup | Ultra-wide Monitor, Ergonomic Chair, RGB Lights, High-End Headset, Sticky Keyboard |

**Validation:** unique category IDs and item IDs; trimmed titles; required emoji; category has 12+ distinct active items; no empty items. Keep categories static for MVP so matches work offline after initial page load.

## 9. Core calculations and testable examples

### 9.1 Required invariants

At every stable outcome:

- Each player's roster length is in `0..5`.
- Each player's budget is an integer in `0..20` and is **at least their remaining open slots**.
- No card is acquired by both players; a card cannot be both discarded and acquired.
- Every acquired card has a positive integer cost; mandatory assignments cost exactly $1.
- `totalSpent + budgetRemaining === 20` for each player.
- `acquiredCount + discardedCount === numberOfResolvedDeckCards`.
- `remainingDeckCards >= totalOpenSlots` while match is active.
- All player data, outcomes, and UI state follow a valid transition.
- Upon finish, each player has **exactly 5** cards and no unresolved partial bid.

### 9.2 Minimum unit test scenarios

1. Start state: $20 each, zero picks, 12 unique cards.
2. Max bid for $20/5 slots = $16; $17 rejected; negative/decimal/NaN bids rejected.
3. Win at $16 leaves $4 with four slots; next max bid = $1.
4. Positive unequal bids choose higher amount and charge correct winner.
5. Equal positive bids choose current priority and flip it **exactly once**.
6. No positive bid + spare deck capacity => discard; don't spend.
7. No positive bid + no spare deck capacity => $1 mandatory assignment.
8. Mandatory assignment chooses greater open slots; equal slots use forced priority.
9. Full player cannot bid or receive cards; other player skips privacy handoff.
10. A duplicate action/repeated click cannot charge a round twice.
11. End state is 5 picks each; no leftover incomplete players across repeated seeded simulations (e.g., 1,000 random legal matches).
12. `START_MATCH` with category <12 valid items rejects gracefully.
13. Player name truncation/validation; no code injection from names or category values.
14. Versioned persistence restores safely; corrupt state resets cleanly.
15. Refresh during handoff reveals no prior bid.
16. Rematch completely resets budgets, picks, votes, priorities, and pending bids.
17. 320px layout, keyboard controls, large targets, focus management, `prefers-reduced-motion`.

### 9.3 E2E player journey

Select theme → set names → start → reveal → Player 1 bids $5 → opaque handoff → Player 2 bids $3 → outcome says Player 1 paid $5 → complete match through 12-or-fewer rounds → exactly five cards for each → vote locally → rematch. Write a Playwright test for this and for the both-pass path.

## 10. Detailed phased build plan

### Phase 0 — Foundation and design system

**Tasks**
1. Scaffold Vite React TypeScript project with current stable packages; install Tailwind and recommended tooling with compatible versions.
2. Create ESLint/TypeScript strict checks; Vitest + Testing Library; Playwright can be added when ready for E2E.
3. Establish design tokens, responsive page shell, typography, reusable Button/Card/Dialog components, focus states, and reduced-motion rules.
4. Add a polished **Home** screen and navigable **How to Play**.
5. Add a README quick-start section with precise commands and any setup assumptions.

**Acceptance:** `npm run dev`, `typecheck`, `lint`, and `build` work; responsive Home screen looks intentional at 375px and 1280px. No database or API keys.

### Phase 1 — Pure game engine + comprehensive tests

**Tasks**
1. Define types, category data, validation, seeded shuffle.
2. Implement bid legality, protected budgets, tie priority, discards, mandatory assignment, and completion.
3. Implement reducer transitions; reject invalid actions and double-resolves.
4. Write unit and seeded simulation tests covering Section 9.
5. Document any unavoidable ambiguities in an `Implementation Decisions` section rather than making silent decisions.

**Acceptance:** All rules tests pass; 1,000 seeded random legal matches finish 5/5 with invariants intact. No match UI required yet.

### Phase 2 — Complete local 1v1 user experience

**Tasks**
1. Category/players setup UI with validation.
2. Reveal and bidding screen wired to actual reducer, not mock state.
3. Complete opaque device-handoff screen and correct eligible-player handling.
4. Resolve outcome views including win/tie/discard/mandatory assignment.
5. Finished results page, local voting, rematch, new category, and confirm quit.
6. Add refresh-resume behavior, useful errors, and disabled controls in invalid states.

**Acceptance:** Two people can play an entire game on one phone without developer tools or manual state edits. Data is accurate; no bid leak during handoff. A browser refresh does not destroy the match or reveal a previous bid.

### Phase 3 — Polish, shareability, and launch MVP

**Tasks**
1. Card flip, win, tie, discard, and final reveal animations; reduced-motion equivalent.
2. Optional no-sound-by-default sound effects and emoji reactions.
3. Results image export using a suitable client-side approach; fallback to text share/copy if image export is unsupported.
4. Responsive polish across screen sizes; accessibility audit; test browser back/refresh.
5. Playwright flows, build checks, SEO/Open Graph metadata, favicon, and simple privacy notice (all MVP progress is in browser storage).
6. Deploy Vite project to **Vercel**, with build command `npm run build` and output directory `dist`.

**Acceptance:** A stranger can understand the game, finish a match, and share the result. Production build and smoke tests pass.

### Phase 4 — Online multiplayer (separate project milestone)

**Do not start until P0–P3 are accepted.**

See the [Phase 4 architecture and security design](docs/online-multiplayer.md) for the proposed release sequence and provider configuration.

- Design host-created room/invite flow with short-lived room tokens or authenticated guest identity.
- Keep the authoritative match state and sealed bids on the server, not in an untrusted browser state.
- Use a supported realtime provider (evaluate Ably/Pusher for channel authorization, reconnect, ordering, rate limits, and costs). Server issues authoritative events; clients do not decide winners.
- Persist active rooms/matches as needed (evaluate Neon PostgreSQL); use transactional state versioning or a concurrency-safe single-writer workflow.
- Define round timer (e.g., 15 seconds), timeouts as $0, room disconnection handling, reconnection snapshot, and abandoned-room cleanup.
- Validate every submitted bid against current turn/version, eligibility, and budget on server.
- Prevent spectators and the opponent from seeing unrevealed bids; enforce authorization and rate limits.
- Add online voting after match with anti-spam protections and expiration.
- Add telemetry only with clear privacy disclosure.

**Acceptance:** Two browsers can join the same room and finish a match, with consistent winner/budget outcome under reconnect, duplicate sends, and simultaneous submits.

### Phase 5 — Live Auction, Chaos, and Creator Mode

See [Phase 5 local variants](docs/phase-5.md) for the Live Auction rules, Creator view, and Chaos playtest candidates.

- Add an explicit **Secret Bid / Live Auction** mode choice only when live auction rules are fully specified and tested.
- Playtest Chaos abilities and implement only those that do not create unfair or unwinnable matches.
- Build portrait 9:16 **Creator Mode** with large titles, readable budgets, staged reveals, and safe visual zones for platform overlays.
- Provide replay metadata and a capture-friendly view; native video export is optional and should be evaluated for browser limitations and cost.
- Optional: audience voting landing page, custom categories, moderation, account profiles, and ranked ladders.

## 11. UX success criteria and analytics (no tracking required at MVP)

Evaluate during manual playtests:
- Can two people explain how bidding works after one round?
- Are there enough surprising / regrettable choices to spark conversation after the draft?
- Does the full match finish without confusing handoffs or rule disputes?
- Is the final comparison worth sharing?
- Does each category contain a fun mix rather than obviously optimal picks?

Avoid adding product analytics until there is a privacy policy and clear reason to collect them. Basic performance/error logs are sufficient for local MVP.

## 12. Definition of done and release checklist

- [x] Local Secret Bid works start to finish for 2 players.
- [x] At least 8 curated categories with >=12 unique eligible items each.
- [x] Both players start at $20 and end with exactly 5 cards.
- [x] Legal bids, ties, discards, mandatory assignments implemented exactly as specified.
- [x] No hidden bid is accidentally shown during handoff or on refresh.
- [x] Budget conservation and no duplicate allocation verified by tests.
- [x] Empty, invalid, and corrupted states handled gracefully.
- [ ] Mobile and desktop screens match the UI intent; no horizontal overflow.
- [ ] Keyboard play and reduced-motion support work.
- [x] All lint, typecheck, unit, E2E, and production build commands pass.
- [ ] Vercel deployment works without any paid services or environment variables.
- [ ] Hosted online rooms pass invite, reconnect, polling fallback, and cleanup checks.
- [ ] README accurately describes *implemented* features; future features clearly marked.

## 13. VS Code + Codex workflow

1. Create/open the `bid-brawl` folder in VS Code.
2. Add this file as `README.md`, and add `CODEX_PROMPTS.md` beside it.
3. Open the Codex coding agent with the project folder as its workspace.
4. Paste the **Phase 0** prompt from `CODEX_PROMPTS.md` and let Codex modify files and execute tests.
5. Review result and commit it (e.g., `git commit -m "feat: scaffold game foundation"`).
6. Run the Phase 1 prompt, then Phase 2, Phase 3. **Do not ask Codex to implement all phases at once.**
7. Test locally with a second person before adding online services.

### Recommended commands

```bash
# after Codex scaffolds the project
npm install
npm run dev
# before each commit
npm run typecheck && npm run lint && npm run test && npm run build
```

### Starter prompt (if you want only one prompt)

> You are my senior full-stack game engineer and UI designer. Read `README.md` completely and treat Sections 3, 4, 7, 9, and 10 as authoritative. Build **Phase 0 only** of Bid Brawl with Vite, React, strict TypeScript, Tailwind CSS, a premium responsive dark design, and accessible reusable components. Create the Home and How to Play screens, install/configure the testing and linting setup, and add working scripts for `dev`, `typecheck`, `lint`, `test`, and `build`. Do not implement backend or online multiplayer. Run checks, repair errors, and report changed files and remaining tasks. Do not stop after planning: actually write the code in this workspace.

## 14. Open product decisions (not permission to improvise)

- Should player starts alternate rather than always begin with P1? Test fairness after initial MVP.
- Would 14 cards / four discards make drafts more tense? Only change if playtesting supports it.
- Is one shared device genuinely fun for Secret Bid, or should Live Auction become the primary couch mode? Observe users first.
- Should a match include optional objective scoring for certain categories? Keep opinion voting the default.
- Do special abilities add entertainment without increasing confusion? Test separately as Chaos Mode.

**Rule change process:** Document the proposed rule, why it improves play, its effect on invariants, the exact tests that change, and the UI explanation before implementing.

---

**License:** Choose and add a license when publishing. This README alone grants no source-code license.
