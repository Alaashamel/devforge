import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgres://devforge:devforge@localhost:5433/devforge'),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  const issues = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join(', ');
  console.error(`[database] invalid environment configuration: ${issues}`);
  process.exit(1);
}

export const env = {
  databaseUrl: result.data.DATABASE_URL,
};
