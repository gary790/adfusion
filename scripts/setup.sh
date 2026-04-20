#!/usr/bin/env bash
# ============================================
# AD FUSION - Local Development Setup Script
# ============================================
set -euo pipefail

echo "🚀 Ad Fusion — Local Development Setup"
echo "======================================="

# Check prerequisites
command -v node >/dev/null 2>&1 || { echo "❌ Node.js required (>=20)"; exit 1; }
command -v docker >/dev/null 2>&1 || echo "⚠️  Docker not found (optional — needed for docker-compose)"

# Step 1: Environment
if [ ! -f .env ]; then
  echo "📝 Creating .env from .env.example..."
  cp .env.example .env
  echo "⚠️  Edit .env with your API keys before running the app!"
else
  echo "✅ .env file exists"
fi

# Step 2: Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Step 3: Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Step 4: Start infrastructure (Docker)
if command -v docker >/dev/null 2>&1 && command -v docker-compose >/dev/null 2>&1; then
  echo "🐳 Starting PostgreSQL & Redis via Docker..."
  docker-compose up -d postgres redis
  echo "⏳ Waiting for services to be healthy..."
  sleep 5
fi

# Step 5: Run migrations
echo "🗄️ Running database migrations..."
npm run db:migrate 2>/dev/null || echo "⚠️  Migration skipped (DB may not be available)"

# Step 6: Seed test data
echo "🌱 Seeding test data..."
npm run db:seed 2>/dev/null || echo "⚠️  Seed skipped (DB may not be available)"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Start the app:  npm run dev"
echo "Run tests:       npm test"
echo "Build:           npm run build"
echo ""
echo "📝 Remember to configure your .env with:"
echo "   - META_APP_ID / META_APP_SECRET"
echo "   - OPENAI_API_KEY"
echo "   - STRIPE_SECRET_KEY"
echo ""
