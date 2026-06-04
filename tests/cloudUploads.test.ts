import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const {
  DEFAULT_CLOUD_UPLOAD_TARGETS,
  maskCloudUploadTargets,
  normalizeCloudUploadTargets,
  summarizeCloudUploadTargets,
} = require('../backend/src/cloudUploads/settings.js');

const {
  buildObjectKey,
  validateTargetConfig,
} = require('../backend/src/cloudUploads/uploader.js');

test('normalizeCloudUploadTargets creates disabled built-in targets', () => {
  const targets = normalizeCloudUploadTargets(undefined);

  assert.deepEqual(
    targets.map((target: any) => target.id),
    DEFAULT_CLOUD_UPLOAD_TARGETS.map((target: any) => target.id),
  );
  assert.ok(targets.every((target: any) => target.enabled === false));
  assert.equal(targets.find((target: any) => target.id === 'tencent-cos')?.tencentCos?.region, 'ap-guangzhou');
  assert.equal(targets.find((target: any) => target.id === 'aliyun-oss')?.aliyunOss?.endpoint, 'oss-cn-hangzhou.aliyuncs.com');
});

test('normalizeCloudUploadTargets preserves stored secrets when incoming values are blank or masked', () => {
  const current = normalizeCloudUploadTargets([
    {
      id: 'tencent-cos',
      provider: 'tencent-cos',
      tencentCos: {
        bucket: 'bucket-1250000000',
        region: 'ap-guangzhou',
        secretId: 'sid-secret-1234',
        secretKey: 'skey-secret-5678',
      },
    },
    {
      id: 'aliyun-oss',
      provider: 'aliyun-oss',
      aliyunOss: {
        bucket: 'bucket',
        endpoint: 'oss-cn-hangzhou.aliyuncs.com',
        accessKeyId: 'ak-secret-1111',
        accessKeySecret: 'sk-secret-2222',
      },
    },
  ]);

  const next = normalizeCloudUploadTargets(
    [
      {
        id: 'tencent-cos',
        provider: 'tencent-cos',
        tencentCos: {
          bucket: 'bucket-1250000000',
          region: 'ap-guangzhou',
          secretId: '****1234',
          secretKey: '',
        },
      },
      {
        id: 'aliyun-oss',
        provider: 'aliyun-oss',
        aliyunOss: {
          bucket: 'bucket',
          endpoint: 'https://oss-cn-shanghai.aliyuncs.com/',
          accessKeyId: '****1111',
          accessKeySecret: '',
        },
      },
    ],
    current,
  );

  const tencent = next.find((target: any) => target.id === 'tencent-cos');
  const aliyun = next.find((target: any) => target.id === 'aliyun-oss');

  assert.equal(tencent?.tencentCos?.secretId, 'sid-secret-1234');
  assert.equal(tencent?.tencentCos?.secretKey, 'skey-secret-5678');
  assert.equal(aliyun?.aliyunOss?.accessKeyId, 'ak-secret-1111');
  assert.equal(aliyun?.aliyunOss?.accessKeySecret, 'sk-secret-2222');
  assert.equal(aliyun?.aliyunOss?.endpoint, 'oss-cn-shanghai.aliyuncs.com');
});

test('maskCloudUploadTargets hides cloud secrets while keeping status flags', () => {
  const targets = normalizeCloudUploadTargets([
    {
      id: 'tencent-cos',
      provider: 'tencent-cos',
      tencentCos: {
        bucket: 'bucket-1250000000',
        region: 'ap-guangzhou',
        secretId: 'sid-secret-1234',
        secretKey: 'skey-secret-5678',
      },
    },
  ]);

  const masked = maskCloudUploadTargets(targets);
  const tencent = masked.find((target: any) => target.id === 'tencent-cos');

  assert.equal(tencent?.tencentCos?.secretId, '****1234');
  assert.equal(tencent?.tencentCos?.secretKey, '****5678');
  assert.equal(tencent?.tencentCos?.hasSecretId, true);
  assert.equal(tencent?.tencentCos?.hasSecretKey, true);
  assert.equal(JSON.stringify(masked).includes('sid-secret-1234'), false);
});

test('summarizeCloudUploadTargets reports enabled and configured targets', () => {
  const targets = normalizeCloudUploadTargets([
    {
      id: 'tencent-cos',
      provider: 'tencent-cos',
      enabled: true,
      isDefault: true,
      label: 'COS 主桶',
      tencentCos: {
        bucket: 'bucket-1250000000',
        region: 'ap-guangzhou',
        secretId: 'sid',
        secretKey: 'skey',
      },
    },
  ]);

  const summary = summarizeCloudUploadTargets(targets);

  assert.equal(summary.enabledCount, 1);
  assert.equal(summary.configuredCount, 1);
  assert.equal(summary.defaultLabel, 'COS 主桶');
});

test('buildObjectKey applies date and kind tokens while keeping extension', () => {
  const objectKey = buildObjectKey(
    { prefix: 't8/{kind}/{yyyy-mm}' },
    path.join('C:', 'tmp', 'image.png'),
    { kind: 'image', title: 'demo.png' },
  );

  assert.match(objectKey, /^t8\/image\/\d{4}-\d{2}\/demo_\d+\.png$/);
});

test('validateTargetConfig rejects unsupported netdisk placeholders with clear errors', () => {
  assert.throws(
    () => validateTargetConfig({ provider: 'baidu-netdisk', baiduNetdisk: { accessToken: 'token' } }),
    /百度网盘真实上传等待/,
  );
  assert.throws(
    () => validateTargetConfig({ provider: 'quark-netdisk', quarkNetdisk: { commandPath: 'quark' } }),
    /夸克网盘真实上传等待/,
  );
});
