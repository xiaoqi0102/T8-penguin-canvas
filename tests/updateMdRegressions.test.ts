import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function read(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('RunningHub local upload conversion accepts both input and output file URLs', () => {
  const proxy = read('../backend/src/routes/proxy.js');
  const runninghub = read('../src/components/nodes/RunningHubNode.tsx');

  assert.match(proxy, /url\.startsWith\('\/files\/output\/'\)/);
  assert.match(proxy, /url\.startsWith\('\/files\/input\/'\)/);
  assert.match(proxy, /path\.join\(config\.OUTPUT_DIR/);
  assert.match(proxy, /path\.join\(config\.INPUT_DIR/);
  assert.match(runninghub, /v\.startsWith\('\/files\/output\/'\)/);
  assert.match(runninghub, /v\.startsWith\('\/files\/input\/'\)/);
});

test('material context menu lets saved prompt templates choose or create categories', () => {
  const menu = read('../src/components/MaterialContextMenu.tsx');

  assert.match(menu, /getPromptTemplateCategories/);
  assert.match(menu, /getPromptTemplateCategoryLabel/);
  assert.match(menu, /promptCategoryId/);
  assert.match(menu, /createPromptTemplateCategory/);
  assert.match(menu, /新建模板分类/);
  assert.match(menu, /categoryId:\s*selectedPromptCategoryId/);
});

test('canvas exposes Figma send, placement shelf, and external file drag protocols', () => {
  const canvas = read('../src/components/Canvas.tsx');
  const styles = read('../src/styles/index.css');
  const modal = read('../src/components/SendMaterialsModal.tsx');
  const api = read('../src/services/api.ts');
  const server = read('../backend/src/server.js');
  const figma = read('../backend/src/routes/figma.js');
  const figmaBridgeUtil = read('../backend/src/utils/figmaBridge.js');
  const figmaBridge = read('../tools/figma-bridge/server.cjs');
  const figmaStart = read('../tools/figma-bridge/start-figma-bridge.cmd');
  const figmaManifest = read('../tools/figma-bridge/plugin/manifest.json');
  const figmaUi = read('../tools/figma-bridge/plugin/ui.html');
  const figmaPlugin = read('../tools/figma-bridge/plugin/code.js');

  assert.match(server, /const figmaRouter = require\('\.\/routes\/figma'\)/);
  assert.match(server, /app\.use\('\/api\/figma', figmaRouter\)/);
  assert.match(server, /startFigmaBridgeOnAppStart/);
  assert.match(server, /T8_FIGMA_BRIDGE_AUTOSTART=0/);
  assert.match(api, /sendToFigma/);
  assert.match(modal, /onSendToFigma/);
  assert.match(modal, /发送到 Figma/);
  assert.match(modal, /画布会自动启动本机桥接/);
  assert.match(modal, /FIGMA_PLUGIN_IMPORT_HINT/);
  assert.match(modal, /Figma 桌面软件/);
  assert.match(modal, /Import plugin from manifest/);
  assert.match(modal, /tools\\\\figma-bridge\\\\plugin\\\\manifest\.json/);
  assert.match(modal, /resources\\\\tools\\\\figma-bridge\\\\plugin\\\\manifest\.json/);
  assert.doesNotMatch(modal, /先运行 npm run figma:bridge/);
  assert.match(modal, /actionNotice/);
  assert.match(modal, /setActionNotice\(\{ kind: 'error'/);
  assert.match(modal, /CheckCircle2/);
  assert.match(modal, /AlertTriangle/);
  assert.match(canvas, /handleSendMaterialsToFigma/);
  assert.match(canvas, /throw new Error\(message\)/);
  assert.match(canvas, /Figma Bridge 队列/);
  assert.match(canvas, /保持 Figma 插件窗口打开会自动导入/);
  assert.match(canvas, /bridgeJobId/);
  assert.match(canvas, /<PlacementShelf/);
  assert.ok(canvas.lastIndexOf('<PlacementShelf') > canvas.indexOf('className="t8-control-rail'));
  assert.doesNotMatch(canvas, /if \(items\.length === 0\) return null/);
  assert.match(canvas, /placementShelfItemsFromCanvasNodes/);
  assert.match(canvas, /setPlacementShelfItems\(placementShelfItemsFromCanvasNodes\(fixedNs, '画布'\)\)/);
  assert.match(canvas, /暂无素材/);
  assert.doesNotMatch(canvas, /fixed bottom-4 left-4/);
  assert.match(canvas, /t8-control-stack/);
  assert.match(styles, /\.t8-control-rail[\s\S]*flex-direction:\s*row/);
  assert.match(styles, /\.t8-placement-shelf/);
  assert.match(canvas, /DownloadURL/);
  assert.match(canvas, /registerPlacementShelfNodes/);
  assert.match(canvas, /movePlacementShelfNode/);
  assert.match(figma, /DEFAULT_FIGMA_BRIDGE_BASE/);
  assert.match(figma, /FIGMA_BRIDGE_TIMEOUT_MS/);
  assert.match(figma, /ensureFigmaBridgeRunning/);
  assert.match(figma, /画布会自动启动本机 Figma bridge/);
  assert.match(figma, /AbortController/);
  assert.match(figma, /localhost:3845/);
  assert.match(figma, /127\.0\.0\.1/);
  assert.match(figmaBridgeUtil, /function ensureFigmaBridgeRunning/);
  assert.match(figmaBridgeUtil, /function startFigmaBridgeOnAppStart/);
  assert.match(figmaBridgeUtil, /T8_FIGMA_BRIDGE_AUTOSTART/);
  assert.match(figmaBridgeUtil, /ELECTRON_RUN_AS_NODE/);
  assert.match(figmaBridgeUtil, /tools['"], ['"]figma-bridge['"], ['"]server\.cjs/);
  assert.match(figmaBridge, /T8 Penguin Canvas Bridge/);
  assert.match(figmaBridge, /T8_FIGMA_BRIDGE_HOST \|\| '127\.0\.0\.1'/);
  assert.match(figmaBridge, /BRIDGE_VERSION = 2/);
  assert.match(figmaBridge, /PUBLIC_BASE = `http:\/\/localhost:\$\{PORT\}`/);
  assert.match(figmaBridge, /assetBase: PUBLIC_BASE/);
  assert.match(figmaBridge, /EADDRINUSE/);
  assert.match(figmaBridge, /already running/);
  assert.match(figmaBridge, /found an older bridge/);
  assert.match(figmaBridge, /T8_FIGMA_BRIDGE_KEEP_ALIVE_ON_EXISTING/);
  assert.match(figmaBridge, /\/import/);
  assert.match(figmaBridge, /\/claim/);
  assert.match(figmaBridge, /\/asset\//);
  assert.match(figmaStart, /T8_FIGMA_BRIDGE_KEEP_ALIVE_ON_EXISTING=1/);
  assert.match(figmaStart, /if not "%EXIT_CODE%"=="0"/);
  assert.match(figmaStart, /if "%EXIT_CODE%"=="0"/);
  assert.match(figmaStart, /桥接进程已正常退出/);
  assert.doesNotMatch(figmaStart, /node tools\\figma-bridge\\server\.cjs\r?\n\s*echo\.\r?\n\s*pause/);
  assert.match(figmaManifest, /localhost:3845/);
  assert.doesNotMatch(figmaManifest, /127\.0\.0\.1:3845/);
  assert.match(figmaManifest, /networkAccess/);
  assert.match(figmaManifest, /documentAccess/);
  assert.doesNotMatch(figmaManifest, /containsWidget/);
  assert.doesNotMatch(figmaManifest, /widgetApi/);
  assert.match(read('../tools/figma-bridge/README.md'), /Import plugin from manifest/);
  assert.match(read('../tools/figma-bridge/README.md'), /Import widget from manifest/);
  assert.match(figmaUi, /Old bridge detected/);
  assert.match(figmaUi, /bridgeReady/);
  assert.match(figmaUi, /unhandledrejection/);
  assert.match(figmaPlugin, /figma\.createImageAsync/);
  assert.match(figmaPlugin, /figma\.createImage\(bytes\)/);
  assert.match(figmaPlugin, /function isLocalAssetUrl/);
  assert.match(figmaPlugin, /function loadImageFromBytesUrl/);
  assert.match(figmaPlugin, /function imageSizeFromBytes/);
  assert.match(figmaPlugin, /figma\.currentPage\.selection/);
  assert.match(figmaPlugin, /function showBridgeUi/);
  assert.match(figmaPlugin, /function inlineBridgeUiHtml/);
  assert.match(figmaPlugin, /Import next job/);
  assert.match(figmaPlugin, /typeof __html__ === 'string'/);
  assert.match(figmaPlugin, /function notifyError/);
  assert.doesNotMatch(figmaPlugin, /Plugin UI was not bundled/);
  assert.doesNotMatch(figmaPlugin, /\{\s*\.\.\./);
  assert.doesNotMatch(figmaPlugin, /`/);
});

test('LLM node defaults to the second built-in model', () => {
  const models = read('../src/providers/models.ts');
  const canvas = read('../src/components/Canvas.tsx');
  const llm = read('../src/components/nodes/LLMNode.tsx');
  const features = read('../features.json');

  assert.match(models, /export const DEFAULT_LLM_MODEL = 'gemini-3\.5-flash'/);
  assert.match(canvas, /llm:\s*\{[\s\S]*model:\s*'gemini-3\.5-flash'/);
  assert.match(llm, /gemini-3\.5-flash\(默认\)/);
  assert.match(features, /gemini-3\.5-flash 默认/);
});

test('topbar canvas tutorial panel replaces RH ApiKey shortcut in latest apps', () => {
  const app = read('../src/App.tsx');
  const features = read('../features.json');

  assert.match(app, /CANVAS_TUTORIALS/);
  assert.match(app, /画布教程/);
  assert.match(app, /基础功能教程第一弹1\.2\.3版/);
  assert.match(app, /BV18sG76AE9Y/);
  assert.match(app, /V8oCBhemmCQ/);
  assert.match(app, /BV1gSEA6GEDQ/);
  assert.match(app, /-nmX9oB-MX/);
  assert.ok(app.indexOf('画布教程') < app.indexOf('最新应用'));
  assert.doesNotMatch(app, /获取 RH ApiKey/);
  assert.doesNotMatch(app, /enterprise-api\/consumerApi/);
  assert.match(features, /canvasTutorialTopbarPanel/);
});
