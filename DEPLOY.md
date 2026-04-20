# Ad Fusion - Google Cloud Run Deployment Guide

## Architecture

```
                    Internet
                       │
              ┌────────▼────────┐
              │  Cloud Run       │
              │  (adfusion)     │──── Port 3000
              │  Express + SPA  │
              └────────┬────────┘
                       │
         ┌─────────────┼─────────────┐
         ▼             ▼             ▼
┌──────────────┐ ┌──────────┐ ┌──────────────┐
│  Cloud SQL   │ │ Memory-  │ │ Cloud Run    │
│  PostgreSQL  │ │ store    │ │ (worker)     │
│  16          │ │ Redis 7  │ │ Background   │
└──────────────┘ └──────────┘ │ Jobs         │
                               └──────────────┘
```

**Two Cloud Run services:**
- `adfusion` — Main web app (Express + SPA), public
- `adfusion-worker` — Background job runner (cron sync, automation, AI audit), private

---

## Prerequisites

1. **Google Cloud account** with billing enabled
2. **gcloud CLI** installed and authenticated
3. **Docker** (for local testing, optional)
4. **API keys** ready:
   - Meta (Facebook) App ID & Secret
   - OpenAI API Key
   - Stripe Secret Key & Webhook Secret

---

## Option A: One-Command Deploy (Recommended)

```bash
# Set your GCP project ID
export GCP_PROJECT_ID=your-project-id

# Optional: Set API keys for Secret Manager
export OPENAI_API_KEY=sk-...
export META_APP_ID=...
export META_APP_SECRET=...
export STRIPE_SECRET_KEY=sk_live_...

# Run the deployment script
bash scripts/deploy-gcp.sh
```

This script will:
1. Enable required GCP APIs
2. Create Cloud SQL (PostgreSQL 16) instance
3. Create Memorystore (Redis 7) instance
4. Set up VPC connector for Redis access
5. Store secrets in Secret Manager
6. Build and push the Docker image
7. Deploy both Cloud Run services
8. Output the production URL

---

## Option B: Step-by-Step Manual Deployment

### Step 1: Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com \
  vpcaccess.googleapis.com \
  compute.googleapis.com
```

### Step 2: Create Cloud SQL (PostgreSQL 16)

```bash
# Create instance (5-10 min)
gcloud sql instances create adfusion-db \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --storage-size=10 \
  --storage-type=SSD

# Create database and user
gcloud sql databases create adfusion --instance=adfusion-db
gcloud sql users create adfusion --instance=adfusion-db --password=YOUR_DB_PASSWORD

# Get connection name
gcloud sql instances describe adfusion-db --format="value(connectionName)"
# Output: your-project:us-central1:adfusion-db
```

### Step 3: Create Memorystore Redis

```bash
gcloud redis instances create adfusion-cache \
  --region=us-central1 \
  --size=1 \
  --tier=basic \
  --redis-version=redis_7_0

# Get Redis host
gcloud redis instances describe adfusion-cache \
  --region=us-central1 --format="value(host)"
```

### Step 4: Create VPC Connector

```bash
gcloud compute networks vpc-access connectors create adfusion-vpc-connector \
  --region=us-central1 \
  --range=10.8.0.0/28 \
  --network=default
```

### Step 5: Store Secrets

```bash
# Required secrets
echo -n "postgresql://adfusion:PASSWORD@localhost:5432/adfusion?host=/cloudsql/PROJECT:REGION:INSTANCE" | \
  gcloud secrets create adfusion-db-url --data-file=-

echo -n "redis://REDIS_HOST:6379" | \
  gcloud secrets create adfusion-redis-url --data-file=-

echo -n "$(openssl rand -base64 48)" | \
  gcloud secrets create adfusion-jwt-secret --data-file=-

echo -n "sk-your-openai-key" | \
  gcloud secrets create adfusion-openai-key --data-file=-

