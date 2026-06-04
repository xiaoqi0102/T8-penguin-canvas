'use strict';

const express = require('express');
const { loadSettings } = require('./settings');
const {
  maskCloudUploadTargets,
  normalizeCloudUploadTargets,
  summarizeCloudUploadTargets,
} = require('../cloudUploads/settings');
const {
  uploadCloudAsset,
  validateTargetConfig,
} = require('../cloudUploads/uploader');

const router = express.Router();

function loadNormalizedTargets() {
  const settings = loadSettings();
  return normalizeCloudUploadTargets(settings.cloudUploadTargets);
}

function publicTargets(targets) {
  return maskCloudUploadTargets(targets);
}

function findTarget(targets, targetId) {
  const id = String(targetId || '').trim();
  if (!id) return null;
  return targets.find((target) => target.id === id) || null;
}

function normalizeTransientTarget(rawTarget, currentTargets) {
  if (!rawTarget || typeof rawTarget !== 'object') return null;
  const id = String(rawTarget.id || '').trim();
  const normalized = normalizeCloudUploadTargets([rawTarget], currentTargets);
  return normalized.find((target) => target.id === id) || null;
}

router.get('/status', (_req, res) => {
  const targets = loadNormalizedTargets();
  res.json({
    success: true,
    data: {
      targets: publicTargets(targets),
      summary: summarizeCloudUploadTargets(targets),
    },
  });
});

router.post('/test', (req, res) => {
  try {
    const currentTargets = loadNormalizedTargets();
    const target = req.body?.target
      ? normalizeTransientTarget(req.body.target, currentTargets)
      : findTarget(currentTargets, req.body?.targetId);
    if (!target) {
      return res.status(404).json({ success: false, error: '云端目标不存在' });
    }
    const result = validateTargetConfig(target);
    res.json({
      success: true,
      data: {
        ok: true,
        ...result,
        target: publicTargets([target])[0],
      },
    });
  } catch (e) {
    res.status(400).json({
      success: false,
      error: e?.message || String(e),
      data: { ok: false },
    });
  }
});

router.post('/upload', async (req, res) => {
  try {
    const targets = loadNormalizedTargets();
    const target = findTarget(targets, req.body?.targetId);
    if (!target) {
      return res.status(404).json({ success: false, error: '云端目标不存在' });
    }
    if (!target.enabled) {
      return res.status(400).json({ success: false, error: '该云端目标未启用，请先在 API 设置中开启' });
    }
    const result = await uploadCloudAsset(target, {
      url: req.body?.url,
      sourceUrl: req.body?.sourceUrl,
      kind: req.body?.kind,
      filename: req.body?.filename,
      title: req.body?.title,
      sourceNodeId: req.body?.sourceNodeId,
      sourceCanvasId: req.body?.sourceCanvasId,
    });
    res.json({
      success: true,
      data: {
        ...result,
        uploadedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    res.status(400).json({ success: false, error: e?.message || String(e) });
  }
});

module.exports = router;
