# Multi-user synchronization

**Precondition:** 4 players in active game (`CLUE_PHASE` or later).

---

### TC-SYNC-001: All clients show same revealed prefix after partial match

- **Priority:** P0
- **Players:** 4
- **Tags:** sync, reveal

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Note revealed prefix (e.g. `O`) | — |
| 2 | Any | Partial match → +1 letter | — |
| 3 | P1, P2, P3, P4 | Read prefix simultaneously | **Identical** string on all (e.g. `OR`) |

---

### TC-SYNC-002: Non-host contact action reaches host and resolves

- **Priority:** P0
- **Players:** 4 (P1 = host)
- **Tags:** host-relay, forward-to-host

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | P1 | Remain host but **do not** initiate contact | — |
| 2 | P2 (non-host) | Contact clue | All see countdown |
| 3 | P2 + clue author | Submit words | Resolution on all within 5s |
| 4 | All | — | Same outcome (match/block/fail) on every client |

---

### TC-SYNC-003: Secret word never in RELAY for non–Clue Givers

- **Priority:** P0
- **Players:** 4
- **Tags:** security, redaction
- **Automation notes:** Intercept WebSocket frames on P2 during full round

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Clue Giver | Set secret `MANGO` | — |
| 2 | P2 (not Clue Giver) | Play through clues + contacts | — |
| 3 | P2 | Capture all `RELAY` payloads | `secretWord` absent or redacted in `state` |
| 4 | P2 | — | DOM never shows `MANGO` until round complete scoreboard |

---

### TC-SYNC-004: Scores identical on all clients after block

- **Priority:** P1
- **Players:** 4
- **Tags:** scoring, sync

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Successful block (+15 Clue Giver) | — |
| 2 | Each player | Open scores overlay | Every player's total matches across all 4 clients |

---

### TC-SYNC-005: Contact countdown visible on all clients

- **Priority:** P1
- **Players:** 4
- **Tags:** timer, sync

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Any | Initiate contact | — |
| 2 | All | Read countdown number within same second | Values equal ±1s (host-driven) |

---

### TC-SYNC-006: Game overlays sync (BLOCKED, SUCCESS, WORD GUESSED)

- **Priority:** P1
- **Players:** 4
- **Tags:** overlay, sync

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Trigger block overlay | All 4 show `BLOCKED` |
| 2 | All | New round/setup; trigger partial match | All show success reveal overlay |
| 3 | All | Secret word match | All show `WORD GUESSED` before scoreboard |

---

### TC-SYNC-007: Clue lifetime timer roughly aligned across clients

- **Priority:** P2
- **Players:** 4
- **Tags:** timer, drift

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | Alice | Submit clue | — |
| 2 | All | Read clue lifetime seconds | Same value ±2s on all clients |
