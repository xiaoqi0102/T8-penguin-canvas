export const LOOPING_VIDEO_DEFAULT_PROPS = {
  loop: true,
  playsInline: true,
  preload: 'metadata',
} as const;

export function mergeLoopingVideoProps<T extends Record<string, unknown>>(props: T): typeof LOOPING_VIDEO_DEFAULT_PROPS & T {
  return {
    ...LOOPING_VIDEO_DEFAULT_PROPS,
    ...props,
    loop: true,
  };
}
