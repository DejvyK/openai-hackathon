import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
const fixtures = await build({ entryPoints: ['packages/contracts/src/fixtures/v1.ts'], bundle: true, write: false, format: 'cjs' });
const fixtureModule = { exports: {} };
vm.runInNewContext(fixtures.outputFiles[0].text, { module: fixtureModule, exports: fixtureModule.exports, URL });
const { completeProfile } = fixtureModule.exports;

const output = await build({ entryPoints: ['apps/extension/entrypoints/background.ts'], bundle: true, write: false, format: 'iife' });
let listener;
let token = 'fixture-pairing-token';
let response = { status: 200, data: { mode: 'demo', providers: [], workspaceConfigured: false } };
const requests = [];
const openedTabs = [];
const sandbox = {
  AbortSignal, Error, TypeError, encodeURIComponent, URL,
  defineBackground: callback => callback(),
  browser: {
    action: { onClicked: { addListener() {} } },
    runtime: { id: 'fixture-extension', getURL: path => `chrome-extension://fixture-extension${path}`, onConnect: { addListener() {} }, onMessage: { addListener(callback) { listener = callback; } }, openOptionsPage: async () => {} },
    tabs: { onUpdated: { addListener() {} }, onRemoved: { addListener() {} }, create: async options => openedTabs.push(options) },
    permissions: { onRemoved: { addListener() {} } },
    storage: { local: { get: async () => ({ pairingToken: token }) } },
  },
  fetch: async (url, options) => { requests.push({ url, options }); return { ok: response.status < 400, status: response.status, json: async () => response.data }; },
};
vm.runInNewContext(output.outputFiles[0].text, sandbox);
const pageSender = { id: 'fixture-extension', url: completeProfile.url, tab: { id: 1 } };
const optionsSender = { id: 'fixture-extension', url: 'chrome-extension://fixture-extension/options.html' };
function send(message, sender = pageSender) {
  return new Promise(resolve => {
    const result = listener(message, sender, resolve);
    if (result !== true) resolve(undefined);
  });
}
assert.equal((await send({ type: 'agentlayer:connection' }, optionsSender)).ok, true);
assert.equal(requests[0].url, 'http://127.0.0.1:4318/api/settings/connection');
assert.equal(requests[0].options.method, 'GET');
assert.equal(requests[0].options.redirect, 'error');
assert.equal(requests[0].options.headers.Authorization, `Bearer ${token}`);
assert.equal(await send({ type: 'agentlayer:connection' }), undefined);
assert.equal(await send({ type: 'agentlayer:research' }, { ...pageSender, id: 'another-extension' }), undefined);
assert.equal(await send({ type: 'agentlayer:commit' }, optionsSender), undefined);
response = { status: 200, data: { configured: true, connected: false } };
assert.equal((await send({ type: 'agentlayer:calendar-status' }, optionsSender)).data.configured, true);
assert.equal(requests.at(-1).url, 'http://127.0.0.1:4318/api/calendar/status');
assert.equal(await send({ type: 'agentlayer:calendar-connect' }), undefined);
response = { status: 200, data: { authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=fixture' } };
assert.equal((await send({ type: 'agentlayer:calendar-connect' }, optionsSender)).ok, true);
assert.equal(openedTabs.length, 1);
assert.equal(requests.at(-1).options.method, 'POST');
assert.equal(requests.at(-1).options.body, '{}');
response = { status: 200, data: { authorizationUrl: 'https://untrusted.example/auth' } };
assert.equal((await send({ type: 'agentlayer:calendar-connect' }, optionsSender)).ok, false);
assert.equal(openedTabs.length, 1);
response = { status: 200, data: { configured: true, connected: false } };
assert.equal((await send({ type: 'agentlayer:calendar-disconnect' }, optionsSender)).ok, true);
assert.equal(requests.at(-1).url, 'http://127.0.0.1:4318/api/calendar/disconnect');
token = '';
assert.match((await send({ type: 'agentlayer:research', payload: { context: completeProfile } })).error, /pairing token/);
token = 'fixture-pairing-token';
response = { status: 401, data: { error: 'Sensitive internal details must not leak' } };
assert.match((await send({ type: 'agentlayer:research', payload: { context: completeProfile } })).error, /Pairing token rejected/);
response = { status: 429, data: {} };
assert.match((await send({ type: 'agentlayer:research', payload: { context: completeProfile } })).error, /rate limit/);
response = { status: 200, data: { incompatible: true } };
assert.match((await send({ type: 'agentlayer:research', payload: { context: completeProfile } })).error, /incompatible format/);
const previousCount = requests.length;
assert.equal((await send({ type: 'agentlayer:research', payload: { context: { ...completeProfile, backendUrl: 'https://untrusted.example' } } })).ok, false);
assert.equal(requests.length, previousCount);
await send({ type: 'agentlayer:reconcile', payload: { requestId: 'request/with?characters' } });
assert.equal(requests.at(-1).url, 'http://127.0.0.1:4318/api/actions/request%2Fwith%3Fcharacters');
assert.equal(requests.at(-1).options.method, 'GET');
console.log('PASS: authenticated settings, sender restrictions, fixed API origin/no redirects, missing token, 401/429, invalid request/response, encoded status GET. Fixture transport only.');
