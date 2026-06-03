import type { VideoHTMLAttributes } from 'react';
import { mergeLoopingVideoProps } from '../utils/videoPlayback';

type LoopingVideoProps = VideoHTMLAttributes<HTMLVideoElement>;

export default function LoopingVideo(props: LoopingVideoProps) {
  const merged = mergeLoopingVideoProps(props as Record<string, unknown>) as LoopingVideoProps;
  return <video {...merged} />;
}
