// ============================================
// AD FUSION - Auth Routes
// Signup, Login, Meta OAuth, Token Management
// ============================================
import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { body, validationResult } from 'express-validator';
import axios from 'axios';
import { query, transaction } from '../config/database';
import { encrypt, decrypt, hashData } from '../utils/encryption';
import { generateId, successResponse, errorResponse } from '../utils/helpers';
import { authenticate, generateTokens, AuthRequest } from '../middleware/auth';
import config from '../config';
import { logger } from '../utils/logger';

const router = Router();

// ==========================================
// POST /api/auth/signup
// ==========================================
router.post(
  '/signup',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('name').trim().isLength({ min: 2, max: 100 }),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid input', { errors: errors.array() }));
      return;
    }

    const { email, password, name } = req.body;

    try {
      // Check if email exists
      const existing = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (existing.rows.length > 0) {
        res.status(409).json(errorResponse('EMAIL_EXISTS', 'An account with this email already exists'));
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const userId = generateId();

      await transaction(async (client) => {
        // Create user
        await client.query(
          `INSERT INTO users (id, email, password_hash, name, role) VALUES ($1, $2, $3, $4, 'owner')`,
          [userId, email, passwordHash, name]
        );

        // Create default workspace
        const workspaceId = generateId();
        const slug = `${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${Date.now().toString(36)}`;
        await client.query(
          `INSERT INTO workspaces (id, name, slug, owner_id, plan) VALUES ($1, $2, $3, $4, 'free')`,
          [workspaceId, `${name}'s Workspace`, slug, userId]
        );
      });

      const tokens = generateTokens({ id: userId, email, name, role: 'owner' });

      // Log audit event
      await query(
        `INSERT INTO audit_log (id, user_id, action, entity_type, entity_id) VALUES ($1, $2, 'user.signup', 'user', $3)`,
        [generateId(), userId, userId]
      );

      res.status(201).json(successResponse({
        user: { id: userId, email, name },
        ...tokens,
      }));
    } catch (error) {
      logger.error('Signup failed', { error: (error as Error).message });
      res.status(500).json(errorResponse('SIGNUP_FAILED', 'Failed to create account'));
    }
  }
);

// ==========================================
// POST /api/auth/login
// ==========================================
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isString().notEmpty(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json(errorResponse('VALIDATION_ERROR', 'Invalid input'));
      return;
    }

    const { email, password } = req.body;

    try {
      const result = await query(
        'SELECT id, email, password_hash, name, role, is_active FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        res.status(401).json(errorResponse('INVALID_CREDENTIALS', 'Invalid email or password'));
        return;
      }

      const user = result.rows[0] as any;

      if (!user.is_active) {
        res.status(403).json(errorResponse('ACCOUNT_DISABLED', 'Your account has been disabled'));
        return;
      }

      if (!user.password_hash) {
        res.status(401).json(errorResponse('OAUTH_ONLY', 'This account uses social login. Please sign in with Google or Meta.'));
        return;
      }

      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid) {
        res.status(401).json(errorResponse('INVALID_CREDENTIALS', 'Invalid email or password'));
        return;
      }

      // Update last login
      await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

      const tokens = generateTokens({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      });

      // Get user's workspaces
      const workspaces = await query(
        `SELECT w.id, w.name, w.slug, w.plan, 
          COALESCE(wm.role, CASE WHEN w.owner_id = $1 THEN 'owner' END) as role
         FROM workspaces w
         LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $1
         WHERE w.owner_id = $1 OR wm.user_id = $1
         ORDER BY w.created_at`,
        [user.id]
      );

      res.json(successResponse({
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        workspaces: workspaces.rows,
        ...tokens,
      }));
    } catch (error) {
      logger.error('Login failed', { error: (error as Error).message });
      res.status(500).json(errorResponse('LOGIN_FAILED', 'Login failed'));
    }
  }
);

// ==========================================
// POST /api/auth/refresh
// ==========================================
router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    res.status(400).json(errorResponse('MISSING_TOKEN', 'Refresh token required'));
    return;
  }

  try {
    const jwt = await import('jsonwebtoken');
    const decoded = jwt.default.verify(refreshToken, config.jwt.secret) as any;

    if (decoded.type !== 'refresh') {
      res.status(401).json(errorResponse('INVALID_TOKEN', 'Invalid refresh token'));
      return;
    }

    // Get fresh user data
    const result = await query(
      'SELECT id, email, name, role, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0 || !(result.rows[0] as any).is_active) {
      res.status(401).json(errorResponse('INVALID_USER', 'User not found or disabled'));
      return;
    }

    const user = result.rows[0] as any;
    const tokens = generateTokens({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    res.json(successResponse(tokens));
  } catch (error) {
    res.status(401).json(errorResponse('INVALID_TOKEN', 'Invalid or expired refresh token'));
  }
});

