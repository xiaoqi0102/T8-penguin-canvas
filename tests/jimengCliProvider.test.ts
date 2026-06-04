import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jimengCli = require('../backend/src/providers/jimengCli.js');

test('Jimeng image generation builds text2image command and extracts returned media', async () => {
  const commands: any[] = [];
  const provider = {
    id: 'jimeng-cli',
    protocol: 'jimeng-cli',
    imageModels: ['jimeng-image-2k'],
    jimengConfig: { executablePath: 'dreamina', pollSeconds: 20 },
  };

  const result = await jimengCli.generateImage(provider, {
    prompt: 'basketball pose',
    model: 'jimeng-image-2k',
    size: '1344x768',
  }, {
    runCli: async (command: string, args: string[]) => {
      commands.push({ command, args });
      return { images: ['C:\\tmp\\jimeng.png'] };
    },
    storeOutput: async (value: string) => `/files/output/${value.split('\\').pop()}`,
  });

  assert.equal(result.ok, true);
  assert.equal(commands[0].command, 'dreamina');
  assert.equal(commands[0].args[0], 'text2image');
  assert.ok(commands[0].args.includes('--prompt=basketball pose'));
  assert.ok(commands[0].args.includes('--ratio=16:9'));
  assert.ok(commands[0].args.includes('--resolution_type=2k'));
  assert.deepEqual(result.imageUrls, ['/files/output/jimeng.png']);
});

test('Jimeng video generation builds image2video command when one reference image is provided', async () => {
  const commands: any[] = [];
  const provider = {
    id: 'jimeng-cli',
    protocol: 'jimeng-cli',
    videoModels: ['seedance2.0fast_vip'],
    jimengConfig: { executablePath: 'dreamina', pollSeconds: 20 },
  };

  const result = await jimengCli.generateVideo(provider, {
    prompt: 'run',
    model: 'seedance2.0fast_vip',
    aspect_ratio: '9:16',
    duration: 6,
    resolution: '720p',
    images: ['C:\\tmp\\ref.png'],
  }, {
    resolveLocalMedia: async (value: string) => value,
    runCli: async (command: string, args: string[]) => {
      commands.push({ command, args });
      return { videos: ['C:\\tmp\\jimeng.mp4'], submit_id: 'sub-1' };
    },
    storeOutput: async (value: string) => `/files/output/${value.split('\\').pop()}`,
  });

  assert.equal(result.ok, true);
  assert.equal(commands[0].args[0], 'multimodal2video');
  assert.ok(commands[0].args.includes('--image=C:\\tmp\\ref.png'));
  assert.ok(commands[0].args.includes('--ratio=9:16'));
  assert.ok(commands[0].args.includes('--model_version=seedance2.0fast_vip'));
  assert.deepEqual(result.videoUrls, ['/files/output/jimeng.mp4']);
  assert.equal(result.taskId, 'sub-1');
});

test('Jimeng generation queries async result when CLI only returns submit id', async () => {
  const commands: any[] = [];
  const provider = {
    id: 'jimeng-cli',
    protocol: 'jimeng-cli',
    imageModels: ['jimeng-image-2k'],
    jimengConfig: { executablePath: 'dreamina', pollSeconds: 20 },
  };

  const result = await jimengCli.generateImage(provider, {
    prompt: 'portrait',
    providerModel: 'jimeng-image-2k',
    model: 'legacy-node-model',
    size: '1024x1024',
  }, {
    runCli: async (command: string, args: string[]) => {
      commands.push({ command, args });
      if (args[0] === 'query_result') {
        return { data: { result_json: '{"images":["C:\\\\tmp\\\\done.png"]}' } };
      }
      return { submit_id: 'img-sub-1', gen_status: 'running' };
    },
    storeOutput: async (value: string) => `/files/output/${value.split('\\').pop()}`,
  });

  assert.equal(result.ok, true);
  assert.equal(result.model, 'jimeng-image-2k');
  assert.equal(commands[0].args[0], 'text2image');
  assert.equal(commands[1].args[0], 'query_result');
  assert.ok(commands[1].args.includes('--submit_id=img-sub-1'));
  assert.ok(commands[1].args.some((arg: string) => arg.startsWith('--download_dir=')));
  assert.deepEqual(result.imageUrls, ['/files/output/done.png']);
});