echo -n "your-meta-app-id" | \
  gcloud secrets create adfusion-meta-app-id --data-file=-

echo -n "your-meta-app-secret" | \
  gcloud secrets create adfusion-meta-app-secret --data-file=-

echo -n "sk_live_your-stripe-key" | \
  gcloud secrets create adfusion-stripe-key --data-file=-

echo -n "$(openssl rand -hex 16)" | \
  gcloud secrets create adfusion-encryption-key --data-file=-

# Grant Cloud Run access
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

for SECRET in adfusion-db-url adfusion-redis-url adfusion-jwt-secret \
              adfusion-openai-key adfusion-meta-app-id adfusion-meta-app-secret \
              adfusion-stripe-key adfusion-encryption-key; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${SA}" \
    --role=roles/secretmanager.secretAccessor --quiet
done
```

### Step 6: Build & Push Docker Image

```bash
# Build locally
docker build -t gcr.io/$PROJECT_ID/adfusion:latest .

# Push to GCR
gcloud auth configure-docker
docker push gcr.io/$PROJECT_ID/adfusion:latest

# OR use Cloud Build (no local Docker needed)
gcloud builds submit --tag gcr.io/$PROJECT_ID/adfusion:latest .
```

### Step 7: Deploy Cloud Run Services

```bash
# Main app
gcloud run deploy adfusion \
  --image gcr.io/$PROJECT_ID/adfusion:latest \
  --region us-central1 \
  --platform managed \
  --port 3000 \
  --memory 512Mi --cpu 1 \
  --min-instances 1 --max-instances 10 \
  --concurrency 80 --timeout 300 \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,PORT=3000" \
  --set-secrets "DATABASE_URL=adfusion-db-url:latest,REDIS_URL=adfusion-redis-url:latest,JWT_SECRET=adfusion-jwt-secret:latest,OPENAI_API_KEY=adfusion-openai-key:latest,META_APP_ID=adfusion-meta-app-id:latest,META_APP_SECRET=adfusion-meta-app-secret:latest,STRIPE_SECRET_KEY=adfusion-stripe-key:latest,ENCRYPTION_KEY=adfusion-encryption-key:latest" \
  --add-cloudsql-instances PROJECT:REGION:INSTANCE \
  --vpc-connector adfusion-vpc-connector

# Background worker
gcloud run deploy adfusion-worker \
  --image gcr.io/$PROJECT_ID/adfusion:latest \
  --region us-central1 \
  --platform managed \
  --memory 512Mi --cpu 1 \
  --min-instances 1 --max-instances 3 \
  --no-allow-unauthenticated \
  --command "node" --args "dist/jobs/runner.js" \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "DATABASE_URL=adfusion-db-url:latest,REDIS_URL=adfusion-redis-url:latest,OPENAI_API_KEY=adfusion-openai-key:latest,META_APP_ID=adfusion-meta-app-id:latest,META_APP_SECRET=adfusion-meta-app-secret:latest,ENCRYPTION_KEY=adfusion-encryption-key:latest" \
  --add-cloudsql-instances PROJECT:REGION:INSTANCE \
  --vpc-connector adfusion-vpc-connector
```

### Step 8: Run Database Migrations

```bash
# Option A: Use Cloud SQL Proxy
cloud-sql-proxy PROJECT:REGION:INSTANCE --port 5433 &
psql -h localhost -p 5433 -U adfusion -d adfusion -f migrations/001_initial_schema.sql
psql -h localhost -p 5433 -U adfusion -d adfusion -f migrations/002_world_class_upgrade.sql
psql -h localhost -p 5433 -U adfusion -d adfusion -f seed.sql

