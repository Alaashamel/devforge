import { z } from 'zod';

export const createAnalysisSchema = z
  .object({
    repositoryId: z.string().uuid('repositoryId must be a valid id'),
    type: z.enum(['analyzer', 'architecture', 'code_review', 'docs', 'readme']),
    pullRequestNumber: z
      .number()
      .int('pullRequestNumber must be an integer')
      .positive('pullRequestNumber must be a positive integer')
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.type === 'code_review' && data.pullRequestNumber === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'pullRequestNumber is required for code_review analyses',
        path: ['pullRequestNumber'],
      });
    }
  });

export const approveAnalysisSchema = z
  .object({
    filePath: z.string().min(1, 'filePath is required').max(255, 'filePath is too long'),
    message: z.string().max(200, 'message is too long').optional(),
  })
  .strict();

export const createConversationSchema = z
  .object({
    repositoryId: z.string().uuid('repositoryId must be a valid id'),
    title: z.string().max(200, 'title is too long').optional(),
  })
  .strict();

export const streamMessageSchema = z
  .object({
    content: z
      .string()
      .min(1, 'content is required')
      .max(100000, 'content is too long'),
  })
  .strict();
