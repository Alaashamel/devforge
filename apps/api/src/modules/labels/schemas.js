import { z } from 'zod';

const name = z.string().trim().min(1, 'Name is required').max(60, 'Name must be at most 60 characters');
const color = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #64748b');

export const createLabelSchema = z
  .object({
    name,
    color: color.optional(),
  })
  .strict();

export const updateLabelSchema = z
  .object({
    name: name.optional(),
    color: color.optional(),
  })
  .strict();
