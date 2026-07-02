# Reconnect, refresh, and session resilience

**Precondition:** 4-player game in progress unless noted.

---

### TC-RECON-001: Non-host refresh mid CLUE_PHASE restores game

- **Priority:** P0
- **Players:** 4 (P2 = subject)
- **Tags:** refresh, state-recovery

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Reach `CLUE_PHASE` with clues on board | — |
| 2 | P2 | Note scores + revealed prefix | — |
| 3 | P2 | Hard refresh (`F5`) on `/game/:roomCode` | Brief loading |
| 4 | P2 | — | Game restored: same phase, clues, prefix, scores |
| 5 | P2 | — | No `RECONNECT_FAILED` error |

---

### TC-RECON-002: Non-host refresh during CONTACT_COUNTDOWN

- **Priority:** P0
- **Players:** 4
- **Tags:** refresh, contact

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Active contact countdown | — |
| 2 | P3 (participant or not) | Refresh page | Reloads into game |
| 3 | P3 | — | Still in `CONTACT_COUNTDOWN` or correct resolved phase (not stuck loading) |
| 4 | All | — | Contact resolves normally; no duplicate resolution |

---

### TC-RECON-003: Player disconnect shows grace overlay — rejoin within 60s

- **Priority:** P0
- **Players:** 4
- **Tags:** disconnect, grace-period

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | `CLUE_PHASE` | — |
| 2 | P3 | Close browser tab / disconnect WS | — |
| 3 | P1, P2, P4 | — | Overlay: waiting for P3 nickname, countdown ≤60s |
| 4 | P3 | Reopen, same nickname rejoin same room | Rejoin succeeds |
| 5 | All | — | Overlay clears; P3 back in player list; game continues |

---

### TC-RECON-004: Rejoin after refresh preserves nickname and scores

- **Priority:** P0
- **Players:** 4
- **Tags:** rejoin, scores

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Play until Bob has ≠0 score | — |
| 2 | Bob | Refresh page | — |
| 3 | Bob | — | Still `Bob`; score unchanged |
| 4 | All | — | Bob's `connectionId` may change but nickname stable |

---

### TC-RECON-005: Host disconnect promotes new host and recovers state

- **Priority:** P1
- **Players:** 4
- **Tags:** host-migration, critical

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | Mid-game with state | — |
| 2 | P1 (host) | Disconnect / close tab | — |
| 3 | P2 | — | Becomes host (or host promoted by join order) |
| 4 | Remaining | — | `REQUEST_HOST_STATE` / `STATE_SYNC` — game continues |
| 5 | All | — | **No** reset to empty `WORD_SETUP` within 5s (destructive fallback) |
| 6 | Any | Initiate contact | Resolution still works on new host |

---

### TC-RECON-006: Disconnect grace expires — room returns to lobby

- **Priority:** P1
- **Players:** 4
- **Tags:** disconnect, timeout

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | `CLUE_PHASE` | — |
| 2 | P3 | Disconnect and **do not** return | — |
| 3 | All | Wait >60s | Grace overlay expires |
| 4 | All | — | Navigated to `/lobby/:roomCode` or `LOBBY` phase |

---

### TC-RECON-007: Leave game (start fresh) clears session and navigates home

- **Priority:** P1
- **Players:** 2
- **Tags:** leave, session

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | P2 | In game, click leave/home (start fresh) | Navigate to `/` |
| 2 | P2 | — | Session cleared; re-navigating to old game URL requires join again |
| 3 | P1 | — | Game continues for remaining players |

---

### TC-RECON-008: Tab backgrounded 30s+ then foreground — WS reconnects

- **Priority:** P2
- **Players:** 2
- **Tags:** websocket, background-tab
- **Automation notes:** Use `page.evaluate` to blur tab or Playwright clock

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | All | In game | — |
| 2 | P2 | Background tab 30–60s | — |
| 3 | P2 | Foreground tab | WS reconnects (no permanent spinner) |
| 4 | P2 | — | State catches up via `requestGameState` if needed |
