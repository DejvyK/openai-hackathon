/** Explicit opt-in live research and draft-only smoke check. Creates no webpage or external record. */
import { readFile, writeFile } from 'node:fs/promises';
import { configuredCodex } from '../config/codex.js';
import type { ReactiveEvent, ReactiveSnapshotRequest } from '@agentlayer/contracts/reactive-v1';
if (!process.argv.includes('--research-and-draft')) throw new Error('Use --research-and-draft to opt into live Exa and Codex calls.');
const runner = configuredCodex(process.env, true);
if (!runner) throw new Error('RUNTIME_NOT_CONFIGURED');
const events: ReactiveEvent[] = [];
const request: ReactiveSnapshotRequest = { schemaVersion: 'reactive-v1', sessionId: 'mcp-live-check', contextId: 'user-provided-url', revision: 3,
  snapshot: { url: 'https://www.linkedin.com/in/william-bryk/', pageTitle: 'User supplied William Bryk profile URL', capturedAt: new Date().toISOString(),
    mainText: 'The user supplied this LinkedIn URL for research. Live page content is not available in this transport check.', selectedText: '', extractedEvidence: [] },
  conversation: { messageId: 'research-draft-check', userMessage: 'Use Exa to research William Bryk at https://www.linkedin.com/in/william-bryk/. Give one short sourced finding and prepare a Slack draft containing the profile URL and source URL for review only. Do not send or create any external record.', history: [] },
};
let failure: string | undefined;
try { await runner(request, { runId: 'native-mcp-live', signal: AbortSignal.timeout(65000), emit: event => { events.push(event); if (event.type === 'progress') console.log(JSON.stringify({ message: event.message })); } }); }
catch (error) { failure = error instanceof Error ? error.message : 'RUNTIME_FAILED'; }
const completed = events.find(event => event.type === 'completed');
const passed = Boolean(!failure && completed?.type === 'completed' && completed.sources?.length && completed.slackDraft?.includes(request.snapshot.url));
const report = { checkedAt: new Date().toISOString(), scope: 'Live Codex native MCP, real Exa, draft only; URL supplied by user, not LinkedIn DOM acceptance', passed, events, ...(failure ? { failure } : {}) };
const file = new URL('../../../../docs/handoffs/native-mcp-live.json', import.meta.url);
let previous: { attempts?: unknown[] } = {};
try { previous = JSON.parse(await readFile(file, 'utf8')); } catch { /* First run. */ }
await writeFile(file, JSON.stringify({ attempts: [...(previous.attempts ?? (Object.keys(previous).length ? [previous] : [])), report] }, null, 2) + '\n');
console.log(JSON.stringify(report));
if (!passed) process.exitCode = 1;
