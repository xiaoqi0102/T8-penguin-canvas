import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LOOPING_VIDEO_DEFAULT_PROPS,
  mergeLoopingVideoProps,
} from '../src/utils/videoPlayback.ts';

test('LOOPING_VIDEO_DEFAULT_PROPS makes canvas video previews loop by default', () => {
  assert.equal(LOOPING_VIDEO_DEFAULT_PROPS.loop, true);
  assert.equal(LOOPING_VIDEO_DEFAULT_PROPS.playsInline, true);
  assert.equal(LOOPING_VIDEO_DEFAULT_PROPS.preload, 'metadata');
});

test('mergeLoopingVideoProps preserves caller props while keeping loop enabled', () => {
  assert.deepEqual(mergeLoopingVideoProps({ controls: true, muted: false, className: 'w-full' }), {
    loop: true,
    playsInline: true,
    preload: 'metadata',
    controls: true,
    muted: false,
    className: 'w-full',
  });
});
