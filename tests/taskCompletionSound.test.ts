import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPLETION_SOUND_THROTTLE_MS,
  isCompletionSoundEligibleNodeType,
  nextCompletionSoundGateState,
  resolveCompletionSoundNodeType,
  shouldNotifyCompletionSoundForNodeType,
  shouldPlayCompletionSound,
} from '../src/utils/taskCompletionSound.ts';

test('task completion sound plays once and throttles repeats for five seconds', () => {
  let gate = { enabled: true, lastPlayedAt: 0 };

  assert.equal(shouldPlayCompletionSound(gate, 1000), true);
  gate = nextCompletionSoundGateState(gate, 1000);

  assert.equal(shouldPlayCompletionSound(gate, 1000 + COMPLETION_SOUND_THROTTLE_MS - 1), false);
  assert.equal(shouldPlayCompletionSound(gate, 1000 + COMPLETION_SOUND_THROTTLE_MS), true);
});

test('task completion sound stays silent when disabled', () => {
  const gate = { enabled: false, lastPlayedAt: 0 };

  assert.equal(shouldPlayCompletionSound(gate, 1000), false);
  assert.deepEqual(nextCompletionSoundGateState(gate, 1000), gate);
});

test('task completion sound is only eligible for core generation nodes', () => {
  assert.equal(isCompletionSoundEligibleNodeType('image'), true);
  assert.equal(isCompletionSoundEligibleNodeType('video'), true);
  assert.equal(isCompletionSoundEligibleNodeType('seedance'), true);
  assert.equal(isCompletionSoundEligibleNodeType('audio'), true);
  assert.equal(isCompletionSoundEligibleNodeType('llm'), true);
  assert.equal(isCompletionSoundEligibleNodeType('runninghub'), false);
  assert.equal(isCompletionSoundEligibleNodeType('upload'), false);
  assert.equal(isCompletionSoundEligibleNodeType('combine'), false);
});

test('task completion sound notification requires an eligible node type', () => {
  const gate = { enabled: true, lastPlayedAt: 0 };

  assert.equal(shouldNotifyCompletionSoundForNodeType(gate, 'image', 1000), true);
  assert.equal(shouldNotifyCompletionSoundForNodeType(gate, 'runninghub', 1000), false);
  assert.equal(shouldNotifyCompletionSoundForNodeType(gate, undefined, 1000), false);
});

test('task completion sound can resolve an eligible fallback node type for direct runs', () => {
  assert.equal(resolveCompletionSoundNodeType(undefined, 'image'), 'image');
  assert.equal(resolveCompletionSoundNodeType('video', 'image'), 'video');
  assert.equal(resolveCompletionSoundNodeType('runninghub', 'llm'), 'llm');
  assert.equal(resolveCompletionSoundNodeType(undefined, 'upload'), undefined);
});
