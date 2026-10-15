import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'motion/react';

/* Counts a number up from 0 when it scrolls into view. Keeps any prefix or
   suffix ("$140K", "92%"). Shows the final value immediately for people who
   prefer reduced motion. */
export function CountUp({ value, duration = 1200, delay = 0 }: { value: string; duration?: number; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const visible = useInView(ref, { once: true, amount: .6 });
  const reduce = useReducedMotion();
  const match = value.match(/^([^\d]*)(\d+(?:\.\d+)?)(.*)$/);
  const [shown, setShown] = useState(reduce || !match ? match?.[2] ?? value : '0');
  useEffect(() => {
    if (!visible || !match || reduce) { if (match) setShown(match[2]); return; }
    const target = Number(match[2]);
    const decimals = (match[2].split('.')[1] ?? '').length;
    let frame = 0; let started = 0;
    const tick = (now: number) => {
      if (!started) started = now + delay;
      const progress = Math.min(1, Math.max(0, (now - started) / duration));
      setShown((target * (1 - Math.pow(1 - progress, 4))).toFixed(decimals));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [visible, value, reduce]);
  return <span ref={ref} style={{ fontVariantNumeric: 'tabular-nums' }}>{match ? <>{match[1]}{shown}{match[3]}</> : value}</span>;
}

export const easeOut = [0.22, 1, 0.36, 1] as const;
