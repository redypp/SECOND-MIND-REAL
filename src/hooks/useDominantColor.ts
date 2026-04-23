import { useEffect, useState } from 'react';

/**
 * useDominantColor — extract the average color of an image via a tiny
 * canvas draw. The trick: drawing any image onto a 1×1 canvas lets the
 * browser do the averaging for us — the resulting pixel's RGB is the
 * image's mean color. Cheap, no dependency.
 *
 * Falls back to a warm ink color if:
 *   - the image fails to load
 *   - the image is cross-origin without permissive CORS (canvas becomes tainted)
 *
 * Results are cached per-URL so switching back and forth through the
 * carousel doesn't re-decode.
 */

const FALLBACK = 'hsl(220 12% 10%)';
const cache = new Map<string, string>();

export function useDominantColor(src?: string | null): string {
  const [color, setColor] = useState<string>(() => (src && cache.get(src)) || FALLBACK);

  useEffect(() => {
    if (!src) {
      setColor(FALLBACK);
      return;
    }
    const cached = cache.get(src);
    if (cached) {
      setColor(cached);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('no 2d context');
        // Drawing the image into a 1×1 canvas averages its pixels for us.
        ctx.drawImage(img, 0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        // Nudge toward darker so the cover card still reads well on top.
        const dim = (v: number) => Math.round(v * 0.78);
        const result = `rgb(${dim(r)}, ${dim(g)}, ${dim(b)})`;
        cache.set(src, result);
        setColor(result);
      } catch {
        // Tainted canvas (cross-origin without CORS) — swallow and use fallback.
        setColor(FALLBACK);
      }
    };
    img.onerror = () => {
      if (!cancelled) setColor(FALLBACK);
    };
    img.src = src;

    return () => {
      cancelled = true;
    };
  }, [src]);

  return color;
}
