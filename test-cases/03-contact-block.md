# Contact, block, and used words

**Precondition:** Game in `CLUE_PHASE` with secret word set and at least one active clue unless noted.

---

### TC-BLOCK-001: Successful block awards +15 only — round continues

- **Priority:** P0
- **Players:** 4
- **Tags:** block, scoring

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Alice | Submit clue | — |
| 2 | Bob | Contact Alice's clue | `CONTACT_COUNTDOWN` |
| 3 | Bob + Alice | Submit matching word `APPLE` (not secret) | — |
| 4 | Clue Giver | Submit block `APPLE` within grace window | `BLOCKED` overlay on all |
| 5 | All | — | Clue Giver +15 only; Alice/Bob **no** +15 match points |
| 6 | All | — | After ~2.5s overlay clears → `CLUE_PHASE`; round **not** over |
| 7 | All | — | Used words: `APPLE` labeled **blocked** (coral) |

---

### TC-BLOCK-002: Block on secret-word contact prevents round end

- **Priority:** P0
- **Players:** 4
- **Tags:** block, round-end, regression
- **Regression for:** block vs early resolve race

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Secret word `ORANGE` | — |
| 2 | Alice | Clue; Bob contacts | Countdown |
| 3 | Bob + Alice | Both submit `ORANGE` | — |
| 4 | Clue Giver | Block `ORANGE` quickly (within 2s grace) | `BLOCKED` overlay |
| 5 | All | — | **No** `WORD GUESSED`; **no** +50/+25 |
| 6 | All | — | Clue Giver +15; game continues |
| 7 | All | — | **Not** on scoreboard route |

---

### TC-BLOCK-003: Block grace — clue giver can block after both submit

- **Priority:** P0
- **Players:** 4
- **Tags:** block, timing, regression

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Setup contact on partial word | — |
| 2 | Bob + Alice | Submit matching guess **before** Clue Giver blocks | Wait ≤2s (do not expect instant match resolve) |
| 3 | Clue Giver | Submit block matching their word | Block wins |
| 4 | All | — | Block outcome, not match outcome |

---

### TC-BLOCK-004: Contacted clue removed from board after resolution

- **Priority:** P0
- **Players:** 4
- **Tags:** clue-archive, ui
- **Regression for:** clue card lingering after contact

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Alice | Submit clue | Card on board |
| 2 | Bob | Contact; both submit (match or block) | — |
| 3 | All | — | Alice's clue **not** in active clue list (even if lifetime timer had time left) |
| 4 | All | — | Clue appears in history panel (expired count ≥1) |

---

### TC-BLOCK-005: Used words list shows matched vs blocked badges

- **Priority:** P1
- **Players:** 4
- **Tags:** used-words, ui

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Partial match on `APPLE` | Used list: `APPLE` + matched badge |
| 2 | All | Later block on `BANANA` | Used list: `BANANA` + blocked badge |
| 3 | All | — | Both words visible simultaneously with distinct styling |

---

### TC-BLOCK-006: Cannot submit used match word during contact

- **Priority:** P1
- **Players:** 4
- **Tags:** used-words, validation

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Partial match `APPLE` (now used) | — |
| 2 | Carol | New clue; Dave contacts | Contact form open |
| 3 | Dave | Type `APPLE` in contact word field | Error `WORD_ALREADY_USED`; submit disabled |
| 4 | Dave | Submit different valid word | Accepted |

---

### TC-BLOCK-007: Abandon contact returns to clue phase with clue still active

- **Priority:** P1
- **Players:** 4
- **Tags:** abandon, contact

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Bob | Initiate contact on Alice's clue | Countdown |
| 2 | Bob | Click `Abandon contact` | Phase → `CLUE_PHASE` |
| 3 | All | — | Alice's clue **still** on active board (not archived) |
| 4 | All | — | No scores change |

---

### TC-BLOCK-008: Failed contact (mismatched words) archives clue

- **Priority:** P2
- **Players:** 4
- **Tags:** no-match, clue-archive

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Bob | Contact Alice's clue | Countdown |
| 2 | Bob | Submit `APPLE` | — |
| 3 | Alice | Submit `BANANA` | Wait for grace + resolve |
| 4 | All | — | `CLUE_PHASE`; no score change |
| 5 | All | — | Contacted clue removed from active board |
| 6 | All | — | No used-word entry for failed attempt |
