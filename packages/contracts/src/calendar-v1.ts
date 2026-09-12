import { z } from 'zod';

const timestamp = z.string().datetime({ offset: true });
export const CalendarEventInputSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().max(6000),
  location: z.string().max(500).nullable(),
  start: timestamp,
  end: timestamp,
  timeZone: z.string().min(1).max(100).refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
  }, 'Use a valid IANA time zone'),
}).strict().refine(value => Date.parse(value.end) > Date.parse(value.start), 'End must follow start');
export type CalendarEventInput = z.infer<typeof CalendarEventInputSchema>;

export const CalendarConnectionStatusSchema = z.object({ configured: z.boolean(), connected: z.boolean() }).strict();
export const CalendarConnectResponseSchema = z.object({ authorizationUrl: z.string().url().refine(value => {
  const url = new URL(value);
  return url.origin === 'https://accounts.google.com' && url.pathname === '/o/oauth2/v2/auth';
}) }).strict();
