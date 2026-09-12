import { createRoot } from 'react-dom/client';
import { AgentCard } from '../components/AgentCard';
import { extractPageContext } from '../adapters';
import { toPageContext } from '../lib/api-bridge';
import styles from '../entrypoints/agent.content/style.css?inline';

// This entry is bundled only by browser-tests.mjs. No fixture transport ships.
Object.assign(window, {
  inspectContext: () => extractPageContext(document).context,
  inspectWireContext: () => toPageContext(extractPageContext(document).context),
  mountCard: () => {
    if (document.querySelector('agentlayer-ui')) return;
    const initialCapture = extractPageContext(document);
    const host = document.createElement('agentlayer-ui');
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style'); style.textContent = styles; shadow.append(style);
    const wrapper = document.createElement('div'); shadow.append(wrapper);
    document.documentElement.append(host);
    const root = createRoot(wrapper);
    root.render(<AgentCard initialCapture={initialCapture} onClose={() => { root.unmount(); host.remove(); }} />);
  },
});