// ==========================================
// GET /api/auth/me
// ==========================================
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT u.id, u.email, u.name, u.avatar_url, u.role, u.is_active, u.email_verified, 
              u.created_at, u.last_login_at
       FROM users u WHERE u.id = $1`,
      [req.user!.id]
    );

    if (result.rows.length === 0) {
      res.status(404).json(errorResponse('NOT_FOUND', 'User not found'));
      return;
    }

    // Get workspaces
    const workspaces = await query(
      `SELECT w.id, w.name, w.slug, w.plan, w.settings,
        COALESCE(wm.role, CASE WHEN w.owner_id = $1 THEN 'owner' END) as role,
        (SELECT COUNT(*) FROM ad_accounts aa WHERE aa.workspace_id = w.id AND aa.is_active = true) as ad_account_count
       FROM workspaces w
       LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $1
       WHERE (w.owner_id = $1 OR wm.user_id = $1) AND w.is_active = true
       ORDER BY w.created_at`,
      [req.user!.id]
    );

    res.json(successResponse({
      user: result.rows[0],
      workspaces: workspaces.rows,
    }));
  } catch (error) {
    logger.error('Get profile failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get profile'));
  }
});

// ==========================================
// GET /api/auth/meta/connect - Start Meta OAuth
// ==========================================
router.get('/meta/connect', authenticate, (req: AuthRequest, res: Response): void => {
  const state = Buffer.from(JSON.stringify({
    userId: req.user!.id,
    workspaceId: req.query.workspace_id,
    timestamp: Date.now(),
  })).toString('base64');

  const scopes = config.meta.scopes.join(',');
  const authUrl = `https://www.facebook.com/${config.meta.apiVersion}/dialog/oauth?` +
    `client_id=${config.meta.appId}` +
    `&redirect_uri=${encodeURIComponent(config.meta.redirectUri)}` +
    `&scope=${scopes}` +
    `&state=${state}` +
    `&response_type=code`;

  res.json(successResponse({ authUrl }));
});

// ==========================================
// GET /api/auth/meta/callback - Handle Meta OAuth callback
// ==========================================
router.get('/meta/callback', async (req: Request, res: Response): Promise<void> => {
  const { code, state, error } = req.query;

  if (error) {
    logger.warn('Meta OAuth error', { error });
    res.redirect(`/?error=meta_auth_denied`);
    return;
  }

  if (!code || !state) {
    res.status(400).json(errorResponse('MISSING_PARAMS', 'Missing code or state parameter'));
    return;
  }

  try {
    // Decode state
    const stateData = JSON.parse(Buffer.from(state as string, 'base64').toString());
    const { userId, workspaceId } = stateData;

    // Exchange code for access token
    const tokenResponse = await axios.get(
      `${config.meta.graphApiBase}/${config.meta.apiVersion}/oauth/access_token`,
      {
        params: {
          client_id: config.meta.appId,
          client_secret: config.meta.appSecret,
          redirect_uri: config.meta.redirectUri,
          code,
        },
      }
    );

    const shortLivedToken = tokenResponse.data.access_token;

    // Exchange for long-lived token
    const longLivedResponse = await axios.get(
      `${config.meta.graphApiBase}/${config.meta.apiVersion}/oauth/access_token`,
      {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: config.meta.appId,
          client_secret: config.meta.appSecret,
          fb_exchange_token: shortLivedToken,
        },
      }
    );

    const longLivedToken = longLivedResponse.data.access_token;
    const expiresIn = longLivedResponse.data.expires_in; // ~60 days

    // Get user's ad accounts
    const adAccountsResponse = await axios.get(
      `${config.meta.graphApiBase}/${config.meta.apiVersion}/me/adaccounts`,
      {
        params: {
          access_token: longLivedToken,
          fields: 'id,name,account_status,currency,timezone_name,amount_spent,balance,spend_cap',
          limit: 100,
        },
      }
    );

    const adAccounts = adAccountsResponse.data.data || [];
    const encryptedToken = encrypt(longLivedToken);
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

    // Store ad accounts
    await transaction(async (client) => {
      // Update user's Meta ID
      const meResponse = await axios.get(
        `${config.meta.graphApiBase}/${config.meta.apiVersion}/me`,
        { params: { access_token: longLivedToken, fields: 'id,name' } }
      );
      await client.query(
        'UPDATE users SET meta_user_id = $1 WHERE id = $2',
        [meResponse.data.id, userId]
      );

      // Upsert each ad account
      for (const account of adAccounts) {
        await client.query(
          `INSERT INTO ad_accounts (id, workspace_id, meta_account_id, name, currency, timezone, access_token_encrypted, token_expires_at, account_status, spend_cap, amount_spent, balance)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           ON CONFLICT (workspace_id, meta_account_id) DO UPDATE SET
             name = EXCLUDED.name,
             access_token_encrypted = EXCLUDED.access_token_encrypted,
             token_expires_at = EXCLUDED.token_expires_at,
             account_status = EXCLUDED.account_status,
             amount_spent = EXCLUDED.amount_spent,
             balance = EXCLUDED.balance`,
          [
            generateId(),
            workspaceId,
            account.id,
            account.name || account.id,
            account.currency || 'USD',
            account.timezone_name || 'UTC',
            encryptedToken,
            tokenExpiresAt,
            mapMetaAccountStatus(account.account_status),
            account.spend_cap ? Number(account.spend_cap) / 100 : null,
            account.amount_spent ? Number(account.amount_spent) / 100 : 0,
            account.balance ? Number(account.balance) / 100 : 0,
          ]
        );
      }
    });

    // Audit log
    await query(
      `INSERT INTO audit_log (id, workspace_id, user_id, action, entity_type, entity_id, new_value)
       VALUES ($1, $2, $3, 'meta.connected', 'ad_account', $4, $5)`,
      [generateId(), workspaceId, userId, 'multiple', JSON.stringify({ count: adAccounts.length })]
    );

    logger.info('Meta OAuth completed', { userId, accountCount: adAccounts.length });

    // Redirect to frontend with success
    res.redirect(`/?meta_connected=true&accounts=${adAccounts.length}`);
  } catch (error) {
    logger.error('Meta OAuth callback failed', { error: (error as Error).message });
    res.redirect(`/?error=meta_auth_failed`);
  }
});

