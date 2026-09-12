import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConnectionStatusSchema } from '@agentlayer/contracts/v1';
import { CalendarConnectionStatusSchema } from '@agentlayer/contracts/calendar-v1';

function Settings() {
  const [token, setToken] = useState('');
  const [stored, setStored] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connection, setConnection] = useState<ReturnType<typeof ConnectionStatusSchema.parse> | null>(null);
  const [calendar, setCalendar] = useState<ReturnType<typeof CalendarConnectionStatusSchema.parse> | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState('');
  async function calendarAction(action: 'status' | 'connect' | 'disconnect') {
    setCalendarBusy(true); setCalendarMessage('');
    try {
      const response = await browser.runtime.sendMessage({ type: `agentlayer:calendar-${action}` });
      if (!response?.ok) throw new Error(response?.error || 'The extension did not respond. Reload Settings.');
      if (action === 'connect') setCalendarMessage('Finish signing in with Google in the new tab, then refresh the connection here.');
      else { setCalendar(CalendarConnectionStatusSchema.parse(response.data)); setCalendarMessage(action === 'disconnect' ? 'Google Calendar disconnected.' : 'Connection status refreshed.'); }
    } catch (cause) { setCalendarMessage(cause instanceof Error ? cause.message : 'Could not check Google Calendar.'); }
    finally { setCalendarBusy(false); }
  }
  useEffect(() => { if (stored) void calendarAction('status'); else setCalendar(null); }, [stored]);
  useEffect(() => { void browser.storage.local.get('pairingToken').then(value => setStored(!!value.pairingToken)); }, []);
  async function save() {
    setBusy(true); setError(''); setConnection(null);
    try {
      await browser.storage.local.set({ pairingToken: token.trim() }); setToken(''); setStored(true);
      setStatus('Token saved. Test the connection, then open a webpage and click the AgentLayer toolbar icon.');
    } catch { setError('Could not save the pairing token. Reload this settings page and try again.'); }
    finally { setBusy(false); }
  }
  async function check() {
    setBusy(true); setError(''); setConnection(null); setStatus('Testing the authenticated connection…');
    try {
      const response = await browser.runtime.sendMessage({ type: 'agentlayer:connection' });
      if (!response?.ok) throw new Error(response?.error || 'No response from the extension. Reload it and try again.');
      const next = ConnectionStatusSchema.parse(response.data); setConnection(next);
      setStatus('Pairing accepted. Provider configuration is listed below; configured does not mean verified.');
    } catch (cause) { setStatus(''); setError(cause instanceof Error ? cause.message : 'Connection check failed.'); }
    finally { setBusy(false); }
  }
  return <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '48px auto', padding: 24, lineHeight: 1.6 }}>
    <h1>AgentLayer settings</h1>
    <ol><li>Start the local API server using the project README.</li>
      <li>Paste its pairing token below and test the connection.</li>
      <li>Pin AgentLayer in Chrome’s Extensions menu. Open a LinkedIn profile, or select text on an article, then click AgentLayer’s toolbar icon.</li>
    </ol>
    <p>Local API: http://127.0.0.1:4318</p>
    <p>Use the local pairing token only. OpenAI, Exa and Ambiguous API keys belong on the server.</p>
    <label>Pairing token <input style={{ padding: 8 }} type="password" autoComplete="off" maxLength={1000} value={token} onChange={e => setToken(e.target.value)} /></label>{' '}
    <button disabled={busy || !token.trim()} onClick={() => void save()}>Save</button>{' '}
    <button disabled={busy || !stored || !!token} onClick={() => void check()}>Test connection</button>{' '}
    <button disabled={busy || !stored} onClick={async () => {
      try { await browser.storage.local.remove('pairingToken'); setStored(false); setConnection(null); setStatus('Pairing token removed from this browser.'); setError(''); }
      catch { setError('Could not remove the token. Reload this settings page and try again.'); }
    }}>Disconnect</button>
    <p>{stored ? 'A pairing token is stored in this browser.' : 'No pairing token is stored.'}</p>
    <p role="status">{status}</p>{error && <p role="alert" style={{ color: '#171717', borderLeft: '3px solid #171717', paddingLeft: 12 }}>{error}</p>}
    {connection && <section aria-label="Connection details"><h2>{connection.mode === 'demo' ? 'Demo mode — live research and saving are disabled' : 'Live mode'}</h2>
      <p>Workspace: {connection.workspaceConfigured ? 'configured' : 'not configured'}</p>
      <ul>{connection.providers.map(provider => <li key={provider.provider}>{provider.provider}: {provider.status.replaceAll('_', ' ')}
        {provider.missing.length > 0 && ` — missing: ${provider.missing.join(', ')}`}</li>)}</ul>
    </section>}
    <section aria-label="Google Calendar connection">
      <h2>Google Calendar</h2>
      <p>Connect your calendar so the agent can prepare appointments from the current page through CopilotKit.</p>
      <p>{calendar?.connected ? 'Google Calendar is connected.' : calendar?.configured ? 'Ready to connect your Google account.' : calendar ? 'Google OAuth is not configured on the API server. Configure its client ID, client secret and redirect URL there, then refresh.' : 'Check the calendar connection after pairing the local API.'}</p>
      <button disabled={!stored || calendarBusy || !calendar?.configured || calendar.connected} onClick={() => void calendarAction('connect')}>Connect Google Calendar</button>{' '}
      <button disabled={!stored || calendarBusy} onClick={() => void calendarAction('status')}>Refresh calendar connection</button>{' '}
      <button disabled={!stored || calendarBusy || !calendar?.connected} onClick={() => void calendarAction('disconnect')}>Disconnect Google Calendar</button>
      <p role="status">{calendarMessage}</p>
    </section>
    <h2>Supported pages</h2>
    <p>Readable text on HTTP(S) pages, including LinkedIn profiles and reservation confirmations. Each new page gets relevant suggestions; the content is read again for your next action. Use Follow browsing in the sidebar menu to grant access across websites. Browser settings pages, the Chrome Web Store, editable fields and embedded booking frames are not supported.</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Settings />);
