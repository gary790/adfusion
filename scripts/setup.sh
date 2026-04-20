#!/usr/bin/env bash
# ============================================
# AD FUSION - Local Development Setup Script
# ============================================
set -euo pipefail

echo ""
echo "============================================"
echo "  AD FUSION - Local Development Setup"
echo "============================================"
echo ""

# Check prerequisites
echo "[1/6] Checking prerequisites..."
command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js required (>=20). Install from https://nodejs.org"; exit 1; }

NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "ERROR: Node.js 20+ required. Current: $(node -v)"
  exit 1
fi
echo "  Node.js: $(node -v)"
echo "  npm: $(npm -v)"

HAS_DOCKER=false
if command -v docker >/dev/null 2>&1; then
  echo "  Docker: $(docker --version | cut -d' ' -f3 | tr -d ',')"
  HAS_DOCKER=true
else
  echo "  Docker: not found (optional - for PostgreSQL & Redis)"
fi

# Step 2: Environment
echo ""
echo "[2/6] Setting up environment..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "  Created .env from .env.example"
  echo "  IMPORTANT: Edit .env with your API keys before running the app!"
  echo "  Required for full functionality:"
  echo "    - META_APP_ID & META_APP_SECRET (Meta Developer Console)"
  echo "    - OPENAI_API_KEY (OpenAI Platform)"
  echo "    - STRIPE_SECRET_KEY (Stripe Dashboard)"
else
  echo "  .env file exists"
fi

# Step 3: Install dependencies
echo ""
echo "[3/6] Installing dependencies..."
npm ci

# Step 4: Build TypeScript
echo ""
echo "[4/6] Building TypeScript..."
npm run build
echo "  Build successful. Output in ./dist"

# Step 5: Start infrastructure
echo ""
echo "[5/6] Starting infrastructure services..."
if [ "$HAS_DOCKER" = true ]; then
  echo "  Starting PostgreSQL & Redis via Docker Compose..."
  docker compose up -d postgres redis 2>/dev/null || docker-compose up -d postgres redis 2>/dev/null
  echo "  Waiting for services to be healthy..."
  sleep 5

  # Check PostgreSQL
  if docker exec adfusion-postgres pg_isready -U adfusion -d adfusion &>/dev/null; then
    echo "  PostgreSQL: healthy"
  else
    echo "  PostgreSQL: starting (may need a few more seconds)..."
    sleep 5
  fi

  # Check Redis
  if docker exec adfusion-redis redis-cli ping &>/dev/null; then
    echo "  Redis: healthy"
  else
    echo "  Redis: starting..."
    sleep 3
  fi
else
  echo "  Docker not available. You need to run PostgreSQL & Redis manually:"
  echo "    PostgreSQL: localhost:5432 (user: adfusion, pass: adfusion_secret, db: adfusion)"
  echo "    Redis:      localhost:6379"
fi

# Step 6: Run migrations
echo ""
echo "[6/6] Running database migrations..."
if [ "$HAS_DOCKER" = true ]; then
  # Apply migrations via docker exec
  docker exec -i adfusion-postgres psql -U adfusion -d adfusion < migrations/001_initial_schema.sql 2>/dev/null || \
    echo "  Migrations may already be applied or PostgreSQL not ready."

  # Apply seed data
  docker exec -i adfusion-postgres psql -U adfusion -d adfusion < seed.sql 2>/dev/null || \
    echo "  Seed data may already exist."
else
  echo "  Run manually:"
  echo "    psql -h localhost -U adfusion -d adfusion -f migrations/001_initial_schema.sql"
  echo "    psql -h localhost -U adfusion -d adfusion -f seed.sql"
fi

echo ""
echo "============================================"
echo "  SETUP COMPLETE"
echo "============================================"
echo ""
echo "  Start the server:"
echo "    npm run dev"
echo ""
echo "  Access the dashboard:"
echo "    http://localhost:3000"
echo ""
echo "  Demo login credentials:"
echo "    Email: demo@adfusion.dev"
echo "    Password: password123"
echo ""
echo "  API health check:"
echo "    curl http://localhost:3000/api/health"
echo ""
echo "  Docker services:"
echo "    docker compose logs -f     # View logs"
echo "    docker compose down        # Stop services"
echo "    docker compose up -d       # Restart services"
echo ""
echo "============================================"