// ==========================================
// GET /api/auth/meta/accounts - List connected ad accounts
// ==========================================
router.get('/meta/accounts', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const workspaceId = req.headers['x-workspace-id'] as string;

  if (!workspaceId) {
    res.status(400).json(errorResponse('WORKSPACE_REQUIRED', 'X-Workspace-ID header required'));
    return;
  }

  try {
    const result = await query(
      `SELECT id, meta_account_id, name, currency, timezone, account_status,
              spend_cap, amount_spent, balance, last_synced_at, is_active,
              token_expires_at, created_at
       FROM ad_accounts
       WHERE workspace_id = $1
       ORDER BY name`,
      [workspaceId]
    );

    // Add token health status
    const accounts = result.rows.map((acc: any) => ({
      ...acc,
      token_health: acc.token_expires_at
        ? new Date(acc.token_expires_at) > new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          ? 'healthy'
          : new Date(acc.token_expires_at) > new Date()
            ? 'expiring_soon'
            : 'expired'
        : 'unknown',
    }));

    res.json(successResponse(accounts));
  } catch (error) {
    logger.error('Get ad accounts failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to get ad accounts'));
  }
});

// ==========================================
// DELETE /api/auth/meta/accounts/:accountId
// ==========================================
router.delete(
  '/meta/accounts/:accountId',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { accountId } = req.params;
    const workspaceId = req.headers['x-workspace-id'] as string;

    try {
      const result = await query(
        'UPDATE ad_accounts SET is_active = false WHERE id = $1 AND workspace_id = $2 RETURNING id',
        [accountId, workspaceId]
      );

      if (result.rows.length === 0) {
        res.status(404).json(errorResponse('NOT_FOUND', 'Ad account not found'));
        return;
      }

      res.json(successResponse({ message: 'Ad account disconnected' }));
    } catch (error) {
      logger.error('Disconnect ad account failed', { error: (error as Error).message });
      res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to disconnect ad account'));
    }
  }
);

// Helper: Map Meta account status codes to human-readable
function mapMetaAccountStatus(statusCode: number): string {
  const statusMap: Record<number, string> = {
    1: 'active',
    2: 'disabled',
    3: 'unsettled',
    7: 'pending_review',
    8: 'pending_review',
    9: 'in_grace_period',
    100: 'pending_closure',
    101: 'closed',
    201: 'temporarily_unavailable',
  };
  return statusMap[statusCode] || 'active';
}

export default router;
