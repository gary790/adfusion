# Ad Fusion - Meta Ad Creator & Optimizer SaaS

A production-grade, full-stack SaaS platform for managing, optimizing, and automating Meta (Facebook/Instagram) advertising campaigns using AI-powered insights.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (SPA)                            │
│  Vanilla JS + Tailwind CSS + Chart.js                       │
│  Auth · Dashboard · Campaigns · AI Engine · Automation       │
│  Copy Generator · Ad Accounts · Billing · Settings          │
└──────────────────────┬──────────────────────────────────────┘
                       │ REST API (JSON)
┌──────────────────────▼──────────────────────────────────────┐
│                 Node.js / Express Backend                    │
│  JWT + Meta OAuth · Helmet · CORS · Rate Limiting           │
├─────────────┬──────────────┬───────────────┬────────────────┤
│ Auth Routes │Campaign CRUD │ AI Engine     │ Automation     │
│ Dashboard   │ Ad Sets/Ads  │ Copy Gen      │ Rule Engine    │
│ Billing     │ Insights Sync│ Fatigue Detect│ Budget Actions │
├─────────────┴──────────────┴───────────────┴────────────────┤
│                    Services Layer                            │
│  MetaApiClient · MetaSyncService · AIOptimizationEngine     │
│  AutomationEngine · Stripe Integration                      │
├─────────────┬──────────────┬───────────────┬────────────────┤
│ PostgreSQL  │    Redis     │  Meta Graph   │   OpenAI       │
│ (Data Store)│   (Cache)    │    API v21    │  GPT-4o        │
└─────────────┴──────────────┴───────────────┴────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              Background Job Runner (Cron)                    │
│  10min: Incremental Sync · 2AM: Full Sync                   │
│  30min: Rule Evaluation  · 9AM: Token Check                 │
│  Weekly: Data Cleanup                                        │
└─────────────────────────────────────────────────────────────┘
```

## Features

### Core Platform
- **Multi-tenant workspaces** with role-based access control (Owner, Admin, Manager, Analyst, Viewer)
- **Facebook/Meta OAuth** with long-lived token management and automatic refresh
- **Multiple ad account** support per workspace with health monitoring
- **Real-time sync** with Meta Marketing API (campaigns, ad sets, ads, insights)

### AI-Powered Optimization (OpenAI GPT-4o)
- **Campaign Performance Diagnosis** - Deep analysis with findings, recommendations, and predicted impact
- **Ad Copy Generator** - Multi-variation copy using AIDA, PAS, BAB, FAB, PASTOR, and more frameworks
- **Headline Generator** - 10+ headlines per request with hook type classification
- **Creative Fatigue Detection** - Algorithmic + AI detection (frequency, CTR decline, CPM spike)
- **Scaling Readiness Check** - Data-driven scoring with blocker identification
- **Budget Optimization** - AI-recommended allocation across campaigns
- **Audience Recommendations** - Targeting improvements based on performance data

### Rule-Based Automation Engine
- **Condition-based rules** with AND/OR logic across any metric (CTR, CPC, CPM, ROAS, frequency, spend, etc.)
- **Automated actions**: pause, activate, increase/decrease budget, send notification
- **Safety guards**: 20% max budget increase cap, $1 minimum budget floor, cooldown periods
- **Pre-built templates**: Stop Losers, Scale Winners, Creative Fatigue, Budget Protection, High CPM Alert
- **Execution history** with full audit trail

### Dashboard & Analytics
- **Real-time KPIs** with period-over-period comparison (spend, impressions, clicks, CTR, CPC, CPM, reach, frequency)
- **Interactive charts** (spend trend, CTR/CPC dual-axis)
- **Top campaigns and top ads** ranking tables
- **Notification center** with in-app alerts for rule triggers, token expiration, and system events

### Billing & Subscriptions (Stripe)
- **4-tier plans**: Free, Starter ($49/mo), Professional ($149/mo), Enterprise ($499/mo)
- **Usage tracking** per workspace (AI requests, API calls, syncs)
- **Stripe Checkout** integration with 14-day free trial
- **Customer portal** for subscription management

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla JS SPA, Tailwind CSS (CDN), Chart.js, Axios, Font Awesome |
| **Backend** | Node.js 20+, Express 4.21, TypeScript 5.6 |
| **Database** | PostgreSQL 16 (17 tables, full migrations, triggers) |
| **Cache** | Redis 7 (IoRedis client, key-based invalidation) |
| **Auth** | JWT (access + refresh tokens), bcrypt, Meta OAuth 2.0 |
| **AI** | OpenAI GPT-4o (structured JSON output, temperature tuning) |
| **Payments** | Stripe (Checkout, Billing Portal, Webhooks) |
| **Meta API** | Graph API v21.0 (campaigns, ad sets, ads, insights, audiences) |
| **Jobs** | node-cron (5 scheduled tasks), background process |
| **Security** | Helmet CSP, CORS, rate limiting, AES-256 token encryption |
| **Logging** | Winston (file rotation, structured logging) |
| **Testing** | Jest + ts-jest (51 tests) |
| **Docker** | Multi-stage build, docker-compose (app + worker + PostgreSQL + Redis) |

## Project Structure

```
ad-fusion/
├── src/
│   ├── server.ts                    # Express app entry point
│   ├── config/
│   │   ├── index.ts                 # All configuration (env vars, thresholds)
│   │   ├── database.ts              # PostgreSQL pool, query helpers, transactions
│   │   └── redis.ts                 # Redis cache client with retry
│   ├── middleware/
│   │   └── auth.ts                  # JWT auth, workspace RBAC, token generation
│   ├── routes/
│   │   ├── auth.ts                  # Signup, Login, Meta OAuth, Token refresh
│   │   ├── campaigns.ts             # Campaign CRUD + sync + metrics
│   │   ├── ai.ts                    # AI analysis, copy gen, fatigue, scaling
│   │   ├── automation.ts            # Rule CRUD, manual trigger, presets
│   │   ├── dashboard.ts             # Summary, trends, top items, notifications
│   │   └── billing.ts               # Plans, checkout, portal, usage
│   ├── services/
│   │   ├── meta/
│   │   │   ├── client.ts            # Full Meta Graph API client (CRUD + insights)
│   │   │   └── sync.ts              # Full + incremental sync service
│   │   ├── ai/
│   │   │   └── engine.ts            # AI optimization engine (GPT-4o)
│   │   └── automation/
│   │       └── engine.ts            # Rule evaluation & action execution
│   ├── webhooks/
│   │   └── handler.ts               # Meta webhooks + Stripe webhooks
│   ├── jobs/
│   │   └── runner.ts                # Cron jobs (sync, rules, cleanup)
│   ├── utils/
│   │   ├── encryption.ts            # AES-256-CBC encrypt/decrypt
│   │   ├── helpers.ts               # UUID, responses, pagination, retry
│   │   └── logger.ts                # Winston logger with rotation
│   └── types/
│       └── index.ts                 # 500+ lines of TypeScript interfaces
├── public/
│   ├── index.html                   # SPA shell with sidebar navigation
│   └── static/
│       └── app.js                   # Full frontend (930+ lines)
├── migrations/
│   └── 001_initial_schema.sql       # Complete schema (17 tables, indexes, triggers)
├── tests/
│   └── unit/
│       ├── auth.test.ts             # Auth, encryption, utility tests
│       ├── ai-engine.test.ts        # AI engine, automation, threshold tests
│       └── api-routes.test.ts       # API routes, config, schema validation
├── deploy/
│   ├── cloud-run/service.yaml       # Cloud Run Knative service definition
│   ├── gke/k8s.yaml                 # Full GKE manifests (app, worker, DB, Redis, HPA)
│   └── app-engine/app.yaml          # App Engine Flexible configuration
├── scripts/
│   ├── setup.sh                     # Local development setup
│   └── deploy-gcp.sh               # Automated GCP deployment (9 steps)
├── Dockerfile                       # Multi-stage build (builder → production)
├── docker-compose.yml               # Full stack (app + worker + PostgreSQL + Redis)
├── cloudbuild.yaml                  # Cloud Build CI/CD pipeline
├── .dockerignore                    # Docker build exclusions
├── .env.example                     # Environment variable template
├── .gitignore                       # Git exclusions
├── seed.sql                         # Development seed data
├── jest.config.ts                   # Jest test configuration
├── tsconfig.json                    # TypeScript configuration
├── package.json                     # Dependencies and scripts
└── README.md                        # This file
```

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose (for PostgreSQL & Redis)
- Meta Developer App (for Facebook/Instagram integration)
- OpenAI API key (for AI features)
- Stripe account (for billing, optional)

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/ad-fusion.git
cd ad-fusion
npm ci
```

