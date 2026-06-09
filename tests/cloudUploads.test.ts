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
  classifyCloudUploadError,
  testCloudTargetConnectivity,
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

test('normalizeCloudUploadTargets accepts Aliyun OSS region shorthand endpoints', () => {
  const targets = normalizeCloudUploadTargets([
    {
      id: 'aliyun-oss',
      provider: 'aliyun-oss',
      aliyunOss: {
        bucket: 'bucket',
        endpoint: 'oss-cn-beijing',
        accessKeyId: 'ak',
        accessKeySecret: 'sk',
      },
    },
  ]);

  const aliyun = targets.find((target: any) => target.id === 'aliyun-oss');
  assert.equal(aliyun?.aliyunOss?.endpoint, 'oss-cn-beijing.aliyuncs.com');
});

test('normalizeCloudUploadTargets accepts Aliyun OSS bare region ids', () => {
  const targets = normalizeCloudUploadTargets([
    {
      id: 'aliyun-oss',
      provider: 'aliyun-oss',
      aliyunOss: {
        bucket: 'bucket',
        endpoint: 'cn-beijing',
        accessKeyId: 'ak',
        accessKeySecret: 'sk',
      },
    },
  ]);

  const aliyun = targets.find((target: any) => target.id === 'aliyun-oss');
  assert.equal(aliyun?.aliyunOss?.endpoint, 'oss-cn-beijing.aliyuncs.com');
});

test('normalizeCloudUploadTargets treats password bullets as masked secrets', () => {
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
  ]);

  const next = normalizeCloudUploadTargets(
    [
      {
        id: 'tencent-cos',
        provider: 'tencent-cos',
        tencentCos: {
          bucket: 'bucket-1250000000',
          region: 'ap-guangzhou',
          secretId: '••••••••',
          secretKey: '●●●●●●●●',
        },
      },
    ],
    current,
  );

  const tencent = next.find((target: any) => target.id === 'tencent-cos');
  assert.equal(tencent?.tencentCos?.secretId, 'sid-secret-1234');
  assert.equal(tencent?.tencentCos?.secretKey, 'skey-secret-5678');
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

test('classifyCloudUploadError turns storage provider failures into actionable hints', () => {
  const signature = classifyCloudUploadError(
    { provider: 'tencent-cos' },
    Object.assign(new Error('上传失败 HTTP 403：SignatureDoesNotMatch'), {
      statusCode: 403,
      responseText: '<Code>SignatureDoesNotMatch</Code>',
    }),
  );
  assert.equal(signature.code, 'signature');
  assert.match(signature.message, /腾讯云 COS 上传签名校验失败/);
  assert.match(signature.hint, /Region/);

  const bucket = classifyCloudUploadError(
    { provider: 'aliyun-oss' },
    Object.assign(new Error('上传失败 HTTP 404：NoSuchBucket'), {
      statusCode: 404,
      responseText: '<Code>NoSuchBucket</Code>',
    }),
  );
  assert.equal(bucket.code, 'bucket');
  assert.match(bucket.message, /阿里云 OSS Bucket 无法访问/);

  const network = classifyCloudUploadError(
    { provider: 'aliyun-oss' },
    Object.assign(new Error('fetch failed'), { code: 'ENOTFOUND' }),
  );
  assert.equal(network.code, 'network');
  assert.match(network.message, /连接失败/);
});

test('testCloudTargetConnectivity checks Tencent COS with signed location request', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedAuth = '';
  globalThis.fetch = (async (url: any, init: any) => {
    capturedUrl = String(url);
    capturedAuth = String(init?.headers?.Authorization || '');
    return new Response('<LocationConstraint>ap-nanjing</LocationConstraint>', { status: 200 });
  }) as any;
  try {
    const result = await testCloudTargetConnectivity({
      id: 'tencent-cos',
      provider: 'tencent-cos',
      label: 'COS',
      tencentCos: {
        bucket: 'bucket-1250000000',
        region: 'ap-nanjing',
        secretId: 'AKID-demo',
        secretKey: 'secret-demo',
      },
    });

    assert.equal(result.ok, true);
    assert.equal(capturedUrl, 'https://bucket-1250000000.cos.ap-nanjing.myqcloud.com/?location=');
    assert.match(capturedAuth, /q-sign-algorithm=sha1/);
    assert.match(capturedAuth, /q-url-param-list=location/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('testCloudTargetConnectivity surfaces Tencent COS XML errors', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(
    '<Error><Code>SignatureDoesNotMatch</Code><Message>signature not match</Message><RequestId>req-1</RequestId></Error>',
    { status: 403 },
  )) as any;
  try {
    await assert.rejects(
      () => testCloudTargetConnectivity({
        id: 'tencent-cos',
        provider: 'tencent-cos',
        label: 'COS',
        tencentCos: {
          bucket: 'bucket-1250000000',
          region: 'ap-nanjing',
          secretId: 'AKID-demo',
          secretKey: 'secret-demo',
        },
      }),
      (error: any) => {
        assert.equal(error.statusCode, 403);
        assert.equal(error.providerCode, 'SignatureDoesNotMatch');
        assert.equal(error.requestId, 'req-1');
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('testCloudTargetConnectivity checks Aliyun OSS with canonical endpoint host', async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = '';
  let capturedAuth = '';
  globalThis.fetch = (async (url: any, init: any) => {
    capturedUrl = String(url);
    capturedAuth = String(init?.headers?.Authorization || '');
    return new Response('<LocationConstraint>oss-cn-beijing</LocationConstraint>', { status: 200 });
  }) as any;
  try {
    const result = await testCloudTargetConnectivity({
      id: 'aliyun-oss',
      provider: 'aliyun-oss',
      label: 'OSS',
      aliyunOss: {
        bucket: 'bucket',
        endpoint: 'oss-cn-beijing',
        accessKeyId: 'ak-demo',
        accessKeySecret: 'secret-demo',
      },
    });

    assert.equal(result.ok, true);
    assert.match(capturedUrl, /^https:\/\/bucket\.oss-cn-beijing\.aliyuncs\.com\/\?location=/);
    assert.doesNotMatch(capturedUrl, /OSSAccessKeyId=/);
    assert.match(capturedAuth, /^OSS ak-demo:/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
