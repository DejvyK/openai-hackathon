import ReactDOM from 'react-dom/client';
import { AgentCard } from '../../components/AgentCard';
import styles from './style.css?inline';

export default defineContentScript({
  // Runtime matches become host permissions in WXT. Toolbar activeTab grants access instead.
  matches: [],
  registration: 'runtime',
  async main(ctx) {
    if (document.querySelector('agentlayer-ui')) return;
    const ui = await createShadowRootUi(ctx, {
      name: 'agentlayer-ui', position: 'inline', anchor: document.querySelector('h1') ?? document.body,
      append: 'after',
      onMount(container) {
        const style = document.createElement('style'); style.textContent = styles; container.append(style);
        const wrapper = document.createElement('div'); container.append(wrapper);
        const root = ReactDOM.createRoot(wrapper); root.render(<AgentCard />); return root;
      },
      onRemove(root) { root?.unmount(); },
    });
    ui.mount();
  },
});
