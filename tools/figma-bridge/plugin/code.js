var fontReady = false;
var uiReady = false;

function errorText(error) {
  return error && error.message ? error.message : String(error || 'Unknown error');
}

function notifyError(message) {
  try {
    figma.notify(message, { error: true });
  } catch (e) {
    figma.notify(message);
  }
}

function inlineBridgeUiHtml() {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '<meta charset="utf-8">',
    '<style>',
    ':root{color-scheme:light dark;font-family:Inter,Arial,sans-serif;font-size:12px}',
    'body{margin:0;padding:16px;background:var(--figma-color-bg,#fff);color:var(--figma-color-text,#111)}',
    'h1{margin:0 0 8px;font-size:16px}',
    '.muted{color:var(--figma-color-text-secondary,#666);line-height:1.5}',
    '.panel{margin-top:12px;border:1px solid var(--figma-color-border,#ddd);border-radius:8px;padding:12px;background:var(--figma-color-bg-secondary,#f7f7f7)}',
    '.row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px}',
    'button{border:1px solid var(--figma-color-border,#bbb);border-radius:8px;padding:8px 10px;background:var(--figma-color-bg-brand,#18a0fb);color:var(--figma-color-text-onbrand,#fff);cursor:pointer;font-weight:600}',
    'button.secondary{background:var(--figma-color-bg,#fff);color:var(--figma-color-text,#111)}',
    'code{border-radius:4px;padding:1px 4px;background:rgba(127,127,127,.16);word-break:break-all}',
    '#log{max-height:180px;overflow:auto;white-space:pre-wrap;line-height:1.45}',
    '.ok{color:#0b8f4d}.bad{color:#d2372a}',
    '</style>',
    '</head>',
    '<body>',
    '<h1>T8 Penguin Canvas Bridge</h1>',
    '<div class="muted">Keep this plugin open while using <code>Send to Figma</code> in T8. The plugin polls <code>localhost:3845</code> and imports queued materials.</div>',
    '<div class="panel"><div id="status">Checking bridge...</div><div class="row"><button id="pull">Import next job</button><button id="toggle" class="secondary">Pause</button></div></div>',
    '<div class="panel"><div class="muted">Log</div><div id="log"></div></div>',
    '<script>',
    'var BASE="http://localhost:3845";',
    'var statusEl=document.getElementById("status");',
    'var logEl=document.getElementById("log");',
    'var pullBtn=document.getElementById("pull");',
    'var toggleBtn=document.getElementById("toggle");',
    'var paused=false;',
    'var busy=false;',
    'var bridgeReady=false;',
    'var currentJobId="";',
    'function log(text,cls){var line=document.createElement("div");if(cls)line.className=cls;line.textContent="["+new Date().toLocaleTimeString()+"] "+text;logEl.insertBefore(line,logEl.firstChild);}',
    'window.addEventListener("error",function(event){log(event.message||"Plugin UI error","bad");event.preventDefault();});',
    'window.addEventListener("unhandledrejection",function(event){var reason=event.reason&&event.reason.message?event.reason.message:String(event.reason||"Plugin UI promise error");log(reason,"bad");event.preventDefault();});',
    'async function post(path,body){var resp=await fetch(BASE+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body||{})});var data=await resp.json().catch(function(){return {};});if(!resp.ok||data.success===false){throw new Error(data.error||("HTTP "+resp.status));}return data;}',
    'async function refreshStatus(){try{var resp=await fetch(BASE+"/health",{cache:"no-store"});var data=await resp.json();bridgeReady=data&&data.service==="t8-figma-bridge"&&Number(data.version||0)>=2&&data.assetBase===BASE;if(bridgeReady){statusEl.innerHTML="<span class=\\"ok\\">Bridge online</span> · queued "+(data.queued||0)+" · claimed "+(data.claimed||0);}else{statusEl.innerHTML="<span class=\\"bad\\">Old bridge detected</span> · close the old bridge window and restart <code>start-figma-bridge.cmd</code>";}}catch(e){bridgeReady=false;statusEl.innerHTML="<span class=\\"bad\\">Bridge offline</span> · go back to T8 and click <code>Send to Figma</code> once to auto-start it";}}',
    'async function claimNext(){if(paused||busy)return;busy=true;try{await refreshStatus();if(!bridgeReady)return;var data=await post("/claim",{});var job=data.data;if(!job)return;currentJobId=job.id;log("Received job "+job.id+" ("+((job.materials||[]).length)+" item(s))");parent.postMessage({pluginMessage:{type:"import-job",job:job}},"*");}catch(e){log(e.message||String(e),"bad");}finally{busy=false;}}',
    'window.onmessage=async function(event){var message=event.data&&event.data.pluginMessage;if(!message||message.type!=="import-complete")return;try{await post("/complete",{jobId:message.jobId||currentJobId,ok:message.ok!==false,message:message.message||""});log(message.ok===false?"Job "+message.jobId+" failed":"Imported job "+message.jobId,message.ok===false?"bad":"ok");}catch(e){log(e.message||String(e),"bad");}currentJobId="";refreshStatus();};',
    'pullBtn.onclick=claimNext;',
    'toggleBtn.onclick=function(){paused=!paused;toggleBtn.textContent=paused?"Resume":"Pause";log(paused?"Paused polling":"Resumed polling");};',
    'refreshStatus();',
    'setInterval(refreshStatus,3000);',
    'setInterval(claimNext,1800);',
    '</script>',
    '</body>',
    '</html>',
  ].join('\n');
}

