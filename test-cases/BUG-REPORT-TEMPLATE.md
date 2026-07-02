# Bug report template (for AI test agents)

When a test from this folder **fails**, create a fix task using the structure below. Copy this template and fill every section.

---

## Summary

**Test ID:** TC-XXXX-NNN  
**Title:** (from manifest)  
**Priority:** P0 | P1 | P2  
**Status:** FAIL | FLAKY | BLOCKED

One sentence describing what went wrong.

---

## Environment

| Field | Value |
|-------|-------|
| `CONTACT_BASE_URL` | |
| App version (`version.ts`) | |
| Browser / Playwright version | |
| Players used | e.g. 4 (Host, Alice, Bob, Carol) |
| Host player | P1 |
| Clue Giver (if relevant) | |

---

## Reproduction

### Preconditions

- (e.g. fresh room, game in `CLUE_PHASE`, secret word set)

### Steps

1. 
2. 
3. 

(Fail at step #___)

---

## Expected vs actual

| | Detail |
|---|--------|
| **Expected** | (from test spec table) |
| **Actual** | What happened instead |

---

## Divergence details

| Player | Observed state / UI |
|--------|---------------------|
| P1 (Host) | |
| P2 | |
| P3 | |
| P4 | |

**Phase at failure:** `LOBBY` | `WORD_SETUP` | `CLUE_PHASE` | `CONTACT_COUNTDOWN` | `BLOCKED` | other

**Which client(s) diverged:** (list player nicknames)

---

## Evidence

- [ ] Screenshot(s) — attach paths or links
- [ ] Browser console errors (per player if different)
- [ ] WebSocket log snippet (redact tokens)
- [ ] `RELAY` payload sample (confirm `secretWord` redaction if security test)

```
(paste relevant logs)
```

---

## Classification

| Tag | Apply if true |
|-----|----------------|
| `host-relay` | Non-host action not forwarded / host didn't resolve |
| `sync` | Clients show different state |
| `security` | Secret word leaked to non–Clue Giver |
| `timer` | Countdown / expiry wrong or host throttling suspected |
| `reconnect` | Refresh / disconnect / host migration involved |
| `ui` | Overlay, popup, or misclick behavior |
| `scoring` | Points wrong |

**Suggested fix area:** (e.g. `game-engine.service.ts`, `game-room.component.ts`, Lambda `message.ts`)

---

## Blocked setup (if applicable)

If the test could not run (no `wsUrl`, fewer than 3 browsers, etc.):

- **Reason:**
- **Unblock requires:**

---

## Retest checklist

After fix, re-run:

- [ ] Failing test ID
- [ ] Related P0 tests in same file
- [ ] Any regression tests cited in the spec (`Regression for:`)
