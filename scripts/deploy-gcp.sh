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

if [ -z "$PROJECT_ID" ]; then
  echo "❌ Set GCP_PROJECT_ID environment variable"
  exit 1
fi

echo "🚀 Deploying Ad Fusion to Google Cloud"
echo "Project: $PROJECT_ID | Region: $REGION"
echo "======================================="

# Step 1: Authenticate
echo "🔐 Verifying GCP authentication..."
gcloud config set project "$PROJECT_ID"

# Step 2: Enable required APIs
echo "📦 Enabling required APIs..."
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com

# Step 3: Create Cloud SQL instance (if not exists)
echo "🗄️ Setting up Cloud SQL (PostgreSQL 16)..."
gcloud sql instances describe adfusion-db --project="$PROJECT_ID" 2>/dev/null || \
  gcloud sql instances create adfusion-db \
    --database-version=POSTGRES_16 \
    --tier=db-f1-micro \
    --region="$REGION" \
    --storage-size=10 \
    --storage-type=SSD \
    --no-assign-ip

# Create database and user
gcloud sql databases create adfusion --instance=adfusion-db 2>/dev/null || true
gcloud sql users create adfusion --instance=adfusion-db --password="${DB_PASSWORD:-adfusion_secret}" 2>/dev/null || true

# Step 4: Create Memorystore Redis (if not exists)
echo "🔴 Setting up Memorystore Redis..."
gcloud redis instances describe adfusion-cache --region="$REGION" 2>/dev/null || \
  gcloud redis instances create adfusion-cache \
    --region="$REGION" \
    --size=1 \
    --tier=basic

# Step 5: Store secrets
echo "🔑 Storing secrets in Secret Manager..."
SECRETS=("db-url" "jwt-secret" "openai-key" "meta-app-id" "meta-app-secret" "stripe-key" "encryption-key")
for secret in "${SECRETS[@]}"; do
  gcloud secrets describe "adfusion-${secret}" 2>/dev/null || \
    echo "⚠️  Create secret: gcloud secrets create adfusion-${secret} --replication-policy=automatic"
done

echo ""
echo "⚠️  Set secret values with:"
echo "  echo -n 'VALUE' | gcloud secrets versions add adfusion-SECRET-NAME --data-file=-"
echo ""

# Step 6: Build and push Docker image
echo "🐳 Building and pushing Docker image..."
gcloud builds submit --tag "$IMAGE_NAME:latest" .

# Step 7: Deploy to Cloud Run
CLOUD_SQL_INSTANCE="${PROJECT_ID}:${REGION}:adfusion-db"

echo "🚀 Deploying main service to Cloud Run..."
gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_NAME:latest" \
  --region "$REGION" \
  --platform managed \
  --port 3000 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 1 \
  --max-instances 10 \
  --allow-unauthenticated \
  --set-env-vars "NODE_ENV=production" \
  --add-cloudsql-instances "$CLOUD_SQL_INSTANCE"

# Step 8: Deploy worker
echo "🔧 Deploying worker service..."
gcloud run deploy "${SERVICE_NAME}-worker" \
  --image "$IMAGE_NAME:latest" \
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
  --add-cloudsql-instances "$CLOUD_SQL_INSTANCE"

# Step 9: Get URL
APP_URL=$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(status.url)')

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 App URL: $APP_URL"
echo "🔧 Worker: ${SERVICE_NAME}-worker (internal)"
echo ""
echo "📝 Next steps:"
echo "  1. Set secret values in Secret Manager"
echo "  2. Run migrations: Connect to Cloud SQL and execute migrations/001_initial_schema.sql"
echo "  3. Set up Meta OAuth redirect URI to: ${APP_URL}/api/auth/meta/callback"
echo "  4. Configure Stripe webhook URL to: ${APP_URL}/api/webhooks/stripe"
echo ""
