/**
 * Grsai 图像生成 — 运行逻辑（从 ImageNode.handleGenerate 抽出）
 * 只负责：submit → 轮询 → 写回 node data。
 * 与 runQiniuImage 签名完全一致，便于 ImageNode 一行调用。
 *
 * Grsai 自有协议（非 OpenAI 兼容）：
 *   - 上游路径统一 POST /v1/api/generate（不分文/图生图，靠 images[] 区分）
 *   - 字段驼峰：aspectRatio / imageSize / replyType
 *   - 状态枚举：succeeded / running / failed / violation
 *   - imageSize 仅 nano-banana 系列读取（gpt-image-2 系列后端会忽略）
 *   - gpt-image-2-vip 必须传像素串，不接受比例字符串
 */
import { submitGrsaiImage, queryGrsaiImageStatus, type GrsaiImageSubmitRequest } from '../../services/generation';
import { logBus } from '../../stores/logs';
import { resolveGrsaiAspectRatio } from './sizeMap';

export interface RunGrsaiImageParams {
  /** 节点 id，仅用于日志 src 命名空间 */
  id: string;
  /** 当前 apiModel（11 个 grsai 模型之一） */
  apiModel: string;
  /** 已合并上游+本地 prompt 后的最终文本 */
  finalPrompt: string;
  /** 已合并并截断到 maxRefs 的参考图列表（URL 或 dataURL） */
  allRefs: string[];
  /** ImageNode 当前 data，用于读取 grsaiAspectRatio / grsaiImageSize */
  d: any;
  /** ImageNode 的 useUpdateNodeData(id) 返回的 update 函数 */
  update: (patch: any) => void;
}

/** 判断 model 是否属于 nano-banana 系列（这些 model 才会读 imageSize） */
function isNanoBananaSeries(model: string): boolean {
  return /^nano-banana/i.test(String(model || ''));
}

export async function runGrsaiImage({ id, apiModel, finalPrompt, allRefs, d, update }: RunGrsaiImageParams) {
  const src = `image:${id.slice(0, 6)}`;
  const rawRatio = String(d?.grsaiAspectRatio || 'auto');
  // UI 存比例字符串；gpt-image-2-vip 上游强制像素串，由 resolveGrsaiAspectRatio 转换
  const aspectRatio = resolveGrsaiAspectRatio(rawRatio, apiModel);
  const imageSize = (d?.grsaiImageSize || '1K') as '1K' | '2K' | '4K';

  const req: GrsaiImageSubmitRequest = {
    model: apiModel,
    prompt: finalPrompt,
    aspectRatio,
    images: allRefs.length ? allRefs : undefined,
  };
  // gpt-image-2 系列上游会忽略 imageSize；仅 nano-banana 系列透传，避免误传
  if (isNanoBananaSeries(apiModel)) req.imageSize = imageSize;

  logBus.info(
    `Grsai提交: model=${apiModel} ratio=${rawRatio} aspectRatio=${aspectRatio}${req.imageSize ? ' imageSize=' + req.imageSize : ''} 参考图=${allRefs.length} prompt="${finalPrompt.slice(0, 60)}${finalPrompt.length > 60 ? '…' : ''}"`,
    src,
  );

  const submit = await submitGrsaiImage(req);

  // 同步完成（极少见，后端默认走 async；保留分支以防上游直接同步返回）
  if (submit.sync && submit.urls && submit.urls.length) {
    logBus.success(`Grsai同步返回 → ${submit.urls[0]}`, src);
    update({
      status: 'success',
      progress: '100%',
      imageUrl: submit.urls[0],
      lastPrompt: finalPrompt,
      usedI2I: allRefs.length > 0,
    });
    return;
  }

  // 异步任务 → 轮询 /v1/api/result?id=
  const taskId = submit.taskId;
  if (!taskId) throw new Error('Grsai 未返回 task_id 且无同步结果');
  logBus.info(`Grsai异步任务已提交 taskId=${taskId}`, src);
  update({ progress: submit.progress || '5%', taskId });

  const maxPoll = 1800;
  const interval = 2000;
  let lastProg = '5%';
  for (let i = 0; i < maxPoll; i++) {
    await new Promise((r) => setTimeout(r, interval));
    const q = await queryGrsaiImageStatus(taskId);
    if (q.progress && q.progress !== lastProg) {
      lastProg = q.progress;
      update({ progress: q.progress });
      if (i % 5 === 4) logBus.debug(`[${i + 1}/${maxPoll}] Grsai status=${q.status} progress=${q.progress}`, src);
    }
    const st = String(q.status || '').toLowerCase();
    if (st === 'completed' || st === 'success' || st === 'done' || st === 'succeeded') {
      const url = q.urls?.[0];
      if (!url) throw new Error('Grsai 任务完成但未返回图片');
      logBus.success(`Grsai任务完成 → ${url}`, src);
      update({
        status: 'success',
        progress: '100%',
        imageUrl: url,
        lastPrompt: finalPrompt,
        usedI2I: allRefs.length > 0,
      });
      return;
    }
    if (st === 'failed' || st === 'failure' || st === 'error' || st === 'violation') {
      throw new Error(q.error || `Grsai 任务${st}`);
    }
  }
  throw new Error(`Grsai 超时:${(maxPoll * interval) / 1000}s 未完成`);
}
