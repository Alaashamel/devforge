import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { validate } from '../../utils/validate.js';
import { createAuthController } from './controller.js';
import {
  forgotPasswordSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from './schemas.js';

export function createAuthRouter({ service, requireAuth, limiter }) {
  const controller = createAuthController(service);
  const router = Router();

  router.post('/register', limiter('register'), validate(registerSchema), asyncHandler(controller.register));
  router.post('/login', limiter('login'), validate(loginSchema), asyncHandler(controller.login));
  router.post('/refresh', limiter('refresh'), validate(refreshSchema), asyncHandler(controller.refresh));
  router.post('/logout', limiter('logout'), validate(logoutSchema), asyncHandler(controller.logout));
  router.post('/verify-email', limiter('verify-email'), validate(verifyEmailSchema), asyncHandler(controller.verifyEmail));
  router.post('/forgot-password', limiter('forgot-password'), validate(forgotPasswordSchema), asyncHandler(controller.forgotPassword));
  router.post('/reset-password', limiter('reset-password'), validate(resetPasswordSchema), asyncHandler(controller.resetPassword));
  router.get('/me', requireAuth, asyncHandler(controller.me));

  return router;
}
