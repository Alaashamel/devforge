import { z } from 'zod';

export const projectKey = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,6}$/, 'Key must be 2–6 uppercase letters or digits');

const name = z.string().trim().min(1, 'Name is required').max(120, 'Name must be at most 120 characters');
const description = z
  .string()
  .trim()
  .max(2000, 'Description must be at most 2000 characters')
  .nullable()
  .optional();

export const createProjectSchema = z
  .object({
    name,
    key: projectKey,
    description: description.optional(),
    defaultPriority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  })
  .strict();

export const updateProjectSchema = z
  .object({
    name: name.optional(),
    description,
    status: z.enum(['active', 'archived']).optional(),
    defaultPriority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  })
  .strict();

export const setMemberSchema = z
  .object({
    role: z.enum(['owner', 'admin', 'maintainer', 'developer', 'viewer']),
  })
  .strict();
