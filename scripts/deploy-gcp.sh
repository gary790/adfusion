#!/usr/bin/env bash
# ============================================
# AD FUSION - GCP Deployment Script
# Cloud Run + Cloud SQL + Memorystore Redis
# ============================================
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:-}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="adfusion"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"
DB_INSTANCE="adfusion-db"
REDIS_INSTANCE="adfusion-cache"

if [ -z "$PROJECT_ID" ]; then
  echo "ERROR: Set GCP_PROJECT_ID environment variable"
  exit 1
fi

echo ""
echo "============================================"
echo "  AD FUSION - Google Cloud Deployment"
echo "============================================"
echo "  Project:  $PROJECT_ID"
echo "  Region:   $REGION"
echo "  Service:  $SERVICE_NAME"
echo "============================================"
echo ""

# ============================================
# Step 1: Authenticate & Configure
# ============================================
echo "[1/9] Verifying GCP authentication..."
gcloud config set project "$PROJECT_ID"
gcloud config set compute/region "$REGION"

ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null || true)
if [ -z "$ACCOUNT" ]; then
  echo "ERROR: No active GCP account. Run: gcloud auth login"
  exit 1
fi
echo "  Authenticated as: $ACCOUNT"

# ============================================
# Step 2: Enable Required APIs
# ============================================
echo "[2/9] Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com \
  vpcaccess.googleapis.com \
  compute.googleapis.com \
  2>/dev/null

echo "  APIs enabled."

# ============================================
# Step 3: Create Cloud SQL (PostgreSQL 16)
# ============================================
echo "[3/9] Setting up Cloud SQL (PostgreSQL 16)..."

if gcloud sql instances describe "$DB_INSTANCE" --project="$PROJECT_ID" &>/dev/null; then
  echo "  Cloud SQL instance '$DB_INSTANCE' already exists."
else
  echo "  Creating Cloud SQL instance (this takes 5-10 minutes)..."
  gcloud sql instances create "$DB_INSTANCE" \
    --database-version=POSTGRES_16 \
    --tier=db-f1-micro \
    --region="$REGION" \
    --storage-size=10 \
    --storage-type=SSD \
    --availability-type=zonal \
    --no-assign-ip \
    --network=default
fi

# Create database and user
gcloud sql databases create adfusion --instance="$DB_INSTANCE" 2>/dev/null || echo "  Database 'adfusion' already exists."

DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 24)}"
gcloud sql users create adfusion --instance="$DB_INSTANCE" --password="$DB_PASSWORD" 2>/dev/null || \
  gcloud sql users set-password adfusion --instance="$DB_INSTANCE" --password="$DB_PASSWORD"

# Get connection name for Cloud Run
CLOUD_SQL_CONNECTION=$(gcloud sql instances describe "$DB_INSTANCE" --format="value(connectionName)")
echo "  Cloud SQL connection: $CLOUD_SQL_CONNECTION"

# Build DATABASE_URL
DATABASE_URL="postgresql://adfusion:${DB_PASSWORD}@localhost:5432/adfusion?host=/cloudsql/${CLOUD_SQL_CONNECTION}"

# ============================================
# Step 4: Create Memorystore Redis
# ============================================
echo "[4/9] Setting up Memorystore Redis..."

if gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" &>/dev/null; then
  echo "  Redis instance '$REDIS_INSTANCE' already exists."
else
  echo "  Creating Redis instance (this takes 3-5 minutes)..."
  gcloud redis instances create "$REDIS_INSTANCE" \
    --region="$REGION" \
    --size=1 \
    --tier=basic \
    --redis-version=redis_7_0
fi

REDIS_HOST=$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --format="value(host)")
REDIS_PORT=$(gcloud redis instances describe "$REDIS_INSTANCE" --region="$REGION" --format="value(port)")
REDIS_URL="redis://${REDIS_HOST}:${REDIS_PORT}"
echo "  Redis URL: $REDIS_URL"

# ============================================
# Step 5: Create Serverless VPC Connector
# ============================================
echo "[5/9] Setting up VPC connector for Redis access..."

VPC_CONNECTOR="adfusion-vpc-connector"
if gcloud compute networks vpc-access connectors describe "$VPC_CONNECTOR" --region="$REGION" &>/dev/null; then
  echo "  VPC connector already exists."
