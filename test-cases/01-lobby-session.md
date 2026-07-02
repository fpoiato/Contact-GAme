# Lobby and session

Common precondition for all tests: fresh room unless stated.

---

### TC-LOBBY-001: Create room and copy invite code

- **Priority:** P0
- **Players:** 1 (Host)
- **Tags:** lobby, create-room
- **Automation notes:** Assert URL matches `/lobby/[A-Z]{5}`

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | P1 | Open `/` | Landing visible |
| 2 | P1 | Enter nickname `Host`, create room | Navigate to `/lobby/XXXXX` |
| 3 | P1 | — | Room code displayed; invite/share control present |
| 4 | P1 | — | P1 listed as host and approved player |

---

### TC-LOBBY-002: Join pending until host approves

- **Priority:** P0
- **Players:** 2
- **Tags:** lobby, approval

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | P1 | Create room | In lobby |
| 2 | P2 | Join same room as `Alice` | Pending/waiting state (not in game) |
| 3 | P1 | — | Sees Alice in pending list |
| 4 | P1 | Approve Alice | Alice moves to approved list |
| 5 | P2 | — | Approved UI; no longer blocked |

---

### TC-LOBBY-003: Reject player cannot enter game

- **Priority:** P0
- **Players:** 2
- **Tags:** lobby, reject

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | P1 | Create room | — |
| 2 | P2 | Join as `Bob` | Pending |
| 3 | P1 | Reject Bob | Bob sees rejection / returned to landing |
| 4 | P2 | — | Cannot access `/game/:roomCode` without new approval |

---

### TC-LOBBY-004: Start game requires minimum 3 approved players

- **Priority:** P0
- **Players:** 2
- **Tags:** lobby, min-players

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | P1 | Create room, approve only 1 joiner (2 total) | Start disabled or error |
| 2 | P3 | Join and get approved (3 total) | Start enabled |
| 3 | P1 | Start game | All 3 navigate to `/game/:roomCode` |

---

### TC-LOBBY-005: Duplicate nickname join handling

- **Priority:** P1
- **Players:** 3
- **Tags:** lobby, nickname-collision

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | P1 | Create room as `Host` | — |
| 2 | P2 | Join as `Alice`, approved | — |
| 3 | P3 | Attempt join as `Alice` | Rejected or error (no duplicate active player) |
| 4 | All | — | Only one `Alice` in room |

---

### TC-LOBBY-006: Deep link join with room query param

- **Priority:** P1
- **Players:** 2
- **Tags:** lobby, deep-link

| # | Actor | Action | Expected |
|---|-------|--------|----------|
| 1 | P1 | Create room, note code `XXXXX` | — |
| 2 | P2 | Open `/?room=XXXXX` | Join flow pre-filled or room code recognized |
| 3 | P2 | Complete join + approval | Lands in lobby for same room |
