# Ad Fusion

**AI-Powered Meta (Facebook) Ad Creator & Optimizer — Multi-Tenant SaaS Platform**

Ad Fusion is a production-ready SaaS platform that helps advertisers manage, optimize, and scale their Meta (Facebook/Instagram) ad campaigns using AI-driven insights, automated rules, and real-time analytics.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND SPA                              │
│   Tailwind CSS + Chart.js + Vanilla JS                          │
│   Dashboard | Campaigns | Ad Creator | AI Studio | Automation   │
│   Billing | Settings                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │ REST API (JSON)
┌────────────────────────────▼────────────────────────────────────┐
│                     EXPRESS API GATEWAY                          │
│   Auth (JWT + Meta OAuth) | Rate Limiting | RBAC | Validation   │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│ Auth     │ Campaign │ AI       │ Automtn  │ Billing  │ Webhook  │
│ Service  │ Service  │ Engine   │ Engine   │ Service  │ Handler  │
│          │          │(OpenAI)  │          │(Stripe)  │          │
├──────────┴──────────┴──────────┴──────────┴──────────┴──────────┤
│                  META MARKETING API CLIENT                       │
│   Campaigns | Ad Sets | Ads | Insights | Audiences | Sync       │
├─────────────┬─────────────────────┬─────────────────────────────┤
│ PostgreSQL  │      Redis          │   Background Jobs           │
│ (Primary)   │  (Cache + Queue)    │  (Cron: sync, rules, etc.)  │
└─────────────┴─────────────────────┴─────────────────────────────┘
```

## Features

### Core Platform
- **Multi-Tenant Architecture** — Workspace-based isolation with RBAC (Owner, Admin, Manager, Analyst, Viewer)
- **Meta OAuth Integration** — One-click Facebook login, long-lived token management, multiple ad account support
- **Real-Time Dashboard** — Spend trends, CTR, CPC, CPM, frequency, top campaigns, top ads, notifications

### Campaign Management
- **Full CRUD** — Create, read, update, delete campaigns via Meta Marketing API
- **Bulk Sync** — Incremental (10min) + full (daily) data synchronization
- **Deep Analytics** — 30-day performance trends, ad set breakdown, granular filtering

### AI Optimization Engine (GPT-4o)
- **Campaign Analysis** — Automated performance diagnosis with severity-ranked findings
- **Ad Copy Generator** — Multi-framework copy generation (AIDA, PAS, BAB, FAB, PASTOR, etc.)
- **Headline Generator** — Batch headline creation with hook-type diversity scoring
- **Creative Fatigue Detection** — Algorithmic + AI detection of frequency spikes and CTR decline
- **Scaling Readiness** — Data-driven assessment with budget recommendations
- **Audience Recommender** — Targeting expansion suggestions based on performance data
- **Budget Optimizer** — AI-powered cross-campaign budget allocation

### Automation Engine
- **Rule-Based Actions** — Pause losers, scale winners, fatigue alerts, budget protection
- **Flexible Conditions** — AND/OR logic on spend, CTR, CPC, CPM, ROAS, frequency, etc.
- **Meta API Execution** — Rules directly update campaign/ad set/ad status and budgets via API
- **Preset Templates** — 5 pre-built rules (Stop Losers, Scale Winners, Creative Fatigue, Budget Protection, High CPM Alert)
- **Execution History** — Full audit trail with condition details and action results

### Billing (Stripe)
- **4-Tier Plans** — Free, Starter ($49/mo), Professional ($149/mo), Enterprise ($499/mo)
- **Usage Tracking** — AI requests, API calls, entity counts per billing period
- **Stripe Checkout** — Seamless subscription creation with 14-day free trial
- **Customer Portal** — Self-service subscription management

### Infrastructure
- **PostgreSQL** — 16 tables with proper indexes, triggers, JSONB columns, UUID PKs
- **Redis** — Response caching (configurable TTL), rate limit storage
- **Background Jobs** — 5 cron jobs (incremental sync, full sync, rule evaluation, token checks, cleanup)
- **Webhooks** — Meta real-time updates + Stripe subscription lifecycle events

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Tailwind CSS, Chart.js, Font Awesome, Vanilla JS SPA |
| Backend | Node.js 20, Express 4, TypeScript 5 |
| Database | PostgreSQL 16 |
| Cache | Redis 7 (via ioredis) |
| AI | OpenAI GPT-4o |
| Ads API | Meta Marketing API v21.0 |
| Billing | Stripe (Subscriptions, Checkout, Webhooks) |
| Auth | JWT (access + refresh tokens), Meta OAuth 2.0 |
| Jobs | node-cron (cron scheduling) |
| Logging | Winston (structured JSON logging) |
| Validation | express-validator, Zod |
| Security | Helmet CSP, CORS, rate limiting, AES-256-CBC encryption, bcrypt |
| Container | Docker, docker-compose |
| Deploy | Google Cloud Run, GKE, App Engine |

## Project Structure

```
ad-fusion/
├── src/
│   ├── server.ts                    # Express app + middleware + routes
│   ├── config/
│   │   ├── index.ts                 # Centralized config (env vars, thresholds)
│   │   ├── database.ts              # PostgreSQL pool + query helpers
│   │   └── redis.ts                 # Redis client + cache helpers
│   ├── middleware/
│   │   └── auth.ts                  # JWT auth, workspace RBAC, role guard
│   ├── routes/
│   │   ├── auth.ts                  # Signup, login, refresh, Meta OAuth
│   │   ├── campaigns.ts             # Campaign CRUD, sync, insights
│   │   ├── ai.ts                    # AI analysis, copy gen, headlines
│   │   ├── automation.ts            # Rule CRUD, manual run, presets
│   │   ├── dashboard.ts             # Summary, trends, top performers
│   │   └── billing.ts              # Plans, checkout, portal, status
│   ├── services/
│   │   ├── meta/
│   │   │   ├── client.ts            # Meta Graph API client (Axios)
│   │   │   └── sync.ts              # Full + incremental data sync
│   │   ├── ai/
│   │   │   └── engine.ts            # OpenAI integration + fatigue/scaling
│   │   └── automation/
│   │       └── engine.ts            # Rule evaluation + action execution
│   ├── webhooks/
│   │   └── handler.ts               # Meta + Stripe webhook processing
│   ├── jobs/
│   │   └── runner.ts                # Cron job scheduler (5 jobs)
│   ├── types/
│   │   └── index.ts                 # TypeScript interfaces (500+ lines)
│   └── utils/
│       ├── helpers.ts               # UUID, pagination, retry, formatting
│       ├── encryption.ts            # AES-256-CBC encrypt/decrypt
│       └── logger.ts                # Winston structured logger
├── public/
│   ├── index.html                   # SPA shell
│   └── static/js/app.js            # Complete frontend application
├── migrations/
│   └── 001_initial_schema.sql       # Full PostgreSQL schema (430 lines)
├── tests/
│   ├── unit/
│   │   ├── auth.test.ts             # Auth & encryption tests
│   │   └── ai-engine.test.ts        # AI engine & automation tests
│   └── integration/
├── deploy/
│   ├── cloud-run/service.yaml       # Cloud Run service config
│   ├── gke/k8s.yaml                # Full Kubernetes manifests
│   └── app-engine/app.yaml          # App Engine Flexible config
├── scripts/
│   ├── setup.sh                     # Local dev setup
│   └── deploy-gcp.sh               # GCP deployment automation
├── Dockerfile                       # Multi-stage Node.js build
├── docker-compose.yml               # PostgreSQL + Redis + App + Worker
├── .dockerignore
├── cloudbuild.yaml                  # Google Cloud Build pipeline
├── package.json
├── tsconfig.json
├── .env.example                     # Environment template
├── .gitignore
├── seed.sql                         # Development seed data
└── README.md
```

## Quick Start

### Prerequisites
- Node.js >= 20
- PostgreSQL 16+
- Redis 7+
- Docker & Docker Compose (optional but recommended)

### 1. Clone & Install

```bash
git clone https://github.com/your-org/ad-fusion.git
cd ad-fusion
npm ci
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys:
#   META_APP_ID, META_APP_SECRET
#   OPENAI_API_KEY
#   STRIPE_SECRET_KEY
#   JWT_SECRET, ENCRYPTION_KEY
```

### 3a. Docker (Recommended)

```bash
# Start everything (PostgreSQL + Redis + App + Worker)
docker-compose up -d

