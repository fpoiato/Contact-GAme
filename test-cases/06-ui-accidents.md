# UI accidents, popups, and misclicks

**Precondition:** 4-player game in `CLUE_PHASE` with secret word set unless noted.

---

### TC-UI-001: Cancel clue popup — no clue published

- **Priority:** P1
- **Players:** 4
- **Tags:** clue, popup, cancel

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Guesser (not Clue Giver) | Click `Create clue` | Clue popup opens with timer |
| 2 | Same | Type partial text `A fru` | — |
| 3 | Same | Click `Cancel` | Popup closes |
| 4 | All | — | No new clue card on board |
| 5 | Same | — | Can reopen clue popup |

---

### TC-UI-002: Clue timer expires with empty textarea — popup closes

- **Priority:** P1
- **Players:** 4
- **Tags:** clue, timer, popup
- **Automation notes:** Wait full `CLUE_TIMER_SECONDS` (45s); do not submit

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Guesser | Open clue popup | Timer visible (~45s) |
| 2 | Same | Leave textarea empty | — |
| 3 | Same | Wait until timer reaches 0 | Popup auto-closes |
| 4 | All | — | No clue published |

---

### TC-UI-003: Double-click Contact — single contact only

- **Priority:** P1
- **Players:** 4
- **Tags:** contact, double-action
- **Automation notes:** Rapid double-click `CONTACT` on same clue card

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Alice | Submit clue | Card on board |
| 2 | Bob | Double-click `CONTACT` quickly | — |
| 3 | All | — | Exactly one `CONTACT_COUNTDOWN` phase |
| 4 | All | — | Single contact pair (Bob + Alice); no duplicate countdowns |

---

### TC-UI-004: Double-submit contact word — one guess counted

- **Priority:** P1
- **Players:** 4
- **Tags:** contact, double-action
- **Automation notes:** Double-click `Submit word` or rapid Enter key

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Bob | Contact Alice's clue | Contact word form open |
| 2 | Bob | Enter `APPLE`, double-submit quickly | Form closes after first submit |
| 3 | All | — | Bob's guess recorded once |
| 4 | Bob | — | Cannot re-open contact guess form (`guessSubmitted` locked) |

---

### TC-UI-005: Close history overlay by backdrop click

- **Priority:** P1
- **Players:** 4
- **Tags:** overlay, history, backdrop

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Any | Click history button (clock icon) | History overlay visible |
| 2 | Same | Click dark backdrop outside card | Overlay closes |
| 3 | Same | — | Game board visible; history button not highlighted |

---

### TC-UI-006: Close scores overlay by backdrop click

- **Priority:** P1
- **Players:** 4
- **Tags:** overlay, scores, backdrop

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Any | Click scores button (trophy icon) | Scores overlay visible |
| 2 | Same | Click dark backdrop outside card | Overlay closes |
| 3 | Same | — | Game board visible; scores button not highlighted |

---

### TC-UI-007: Misclick outside clue form does not dismiss (no backdrop close)

- **Priority:** P2
- **Players:** 4
- **Tags:** clue, popup, backdrop
- **Regression for:** accidental clue loss from backdrop tap

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Guesser | Open clue popup, type text | Popup open |
| 2 | Same | Click/tap dark area outside the white card | Popup **stays open** |
| 3 | Same | — | Typed text preserved |
| 4 | Same | Cancel or submit explicitly | Popup closes only via button |

---

### TC-UI-008: Rapid open/close history and scores — no stuck overlay

- **Priority:** P2
- **Players:** 4
- **Tags:** overlay, stress

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Any | Open history → close → open scores → close (repeat 5× quickly) | — |
| 2 | Same | — | No overlay stuck on screen |
| 3 | Same | — | Game interactions (create clue, contact) still work |

---

### TC-UI-009: Submit block then attempt second block — locked state

- **Priority:** P2
- **Players:** 4
- **Tags:** block, double-action

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Setup contact with matching partial word | Countdown active |
| 2 | Clue Giver | Submit block word `APPLE` | Block form closes |
| 3 | Clue Giver | — | Block form does **not** reappear (`blockSubmitted` lock) |
| 4 | All | — | Single block resolution; no duplicate block attempts |

---

### TC-UI-010: Peek secret word hold-to-reveal hides on release

- **Priority:** P2
- **Players:** 4 (Clue Giver = subject)
- **Tags:** secret-word, peek, clue-giver-only

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Enter `CLUE_PHASE` | — |
| 2 | Clue Giver | Note revealed prefix (partial letters only) | e.g. `O` |
| 3 | Clue Giver | Press and hold `Show secret word` button | Full secret visible in revealed area |
| 4 | Clue Giver | Release pointer | Reverts to partial prefix only |
| 5 | P2 (non–Clue Giver) | — | No peek button visible |
