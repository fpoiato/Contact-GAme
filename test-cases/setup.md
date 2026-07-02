# Test environment setup

## Prerequisites

1. **Frontend** running (`npm start` → `http://localhost:4200`) **or** deployed build.
2. **WebSocket backend** reachable (`environment.ts` / `environment.prod.ts` `wsUrl`).
3. **4 isolated browser contexts** (Playwright: 4 `browser.newContext()`; manual: 4 tabs/incognito windows).

## Environment variables (automation)

| Variable | Example | Purpose |
|----------|---------|---------|
| `CONTACT_BASE_URL` | `http://localhost:4200` | App origin |
| `CONTACT_WS_URL` | `wss://…` | Optional WS health check |

## Player bootstrap helper

Repeat for each player context:

1. Navigate to `CONTACT_BASE_URL`.
2. **P1 (Host):** Create room → note 5-letter `roomCode` from URL `/lobby/XXXXX`.
3. **P2–P4:** Join with `roomCode` + unique nickname.
4. **P1:** Approve all pending players.
5. **P1:** Start game when ≥3 approved.

Store per context:

- `nickname`
- `roomCode`
- `isHost` (only P1)

## Session / rejoin

Session persists in `localStorage` (via `SessionService`). After refresh:

- Same context should auto `REJOIN_ROOM` on `/game/:roomCode` or `/lobby/:roomCode`.
- Use **same nickname** as before.

## Suggested Playwright patterns

```typescript
// One test — four pages
const host = await browser.newContext();
const alice = await browser.newContext();
// …

// Wait for host relay (non-host)
await expect(alicePage.locator('text=BLOCKED')).toBeVisible({ timeout: 5000 });

// Network: ensure secret not leaked
const relays = await alicePage.waitForResponse(r =>
  r.url().includes('websocket') /* or intercept WS frame */);
```

## Optional `data-testid` additions (for implementer)

If tests are flaky, add IDs in `game-room.component.html`:

- `data-testid="revealed-prefix"`
- `data-testid="contact-countdown"`
- `data-testid="used-words-list"`
- `data-testid="clue-card-{id}"`
- `data-testid="game-overlay"`

File a separate task if missing — do not block P0 on testids if text/role selectors work.

## Known architecture constraints

- Only **host** runs game engine timers (`resolveContact`, clue expiry). If host tab is throttled (background), timers may drift — note in failure reports.
- Host migration fallback after 5s may reset to `WORD_SETUP` (destructive) — flag as P0 if seen outside intentional host-death tests.