function bridgeHtml() {
  if (typeof __html__ === 'string' && __html__) return __html__;
  return inlineBridgeUiHtml();
}

function showBridgeUi() {
  var html = bridgeHtml();
  try {
    figma.showUI(html, { width: 380, height: 480, themeColors: true });
    uiReady = true;
    return;
  } catch (firstError) {
    try {
      figma.showUI(html, { width: 380, height: 480 });
      uiReady = true;
      return;
    } catch (secondError) {
      notifyError('T8 Bridge UI failed: ' + errorText(secondError));
      throw secondError;
    }
  }
}

showBridgeUi();

async function ensureFont() {
  if (fontReady) return;
  try {
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    fontReady = true;
  } catch (e) {
    await figma.loadFontAsync({ family: 'Arial', style: 'Regular' });
    fontReady = true;
  }
}

function fitSize(width, height, maxSide) {
  var w = Math.max(1, Number(width || 1));
  var h = Math.max(1, Number(height || 1));
  var scale = Math.min(1, maxSide / Math.max(w, h));
  return {
    width: Math.max(40, Math.round(w * scale)),
    height: Math.max(40, Math.round(h * scale)),
  };
}

function styleCard(node, fill) {
  node.cornerRadius = 12;
  node.fills = [{ type: 'SOLID', color: fill }];
  node.strokes = [{ type: 'SOLID', color: { r: 0.08, g: 0.1, b: 0.12 } }];
  node.strokeWeight = 1;
}

function isLocalAssetUrl(raw) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(String(raw || ''));
}

function readUint32BE(bytes, offset) {
  return ((bytes[offset] * 16777216) + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
}

function readUint16LE(bytes, offset) {
  return bytes[offset] + (bytes[offset + 1] << 8);
}

function imageSizeFromBytes(bytes) {
  if (bytes && bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
  }
  if (bytes && bytes.length > 10 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return { width: readUint16LE(bytes, 6), height: readUint16LE(bytes, 8) };
  }
  if (bytes && bytes.length > 10 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    var offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      var marker = bytes[offset + 1];
      var length = (bytes[offset + 2] << 8) + bytes[offset + 3];
      if (marker >= 0xc0 && marker <= 0xc3) {
        return { width: (bytes[offset + 7] << 8) + bytes[offset + 8], height: (bytes[offset + 5] << 8) + bytes[offset + 6] };
      }
      offset += 2 + Math.max(2, length);
    }
  }
  return { width: 720, height: 405 };
}

async function loadImageFromBytesUrl(url) {
  var resp = await fetch(url, { cache: 'no-store' });
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  var bytes = new Uint8Array(await resp.arrayBuffer());
  var image = figma.createImage(bytes);
  var size = imageSizeFromBytes(bytes);
  if (image && typeof image.getSizeAsync === 'function') {
    try {
      size = await image.getSizeAsync();
    } catch (e) {
      // Keep the parsed size fallback.
    }
  }
  return { image: image, size: size };
}

async function makeLabel(text, x, y, width) {
  await ensureFont();
  var label = figma.createText();
  label.fontName = { family: 'Inter', style: 'Regular' };
  label.characters = text;
  label.fontSize = 14;
  label.lineHeight = { unit: 'AUTO' };
  label.x = x;
  label.y = y;
  label.resize(Math.max(120, width), label.height);
  return label;
}

