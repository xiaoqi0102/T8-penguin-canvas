import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('docker compose enables remote ComfyUI access for the packaged GUI service', () => {
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');

  assert.match(compose, /^\s*T8_COMFYUI_ALLOW_REMOTE:\s*["']?1["']?\s*$/m);
});

test('Dockerfile installs ffmpeg for video frame extraction in the backend container', () => {
  const dockerfile = fs.readFileSync('Dockerfile', 'utf8');

  assert.match(dockerfile, /apt-get install[^\n]*ffmpeg/);
});
