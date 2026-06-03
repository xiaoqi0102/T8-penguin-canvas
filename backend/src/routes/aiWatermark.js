'use strict';

const express = require('express');
const { resolveAiWatermarkMediaRef } = require('../tools/aiWatermark/media');
const {
  detectCapabilities,
  runAiWatermarkProcess,
} = require('../tools/aiWatermark/runner');

const router = express.Router();

function normalizeSource(reqBody) {
  const body = reqBody || {};
  return String(
    body.source ||
    body.url ||
    body.imageUrl ||
    body.videoUrl ||
    body.audioUrl ||
    '',
  ).trim();
}

router.get('/status', async (_req, res) => {
  try {
    const data = await detectCapabilities();
    res.json({ success: true, data });
  } catch (e) {
    res.json({
      success: true,
      data: {
        installed: false,
        version: '',
        resolver: '',
        markKeys: ['gemini', 'doubao', 'jimeng'],
        optionalFeatures: {
          invisible: false,
          lama: false,
          detect: false,
          trustmark: false,
        },
        setupHints: [
          '推荐: pipx install remove-ai-watermarks',
          '也可以: uv tool install remove-ai-watermarks',
          '已有本地源码时设置 T8_REMOVE_AI_WATERMARKS_SRC 指向 clone 根目录',
        ],
        errors: [e?.message || String(e)],
      },
    });
  }
});

router.post('/process', async (req, res) => {
  try {
    const source = normalizeSource(req.body);
    if (!source) {
      return res.status(400).json({ success: false, error: '缺少输入素材' });
    }
    const media = await resolveAiWatermarkMediaRef(source);
    const result = await runAiWatermarkProcess({
      sourcePath: media.path,
      mediaKind: req.body?.kind || media.kind,
      mode: req.body?.mode || 'smart',
      options: req.body?.options || {},
    });
    res.json({
      success: true,
      data: {
        ...result,
        input: {
          kind: media.kind,
          mime: media.mime,
          source: media.source,
        },
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || String(e) });
  }
});

module.exports = router;
