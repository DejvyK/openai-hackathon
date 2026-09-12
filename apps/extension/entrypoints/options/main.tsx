import { useState } from 'react';
import { createRoot } from 'react-dom/client';
function Settings() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('');
  return <main style={{ fontFamily: 'Arial', maxWidth: 600, margin: '60px auto' }}>
    <h1>AgentLayer settings</h1><p>Local API: http://127.0.0.1:4318</p>
    <p>Enter the pairing token configured on your local API server. Provider API keys belong only in the server environment.</p>
    <label>Pairing token <input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} /></label>
    <button disabled={!token.trim()} onClick={async () => { await browser.storage.local.set({ pairingToken: token.trim() }); setToken(''); setStatus('Token saved. Open a webpage and click the AgentLayer toolbar icon.'); }}>Save</button>
    <p role="status">{status}</p>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Settings />);
