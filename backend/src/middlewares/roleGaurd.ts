// src/middlewares/roleGuard.ts
import { Request, Response, NextFunction } from 'express';
/* 
roleGuard('admin') will reject everyone except admins to access
 */
export const roleGuard = (requiredRole: 'admin' | 'staff' | 'customer') => {
  return (req: Request, res: Response, next: NextFunction) => {
    // req.user is set by authGuard
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'No authenticated user' });
    }
    if (user.role !== requiredRole) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    next();
  };
};

// Allow any of the provided roles
export const roleAnyGuard = (
  ...allowed: Array<'admin' | 'staff' | 'customer'>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: 'No authenticated user' });
    }
    if (!allowed.includes(user.role as any)) {
      return res.status(403).json({ message: 'Forbidden: insufficient role' });
    }
    next();
  };
};
