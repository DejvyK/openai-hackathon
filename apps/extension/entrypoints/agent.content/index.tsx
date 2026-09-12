import ReactDOM from 'react-dom/client';
import { AgentCard } from '../../components/AgentCard';
import { extractPageContext } from '../../adapters';
import styles from './style.css?inline';

export default defineContentScript({
  matches: [],
  registration: 'runtime',
  async main(ctx) {
    const existing = document.querySelector('agentlayer-ui');
    if (existing) {
      const connection = existing.getAttribute('data-agentlayer-connection');
      // The legacy message also permits replacing an already-open pre-recovery build.
      const legacyDisconnected = existing.shadowRoot?.querySelector('.live-assistant [role="status"]')?.textContent?.startsWith('Extension disconnected.');
      if (!['disconnected', 'invalidated'].includes(connection ?? '') && !legacyDisconnected) {
        (existing.shadowRoot?.querySelector('h2') as HTMLElement | null)?.focus(); return;
      }
      existing.dispatchEvent(new Event('agentlayer:dispose'));
      existing.remove();
    }
    const activation = globalThis as typeof globalThis & { __agentlayerMounting?: boolean };
    if (activation.__agentlayerMounting) return;
    activation.__agentlayerMounting = true;
    try {
      const capture = extractPageContext(document);
      const previousFocus = document.activeElement;
      const ui = await createShadowRootUi(ctx, {
        name: 'agentlayer-ui', position: 'overlay', anchor: document.documentElement,
        append: 'last', zIndex: 2147483647,
        onMount(container) {
          const style = document.createElement('style'); style.textContent = styles; container.append(style);
          const wrapper = document.createElement('div'); container.append(wrapper);
          const root = ReactDOM.createRoot(wrapper);
          root.render(<AgentCard reactive initialCapture={capture} onClose={() => {
            ui.remove(); if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
          }} />);
          return root;
        },
        onRemove(root) { root?.unmount(); },
      });
      ui.mount();
      document.querySelector('agentlayer-ui')?.addEventListener('agentlayer:dispose', () => ui.remove(), { once: true });
    } finally { activation.__agentlayerMounting = false; }
  },
});
