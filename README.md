# Contact Party Game

Mobile-first, serverless real-time party word game built with **Angular**, **AWS API Gateway WebSocket**, **Lambda**, **DynamoDB**, **S3**, and **CloudFront**.

## Architecture

- **Frontend:** Angular 19 + Tailwind CSS, hosted on S3/CloudFront (Terraform)
- **Realtime:** API Gateway WebSocket + Lambda (CDK)
- **Connection mapping:** DynamoDB (`connectionId` → `roomCode`, `nickname`, host flag)
- **Game state:** Ephemeral — Host client is source of truth, synced via WebSocket relays

## Project structure

```
Contact-GAme/
├── frontend/contact-app/   # Angular app
├── infra/cdk/              # WebSocket API, DynamoDB, Lambdas
├── infra/terraform/        # S3 + CloudFront static hosting
├── shared/ws-types.ts      # Shared WebSocket contract
├── pipeline/buildspec.yml  # CodeBuild spec
└── .github/workflows/      # GitHub Actions → CodePipeline
```

## Local development

### Prerequisites

- Node.js 20+
- AWS CLI (for deploy)
- AWS CDK CLI (`npm install -g aws-cdk`)

### Frontend

```bash
cd frontend/contact-app
npm install
npm start
```

Open http://localhost:4200

Set `src/environments/environment.ts` `wsUrl` to your deployed WebSocket URL for real multiplayer.

### CDK backend

```bash
cd infra/cdk
npm install
export CDK_DEFAULT_ACCOUNT=your-account-id
export CDK_DEFAULT_REGION=us-east-1
npx cdk bootstrap   # first time only
npm run deploy
```

Note the `WebSocketUrl` output.

### Terraform static hosting

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# Set websocket_url after CDK deploy
terraform init
terraform apply
```

## Game flow

1. **Landing** — Enter nickname, create or join a 5-letter room code
2. **Lobby** — Host approves joiners; share invite link / WhatsApp
3. **Game** — Clue Giver sets secret word; Guessers submit clues; CONTACT countdown; block; group vote; letter reveal
4. **Host migration** — If Host disconnects, backend promotes next player; new Host requests state snapshot

## CI/CD

1. Push to `main` triggers GitHub Actions (lint/build/test)
2. On success, GitHub Actions assumes AWS OIDC role and starts CodePipeline
3. CodeBuild deploys CDK, builds Angular with injected `WS_URL`, applies Terraform, syncs S3, invalidates CloudFront

### Setup checklist

- [ ] Bootstrap CDK in your AWS account
- [ ] Create CodeStar Connection to GitHub
- [ ] Create CodePipeline `contact-game-pipeline` with CodeBuild using `pipeline/buildspec.yml`
- [ ] Configure GitHub secret `AWS_ROLE_ARN` for OIDC

## i18n

English and Portuguese (Brazil) — toggle in app header. Translation files in `frontend/contact-app/src/assets/i18n/`.

## Rules

- 2–12 players per room
- Secret word: letters only, 4–12 characters
- Clue Giver auto-rotates each round
- Match votes: all players; tie = no match
- Clue Giver cannot block two consecutive contacts

## License

MIT