async function makeTextLayer(item, x, y) {
  await ensureFont();
  var text = figma.createText();
  text.fontName = { family: 'Inter', style: 'Regular' };
  text.characters = item.text || item.name || 'T8 text';
  text.fontSize = 18;
  text.lineHeight = { unit: 'AUTO' };
  text.x = x;
  text.y = y;
  text.resize(420, Math.max(60, text.height));
  return text;
}

async function makeReferenceCard(item, x, y) {
  var frame = figma.createFrame();
  frame.name = item.name || ((item.kind || 'file') + ' reference');
  frame.x = x;
  frame.y = y;
  frame.resize(360, 132);
  styleCard(frame, item.kind === 'video'
    ? { r: 0.2, g: 0.52, b: 0.95 }
    : { r: 0.95, g: 0.68, b: 0.18 });
  await ensureFont();
  var title = figma.createText();
  title.fontName = { family: 'Inter', style: 'Regular' };
  title.characters = (item.kind === 'video' ? 'Video' : item.kind === 'audio' ? 'Audio' : 'File') + ': ' + (item.name || item.id || '');
  title.fontSize = 16;
  title.x = 18;
  title.y = 18;
  title.resize(324, title.height);
  var url = figma.createText();
  url.fontName = { family: 'Inter', style: 'Regular' };
  url.characters = item.assetUrl || item.sourceUrl || '';
  url.fontSize = 10;
  url.opacity = 0.72;
  url.x = 18;
  url.y = 56;
  url.resize(324, url.height);
  frame.appendChild(title);
  frame.appendChild(url);
  return frame;
}

async function makeImageLayer(item, x, y) {
  if (!item.assetUrl) return makeReferenceCard(item, x, y);
  try {
    var image;
    var size;
    if (isLocalAssetUrl(item.assetUrl)) {
      var loaded = await loadImageFromBytesUrl(item.assetUrl);
      image = loaded.image;
      size = loaded.size;
    } else if (typeof figma.createImageAsync === 'function') {
      image = await figma.createImageAsync(item.assetUrl);
      size = await image.getSizeAsync();
    } else {
      var fallbackLoaded = await loadImageFromBytesUrl(item.assetUrl);
      image = fallbackLoaded.image;
      size = fallbackLoaded.size;
    }
    var fitted = fitSize(size.width, size.height, 720);
    var rect = figma.createRectangle();
    rect.name = item.name || item.id || 'T8 image';
    rect.x = x;
    rect.y = y;
    rect.resize(fitted.width, fitted.height);
    rect.fills = [{ type: 'IMAGE', imageHash: image.hash, scaleMode: 'FILL' }];
    rect.cornerRadius = 8;
    return rect;
  } catch (e) {
    return makeReferenceCard({
      id: item.id,
      kind: item.kind,
      name: (item.name || item.id || 'image') + ' (image failed)',
      sourceUrl: item.sourceUrl,
      assetUrl: item.assetUrl,
      text: item.text,
    }, x, y);
  }
}

async function importJob(job) {
  var center = figma.viewport.center;
  var startX = center.x - 360;
  var startY = center.y - 240;
  var x = startX;
  var y = startY;
  var rowHeight = 0;
  var nodes = [];
  var materials = Array.isArray(job && job.materials) ? job.materials : [];

  for (var i = 0; i < materials.length; i += 1) {
    var item = materials[i];
    var node;
    if (item.kind === 'image') node = await makeImageLayer(item, x, y);
    else if (item.kind === 'text') node = await makeTextLayer(item, x, y);
    else node = await makeReferenceCard(item, x, y);

    nodes.push(node);
    x += Math.max(220, node.width || 220) + 28;
    rowHeight = Math.max(rowHeight, node.height || 120);
    if (x > startX + 980) {
      x = startX;
      y += rowHeight + 56;
      rowHeight = 0;
    }
  }

  if (nodes.length === 0) throw new Error('No importable materials');
  figma.currentPage.selection = nodes;
  figma.viewport.scrollAndZoomIntoView(nodes);
  figma.notify('T8 imported ' + nodes.length + ' item(s)');
}

if (uiReady && figma.ui) {
  figma.ui.onmessage = async function onPluginMessage(message) {
    if (!message || message.type !== 'import-job') return;
    var job = message.job;
    try {
      await importJob(job);
      figma.ui.postMessage({ type: 'import-complete', jobId: job.id, ok: true });
    } catch (e) {
      var text = errorText(e);
      notifyError('T8 import failed: ' + text);
      figma.ui.postMessage({ type: 'import-complete', jobId: job && job.id, ok: false, message: text });
    }
  };
}
