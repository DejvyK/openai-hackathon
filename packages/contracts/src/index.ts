import { z } from 'zod';

const httpUrl = z.string().url().max(4096).refine(
  (value) => /^https?:\/\//i.test(value),
  'Only HTTP(S) URLs are supported',
);

export const PageContextSchema = z.object({
  contextId: z.string().min(1).max(200),
  url: httpUrl,
  title: z.string().max(500),
  name: z.string().trim().min(1).max(200),
  company: z.string().trim().max(200).nullable(),
  selection: z.string().max(10000),
}).strict();

export const ResearchRequestSchema = z.object({
  context: PageContextSchema,
}).strict();

export const ResearchBriefSchema = z.object({
  mode: z.enum(['demo', 'live']),
  contextId: z.string().min(1).max(200),
  summary: z.string().max(15000),
  sources: z.array(z.object({ title: z.string().max(500), url: httpUrl })).max(20),
  task: z.object({
    title: z.string().trim().min(1).max(300),
    description: z.string().max(15000),
  }),
}).strict();

export const CreateTaskRequestSchema = z.object({
  requestId: z.string().min(1).max(200),
  contextId: z.string().min(1).max(200),
  title: z.string().trim().min(1).max(300),
  description: z.string().max(15000),
}).strict();

export const TaskResultSchema = z.object({
  mode: z.enum(['demo', 'live']),
  id: z.string().min(1),
  title: z.string().min(1).max(300),
  url: httpUrl.nullable(),
  status: z.literal('created'),
}).strict();

export type PageContext = z.infer<typeof PageContextSchema>;
export type ResearchRequest = z.infer<typeof ResearchRequestSchema>;
export type ResearchBrief = z.infer<typeof ResearchBriefSchema>;
export type CreateTaskRequest = z.infer<typeof CreateTaskRequestSchema>;
export type TaskResult = z.infer<typeof TaskResultSchema>;
