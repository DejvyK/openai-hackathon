# AgentLayer browser extension

Based on the official [WXT React starter](https://github.com/wxt-dev/wxt/tree/main/templates/react), initialized using `npx wxt@latest init apps/extension --template react --pm npm`. Upstream MIT license is preserved in `UPSTREAM-LICENSE`.

Run workspace installation from the repository root. Build with `npm run build --workspace @agentlayer/extension`; load `apps/extension/.output/chrome-mv3` unpacked in Chrome or Edge.

Open extension options and save the local API pairing token. Visit `http://127.0.0.1:4318/demo` and click the extension toolbar icon. This grants temporary access to that tab and injects an inline card near its first heading. Research is explicit; page content is not automatically transmitted. The only permanent host permission is loopback, for the local backend.

The scaffold detects the first page heading and supports an explicit company attribute on the demo fixture. Person and company are editable. It is not yet a production LinkedIn adapter. Navigation invalidates prior research; if the host application removes the card, activate it again using the toolbar.

Demo research and local demo task persistence are labeled in the card. Live providers must be implemented in the backend. Provider secrets never belong in this extension. Content-script messages select two fixed backend routes; arbitrary URL proxying is not supported.
