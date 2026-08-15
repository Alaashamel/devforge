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
