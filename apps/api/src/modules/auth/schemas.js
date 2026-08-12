import { z } from 'zod';

export const PASSWORD_POLICY = {
  min: 10,
  max: 128,
  description: 'Password must be 10–128 characters and contain at least one letter and one digit.',
};

const password = z
  .string()
  .min(PASSWORD_POLICY.min, `Password must be at least ${PASSWORD_POLICY.min} characters`)
  .max(PASSWORD_POLICY.max, `Password must be at most ${PASSWORD_POLICY.max} characters`)
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/\d/, 'Password must contain at least one digit');

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address');

export const registerSchema = z
  .object({
    email,
    name: z.string().trim().min(1, 'Name is required').max(120, 'Name must be at most 120 characters'),
    password,
  })
  .strict();

export const loginSchema = z
  .object({
    email,
    password: z.string().min(1, 'Password is required'),
  })
  .strict();

export const refreshSchema = z
  .object({
    token: z.string().min(1, 'Refresh token is required'),
  })
  .strict();

export const logoutSchema = refreshSchema;

export const verifyEmailSchema = z
  .object({
    token: z.string().min(1, 'Verification token is required'),
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password,
  })
  .strict();
