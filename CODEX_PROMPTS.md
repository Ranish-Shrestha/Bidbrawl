# Codex Prompts — Bid Brawl

Use these prompts in the **Codex VS Code extension**, with this directory open. Codex should read `README.md` first. Send **one phase at a time**. After each phase, inspect the changes, test manually, and commit before proceeding.

## 1. First prompt — Phase 0: scaffold and polished UI foundation

```text
Act as a senior React/TypeScript engineer and expert mobile game UI designer. Read README.md in full first. This is a new web game called Bid Brawl. Follow the scope and rules in README.md exactly. Implement PHASE 0 ONLY.

Deliverables:
- Scaffold a Vite React + TypeScript application in the current workspace, with Tailwind CSS and compatible current stable dependencies.
- Build a polished, mobile-first dark arcade/party-game visual system using the README color palette, responsive spacing, accessible focus states, and optional reduced-motion behavior.
- Create a high-quality Home screen (start game, how to play), How to Play modal/screen, and basic navigation shell. Add reusable Button, Card, and Dialog primitives as needed.
- Configure strict TypeScript, ESLint, Vitest + Testing Library, and scripts: dev, build, typecheck, lint, test.
- Do not build an API, database, accounts, multiplayer, or Chaos Mode. No API keys are required for MVP.
- Do not create fake functional controls; buttons and navigation must actually work.

Execution requirements:
1. Inspect the workspace before writing files; preserve any existing user work.
2. Implement directly, not just a plan.
3. Run npm install, typecheck, lint, test, and build; fix failures.
4. Summarize files created/modified, commands/results, and any decisions. Stop after Phase 0.
```

## 2. Phase 1 — deterministic rules + tests

```text
Read README.md fully, focusing on Sections 3, 7, 8, and 9. Implement PHASE 1 ONLY: a pure deterministic game engine for Bid Brawl.

Build the typed category model and at least 8 curated categories with 20–30 unique items each. Implement match initialization (12 unique mystery cards), budget reservation, bid validation, secret bidding transitions, tie priority, discard eligibility, $1 mandatory assignments, no double resolution, exact five-card completion, and pure selectors. Use useReducer-compatible pure actions but do not integrate the full match UI yet.

Tests must cover all 17 scenarios in README Section 9, including at least 1,000 seeded randomized legal matches with invariant assertions. Ensure both-pass behavior is mathematically consistent: a card can only be discarded if cards remaining INCLUDING current > total empty roster slots. Protect at least $1 for each future slot when placing a bid. Priorities only toggle under their documented trigger.

Run typecheck, lint, tests and build. Fix failures. Do not implement backend, networking, Chaos Mode, or alternative auction modes. Summarize implementation and test results, then stop.
```

## 3. Phase 2 — complete playable local game

```text
Read README.md, especially the screen wireframes in Section 4 and the exact rules in Section 3. Implement PHASE 2 ONLY: wire the existing pure game engine into a fully playable LOCAL 2-player game.

Create category/player setup, card reveal, legal private bid controls, opaque device handoff with no previous bid leakage, second-player bid, simultaneous bid/outcome reveal, correct discard/mandatory explanations, dynamic budgets/slots, final 5-vs-5 showdown, optional local winner vote, rematch, new category, and confirm exit. Skip ineligible full players' bid screens. Persist a versioned match in localStorage and restore privately after reload; reject invalid stored states gracefully.

The UI must feel like a premium mobile-first game and be usable at 320px and desktop, with accessible interaction and reduced-motion handling. Use real reducer state, not hardcoded card or score data. Do not add any API or account requirement.

Add Testing Library flow tests and a Playwright smoke test if feasible. Run typecheck, lint, test, build; fix failures. Report what works, manual test instructions, and any limitations. Stop after Phase 2.
```

## 4. Phase 3 — delight, sharing and Vercel launch

```text
Read README.md Phase 3. Polish the implemented local game without altering its rules. Add tasteful card flip/reveal animation, outcome transitions, optional emoji reactions, sound toggle default OFF (if practical), reduced-motion equivalents, improved mobile and desktop layouts, accessible focus/announcements, proper errors and loading states, favicon and metadata.

Create a shareable final-result image export or a safe text-share fallback; do not require a paid provider. Add Playwright happy path and both-pass flows and fix issues found. Prepare Vercel deployment of the Vite static app (npm run build, output dist); write straightforward deployment instructions and ensure no secrets or database are needed.

Run typecheck, lint, unit tests, E2E tests (if set up), and build. Explain completed features, outstanding caveats, and exact deployment steps. Stop after Phase 3.
```

## 5. Phase 4 — online multiplayer (ONLY when local MVP is stable)

```text
Read README.md Phase 4. First inspect the existing working local game, and propose a minimal secure online-multiplayer architecture compatible with Vercel, using managed realtime (Ably or Pusher) and optional Neon PostgreSQL if durable rooms are needed. State expected provider accounts, environment variables, free-tier limitations, and architectural tradeoffs. Do not assume Vercel serverless functions host persistent WebSockets.

Before introducing external services, produce a concise implementation plan and security model covering room identity, private unrevealed bids, server-authoritative state, concurrency/versioning, reconnect, timeouts, duplicate messages, expiry/cleanup, and abuse prevention. Implement after the architecture is decided and documented. Preserve the working local mode. Add integration tests and deployment documentation. Never expose private bids on opponent channels before outcome reveal.
```

## 6. Reusable review/debug prompt

```text
Audit this Bid Brawl repository against README.md as a strict product spec. Do not merely summarize. Inspect relevant source and tests, run typecheck, lint, test and build, then identify concrete bugs, broken flows, accessibility problems, design inconsistencies, missing acceptance criteria, and rule violations. Prioritize by severity and cite exact files/functions. Fix high-confidence issues without introducing scope creep; add regression tests; report what you changed and what still needs manual checking.
```

## 7. Optional UI-only improvement prompt

```text
Act as a senior UI/UX engineer. Preserve all game rules and data flows. Refine Bid Brawl's visual design based on README Section 4 to look like a premium, viral-friendly mobile party game: great card emphasis, polished dark theme, responsive player status, clear private bid controls, smooth optional reveal animation, and a beautiful final showdown. Ensure 320px responsiveness, 44px touch targets, contrast, keyboard operation, reduced motion, and no private bid leakage. Do not add dependencies unless necessary. Run all checks and show what changed.
```

## Practical guidance

- **Best workflow:** Phase 0 → Phase 1 → Phase 2 → Phase 3, with manual reviews and git commits between each.
- Use a **strong coding/reasoning configuration** for Phase 1 rules and Phase 4 networking; a faster setting is fine for minor copy/color changes.
- Ask Codex to **write code, run commands, and verify**, not merely generate an implementation plan.
- For large changes, request one phase or one subsystem at a time. Keep `README.md` current when gameplay decisions change.