test('Jimeng async video keeps polling until query_result returns downloaded path objects', async () => {
  const commands: any[] = [];
  const provider = {
    id: 'jimeng-cli',
    protocol: 'jimeng-cli',
    videoModels: ['seedance2.0_vip'],
    jimengConfig: { executablePath: 'dreamina', pollSeconds: 20 },
  };

  let queryCount = 0;
  const result = await jimengCli.generateVideo(provider, {
    prompt: 'basketball dance',
    providerModel: 'seedance2.0_vip',
    aspect_ratio: '9:16',
    duration: 5,
    resolution: '720p',
    images: ['C:\\tmp\\ref.png'],
  }, {
    pollIntervalMs: 0,
    resolveLocalMedia: async (value: string) => value,
    runCli: async (command: string, args: string[]) => {
      commands.push({ command, args });
      if (args[0] === 'query_result') {
        queryCount += 1;
        if (queryCount === 1) {
          return { submit_id: 'vid-sub-2', gen_status: 'querying', result_json: { images: [], videos: [] } };
        }
        return {
          submit_id: 'vid-sub-2',
          gen_status: 'success',
          result_json: {
            images: [],
            videos: [{ path: 'C:\\tmp\\vid-sub-2_video_1.mp4', width: 720, height: 1280 }],
          },
        };
      }
      return { submit_id: 'vid-sub-2', gen_status: 'querying' };
    },
    storeOutput: async (value: string) => `/files/output/${value.split('\\').pop()}`,
  });

  assert.equal(result.ok, true);
  assert.equal(commands.filter((item) => item.args[0] === 'query_result').length, 2);
  assert.deepEqual(result.videoUrls, ['/files/output/vid-sub-2_video_1.mp4']);
});

