import { z } from 'zod';

const DEFAULT_ACCESS_SECRET = 'devforge-dev-access-secret-change-me-in-production-0123456789';
const DEFAULT_GITHUB_ENCRYPTION_KEY = 'devforge-dev-token-encryption-key';

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
    API_BASE_URL: z.string().url().default('http://localhost:4000'),
    GITHUB_CLIENT_ID: z.string().min(1).default('devforge-dev-github-client-id'),
    GITHUB_CLIENT_SECRET: z.string().min(1).default('devforge-dev-github-client-secret'),
    GITHUB_OAUTH_URL: z.string().url().default('https://github.com/login/oauth'),
    GITHUB_API_URL: z.string().url().default('https://api.github.com'),
    GITHUB_OAUTH_CALLBACK_URL: z
      .string()
      .url()
      .default('http://localhost:4000/api/v1/github/oauth/callback'),
    GITHUB_APP_NAME: z.string().min(1).default('devforge'),
    GITHUB_ENCRYPTION_KEY: z.string().min(16, 'GITHUB_ENCRYPTION_KEY must be at least 16 characters').default(DEFAULT_GITHUB_ENCRYPTION_KEY),
    AI_SERVICE_URL: z.string().url().default('http://localhost:5001'),
    AI_JOB_SECRET: z.string().min(16, 'AI_JOB_SECRET must be at least 16 characters').default('devforge-dev-ai-job-secret'),
    AI_JOB_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
    AI_ARCHIVE_TTL_SECONDS: z.coerce.number().int().min(60).max(7200).default(900),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && value.JWT_ACCESS_SECRET === DEFAULT_ACCESS_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_ACCESS_SECRET'],
        message: 'JWT_ACCESS_SECRET must be set explicitly in production',
      });
    }
    if (value.NODE_ENV === 'production' && value.GITHUB_ENCRYPTION_KEY === DEFAULT_GITHUB_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['GITHUB_ENCRYPTION_KEY'],
        message: 'GITHUB_ENCRYPTION_KEY must be set explicitly in production',
      });
    }
    if (value.NODE_ENV === 'production' && value.API_BASE_URL.startsWith('http://localhost')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['API_BASE_URL'],
        message: 'API_BASE_URL must be a publicly reachable URL in production',
      });
    }
    if (value.NODE_ENV === 'production' && value.AI_JOB_SECRET === 'devforge-dev-ai-job-secret') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AI_JOB_SECRET'],
        message: 'AI_JOB_SECRET must be set explicitly in production',
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
