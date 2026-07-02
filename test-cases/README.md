# Contact — AI agent test specification

This folder contains **manual and automation-ready test cases** for the Contact party word game. An AI test agent should read these specs, implement Playwright (or similar) multi-browser tests, run them, and file failures as fix tasks.

## Repository context

| Item | Location |
|------|----------|
| Game rules (authoritative engine) | `frontend/contact-app/src/app/core/services/game-engine.service.ts` |
| Routes | `/`, `/lobby/:roomCode`, `/game/:roomCode`, `/game/:roomCode/scoreboard` |
| Shared types | `shared/ws-types.ts` |
| Architecture (host relay, rejoin) | `docs/ARCHITECTURE.md` |

**Critical:** Game state is **host-authoritative**. Only the room host's browser runs `resolveContact()` and relays `RELAY` messages. Multi-user tests must use **separate browser contexts** (not one logged-in session).

## How to use this folder (AI agent workflow)

1. Read `setup.md` — environment, player naming, constants.
2. Load `manifest.yaml` — ordered list of all test IDs, priority, and source file.
3. For each test ID, open the referenced file and implement automation from the **Steps** table.
4. On failure, create a task using `BUG-REPORT-TEMPLATE.md`. Include: test ID, repro steps, expected vs actual, which player(s) diverged, phase, screenshots/logs.
5. Mark tests blocked if setup cannot be satisfied (e.g. no deployed `wsUrl`).

## Test case format

Each test uses this structure:

```
### TC-XXX-NNN: Title
- **Priority:** P0 | P1 | P2
- **Players:** N (roles listed)
- **Tags:** comma-separated
- **Automation notes:** hints for Playwright

| # | Actor | Action | Expected (verify on…) |
```

**Priority**

- **P0** — Core rules, data loss, security (secret leak), game-breaking desync
- **P1** — Reconnect, multi-user sync, scoring correctness
- **P2** — UI accidents, edge timers, polish

## Multi-player setup convention

Use **4 players** unless a test says otherwise:

| Slot | Role | Browser context |
|------|------|-----------------|
| P1 | Room **host** + often guesser | Context A |
| P2 | Guesser | Context B |
| P3 | Guesser | Context C |
| P4 | Guesser / spare | Context D |

Nicknames: `Host`, `Alice`, `Bob`, `Carol` (unique, stable for rejoin).

**Host ≠ Clue Giver** after round 1 (rotation). Tests should note who is Clue Giver via UI (*Criador de Senha* / revealed-word card).

## Observable assertions (automation-friendly)

Prefer checking:

- URL path (`/game/ABCDE`, `/scoreboard`)
- Visible phase indicators: countdown number, `CONTACT` button, secret-word form
- Text overlays: `BLOCKED`, `WORD GUESSED`, success reveal
- Score values in scores panel (button top-right)
- Used-words list badges: `matched` vs `blocked` (mint vs coral)
- Clue history count badge
- Absence of secret word in non–Clue Giver DOM / network `RELAY` payloads
- `localStorage` session key survival after refresh (via `SessionService`)

Avoid brittle CSS class assertions; use `data-testid` if added later (see `setup.md`).

## Constants (current)

| Constant | Value |
|----------|-------|
| `MIN_PLAYERS` | 3 |
| `MAX_PLAYERS` | 12 |
| `CLUE_TIMER_SECONDS` | 45 |
| `CLUE_LIFETIME_SECONDS` | 45 |
| `CONTACT_COUNTDOWN_SECONDS` | 30 |
| `BLOCK_GRACE_MS` | 2000 (engine) |
| `RECONNECT_GRACE_SECONDS` | 60 |
| Block points | +15 Clue Giver |
| Partial match | +15 each |
| Secret on contact | +50 clue author, +25 initiator |

## File index

| File | Domain |
|------|--------|
| `setup.md` | Environment and shared helpers |
| `01-lobby-session.md` | Create/join/approve/start |
| `02-game-core.md` | Clues, phases, scoring, rotation |
| `03-contact-block.md` | Contact resolution, block grace, used words |
| `04-multi-user-sync.md` | Cross-client state consistency |
| `05-reconnect-resilience.md` | Refresh, disconnect, host migration |
| `06-ui-accidents.md` | Popups, misclicks, double actions |
| `07-timers-edge.md` | Expiry, countdown, race conditions |
| `BUG-REPORT-TEMPLATE.md` | Failure output format for fix tasks |