# App available at http://localhost:3000
# Migrations run automatically on first PostgreSQL start
```

### 3b. Manual Setup

```bash
# Start PostgreSQL and Redis separately, then:
npm run db:migrate          # Apply schema
npm run db:seed             # Insert demo data
npm run build               # Compile TypeScript
npm start                   # Start server
```

### 4. Access

- **Dashboard**: http://localhost:3000
- **API**: http://localhost:3000/api
- **Health**: http://localhost:3000/health
- **Demo Login**: demo@adfusion.dev / password123

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Login (returns JWT) |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/auth/me` | Get current user profile |
| GET | `/api/auth/meta/connect` | Start Meta OAuth flow |
| GET | `/api/auth/meta/callback` | Meta OAuth callback |
| GET | `/api/auth/meta/accounts` | List connected ad accounts |
| DELETE | `/api/auth/meta/accounts/:id` | Disconnect ad account |

### Campaigns
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaigns` | List campaigns (filterable, paginated) |
| GET | `/api/campaigns/:id` | Get campaign with ad sets & trend |
| POST | `/api/campaigns` | Create campaign (via Meta API) |
| PATCH | `/api/campaigns/:id` | Update campaign |
| DELETE | `/api/campaigns/:id` | Archive campaign |
| POST | `/api/campaigns/:id/sync` | Force sync campaign data |
| GET | `/api/campaigns/:id/insights` | Get campaign insights |
| POST | `/api/campaigns/sync-all` | Sync all connected accounts |

### AI Optimization
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/analyze-campaign` | Full campaign performance analysis |
| POST | `/api/ai/generate-copy` | Generate ad copy variations |
| POST | `/api/ai/generate-headlines` | Generate ad headlines |
| POST | `/api/ai/creative-fatigue` | Detect creative fatigue |
| POST | `/api/ai/scaling-readiness` | Check scaling readiness |
| POST | `/api/ai/recommend-audiences` | Get audience recommendations |
| POST | `/api/ai/optimize-budget` | Optimize budget allocation |
| GET | `/api/ai/history` | Get AI analysis history |

