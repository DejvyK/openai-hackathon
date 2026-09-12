import { Hono } from 'hono';
import { SlackPreviewRequestSchema, SlackPreviewSchema, SlackSendRequestSchema, SlackSendResultSchema } from '@agentlayer/contracts/reactive-v1';
import { SlackReviewError, type SlackReviewService } from '../slack/review.js';
import { apiError } from './errors.js';

export function createSlackRoutes(review: SlackReviewService | null) {
  const app = new Hono();
  for (const action of ['preview', 'send'] as const) app.post(`/${action}`, async c => {
    if (!review) return apiError('SLACK_UNAVAILABLE', 'Configure the Slack bot, workspace and channel on the local API before reviewing a send.', 503, 'commit');
    let body: unknown;
    try { body = await c.req.json(); } catch { return apiError('INVALID_JSON', 'Invalid JSON.', 400, 'commit'); }
    try {
      if (action === 'preview') {
        const input = SlackPreviewRequestSchema.safeParse(body);
        if (!input.success) return apiError('INVALID_SLACK_PREVIEW', 'Review text and current profile are required.', 400, 'commit');
        return c.json(SlackPreviewSchema.parse(await review.prepare(input.data)));
      }
      const input = SlackSendRequestSchema.safeParse(body);
      if (!input.success) return apiError('INVALID_SLACK_SEND', 'Sending requires the exact preview and explicit confirmation.', 400, 'commit');
      return c.json(SlackSendResultSchema.parse(await review.send(input.data)));
    } catch (error) {
      if (error instanceof SlackReviewError) {
        const messages: Record<SlackReviewError['code'], string> = {
          invalid_input: 'The Slack request is invalid.', stale_context: 'The profile or goal changed. Prepare a new message.',
          preview_not_found: 'The preview was not found. Prepare a new message.', preview_mismatch: 'The text changed. Review a new preview before sending.',
          expired: 'This preview expired. Review a new preview.', connection_unavailable: 'Slack access could not be verified. Check the configured channel and connection.',
          destination_changed: 'The Slack destination changed. Prepare a new preview.', journal_error: 'The send record could not be verified. Do not resend until its status is checked.',
        };
        return apiError(`SLACK_${error.code.toUpperCase()}`, messages[error.code], error.code === 'connection_unavailable' ? 503 : 409, 'commit');
      }
      return apiError('SLACK_REQUEST_FAILED', 'The Slack result could not be verified. Do not create a new send until its status is checked.', 500, 'commit');
    }
  });
  return app;
}
