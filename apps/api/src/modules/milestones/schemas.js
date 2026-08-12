import { z } from 'zod';

const title = z.string().trim().min(1, 'Title is required').max(120, 'Title must be at most 120 characters');
const description = z.string().trim().max(2000, 'Description must be at most 2000 characters').nullable().optional();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD')
  .nullable()
  .optional();

export const createMilestoneSchema = z
  .object({
    title,
    description: description.optional(),
    startDate: isoDate,
    dueDate: isoDate,
    status: z.enum(['planned', 'active', 'completed', 'cancelled']).optional(),
  })
  .strict();

export const updateMilestoneSchema = z
  .object({
    title: title.optional(),
    description,
    startDate: isoDate,
    dueDate: isoDate,
    status: z.enum(['planned', 'active', 'completed', 'cancelled']).optional(),
    position: z.number().min(0).optional(),
  })
  .strict();
