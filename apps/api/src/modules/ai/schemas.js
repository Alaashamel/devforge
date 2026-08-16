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