### 2. Environment Setup

```bash
cp .env.example .env
# Edit .env with your API keys:
# - META_APP_ID & META_APP_SECRET (from Meta Developer Console)
# - OPENAI_API_KEY (from platform.openai.com)
# - STRIPE_SECRET_KEY (from Stripe Dashboard, optional)
```

### 3. Start Services

```bash
# Start PostgreSQL & Redis
docker compose up -d postgres redis

# Run database migrations
docker exec -i adfusion-postgres psql -U adfusion -d adfusion < migrations/001_initial_schema.sql

# Seed demo data
docker exec -i adfusion-postgres psql -U adfusion -d adfusion < seed.sql

# Build & Start
npm run build
npm run dev
```

### 4. Access

- **Dashboard**: http://localhost:3000
- **API Health**: http://localhost:3000/api/health
- **Demo Login**: `demo@adfusion.dev` / `password123`

### One-Line Setup

```bash
chmod +x scripts/setup.sh && ./scripts/setup.sh
```

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Create account (email, password, name) |
| POST | `/api/auth/login` | Login (returns JWT tokens) |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/auth/me` | Get current user profile + workspaces |
| GET | `/api/auth/meta/connect` | Start Meta OAuth flow |
| GET | `/api/auth/meta/callback` | Handle Meta OAuth callback |
| GET | `/api/auth/meta/accounts` | List connected ad accounts |
| DELETE | `/api/auth/meta/accounts/:id` | Disconnect ad account |

### Campaigns
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaigns` | List campaigns (paginated, with 7d metrics) |
| GET | `/api/campaigns/:id` | Get campaign details + ad sets |
| POST | `/api/campaigns` | Create campaign (via Meta API) |
| PATCH | `/api/campaigns/:id` | Update campaign |
| DELETE | `/api/campaigns/:id` | Delete campaign |
| POST | `/api/campaigns/sync` | Sync single ad account |
| POST | `/api/campaigns/sync-all` | Sync all active ad accounts |

