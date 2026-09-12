# Slack provider boundary — implementation handoff

Status: isolated implementation tested; live Slack acceptance `done:false`. No Slack requests were made, no credentials read, no records written, and no substitute web pages created.

## Interface and ownership

`apps/api/src/slack/index.ts` exports `SlackProvider`, `SlackConfig`, `SlackConnection`, `ReviewedSlackMessage`, `SlackSendResult`, `SlackFailure`, and `SLACK_TEXT_LIMIT` (3000 UTF-16 code units).

```ts
const provider = new SlackProvider({
  token: serverConfig.slackBotToken,
  channelId: serverConfig.slackChannelId,
  expectedTeamId: serverConfig.slackTeamId,
});
const connection = await provider.checkConnection();
// Only after durable approval / send reservation and revision checks:
const result = await provider.sendReviewed({ text: exactApprovedText, sendId });
// If result is sent but linkUnavailable, retry only this read:
const url = await provider.getPermalink(result.messageTs);
```

This snippet illustrates conditional calls, not a paste-ready route. Check the result discriminant before accessing `messageTs`.

All destination configuration is server-owned. Optional `expectedTeamId` prevents accidental workspace mismatch; production integration should require it. The provider checks auth and channel membership before each post. It never joins channels. Read checks cannot prove permission to post. Set bot scopes `chat:write` and the channel-read scope appropriate to the destination (`channels:read` for public, `groups:read` for private); invite the bot into the chosen channel. Validate these in the actual destination before accepting the demo.

## Delivery semantics

- Fixed `https://slack.com/api/` endpoints, redirects rejected, bearer header only, per-call timeout default 10 seconds and maximum 30 seconds. Injected fetch supports network-free tests. No automatic retries.
- The reviewed visible message is preserved in a `plain_text` section. The fallback escapes Slack control characters; formatting, mention expansion and link/media unfurls are disabled. The adapter rejects empty, over-limit or control-character input without silently trimming/truncating it. Ordinary URLs remain visible text.
- `sent` requires Slack `ok:true`, matching configured channel and a valid timestamp. Permalink failure retains this confirmed reference with `permalink:null` and `linkUnavailable:true`; it must not trigger another post.
- Known rejections return `failed`. Network loss, ambiguous server failures and malformed write responses return `unknown`. Raw provider bodies, exceptions and tokens are never included in errors.
- `sendId` is local caller correlation, not a Slack deduplication guarantee. The official argument list does not document `client_msg_id`, although duplicate-error descriptions mention it, so this implementation does not depend on that undocumented argument.

## Required coordinator integration

Persist approval, exact text, profile URL/context revision, goal revision, configured destination and stable send ID before attempting the write. Enforce one in-flight attempt per durable send ID; reject a reused ID with changed content. Replay stored terminal results. Keep unknown operations unknown until reconciled, including process death between post and result persistence. Never automatically re-post an unknown operation. Link lookup may be retried independently from writing. Binding previews to current sessions, authorization, cancellation and navigation invalidation belong to the route/orchestrator, not this low-level provider.

No shared schemas/config/manifests/routes were edited. Root must add wiring and include this test command in its aggregate test script. Actual profile URLs, Slack credentials/destination, live exact-text read-back and real browser acceptance remain outstanding. Local fixture success is not live integration evidence.

## Verification

- `node --import tsx --test apps/api/tests/slack/slack.test.ts`: 9 tests passed.
- `npm run typecheck --workspace @agentlayer/api`: passed.
- Tests cover exact visible text and disabled parsing, `ok:false` at HTTP 200, rate limiting without retries, denied channel/workspace, ambiguous network/provider failures, link failure after confirmed post, malicious permalink, rejected input, and timeout despite a fetch implementation that ignores abort.

## Official references consulted

- [chat.postMessage](https://docs.slack.dev/reference/methods/chat.postMessage/): request fields, permission, response/error semantics and message formatting controls.
- [Message formatting](https://docs.slack.dev/messaging/formatting-message-text/): plain text, escaping and automatic parsing.
- [auth.test](https://docs.slack.dev/reference/methods/auth.test/): authenticated identity and workspace check.
- [conversations.info](https://docs.slack.dev/reference/methods/conversations.info/): channel information and access requirements.
- [chat.getPermalink](https://docs.slack.dev/reference/methods/chat.getPermalink/): timestamp/channel to message URL.