test('Jimeng async image extracts result_json image path objects', async () => {
  const provider = {
    id: 'jimeng-cli',
    protocol: 'jimeng-cli',
    imageModels: ['jimeng-image-2k'],
    jimengConfig: { executablePath: 'dreamina', pollSeconds: 20 },
  };

  const result = await jimengCli.generateImage(provider, {
    prompt: 'portrait',
    providerModel: 'jimeng-image-2k',
    size: '1024x1024',
  }, {
    pollIntervalMs: 0,
    runCli: async (_command: string, args: string[]) => {
      if (args[0] === 'query_result') {
        return {
          submit_id: 'img-sub-2',
          gen_status: 'success',
          result_json: {
            images: [{ path: 'C:\\tmp\\img-sub-2_image_1.png', width: 1024, height: 1024 }],
            videos: [],
          },
        };
      }
      return { submit_id: 'img-sub-2', gen_status: 'querying' };
    },
    storeOutput: async (value: string) => `/files/output/${value.split('\\').pop()}`,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.imageUrls, ['/files/output/img-sub-2_image_1.png']);
});

test('Jimeng video generation sends image video and audio references through multimodal mode', async () => {
  const commands: any[] = [];
  const provider = {
    id: 'jimeng-cli',
    protocol: 'jimeng-cli',
    videoModels: ['jimeng-video-720p'],
    jimengConfig: { executablePath: 'dreamina', pollSeconds: 20 },
  };

  const result = await jimengCli.generateVideo(provider, {
    prompt: 'dance',
    providerModel: 'jimeng-video-720p',
    model: 'seedance-2-0-fast',
    aspect_ratio: '16:9',
    duration: 5,
    resolution: '720p',
    images: ['C:\\tmp\\ref.png'],
    videos: ['C:\\tmp\\ref.mp4'],
    audios: ['C:\\tmp\\voice.wav'],
  }, {
    resolveLocalMedia: async (value: string) => value,
    runCli: async (command: string, args: string[]) => {
      commands.push({ command, args });
      return { data: { video_url: 'C:\\tmp\\jimeng.mp4' }, submit_id: 'vid-sub-1' };
    },
    storeOutput: async (value: string) => `/files/output/${value.split('\\').pop()}`,
  });

  assert.equal(result.ok, true);
  assert.equal(result.model, 'jimeng-video-720p');
  assert.equal(commands[0].args[0], 'multimodal2video');
  assert.ok(commands[0].args.includes('--image=C:\\tmp\\ref.png'));
  assert.ok(commands[0].args.includes('--video=C:\\tmp\\ref.mp4'));
  assert.ok(commands[0].args.includes('--audio=C:\\tmp\\voice.wav'));
  assert.ok(commands[0].args.includes('--video_resolution=720p'));
  assert.equal(commands[0].args.some((arg: string) => arg.startsWith('--model_version=')), false);
  assert.deepEqual(result.videoUrls, ['/files/output/jimeng.mp4']);
});

test('Jimeng Seedance video caps multimodal references at 9 images 3 videos and 3 audios', async () => {
  const commands: any[] = [];
  const provider = {
    id: 'jimeng-cli',
    protocol: 'jimeng-cli',
    videoModels: ['seedance2.0fast_vip'],
    jimengConfig: { executablePath: 'dreamina', pollSeconds: 20 },
  };
  const images = Array.from({ length: 11 }, (_, i) => `C:\\tmp\\image-${i + 1}.png`);
  const videos = Array.from({ length: 5 }, (_, i) => `C:\\tmp\\video-${i + 1}.mp4`);
  const audios = Array.from({ length: 4 }, (_, i) => `C:\\tmp\\audio-${i + 1}.wav`);

  const result = await jimengCli.generateVideo(provider, {
    prompt: 'multi reference action',
    providerModel: 'seedance2.0fast_vip',
    aspect_ratio: '16:9',
    duration: 6,
    resolution: '720p',
    images,
    videos,
    audios,
  }, {
    resolveLocalMedia: async (value: string) => value,
    runCli: async (command: string, args: string[]) => {
      commands.push({ command, args });
      return { videos: ['C:\\tmp\\seedance.mp4'], submit_id: 'vid-multi' };
    },
    storeOutput: async (value: string) => `/files/output/${value.split('\\').pop()}`,
  });

  const args = commands[0].args;
  assert.equal(result.ok, true);
  assert.equal(args[0], 'multimodal2video');
  assert.equal(args.filter((arg: string) => arg.startsWith('--image=')).length, 9);
  assert.equal(args.filter((arg: string) => arg.startsWith('--video=')).length, 3);
  assert.equal(args.filter((arg: string) => arg.startsWith('--audio=')).length, 3);
  assert.ok(args.includes('--image=C:\\tmp\\image-9.png'));
  assert.equal(args.some((arg: string) => arg.includes('image-10.png')), false);
  assert.ok(args.includes('--video=C:\\tmp\\video-3.mp4'));
  assert.equal(args.some((arg: string) => arg.includes('video-4.mp4')), false);
  assert.ok(args.includes('--audio=C:\\tmp\\audio-3.wav'));
  assert.equal(args.some((arg: string) => arg.includes('audio-4.wav')), false);
  assert.ok(args.includes('--model_version=seedance2.0fast_vip'));
  assert.deepEqual(result.videoUrls, ['/files/output/seedance.mp4']);
});

test('Jimeng Seedance multiframe keeps up to 9 image references', async () => {
  const commands: any[] = [];
  const provider = {
    id: 'jimeng-cli',
    protocol: 'jimeng-cli',
    videoModels: ['seedance2.0_vip'],
    jimengConfig: { executablePath: 'dreamina', pollSeconds: 20 },
  };
  const images = Array.from({ length: 10 }, (_, i) => `C:\\tmp\\frame-${i + 1}.png`);

  const result = await jimengCli.generateVideo(provider, {
    prompt: 'multi frame action',
    providerModel: 'seedance2.0_vip',
    duration: 6,
    resolution: '1080p',
    images,
  }, {
    resolveLocalMedia: async (value: string) => value,
    runCli: async (command: string, args: string[]) => {
      commands.push({ command, args });
      return { videos: ['C:\\tmp\\frames.mp4'], submit_id: 'vid-frames' };
    },
    storeOutput: async (value: string) => `/files/output/${value.split('\\').pop()}`,
  });

  const args = commands[0].args;
  const imagesArg = args.find((arg: string) => arg.startsWith('--images='));
  assert.equal(result.ok, true);
  assert.equal(args[0], 'multiframe2video');
  assert.ok(imagesArg);
  assert.equal(String(imagesArg).split(',').length, 9);
  assert.match(String(imagesArg), /frame-9\.png/);
  assert.doesNotMatch(String(imagesArg), /frame-10\.png/);
  assert.ok(args.includes('--model_version=seedance2.0_vip'));
  assert.ok(args.includes('--video_resolution=1080p'));
  assert.deepEqual(result.videoUrls, ['/files/output/frames.mp4']);
});
