import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

const built = await build({ entryPoints: ['apps/extension/entrypoints/background.ts'], bundle: true, write: false, format: 'iife',
  plugins: [{ name: 'isolate-unrelated-reactive-runtime', setup(build) {
    build.onResolve({ filter: /reactive-background$/ }, () => ({ path: 'reactive', namespace: 'fixture' }));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export function installReactiveBackground() {}' }));
  } }],
});
const session = {};
const writes = [];
let resultStatus = 'unknown';
const request = { requestId: 'request-recovery-1', contextId: 'context-recovery-1', proposalId: 'proposal-recovery-1', actionKind: 'research_note',
  reviewedPayload: { actionKind: 'research_note', note: { title: 'Reviewed title', content: 'Reviewed content' } } };
const key = 'agentlayer:save:7';
function boot() {
  let receive;
  const browser = { runtime: { id: 'fixture-extension', getURL: path => `chrome-extension://fixture-extension${path}`,
    onMessage: { addListener: listener => { receive = listener; } } },
    action: { onClicked: { addListener() {} } }, tabs: { onRemoved: { addListener() {} } },
    storage: { local: { get: async () => ({ pairingToken: 'fixture-token' }) }, session: {
      get: async key => ({ [key]: structuredClone(session[key]) }),
      set: async data => Object.assign(session, structuredClone(data)),
      remove: async key => { delete session[key]; },
    } } };
  vm.runInNewContext(built.outputFiles[0].text, { browser, defineBackground: fn => fn(), AbortSignal, URL, Response,
    fetch: async (url, options) => {
      if (options.method === 'POST') {
        const sent = JSON.parse(options.body);
        assert.deepEqual(session[key].request, sent, 'journal must exist before any outbound write');
        writes.push(sent);
        if (resultStatus === 'unknown') throw new TypeError('fixture connection lost after sending');
      }
      return Response.json({ requestId: request.requestId, contextId: request.contextId, status: resultStatus,
        operations: [{ kind: 'note', status: resultStatus === 'succeeded' ? 'created' : resultStatus,
          id: resultStatus === 'succeeded' ? 'note-1' : null, url: resultStatus === 'succeeded' ? 'https://example.org/note-1' : null,
          errorCode: null, retryable: resultStatus === 'failed' }], warnings: [] });
    } });
  return message => new Promise(resolve => receive(message, { id: browser.runtime.id, tab: { id: 7 }, url: 'https://example.org/source' }, response => resolve(structuredClone(response))));
}
let send = boot();
assert.equal((await send({ type: 'agentlayer:commit', payload: request })).ok, false);
assert.equal(writes.length, 1);
send = boot(); // Service worker restart, same browser session storage.
let recovered = await send({ type: 'agentlayer:recover-save' });
assert.deepEqual(recovered.data.request, request);
assert.equal(recovered.data.result, null);
assert.equal((await send({ type: 'agentlayer:commit', payload: { ...request, requestId: 'different-save' } })).ok, false);
assert.equal((await send({ type: 'agentlayer:commit', payload: { ...request, reviewedPayload: { actionKind: 'research_note', note: { title: 'Changed', content: 'Changed' } } } })).ok, false);
assert.equal(writes.length, 1);
assert.equal((await send({ type: 'agentlayer:dismiss-save', requestId: request.requestId })).ok, false);
resultStatus = 'failed';
assert.equal((await send({ type: 'agentlayer:reconcile', payload: { requestId: request.requestId } })).ok, true);
resultStatus = 'succeeded';
assert.equal((await send({ type: 'agentlayer:commit', payload: recovered.data.request })).ok, true);
assert.deepEqual(writes, [request, request]);
send = boot();
recovered = await send({ type: 'agentlayer:recover-save' });
assert.equal(recovered.data.result.operations[0].url, 'https://example.org/note-1');
assert.equal((await send({ type: 'agentlayer:dismiss-save', requestId: request.requestId })).ok, true);
assert.equal((await send({ type: 'agentlayer:recover-save' })).data, null);
console.log('PASS: real background handler journals before fetch, survives worker restart, rejects replacement/mutation, reconciles and retries exact request; fixture transport only.');
