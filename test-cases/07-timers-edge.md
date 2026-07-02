# Timers, expiry, and race conditions

**Precondition:** 4-player game with secret word set unless noted.

**Automation notes:** Several tests require waiting 30–45s. Keep host tab **foreground** (host runs authoritative timers). Note actual elapsed time in failure reports.

---

### TC-TIME-001: Contact countdown timeout with no guesses — clue phase resumes

- **Priority:** P1
- **Players:** 4
- **Tags:** contact, timeout
- **Automation notes:** Wait full `CONTACT_COUNTDOWN_SECONDS` (30s) without any word submissions

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Alice | Submit clue | Card on board |
| 2 | Bob | Contact Alice's clue | `CONTACT_COUNTDOWN` on all |
| 3 | Bob + Alice + Clue Giver | Submit **nothing** | Countdown runs to 0 |
| 4 | All | — | Phase → `CLUE_PHASE` (no match, no block) |
| 5 | All | — | Contacted clue archived (not on active board) |
| 6 | All | — | No score changes |

---

### TC-TIME-002: Clue expires on board during CLUE_PHASE

- **Priority:** P1
- **Players:** 4
- **Tags:** clue-lifetime, expiry
- **Automation notes:** Wait full `CLUE_LIFETIME_SECONDS` (45s) after clue submit

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Alice | Submit clue | Card visible with lifetime timer |
| 2 | All | Wait until clue lifetime reaches 0 | — |
| 3 | All | — | Clue removed from active board |
| 4 | All | — | Clue appears in history panel |
| 5 | All | — | Still in `CLUE_PHASE`; no contact triggered |

---

### TC-TIME-003: Clue expires during active contact cancels contact

- **Priority:** P1
- **Players:** 4
- **Tags:** clue-lifetime, contact, race
- **Automation notes:** Start contact when clue has ~5s lifetime remaining; do not submit words

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Alice | Submit clue | Timer counting down |
| 2 | All | Wait until clue lifetime ≤5s | — |
| 3 | Bob | Contact Alice's clue | `CONTACT_COUNTDOWN` |
| 4 | All | Wait for clue lifetime to expire | — |
| 5 | All | — | Contact cancelled; phase → `CLUE_PHASE` |
| 6 | All | — | No scores change; no block/match overlay |

---

### TC-TIME-004: Both submit early — block grace then resolve without full 30s wait

- **Priority:** P2
- **Players:** 4
- **Tags:** contact, block-grace, early-resolve
- **Automation notes:** `BLOCK_GRACE_MS` = 2000; resolution should occur ~2s after both submit, not 30s

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Setup contact on partial word | Countdown starts at ~30 |
| 2 | Bob + Alice | Both submit matching word (not secret) | — |
| 3 | Clue Giver | Do **not** block | — |
| 4 | All | Measure time to match resolve | Resolves within ~2–4s (not full 30s) |
| 5 | All | — | Partial match outcome (+15 each) |

---

### TC-TIME-005: Multiple active clues expire independently

- **Priority:** P2
- **Players:** 4
- **Tags:** clue-lifetime, multiple-clues
- **Automation notes:** Submit two clues ~10s apart; wait for both to expire

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Alice | Submit clue A | Card A on board |
| 2 | Bob | Wait ~10s, submit clue B | Both cards visible |
| 3 | All | Wait for clue A lifetime to expire | Only card A removed |
| 4 | All | — | Card B still active with its own timer |
| 5 | All | Wait for clue B to expire | Card B removed |
| 6 | All | — | Both clues in history; `CLUE_PHASE` continues |
