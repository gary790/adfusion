-- ============================================
-- AD FUSION - Seed Data (Development Only)
-- Provides realistic test data for development
-- ============================================

-- Demo user (password: 'password123')
-- bcrypt hash of 'password123' with 12 rounds
INSERT INTO users (id, email, password_hash, name, role, is_active, email_verified) VALUES
  ('11111111-1111-1111-1111-111111111111', 'demo@adfusion.dev', '$2a$12$LQv3c1yqBo9SkvXS7QTJPOoCAH2vU5mVQvFXgOC2LB3w7.7UxbUty', 'Demo User', 'owner', true, true)
ON CONFLICT (email) DO NOTHING;

-- Demo workspace
INSERT INTO workspaces (id, name, slug, owner_id, plan) VALUES
  ('22222222-2222-2222-2222-222222222222', 'Demo Workspace', 'demo-workspace', '11111111-1111-1111-1111-111111111111', 'professional')
ON CONFLICT (slug) DO NOTHING;

-- NOTE: Real ad accounts, campaigns, ads, and insights
-- will be populated via Meta API sync after OAuth connection.
-- This seed only provides the user/workspace for login.
