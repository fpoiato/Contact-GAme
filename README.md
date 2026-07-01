# Contact / Contato — Party Word Game

Mobile-first, real-time party word game built with **Angular**, **AWS API Gateway WebSocket**, **Lambda**, **DynamoDB**, **S3**, and **CloudFront**.

> **For AI agents:** start with [AGENTS.md](AGENTS.md)  
> **Docs:** [Architecture](docs/ARCHITECTURE.md) · [Game rules](docs/GAME.md) · [Development](docs/DEVELOPMENT.md)

## Architecture (summary)

- **Frontend:** Angular 19 + Tailwind CSS, hosted on S3/CloudFront
- **Realtime:** API Gateway WebSocket + Lambda (CDK)
- **Connection mapping:** DynamoDB (`connectionId` → room, nickname, host flag, rejoin slots)
- **Game state:** Ephemeral — **host client is source of truth**, synced via WebSocket `RELAY`

## Project structure

```
contact-game/
├── frontend/contact-app/   # Angular SPA
├── infra/cdk/              # WebSocket API, DynamoDB, Lambdas
├── infra/terraform/        # S3 + CloudFront
├── shared/ws-types.ts      # Shared WebSocket contract (sync with frontend models)
├── docs/                   # Architecture, game, development guides
├── pipeline/buildspec.yml  # CodeBuild deploy
└── .github/workflows/      # CI + CodePipeline trigger
```

## Quick start

```bash
npm ci
npm start    # http://localhost:4200
```

Set `frontend/contact-app/src/environments/environment.ts` → `wsUrl` to your deployed WebSocket URL for multiplayer.

Deploy backend: `npm run cdk:deploy` (see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)).

## Game flow

1. **Landing** — nickname, create or join 5-letter room code
2. **Lobby** — host approves joiners; share invite link / copy / WhatsApp
3. **Word setup** — Clue Giver sets secret word (4–12 letters)
4. **Clue phase** — guessers post clues; call **Contact** on a clue
5. **Contact countdown** (30s, ends early when both players submit) — both type a word; Clue Giver may block
6. **Reveal** — match shows next letter or ends round if word guessed
7. **Scoreboard** — host starts next round; Clue Giver rotates

Supports **mid-game join** (spectator until next round), **refresh rejoin**, and **host migration** on disconnect.

## Scoring

| Event | Points |
|-------|--------|
| Partial match | +15 each (contact pair) |
| Secret word on contact | +50 clue author, +25 contact caller |
| Successful block | +15 Clue Giver |

## i18n

English and Portuguese (Brazil). Toggle in app header. Files: `frontend/contact-app/src/assets/i18n/`.

## CI/CD

Push to `main` → GitHub Actions (test/build) → CodePipeline → CodeBuild deploys CDK, builds Angular with `WS_URL`, syncs S3, invalidates CloudFront.

## License

MIT
