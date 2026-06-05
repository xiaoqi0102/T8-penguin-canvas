'use strict';

const express = require('express');
const store = require('../achievements/store');

const router = express.Router();

router.get('/profile', (_req, res) => {
  try {
    res.json({ success: true, data: store.getProfile() });
  } catch (error) {
    res.status(500).json({ success: false, error: error?.message || '读取成就数据失败' });
  }
});

router.post('/event', express.json({ limit: '1mb' }), (req, res) => {
  try {
    res.json({ success: true, data: store.recordEvent(req.body || {}) });
  } catch (error) {
    res.status(500).json({ success: false, error: error?.message || '记录成就事件失败' });
  }
});

router.post('/preferences', express.json({ limit: '1mb' }), (req, res) => {
  try {
    res.json({ success: true, data: store.setPreferences(req.body || {}) });
  } catch (error) {
    res.status(500).json({ success: false, error: error?.message || '保存成就设置失败' });
  }
});

router.post('/reset', (_req, res) => {
  try {
    res.json({ success: true, data: store.resetData() });
  } catch (error) {
    res.status(500).json({ success: false, error: error?.message || '重置成就数据失败' });
  }
});

router.get('/export', (_req, res) => {
  try {
    res.json({ success: true, data: store.exportData() });
  } catch (error) {
    res.status(500).json({ success: false, error: error?.message || '导出成就数据失败' });
  }
});

router.post('/import', express.json({ limit: '10mb' }), (req, res) => {
  try {
    res.json({ success: true, data: store.importData(req.body || {}) });
  } catch (error) {
    res.status(400).json({ success: false, error: error?.message || '导入成就数据失败' });
  }
});

module.exports = router;