### Automation
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/automation/rules` | List automation rules |
| POST | `/api/automation/rules` | Create automation rule |
| GET | `/api/automation/rules/:id` | Get rule with executions |
| PATCH | `/api/automation/rules/:id` | Update rule |
| DELETE | `/api/automation/rules/:id` | Delete rule |
| POST | `/api/automation/rules/:id/run` | Manually trigger rule |
| GET | `/api/automation/executions` | Get execution history |
| GET | `/api/automation/presets` | Get pre-built rule templates |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/summary` | Main dashboard overview |
| GET | `/api/dashboard/spend-trend` | Spend & performance trend |
| GET | `/api/dashboard/top-campaigns` | Top campaigns by metric |
| GET | `/api/dashboard/top-ads` | Top ads by CTR |
| GET | `/api/dashboard/notifications` | Get notifications |
| PATCH | `/api/dashboard/notifications/:id/read` | Mark notification read |

### Billing
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/billing/status` | Current plan, usage, limits |
| GET | `/api/billing/plans` | Available plans |
| POST | `/api/billing/create-checkout` | Create Stripe checkout session |
| POST | `/api/billing/create-portal` | Create Stripe customer portal |

### Webhooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | `/api/webhooks/meta` | Meta webhook verification & events |
| POST | `/api/webhooks/stripe` | Stripe subscription lifecycle events |

## Deployment to Google Cloud

### Option 1: Cloud Run (Recommended)

```bash
# Set environment
export GCP_PROJECT_ID=your-project
export GCP_REGION=us-central1

# Deploy using the script
./scripts/deploy-gcp.sh

# Or manually:
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION=us-central1
```

Infrastructure created:
- Cloud SQL (PostgreSQL 16) — `db-f1-micro` instance
- Memorystore (Redis) — 1GB basic tier
- Cloud Run — Main app (1-10 instances) + Worker (1-3 instances)
- Secret Manager — All API keys and secrets

### Option 2: GKE (Kubernetes)

```bash
# Create cluster
gcloud container clusters create adfusion-cluster \
  --num-nodes=3 --machine-type=e2-medium --region=us-central1