else
  gcloud compute networks vpc-access connectors create "$VPC_CONNECTOR" \
    --region="$REGION" \
    --range=10.8.0.0/28 \
    --network=default
fi

# ============================================
# Step 6: Store Secrets in Secret Manager
# ============================================
echo "[6/9] Storing secrets in Secret Manager..."

store_secret() {
  local name=$1
  local value=$2
  if gcloud secrets describe "$name" &>/dev/null; then
    echo "$value" | gcloud secrets versions add "$name" --data-file=-
  else
    echo "$value" | gcloud secrets create "$name" --data-file=- --replication-policy=automatic
  fi
}

# Generate secrets if not provided
JWT_SECRET="${JWT_SECRET:-$(openssl rand -base64 48)}"
SESSION_SECRET="${SESSION_SECRET:-$(openssl rand -base64 48)}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-$(openssl rand -hex 16)}"
ENCRYPTION_IV="${ENCRYPTION_IV:-$(openssl rand -hex 8)}"

store_secret "adfusion-db-url" "$DATABASE_URL"
store_secret "adfusion-redis-url" "$REDIS_URL"
store_secret "adfusion-jwt-secret" "$JWT_SECRET"
store_secret "adfusion-session-secret" "$SESSION_SECRET"
store_secret "adfusion-encryption-key" "$ENCRYPTION_KEY"
store_secret "adfusion-encryption-iv" "$ENCRYPTION_IV"

# External API secrets (only store if provided)
[ -n "${OPENAI_API_KEY:-}" ]           && store_secret "adfusion-openai-key" "$OPENAI_API_KEY"
[ -n "${META_APP_ID:-}" ]              && store_secret "adfusion-meta-app-id" "$META_APP_ID"
[ -n "${META_APP_SECRET:-}" ]          && store_secret "adfusion-meta-app-secret" "$META_APP_SECRET"
[ -n "${STRIPE_SECRET_KEY:-}" ]        && store_secret "adfusion-stripe-key" "$STRIPE_SECRET_KEY"
[ -n "${STRIPE_WEBHOOK_SECRET:-}" ]    && store_secret "adfusion-stripe-webhook" "$STRIPE_WEBHOOK_SECRET"

echo "  Secrets stored."

# Grant Cloud Run access to secrets
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)")
SA_EMAIL="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding adfusion-db-url \
  --member="serviceAccount:${SA_EMAIL}" --role=roles/secretmanager.secretAccessor --quiet
gcloud secrets add-iam-policy-binding adfusion-redis-url \
  --member="serviceAccount:${SA_EMAIL}" --role=roles/secretmanager.secretAccessor --quiet
gcloud secrets add-iam-policy-binding adfusion-jwt-secret \
  --member="serviceAccount:${SA_EMAIL}" --role=roles/secretmanager.secretAccessor --quiet

echo "  IAM policies configured."

# ============================================
# Step 7: Build & Push Docker Image
# ============================================
echo "[7/9] Building and pushing Docker image..."

gcloud builds submit --tag "${IMAGE_NAME}:latest" --timeout=600s .

echo "  Image pushed: ${IMAGE_NAME}:latest"

# ============================================
# Step 8: Deploy to Cloud Run (Main App)
# ============================================
echo "[8/9] Deploying main app to Cloud Run..."

# Build secrets flag
SECRETS_FLAG="DATABASE_URL=adfusion-db-url:latest"
SECRETS_FLAG="${SECRETS_FLAG},REDIS_URL=adfusion-redis-url:latest"
SECRETS_FLAG="${SECRETS_FLAG},JWT_SECRET=adfusion-jwt-secret:latest"
SECRETS_FLAG="${SECRETS_FLAG},SESSION_SECRET=adfusion-session-secret:latest"
SECRETS_FLAG="${SECRETS_FLAG},ENCRYPTION_KEY=adfusion-encryption-key:latest"
SECRETS_FLAG="${SECRETS_FLAG},ENCRYPTION_IV=adfusion-encryption-iv:latest"

