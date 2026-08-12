import { z } from 'zod';

const DEFAULT_ACCESS_SECRET = 'devforge-dev-access-secret-change-me-in-production-0123456789';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().min(1).default('0.0.0.0'),
    PORT: z.coerce.number().int().positive().max(65535).default(4000),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    DATABASE_URL: z
      .string()
      .min(1)
      .default('postgres://devforge:devforge@localhost:5433/devforge'),
    CORS_ORIGINS: z.string().min(1).default('http://localhost:5173'),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters').default(DEFAULT_ACCESS_SECRET),
    JWT_ACCESS_TTL: z.string().min(1).default('15m'),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    WEB_BASE_URL: z.string().url().default('http://localhost:5173'),
    ARGON2_MEMORY_COST: z.coerce.number().int().min(8192).default(65536),
    ARGON2_TIME_COST: z.coerce.number().int().min(1).max(10).default(3),
    ARGON2_PARALLELISM: z.coerce.number().int().min(1).max(8).default(1),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && value.JWT_ACCESS_SECRET === DEFAULT_ACCESS_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACCESS_SECRET'],
        message: 'JWT_ACCESS_SECRET must be set explicitly in production',
      });
    }
  });

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join(', ');
  console.error(`[env] invalid environment configuration: ${issues}`);
  process.exit(1);
}

const raw = result.data;

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
