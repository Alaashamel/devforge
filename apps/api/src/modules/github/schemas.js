import { z } from 'zod';

const fullName = z
  .string()
  .trim()
  .min(3, 'Repository name is required')
  .max(200, 'Repository name must be at most 200 characters')
  .regex(/^[\w.-]+\/[\w.-]+$/, 'Repository must use the "owner/name" format');

const webhookEvents = z
  .array(z.enum(['push', 'pull_request', 'issues']))
  .min(1, 'At least one event is required')
  .max(10, 'Too many webhook events');

export const importRepositorySchema = z.object({ fullName }).strict();

export const createWebhookSchema = z.object({ events: webhookEvents.optional() }).strict();
