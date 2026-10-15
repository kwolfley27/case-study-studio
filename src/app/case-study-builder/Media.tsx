import type { ImgHTMLAttributes } from 'react';
import { useReducedMotion } from './MotionKit';

/* An image slot's picture, or a looping video when the slot holds one (a timelapse, a prototype
   recording). Videos play silently on a loop; with Reduce Motion they wait for a click. */
export const isVideo = (src?: string) => !!src && (/^data:video\//.test(src) || /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(src));

export function Media({ src, alt, className, style, draggable, loading: _loading, ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  const reduce = useReducedMotion();
  if (isVideo(src)) return <video ref={el => { if (el) { el.muted = true; el.setAttribute("muted", ""); } }} className={`csb-media-video ${className ?? ""}`} style={style} src={src} aria-label={alt || undefined} muted loop playsInline autoPlay={!reduce} controls={reduce} preload="metadata" draggable={draggable} />;
  return <img src={src} alt={alt} className={className} style={style} draggable={draggable} loading={_loading} {...rest} />;
}
