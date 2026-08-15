import { z } from 'zod';

export const createAnalysisSchema = z
  .object({
    repositoryId: z.string().uuid('repositoryId must be a valid id'),
    type: z.enum(['architecture', 'code_review', 'docs', 'readme']),
  })
  .strict();