# Add external API secrets if they exist
gcloud secrets describe adfusion-openai-key &>/dev/null && SECRETS_FLAG="${SECRETS_FLAG},OPENAI_API_KEY=adfusion-openai-key:latest"
gcloud secrets describe adfusion-meta-app-id &>/dev/null && SECRETS_FLAG="${SECRETS_FLAG},META_APP_ID=adfusion-meta-app-id:latest"
gcloud secrets describe adfusion-meta-app-secret &>/dev/null && SECRETS_FLAG="${SECRETS_FLAG},META_APP_SECRET=adfusion-meta-app-secret:latest"
gcloud secrets describe adfusion-stripe-key &>/dev/null && SECRETS_FLAG="${SECRETS_FLAG},STRIPE_SECRET_KEY=adfusion-stripe-key:latest"
gcloud secrets describe adfusion-stripe-webhook &>/dev/null && SECRETS_FLAG="${SECRETS_FLAG},STRIPE_WEBHOOK_SECRET=adfusion-stripe-webhook:latest"

# Deploy main service
gcloud run deploy "$SERVICE_NAME" \
  --image "${IMAGE_NAME}:latest" \
  --region "$REGION" \
  --platform managed \
  --port 3000 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 10 \
  --concurrency 80 \
  --timeout 300 \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production,PORT=3000" \
  --set-secrets "$SECRETS_FLAG" \
  --add-cloudsql-instances "$CLOUD_SQL_CONNECTION" \
  --vpc-connector "$VPC_CONNECTOR"

APP_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format="value(status.url)")
echo "  Main app deployed: $APP_URL"

# ============================================
# Step 9: Deploy Worker (Background Jobs)
# ============================================
echo "[9/9] Deploying background worker to Cloud Run..."

gcloud run deploy "${SERVICE_NAME}-worker" \
  --image "${IMAGE_NAME}:latest" \
  --region "$REGION" \
  --platform managed \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 3 \
  --no-allow-unauthenticated \
  --command "node" \
  --args "dist/jobs/runner.js" \
  --set-env-vars "NODE_ENV=production" \
  --set-secrets "$SECRETS_FLAG" \
  --add-cloudsql-instances "$CLOUD_SQL_CONNECTION" \
  --vpc-connector "$VPC_CONNECTOR"

echo "  Worker deployed."

# ============================================
# Step 10: Run Database Migrations
# ============================================
echo ""
echo "[Post-Deploy] Running database migrations..."
echo "  Use Cloud SQL Proxy to run migrations:"
echo "  1. Install proxy: https://cloud.google.com/sql/docs/postgres/connect-instance-auth-proxy"
echo "  2. Run: cloud-sql-proxy $CLOUD_SQL_CONNECTION --port 5433"
echo "  3. Apply: psql -h localhost -p 5433 -U adfusion -d adfusion -f migrations/001_initial_schema.sql"
echo "  4. Seed:  psql -h localhost -p 5433 -U adfusion -d adfusion -f seed.sql"
echo ""

# ============================================
# Summary
# ============================================
echo "============================================"
echo "  DEPLOYMENT COMPLETE"
echo "============================================"
echo ""
echo "  Application URL:  $APP_URL"
echo "  Health Check:     ${APP_URL}/api/health"
echo "  API Base:         ${APP_URL}/api"
echo ""
echo "  Cloud SQL:        $CLOUD_SQL_CONNECTION"
echo "  Redis:            $REDIS_URL"
echo ""
echo "  Next Steps:"
echo "  1. Run database migrations (see instructions above)"
echo "  2. Update META_REDIRECT_URI in Meta Developer Console to: ${APP_URL}/api/auth/meta/callback"
echo "  3. Update CORS_ORIGIN to: ${APP_URL}"
echo "  4. Configure Stripe webhook endpoint: ${APP_URL}/api/webhooks/stripe"
echo "  5. Configure Meta webhook endpoint: ${APP_URL}/api/webhooks/meta"
echo "  6. (Optional) Set up custom domain with Cloud Run domain mapping"
echo ""
echo "  Monitor logs:  gcloud run services logs read $SERVICE_NAME --region $REGION"
echo "  Update env:    gcloud run services update $SERVICE_NAME --set-env-vars KEY=VALUE --region $REGION"
echo "============================================"
