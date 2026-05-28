/**
 * 七牛云 AI 图像生成 — 运行逻辑（从 ImageNode.handleGenerate 抽出）
 * 这层只负责：submit → 轮询 → 写回 node data。
 * UI / 状态 / 上下游素材聚合全部仍在 ImageNode，避免破坏现有运行总线契约。
 *
 * 子模型分流（v1.6.2 起）：
 *   - openai/gpt-image-2 ：UI 比例 → sizeMap 转像素串 → body.size + body.quality
 *   - gemini-3.1-flash-image-preview ：UI 比例直接送 body.aspectRatio + body.imageSize
 *     （后端转 image_config.aspect_ratio / image_config.image_size 嵌套对象）
 *     'auto' 与像素串残留（旧画布）不送 aspectRatio，让上游默认比例
 */
import { submitQiniuImage, queryQiniuImageStatus, type QiniuImageSubmitRequest } from '../../services/generation';
import { logBus } from '../../stores/logs';
import { ratioToQiniuSize, DEFAULT_QINIU_RESOLUTION, type QiniuResolution } from './sizeMap';

export interface RunQiniuImageParams {
  /** 节点 id，仅用于日志 src 命名空间 */
  id: string;
  /** 当前 apiModel（gemini-3.1-flash-image-preview / openai/gpt-image-2） */
  apiModel: string;
  /** 已合并上游+本地 prompt 后的最终文本 */
  finalPrompt: string;
  /** 已合并并截断到 maxRefs 的参考图列表（URL 或 dataURL） */
  allRefs: string[];
  /** ImageNode 当前 data，用于读取 qiniuQuality / qiniuSize / qiniuResolution */
  d: any;
  /** ImageNode 的 useUpdateNodeData(id) 返回的 update 函数 */
  update: (patch: any) => void;
}

export async function runQiniuImage({ id, apiModel, finalPrompt, allRefs, d, update }: RunQiniuImageParams) {
  const src = `image:${id.slice(0, 6)}`;
  const ratio = String(d?.qiniuSize || 'auto');
  const resolution = (d?.qiniuResolution || DEFAULT_QINIU_RESOLUTION) as QiniuResolution;

  const isGemini = apiModel === 'gemini-3.1-flash-image-preview';

  const req: QiniuImageSubmitRequest = {
    model: apiModel,
    prompt: finalPrompt,
    images: allRefs,
  };

  if (isGemini) {
    // gemini：直接送原始比例 + 清晰度档（后端转 image_config 嵌套）
    // 'auto' 不传，让上游默认；旧画布残留的像素串（v1.5.6 早期）也不传，退到上游默认
    if (ratio !== 'auto' && !/^\d+x\d+$/i.test(ratio)) req.aspectRatio = ratio;
    req.imageSize = resolution;
  } else {
    // openai/gpt-image-2：UI 比例 → sizeMap 转像素串 + quality 字段
    req.quality = (d?.qiniuQuality || 'auto') as 'auto' | 'low' | 'medium' | 'high';
    req.size = ratioToQiniuSize(ratio, resolution);
  }

  const logFields = isGemini
    ? `aspect_ratio=${req.aspectRatio ?? '(default)'} image_size=${req.imageSize}`
    : `quality=${req.quality} ratio=${ratio} resolution=${resolution} size=${req.size}`;
  logBus.info(
    `七牛云提交: model=${apiModel} ${logFields} 参考图=${allRefs.length} prompt="${finalPrompt.slice(0, 60)}${finalPrompt.length > 60 ? '…' : ''}"`,
    src,
  );

  const submit = await submitQiniuImage(req);

  // 同步完成
  if (submit.sync && submit.urls && submit.urls.length) {
    logBus.success(`七牛云同步返回 → ${submit.urls[0]}`, src);
    update({
      status: 'success',
      progress: '100%',
      imageUrl: submit.urls[0],
      lastPrompt: finalPrompt,
      usedI2I: allRefs.length > 0,
    });
    return;
  }

  // 异步任务 → 轮询
  const taskId = submit.taskId;
  if (!taskId) throw new Error('七牛云未返回 task_id 且无同步结果');
  logBus.info(`七牛云异步任务已提交 taskId=${taskId}`, src);
  update({ progress: submit.progress || '5%', taskId });

  const maxPoll = 1800;
  const interval = 2000;
  let lastProg = '5%';
  for (let i = 0; i < maxPoll; i++) {
    await new Promise((r) => setTimeout(r, interval));
    const q = await queryQiniuImageStatus(taskId);
    if (q.progress && q.progress !== lastProg) {
      lastProg = q.progress;
      update({ progress: q.progress });
      if (i % 5 === 4) logBus.debug(`[${i + 1}/${maxPoll}] 七牛云 status=${q.status} progress=${q.progress}`, src);
    }
    const st = String(q.status || '').toLowerCase();
    if (st === 'completed' || st === 'success' || st === 'done' || st === 'succeed') {
      const url = q.urls?.[0];
      if (!url) throw new Error('七牛云任务完成但未返回图片');
      logBus.success(`七牛云任务完成 → ${url}`, src);
      update({
        status: 'success',
        progress: '100%',
        imageUrl: url,
        lastPrompt: finalPrompt,
        usedI2I: allRefs.length > 0,
      });
      return;
    }
    if (st === 'failed' || st === 'failure' || st === 'error') {
      throw new Error(q.error || '七牛云任务失败');
    }
  }
  throw new Error(`七牛云超时:${(maxPoll * interval) / 1000}s 未完成`);
}
