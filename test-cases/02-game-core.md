# Core game flow

**Precondition (unless noted):** 4 players approved; game started; reach `WORD_SETUP` or `CLUE_PHASE`.

---

### TC-CORE-001: Clue Giver sets secret word — others see first letter only

- **Priority:** P0
- **Players:** 4
- **Tags:** secret-word, redaction, security
- **Automation notes:** Inspect DOM and WS payloads on P2–P4 for full secret

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Start game | `WORD_SETUP` on all clients |
| 2 | Clue Giver | Open secret word form, enter valid word (e.g. `ORANGE`), submit | Phase → `CLUE_PHASE` |
| 3 | Clue Giver | — | Can hold-to-reveal full word |
| 4 | P2, P3, P4 | — | Revealed prefix shows **first letter only** (e.g. `O`) |
| 5 | P2 | — | No full secret in page source, `state$`, or intercepted `RELAY` |

---

### TC-CORE-002: Guesser submits clue — appears for all players

- **Priority:** P0
- **Players:** 4
- **Tags:** clue, sync

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Complete WORD_SETUP | `CLUE_PHASE` |
| 2 | Guesser (not Clue Giver) | Create clue → submit text `A fruit` | Popup closes |
| 3 | All | — | Active clue card visible with author nickname and text |
| 4 | All | — | Clue lifetime timer counting down (~45s) |

---

### TC-CORE-003: Clue Giver cannot contact own clue

- **Priority:** P0
- **Players:** 4
- **Tags:** clue, contact-rules

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Clue Giver | Wait (do not submit clue) | — |
| 2 | Other guesser | Submit clue | Clue on board |
| 3 | Clue Giver | — | No `CONTACT` button on any clue they authored |
| 4 | Another guesser | — | `CONTACT` visible on others' clues |

---

### TC-CORE-004: Partial contact match reveals letter and awards 15+15

- **Priority:** P0
- **Players:** 4
- **Tags:** scoring, partial-match

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Secret word set (e.g. `ORANGE`) | — |
| 2 | Alice | Submit clue | — |
| 3 | Bob | Contact Alice's clue | `CONTACT_COUNTDOWN` |
| 4 | Bob + Alice | Both submit same word **≠ secret** (e.g. `APPLE`) | Success overlay; next letter revealed |
| 5 | All | — | Alice +15, Bob +15 in scores |
| 6 | All | — | Used words shows `APPLE` as **matched** (mint) |
| 7 | All | — | Active clues cleared; back to `CLUE_PHASE` |

---

### TC-CORE-005: Secret word contact ends round with correct scores

- **Priority:** P0
- **Players:** 4
- **Tags:** scoring, round-end

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Secret word `ORANGE` | — |
| 2 | Alice | Clue; Bob contacts | Countdown |
| 3 | Bob + Alice | Both submit `ORANGE` | `WORD GUESSED` overlay |
| 4 | All | — | Alice +50, Bob +25 (check scores panel) |
| 5 | All | — | Navigate to `/game/:roomCode/scoreboard` |
| 6 | All | — | Full secret visible on scoreboard |

---

### TC-CORE-006: Round scoreboard and continue rotates Clue Giver

- **Priority:** P1
- **Players:** 4
- **Tags:** rotation, scoreboard

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Complete one round (TC-CORE-005) | On scoreboard |
| 2 | Host | Continue / next round | `WORD_SETUP` |
| 3 | All | — | Clue Giver is **different** player (next by join order) |
| 4 | All | — | Scores preserved; used words cleared |

---

### TC-CORE-007: Mid-game approved joiner spectates until next round

- **Priority:** P1
- **Players:** 5
- **Tags:** mid-game-join, spectator

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | P1–P4 | Start game, enter `CLUE_PHASE` | — |
| 5 | P5 | Join room, get approved mid-game | Enters game route |
| 5 | P5 | — | Spectator banner (`JOIN_NEXT_ROUND`); cannot create clue or contact |
| 1 | Host | Complete round → continue | P5 active next round (can play) |

---

### TC-CORE-008: Invalid secret word rejected in form

- **Priority:** P2
- **Players:** 4
- **Tags:** validation

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Clue Giver | Enter `AB` (too short) | Error; submit disabled |
| 2 | Clue Giver | Enter `TOOLONGWORDHERE` | Error; submit disabled |
| 3 | Clue Giver | Enter `AB12` | Error (non-letters) |
| 4 | Clue Giver | Enter valid `TABLE` | Submit succeeds |