# Option B: Via Cloud SQL Studio in GCP Console
# Navigate to Cloud SQL > adfusion-db > Cloud SQL Studio
# Paste and run each migration file
```

---

## Option C: CI/CD with GitHub Actions

The repository includes `.github/workflows/deploy-cloud-run.yml` for automated deployments.

### Setup GitHub Secrets

Go to **Settings > Secrets and variables > Actions** and add:

| Secret | Description |
|--------|-------------|
| `GCP_PROJECT_ID` | Your Google Cloud project ID |
| `GCP_SA_KEY` | Service account JSON key (base64) |
| `GCP_REGION` | Deployment region (default: `us-central1`) |
| `CLOUD_SQL_INSTANCE` | Cloud SQL connection string |

### Create Service Account

```bash
# Create service account
gcloud iam service-accounts create github-deployer \
  --display-name="GitHub Actions Deployer"

SA=github-deployer@${PROJECT_ID}.iam.gserviceaccount.com

# Grant roles
for ROLE in run.admin cloudbuild.builds.editor storage.admin \
            secretmanager.secretAccessor cloudsql.client \
            iam.serviceAccountUser; do
  gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SA}" --role="roles/${ROLE}" --quiet
done

# Create and download key
gcloud iam service-accounts keys create key.json --iam-account=$SA

# Add to GitHub as secret (base64 encoded)
cat key.json | base64 -w 0
# Copy output and paste as GCP_SA_KEY in GitHub Secrets

# Clean up local key
rm key.json
```

### Trigger Deployment

Push to `main` branch triggers:
1. **Test** — `npm test` with Node.js 20
2. **Build** — Docker build + push to GCR
3. **Deploy App** — Update `adfusion` Cloud Run service
4. **Deploy Worker** — Update `adfusion-worker` Cloud Run service
5. **Smoke Test** — Verify `/api/health` returns 200

---

## Option D: Cloud Build Trigger

```bash
# Create trigger for main branch
gcloud builds triggers create github \
  --repo-name=ad-fusion \
  --repo-owner=YOUR_ORG \
  --branch-pattern="^main$" \
  --build-config=cloudbuild.yaml \
  --substitutions="_REGION=us-central1,_CLOUD_SQL_INSTANCE=project:region:instance"
```

---

## Post-Deployment Checklist

- [ ] Verify health: `curl https://YOUR_URL/api/health`
- [ ] Run database migrations (see Step 8)
- [ ] Update Meta Developer Console with production redirect URI
- [ ] Configure Stripe webhook endpoint: `https://YOUR_URL/api/webhooks/stripe`
- [ ] Configure Meta webhook endpoint: `https://YOUR_URL/api/webhooks/meta`
- [ ] Update CORS_ORIGIN env var to production URL
- [ ] (Optional) Map custom domain: `gcloud run domain-mappings create --service adfusion --domain yourdomain.com`

---

## Monitoring & Operations

```bash
# View logs
gcloud run services logs read adfusion --region us-central1 --limit 100

# View worker logs
gcloud run services logs read adfusion-worker --region us-central1 --limit 100

# Update env vars
gcloud run services update adfusion --set-env-vars "KEY=VALUE" --region us-central1

# Scale settings
gcloud run services update adfusion --min-instances 2 --max-instances 20 --region us-central1

# Rollback to previous revision
gcloud run services update-traffic adfusion --to-revisions PREVIOUS_REVISION=100 --region us-central1
```

---

## Cost Estimate (monthly)

| Service | Tier | ~Cost |
|---------|------|-------|
| Cloud Run (app) | 1 vCPU, 512Mi, min 1 instance | ~$15-30 |
| Cloud Run (worker) | 1 vCPU, 512Mi, min 1 instance | ~$15-30 |
| Cloud SQL | db-f1-micro, 10GB SSD | ~$10 |
| Memorystore Redis | Basic, 1GB | ~$35 |
| Container Registry | Image storage | ~$1-5 |
| Secret Manager | 8 secrets | ~$0.50 |
| **Total** | | **~$75-100** |

> Scale down `min-instances` to 0 for dev/staging to reduce costs significantly.