### AI Engine
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/analyze-campaign` | AI campaign performance analysis |
| POST | `/api/ai/generate-copy` | Generate ad copy variations |
| POST | `/api/ai/generate-headlines` | Generate headlines |
| POST | `/api/ai/creative-fatigue` | Detect creative fatigue |
| POST | `/api/ai/scaling-readiness` | Check if campaign is ready to scale |
| POST | `/api/ai/recommend-audiences` | Get targeting recommendations |
| POST | `/api/ai/optimize-budget` | AI budget allocation |
| GET | `/api/ai/history` | Get AI analysis history |

### Automation
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/automation/rules` | List automation rules |
| POST | `/api/automation/rules` | Create automation rule |
| GET | `/api/automation/rules/:id` | Get rule details + executions |
| PATCH | `/api/automation/rules/:id` | Update rule |
| DELETE | `/api/automation/rules/:id` | Delete rule |
| POST | `/api/automation/rules/:id/run` | Manually trigger rule |
| GET | `/api/automation/executions` | Get execution history |
| GET | `/api/automation/presets` | Get pre-built rule templates |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/summary` | Main dashboard overview with comparisons |
| GET | `/api/dashboard/spend-trend` | Daily spend/metrics time series |
| GET | `/api/dashboard/top-campaigns` | Top campaigns by metric |
| GET | `/api/dashboard/top-ads` | Top performing ads |
| GET | `/api/dashboard/notifications` | Get notifications (with unread count) |
| PATCH | `/api/dashboard/notifications/:id/read` | Mark notification as read |

### Billing
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/billing/status` | Current plan, usage, limits |
| GET | `/api/billing/plans` | Available subscription plans |
| POST | `/api/billing/create-checkout` | Create Stripe Checkout session |
| POST | `/api/billing/create-portal` | Create Stripe Customer Portal |

### Webhooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhooks/meta` | Meta webhook verification |
| POST | `/api/webhooks/meta` | Meta webhook events |
| POST | `/api/webhooks/stripe` | Stripe webhook events |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (DB + environment status) |

## Database Schema

17 tables with full referential integrity, indexes, and auto-update triggers:

```
users                    (auth, profiles, Meta user ID)
workspaces              (multi-tenant root, Stripe subscription)
workspace_members       (team collaboration with roles)
ad_accounts             (Meta ad accounts, encrypted tokens)
campaigns               (synced from Meta, budget tracking)
adsets                   (targeting, placements, learning stage)
ads                      (creatives, tracking specs)
ad_insights             (time-series metrics, 25+ columns)
automation_rules        (conditions, actions, schedules)
rule_executions         (full execution audit log)
ai_analyses             (AI analysis history + token usage)
ai_generated_copy       (generated ad copy archive)
notifications           (in-app alerts)
audit_log               (user action tracking)
sync_jobs               (sync history and status)
refresh_tokens          (JWT refresh token management)
api_usage               (billing usage tracking)
```

## Docker

### Development

```bash
# Start everything
docker compose up -d

# View logs
docker compose logs -f app

# Rebuild after changes
docker compose up -d --build app

# Stop all
docker compose down
```

### Production Build

