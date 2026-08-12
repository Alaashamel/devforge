import { z } from 'zod';

const uuid = z.string().uuid('Must be a valid id');

const title = z.string().trim().min(1, 'Title is required').max(200, 'Title must be at most 200 characters');
const description = z
  .string()
  .trim()
  .max(10000, 'Description must be at most 10000 characters')
  .nullable()
  .optional();
const priority = z.enum(['low', 'medium', 'high', 'urgent']);
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD')
  .nullable()
  .optional();

const baseFields = {
  title,
  type: z.enum(['task', 'issue', 'bug']).optional(),
  status: z
    .string()
    .trim()
    .min(1, 'Status is required')
    .max(40, 'Status must be at most 40 characters')
    .optional(),
  priority: priority.optional(),
  description,
  assigneeId: uuid.nullable().optional(),
  milestoneId: uuid.nullable().optional(),
  parentId: uuid.nullable().optional(),
  dueDate: isoDate,
  estimate: z.number().min(0, 'Estimate must be a non-negative number').nullable().optional(),
  labels: z.array(uuid).max(50, 'A task can have at most 50 labels').optional(),
};

export const createTaskSchema = z
  .object({ ...baseFields, title, type: z.enum(['task', 'issue', 'bug']).optional(), labels: baseFields.labels })
  .strict();

export const updateTaskSchema = z
  .object({ ...baseFields, title: baseFields.title.optional(), position: z.number().min(0).optional() })
  .strict();

export const createCommentSchema = z
  .object({
    body: z.string().trim().min(1, 'Comment is required').max(10000, 'Comment must be at most 10000 characters'),
  })
  .strict();

export const updateCommentSchema = createCommentSchema;

export const setTaskLabelsSchema = z
  .object({
    labelIds: z.array(uuid).max(50, 'A task can have at most 50 labels'),
  })
  .strict();

export const createDependencySchema = z
  .object({
    dependsOnId: uuid,
  })
  .strict();
