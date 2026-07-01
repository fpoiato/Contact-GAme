# Agent guide — Contact / Contato

This file is the **entry point for AI coding agents** working in this repository. Read it first, then follow links for deeper context.

## What this project is

**Contact** (Portuguese UI: **Contato**) is a mobile-first, real-time party word game for 3–12 players.

- One player per round is the **Clue Giver** (*Criador de Senha* in PT-BR) and knows the secret word.
- **Guessers** post clues and call **Contact** on a clue when they think they share the same idea with its author.
- During Contact, both players submit a word; the Clue Giver may **block** if they guess the matched word.
- Matching reveals letters of the secret word; guessing the full word ends the round.

## Repository layout

```
contact-game/
├── frontend/contact-app/     # Angular 19 SPA (game UI)
├── infra/cdk/                # AWS CDK: WebSocket API, Lambda, DynamoDB
├── infra/terraform/          # S3 + CloudFront static hosting
├── shared/ws-types.ts        # Shared WebSocket / game types (keep in sync!)
├── pipeline/buildspec.yml    # AWS CodeBuild deploy spec
├── docs/                     # Architecture, game rules, development
└── .github/workflows/        # CI + CodePipeline trigger
```

**npm workspaces:** root `package.json` includes `frontend/contact-app` and `infra/cdk`.

## Critical architecture rule

**Game state is host-authoritative and ephemeral.**

- The **room host's browser** holds canonical `GameState` in `GameEngineService`.
- The host applies all game logic and broadcasts snapshots via WebSocket `RELAY` messages.
- AWS backend handles **rooms, connections, approvals, rejoin slots, and message routing** — not game rules.
- Non-host clients send game intents with `FORWARD_TO_HOST` → host receives `PLAYER_ACTION`.

When changing game behavior, **`frontend/contact-app/src/app/core/services/game-engine.service.ts`** is almost always the right place.

## Key files (quick map)

| Area | Path |
|------|------|
| Game logic (host) | `frontend/contact-app/src/app/core/services/game-engine.service.ts` |
| Room / lobby / rejoin | `frontend/contact-app/src/app/core/services/room.service.ts` |
| WebSocket client | `frontend/contact-app/src/app/core/services/websocket.service.ts` |
| Session persistence | `frontend/contact-app/src/app/core/services/session.service.ts` |
| Types + constants | `frontend/contact-app/src/app/core/models/ws-types.ts` **and** `shared/ws-types.ts` |
| App version | `frontend/contact-app/src/app/core/constants/version.ts` |
| Routes | `frontend/contact-app/src/app/app.routes.ts` |
| Game UI | `frontend/contact-app/src/app/features/game/` |
| i18n (EN + PT-BR) | `frontend/contact-app/src/assets/i18n/` |
| WS message router | `infra/cdk/lambda/src/message.ts` |
| Disconnect / host promotion | `infra/cdk/lambda/src/disconnect.ts` |
| DynamoDB helpers | `infra/cdk/lambda/src/lib/ddb.ts` |

## Routes

| Path | Component | Purpose |
|------|-----------|---------|
| `/` | `LandingComponent` | Create/join room |
| `/lobby/:roomCode` | `LobbyComponent` | Approvals, invite, start game |
| `/game/:roomCode` | `GameRoomComponent` | Active round |
| `/game/:roomCode/scoreboard` | `RoundScoreboardComponent` | End-of-round scores |

## Types duplication — keep in sync

`shared/ws-types.ts` and `frontend/contact-app/src/app/core/models/ws-types.ts` **duplicate** most definitions. The frontend copy also has `createInitialState()`. **Update both** when changing constants, phases, or payload shapes.

Current timers (as of v0.1.1):

- Clue writing: **45s** (`CLUE_TIMER_SECONDS`)
- Contact countdown: **30s** (`CONTACT_COUNTDOWN_SECONDS`) — resolves **early** when both contact players submit
- Vote timeout constant exists (**30s**) but `MATCH_VOTE` phase is **not implemented** in the engine (legacy types/i18n remain)

## Scoring (implemented)

| Event | Points |
|-------|--------|
| Partial contact match (same word, not secret) | +15 each (initiator + clue author) |
| Secret word guessed on contact | +50 clue author, +25 contact caller |
| Successful block | +15 Clue Giver |

## Conventions for agents

1. **Minimize scope** — match existing Angular standalone components, Tailwind utility classes, and RxJS patterns.
2. **i18n** — add strings to both `en.json` and `pt-BR.json`; PT-BR uses *Contato* / *Criador de Senha*.
3. **Version bumps** — update `version.ts` and `frontend/contact-app/package.json` when shipping user-visible releases.
4. **Do not commit** unless the user asks.
5. **Backend game logic** — avoid putting rule changes in Lambda; use host relay model unless explicitly migrating architecture.
6. **Secret word redaction** — non–Clue Givers must not receive `secretWord` in relayed state (`redactForBroadcast` / `redactStateForPlayer`).

## Common commands

```bash
npm ci
npm start                    # Angular dev server (localhost:4200)
npm run build                # Production build
npm run cdk:deploy           # Deploy WebSocket stack
npm test                     # CDK tests (from root)
```

Local WebSocket URL: `frontend/contact-app/src/environments/environment.ts` → `wsUrl`.

## Further reading

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system design, WebSocket protocol, rejoin/host migration
- [docs/GAME.md](docs/GAME.md) — phases, contact resolution, used words, mid-game join
- [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) — local setup, deploy pipeline, coding patterns