```bash
# Build production image
docker build -t adfusion:latest .

# Run standalone
docker run -p 3000:3000 \
  -e DATABASE_URL=postgres://... \
  -e REDIS_URL=redis://... \
  -e JWT_SECRET=... \
  adfusion:latest
```

## GCP Deployment

Three deployment paths are provided: **Cloud Run** (recommended), **GKE**, and **App Engine**.

### Option 1: Cloud Run (Recommended)

Automated deployment script handles everything:

```bash
export GCP_PROJECT_ID=your-project-id
export GCP_REGION=us-central1
export META_APP_ID=your_meta_app_id
export META_APP_SECRET=your_meta_app_secret
export OPENAI_API_KEY=sk-your-key
export STRIPE_SECRET_KEY=sk_live_your-key

chmod +x scripts/deploy-gcp.sh
./scripts/deploy-gcp.sh
```

**What the script creates:**
1. Cloud SQL PostgreSQL 16 instance
2. Memorystore Redis 7 instance
3. Serverless VPC connector (for Redis access)
4. All secrets in Secret Manager
5. Main app Cloud Run service (auto-scaling 1-10)
6. Background worker Cloud Run service (1-3 instances)

**Post-deployment:**
1. Run migrations via Cloud SQL Proxy
2. Update `META_REDIRECT_URI` in Meta Developer Console
3. Configure Stripe webhook endpoint
4. Configure Meta webhook endpoint

### Option 2: Cloud Run via Cloud Build (CI/CD)

```bash
# Submit build + deploy
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions _REGION=us-central1,_CLOUD_SQL_INSTANCE=project:region:instance
```

### Option 3: GKE (Kubernetes)

```bash
# Create cluster
gcloud container clusters create adfusion \
  --num-nodes=3 --machine-type=e2-medium \
  --region=us-central1

# Apply manifests
kubectl apply -f deploy/gke/k8s.yaml

# Update secrets (edit k8s.yaml first!)
kubectl apply -f deploy/gke/k8s.yaml -n adfusion
```

Includes: Deployment (2 replicas), Worker, PostgreSQL StatefulSet, Redis StatefulSet, Service, Ingress, Managed Certificate, HPA (auto-scale 2-10).

### Option 4: App Engine Flexible

```bash
gcloud app deploy deploy/app-engine/app.yaml
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | No | `development` / `production` (default: development) |
| `PORT` | No | Server port (default: 3000) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_SECRET` | Yes | JWT signing secret (min 32 chars) |
| `SESSION_SECRET` | Yes | Session secret (min 32 chars) |
| `META_APP_ID` | Yes* | Meta/Facebook App ID |
| `META_APP_SECRET` | Yes* | Meta/Facebook App Secret |
| `META_REDIRECT_URI` | Yes* | OAuth callback URL |
| `META_WEBHOOK_VERIFY_TOKEN` | No | Meta webhook verification token |
| `OPENAI_API_KEY` | Yes* | OpenAI API key (for AI features) |
| `STRIPE_SECRET_KEY` | No | Stripe secret key (for billing) |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook signing secret |
| `ENCRYPTION_KEY` | Yes | 32-char AES encryption key |
| `ENCRYPTION_IV` | Yes | 16-char AES initialization vector |

*Required for respective features to work. The platform runs without them but with limited functionality.

## Testing

```bash
# Run all tests
npm test

# Run with coverage
npx jest --coverage --forceExit

# Run specific suite
npx jest tests/unit/auth.test.ts --forceExit

# Watch mode
npm run test:watch
```

**Current test coverage**: 51 tests across 3 suites covering auth, encryption, AI thresholds, automation logic, API routes, Meta API config, database schema validation, and billing configuration.

## NPM Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run dev` | Start dev server with ts-node-dev (auto-reload) |
| `npm start` | Start production server |
| `npm test` | Run Jest test suite |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | TypeScript type checking (no emit) |
| `npm run docker:build` | Build Docker image |
| `npm run docker:up` | Start Docker Compose stack |
| `npm run docker:down` | Stop Docker Compose stack |
| `npm run migrate` | Apply database migrations |
| `npm run seed` | Seed development data |
| `npm run jobs:start` | Start background job runner |

## Security

- **Authentication**: JWT access tokens (7d) + refresh tokens (30d), bcrypt password hashing (12 rounds)
- **Encryption**: AES-256-CBC for Meta access tokens at rest
- **HTTP Security**: Helmet CSP, CORS with origin whitelist, rate limiting (100 req/15min)
- **Multi-tenancy**: All queries scoped by `workspace_id`, workspace membership verification
- **Webhook verification**: HMAC signature verification for Stripe, token verification for Meta
- **No plaintext secrets**: All API keys stored via environment variables / Secret Manager

## License

Private / Proprietary
