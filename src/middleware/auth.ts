// ============================================
// AD FUSION - Authentication Middleware
// ============================================
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { query } from '../config/database';
import { errorResponse } from '../utils/helpers';
import { logger } from '../utils/logger';
import { UserRole } from '../types';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    workspace_id?: string;
  };
  workspace_id?: string;
}

interface JwtPayload {
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

// Verify JWT token
export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Authentication token required'));
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
    };
    next();
  } catch (error) {
    if ((error as Error).name === 'TokenExpiredError') {
      res.status(401).json(errorResponse('TOKEN_EXPIRED', 'Authentication token has expired'));
    } else {
      res.status(401).json(errorResponse('INVALID_TOKEN', 'Invalid authentication token'));
    }
  }
}

// Check workspace membership and extract workspace context
export async function requireWorkspace(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const workspaceId = req.headers['x-workspace-id'] as string || req.params.workspaceId;

  if (!workspaceId) {
    res.status(400).json(errorResponse('WORKSPACE_REQUIRED', 'Workspace ID is required'));
    return;
  }

  if (!req.user) {
    res.status(401).json(errorResponse('UNAUTHORIZED', 'Authentication required'));
    return;
  }

  try {
    const result = await query(
      `SELECT wm.role, w.plan, w.settings FROM workspace_members wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.workspace_id = $1 AND wm.user_id = $2`,
      [workspaceId, req.user.id]
    );

    if (result.rows.length === 0) {
      // Check if user is the workspace owner
      const ownerCheck = await query(
        'SELECT id, plan, settings FROM workspaces WHERE id = $1 AND owner_id = $2',
        [workspaceId, req.user.id]
      );

      if (ownerCheck.rows.length === 0) {
        res.status(403).json(errorResponse('FORBIDDEN', 'You do not have access to this workspace'));
        return;
      }

      req.user.role = 'owner';
    } else {
      req.user.role = result.rows[0].role as UserRole;
    }

    req.workspace_id = workspaceId as string;
    req.user.workspace_id = workspaceId as string;
    next();
  } catch (error) {
    logger.error('Workspace auth check failed', { error: (error as Error).message });
    res.status(500).json(errorResponse('INTERNAL_ERROR', 'Failed to verify workspace access'));
  }
}

// Role-based access control
export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json(errorResponse('UNAUTHORIZED', 'Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json(errorResponse('INSUFFICIENT_ROLE', `Required role: ${roles.join(' or ')}`));
      return;
    }

    next();
  };
}

// Generate JWT tokens
export function generateTokens(user: { id: string; email: string; name: string; role: UserRole }) {
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, name: user.name, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as any }
  );

  const refreshToken = jwt.sign(
    { userId: user.id, type: 'refresh' },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiresIn as any }
  );

  return { accessToken, refreshToken };
}
