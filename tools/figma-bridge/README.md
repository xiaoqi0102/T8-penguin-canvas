# T8 Figma Bridge

This folder contains the local bridge and Figma development plugin used by
`Send to Figma` in T8 Penguin Canvas.

## How to use

1. In normal T8 usage, the canvas backend auto-starts the local bridge.
   Manual start is only needed for troubleshooting, or when
   `T8_FIGMA_BRIDGE_AUTOSTART=0` disables autostart:

   ```powershell
   npm run figma:bridge
   ```

   Or double-click `tools\figma-bridge\start-figma-bridge.cmd`.
   If another current bridge is already running, the script keeps a small status
   window open instead of asking you to press a key. If it reports an older
   bridge, close the old bridge window or stop the old `node.exe`, then start it
   again.

2. Open Figma Desktop.

3. In Figma, import the **plugin** manifest:

   `tools\figma-bridge\plugin\manifest.json`

   Use `Plugins -> Development -> Import plugin from manifest...`.
   Do not use `Widgets -> Development -> Import widget from manifest...`.
   If Figma says `manifest.containsWidget` must be true, you are in the widget
   import flow; cancel it and import as a plugin instead.

4. Run the plugin named `T8 Penguin Canvas Bridge`.

5. In T8 Penguin Canvas, use `Send to Figma`.

The T8 app posts materials to `http://localhost:3845/import`. The Figma plugin
polls the same local bridge and imports pending jobs into the current file.

## Notes

- Images are inserted as Figma rectangles with image fills.
- Text is inserted as text layers.
- Video and audio are inserted as reference cards because Figma design files do
  not reliably support arbitrary local media embedding.
- The bridge listens on `127.0.0.1` by default to avoid Windows `localhost`
  resolving to an IPv6-only socket. It does not expose materials to a remote
  server.
- The Figma manifest only whitelists `http://localhost:3845`, so bridge asset
  URLs are always exposed as `localhost` even if the server itself was started
  with a different local host binding.
- If the bridge is already running, starting it again will print an "already
  running" message instead of throwing a Node.js `EADDRINUSE` stack trace.