# Apply manifests
kubectl apply -f deploy/gke/k8s.yaml

# Components: App (2 replicas), Worker (1), PostgreSQL, Redis
# Includes: Ingress, HPA, ManagedCertificate, Services
```

### Option 3: App Engine Flexible

```bash
gcloud app deploy deploy/app-engine/app.yaml
```

### Post-Deployment Checklist

1. **Database Migrations** — Run `migrations/001_initial_schema.sql` against Cloud SQL
2. **Secrets** — Store all API keys in Secret Manager
3. **Meta OAuth** — Update redirect URI to `https://your-domain/api/auth/meta/callback`
4. **Stripe Webhooks** — Set endpoint to `https://your-domain/api/webhooks/stripe`
5. **Custom Domain** — Configure via Cloud Run domain mapping or GKE Ingress

## Database Schema

16 tables organized around multi-tenant workspaces:

| Table | Description | Key Relations |
|-------|-------------|---------------|
| `users` | User accounts with OAuth IDs | Root entity |
| `workspaces` | Multi-tenant containers | `owner_id` → users |
| `workspace_members` | RBAC memberships | workspace + user |
| `ad_accounts` | Meta ad accounts (encrypted tokens) | workspace |
| `campaigns` | Meta campaigns (synced) | ad_account |
| `adsets` | Meta ad sets | campaign |
| `ads` | Meta ads with creative JSON | adset |
| `ad_insights` | Time-series performance metrics | campaign/adset/ad |
| `automation_rules` | Rule definitions (conditions + actions) | workspace |
| `rule_executions` | Rule execution audit log | automation_rule |
| `ai_analyses` | AI analysis results | workspace |
| `ai_generated_copy` | Generated ad copy storage | workspace |
| `notifications` | In-app notification system | workspace |
| `audit_log` | Full audit trail | workspace + user |
| `sync_jobs` | Sync job history | ad_account |
| `api_usage` | Usage tracking for billing | workspace |

## Configuration

All configuration is centralized in `src/config/index.ts` with the following key sections:

- **Server** — Port, environment, base URL
- **Database** — PostgreSQL connection pool (min/max, timeouts, SSL)
- **Redis** — Connection URL, reconnect strategy
- **JWT** — Secret, access token expiry (7d), refresh token expiry (30d)
- **Meta API** — App credentials, v21.0, scopes, rate limits (200/hr, 4800/day), insight fields
- **OpenAI** — API key, model (gpt-4o), max tokens (4096)
- **Stripe** — Keys, 4 plan tiers with limits and price IDs
- **Optimization Thresholds** — Creative fatigue, learning phase, scaling, diagnostics

## Security

- **JWT Authentication** — RS256 signed access + refresh tokens
- **Meta OAuth 2.0** — Secure state parameter, long-lived token exchange
- **AES-256-CBC Encryption** — All Meta access tokens encrypted at rest
- **bcrypt** — Password hashing with 12 salt rounds
- **Helmet CSP** — Strict Content Security Policy headers
- **Rate Limiting** — 100 requests per 15-minute window
- **RBAC** — 5 roles (owner, admin, manager, analyst, viewer) per workspace
- **Input Validation** — express-validator on all endpoints
- **Webhook Verification** — Meta verify token + Stripe signature validation

## Testing

```bash
npm test               # Run all tests with coverage
npm run test:unit      # Unit tests only
npm run test:watch     # Watch mode
npm run typecheck      # TypeScript type checking
npm run lint           # ESLint
```

## Background Jobs

| Schedule | Job | Description |
|----------|-----|-------------|
| Every 10 min | Incremental Sync | Sync last 3 days of insights for active accounts |
| Daily 2 AM UTC | Full Sync | Complete campaign/adset/ad/insight sync (30 days) |
| Every 30 min | Rule Evaluation | Evaluate all active automation rules |
| Daily 9 AM UTC | Token Check | Alert on tokens expiring within 7 days |
| Weekly Sun 3 AM | Data Cleanup | Purge old executions, notifications, audit logs |

## License

MIT
