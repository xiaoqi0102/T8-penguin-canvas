export const COMPLETION_SOUND_THROTTLE_MS = 5000;
export const COMPLETION_SOUND_ELIGIBLE_NODE_TYPES = ['image', 'video', 'seedance', 'audio', 'llm'] as const;

export interface CompletionSoundGateState {
  enabled: boolean;
  lastPlayedAt: number;
}

export function isCompletionSoundEligibleNodeType(nodeType?: string | null): boolean {
  return COMPLETION_SOUND_ELIGIBLE_NODE_TYPES.includes(nodeType as any);
}

export function resolveCompletionSoundNodeType(
  registeredNodeType?: string | null,
  fallbackNodeType?: string | null,
): string | undefined {
  if (isCompletionSoundEligibleNodeType(registeredNodeType)) return String(registeredNodeType);
  if (isCompletionSoundEligibleNodeType(fallbackNodeType)) return String(fallbackNodeType);
  return undefined;
}

export function shouldPlayCompletionSound(
  state: CompletionSoundGateState,
  now = Date.now(),
  throttleMs = COMPLETION_SOUND_THROTTLE_MS,
): boolean {
  if (!state.enabled) return false;
  return state.lastPlayedAt <= 0 || now - state.lastPlayedAt >= throttleMs;
}

export function nextCompletionSoundGateState(
  state: CompletionSoundGateState,
  now = Date.now(),
  throttleMs = COMPLETION_SOUND_THROTTLE_MS,
): CompletionSoundGateState {
  return shouldPlayCompletionSound(state, now, throttleMs)
    ? { ...state, lastPlayedAt: now }
    : state;
}

export function shouldNotifyCompletionSoundForNodeType(
  state: CompletionSoundGateState,
  nodeType?: string | null,
  now = Date.now(),
  throttleMs = COMPLETION_SOUND_THROTTLE_MS,
): boolean {
  return isCompletionSoundEligibleNodeType(nodeType) && shouldPlayCompletionSound(state, now, throttleMs);
}

function scheduleCompletionNote(
  ctx: AudioContext,
  master: GainNode,
  freq: number,
  startAt: number,
  len: number,
  type: OscillatorType,
) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  const endAt = startAt + len;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, endAt + 0.055);
  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start(startAt);
  oscillator.stop(endAt + 0.08);
}

let completionAudioContext: AudioContext | null = null;

function getAudioContextCtor() {
  if (typeof window === 'undefined') return;
  const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
  return AudioContextCtor as (new () => AudioContext) | undefined;
}

async function getOrCreateCompletionAudioContext(): Promise<AudioContext | null> {
  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) return null;
  if (!completionAudioContext || completionAudioContext.state === 'closed') {
    completionAudioContext = new AudioContextCtor();
  }
  if (completionAudioContext.state === 'suspended') {
    await completionAudioContext.resume();
  }
  return completionAudioContext;
}

export async function primeTaskCompletionToneAudio(): Promise<void> {
  await getOrCreateCompletionAudioContext();
}

export async function playTaskCompletionTone(): Promise<void> {
  const ctx = await getOrCreateCompletionAudioContext();
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  const startAt = ctx.currentTime + 0.018;
  scheduleCompletionNote(ctx, master, 660, startAt, 0.105, 'sine');
  scheduleCompletionNote(ctx, master, 880, startAt + 0.13, 0.135, 'triangle');
  window.setTimeout(() => {
    try {
      master.disconnect();
    } catch {
      /* ignore cleanup errors */
    }
  }, 520);
}
