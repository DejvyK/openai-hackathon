import { Hono } from 'hono';
import { CalendarConnectionStatusSchema, CalendarConnectResponseSchema } from '@agentlayer/contracts/calendar-v1';
import type { GoogleCalendarService } from '../calendar/index.js';
import { apiError } from './errors.js';

/** Mounted after the application's /api authentication middleware. OAuth uses one-time state. */
export function createCalendarRoutes(calendar?: GoogleCalendarService) {
  const routes = new Hono();
  routes.get('/api/calendar/status', c => c.json(CalendarConnectionStatusSchema.parse(calendar?.status() ?? { configured: false, connected: false })));
  routes.post('/api/calendar/connect', async c => {
    if (!calendar?.status().configured) return apiError('CALENDAR_NOT_CONFIGURED', 'Set up the Google OAuth client on the API server before connecting Calendar.', 503);
    try { return c.json(CalendarConnectResponseSchema.parse(await calendar.beginConnect())); }
    catch { return apiError('CALENDAR_CONNECT_FAILED', 'Google Calendar connection could not be started.', 503); }
  });
  routes.post('/api/calendar/disconnect', async c => {
    try { await calendar?.disconnect(); return c.json(CalendarConnectionStatusSchema.parse(calendar?.status() ?? { configured: false, connected: false })); }
    catch { return apiError('CALENDAR_DISCONNECT_FAILED', 'Google Calendar could not be disconnected.', 503); }
  });
  routes.get('/oauth/google-calendar/callback', async c => {
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    const code = c.req.query('code');
    const state = c.req.query('state');
    if (!calendar || !code || !state || code.length > 4096 || state.length > 512 || c.req.query('error')) {
      return c.text('Google Calendar was not connected. Return to AgentLayer settings and try Connect again.', 400);
    }
    try {
      await calendar.completeConnect(code, state);
      return c.text('Google Calendar is connected to AgentLayer. You can close this tab and refresh Calendar status in extension settings.');
    } catch { return c.text('Google Calendar connection could not be completed. Return to AgentLayer settings and try Connect again.', 400); }
  });
  return routes;
}
