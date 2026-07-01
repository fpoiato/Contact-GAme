# Development guide

## Prerequisites

- **Node.js 20+**
- **npm** (workspaces at repo root)
- For deploy: AWS CLI, CDK CLI, Terraform (see README)

## Install and run

```bash
# From repository root
npm ci
npm start          # http://localhost:4200
npm run build      # production build → frontend/contact-app/dist/
```

Angular app workspace: `frontend/contact-app/`

```bash
cd frontend/contact-app
npm start
npm run build
```

### WebSocket URL

Development default: `frontend/contact-app/src/environments/environment.ts`

```typescript
export const environment = {
  production: false,
  wsUrl: 'ws://localhost:3001',  // point at deployed API for real multiplayer
  appUrl: 'http://localhost:4200',
};
```

Production `environment.prod.ts` is **generated in CI** by `pipeline/buildspec.yml` with the deployed `wss://` URL.

## CDK backend

```bash
cd infra/cdk
npm ci
export CDK_DEFAULT_ACCOUNT=<account-id>
export CDK_DEFAULT_REGION=us-east-1
npx cdk bootstrap    # once per account/region
npm run deploy       # or: npm run cdk:deploy from root
```

Outputs include **WebSocket URL** — copy into local `environment.ts` for multiplayer testing.

### Lambda handlers

| File | Trigger |
|------|---------|
| `lambda/src/connect.ts` | `$connect` |
| `lambda/src/disconnect.ts` | `$disconnect` |
| `lambda/src/message.ts` | `$default` (all client messages) |

Run CDK tests: `npm test` (from `infra/cdk` or root `npm test`).

## Terraform static hosting

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# Set websocket_url after CDK deploy
terraform init && terraform apply
```

## Project conventions

### Angular

- **Standalone components** (no NgModules)
- **Tailwind CSS** for styling — utility classes, theme colors (`mint`, `coral`, `yellow-bright`, etc.)
- **RxJS** `BehaviorSubject` / `Observable` in services; components subscribe in `ngOnInit`
- Shared UI: `LoadingButtonComponent`, `SpinnerComponent`, `LanguageToggleComponent`

### Feature folders

```
frontend/contact-app/src/app/
├── core/
│   ├── constants/     # APP_VERSION
│   ├── models/        # ws-types (duplicate of shared/)
│   └── services/      # game-engine, room, websocket, session
├── features/
│   ├── landing/
│   ├── lobby/
│   └── game/
└── shared/
```

### i18n

- Library: `@ngx-translate/core`
- Files: `src/assets/i18n/en.json`, `pt-BR.json`
- **Always add both languages** for new user-facing strings
- Template usage: `{{ 'KEY' | translate }}` or `translate` pipe with params

### Version display

Bump on releases:

1. `frontend/contact-app/src/app/core/constants/version.ts` → `APP_VERSION`
2. `frontend/contact-app/package.json` → `"version"`

Displayed bottom-right via `app.component.ts`.

## Making game logic changes

1. Read [GAME.md](GAME.md) for intended behavior
2. Edit `game-engine.service.ts`
3. If adding state fields or constants, update **both** `ws-types.ts` files
4. Update game UI in `game-room.component.html/ts` and scoreboard if needed
5. Add i18n keys
6. `npm run build` to verify

**Remember:** only the host runs resolution timers and `resolveContact()`. Non-hosts forward actions.

## Making protocol / lobby changes

1. Update `infra/cdk/lambda/src/message.ts` (and `disconnect.ts` if connection lifecycle)
2. Update `shared/ws-types.ts` + frontend `ws-types.ts`
3. Update `RoomService` / `WebSocketService` consumers
4. Run CDK tests + build frontend

## Session persistence

`SessionService` stores `{ roomCode, nickname, isHost }` in `localStorage` key `contact-game-session`.

Used for:

- Refresh on `/lobby/:roomCode` or `/game/:roomCode`
- `REJOIN_ROOM` after disconnect

Clear session on explicit leave (`RoomService.reset()`).

## CI/CD summary

| Stage | What runs |
|-------|-----------|
| GitHub Actions PR/push | `npm ci`, CDK test + synth, Angular build |
| GitHub Actions push to `main` | Above + trigger CodePipeline |
| CodeBuild | CDK deploy, build with WS URL, S3 sync, CloudFront invalidation |

GitHub secret required: `AWS_ROLE_ARN` (OIDC).

## Git commit style

Recent messages use imperative summary + optional body:

```
Extend phase timers and resolve contact early when both players submit.

Bump version to 0.1.1: contact countdown 30s, clue timer 45s, ...
```

Only commit when the user explicitly asks.

## Common pitfalls

| Pitfall | Guidance |
|---------|----------|
| Editing only one `ws-types.ts` | Keep `shared/` and frontend models aligned |
| Putting game rules in Lambda | Host client owns rules unless architecting a server-side engine |
| Leaking `secretWord` in relays | Use `redactForBroadcast` / `redactStateForPlayer` |
| Forgetting PT-BR strings | Both JSON files must be updated |
| `MATCH_VOTE` in types | Not used — don't wire UI to it without implementing engine support |

## Useful grep targets

```bash
# Game phases
rg "phase ===" frontend/contact-app/src/app/core/services/game-engine.service.ts

# WebSocket actions
rg "case '" infra/cdk/lambda/src/message.ts

# i18n key usage
rg "translate" frontend/contact-app/src/app/features
```
