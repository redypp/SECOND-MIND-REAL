import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TutorialSpotlightProps {
  targetSelector: string;
  title: string;
  description: string;
  stepNumber: number;
  totalSteps: number;
  tooltipPosition?: 'top' | 'bottom';
  onSkip?: () => void;
  onTargetClick?: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 10;
const POLL_INTERVAL = 200;

export function TutorialSpotlight({
  targetSelector,
  title,
  description,
  stepNumber,
  totalSteps,
  tooltipPosition = 'bottom',
  onSkip,
  onTargetClick,
}: TutorialSpotlightProps) {
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // Reset dismissed state when step changes
  useEffect(() => {
    setDismissed(false);
    setVisible(false);
  }, [targetSelector]);

  // Poll for the target element position
  const updateRect = useCallback(() => {
    const el = document.querySelector(targetSelector);
    if (!el) {
      setTargetRect(null);
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      setTargetRect(null);
      return;
    }
    setTargetRect({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
  }, [targetSelector]);

  // Listen for clicks on the target element to dismiss spotlight and advance
  useEffect(() => {
    const handleClick = () => {
      setDismissed(true);
      onTargetClick?.();
    };
    const el = document.querySelector(targetSelector);
    if (el) {
      el.addEventListener('click', handleClick, { once: true });
      return () => el.removeEventListener('click', handleClick);
    }
  }, [targetSelector, visible, onTargetClick]);

  useEffect(() => {
    const showTimer = setTimeout(() => {
      updateRect();
      setVisible(true);
    }, 400);

    pollRef.current = setInterval(updateRect, POLL_INTERVAL);

    return () => {
      clearTimeout(showTimer);
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [updateRect]);

  if (!visible || !targetRect || dismissed) return null;

  const cutout = {
    top: targetRect.top - PADDING,
    left: targetRect.left - PADDING,
    width: targetRect.width + PADDING * 2,
    height: targetRect.height + PADDING * 2,
  };

  const cutoutBottom = cutout.top + cutout.height;
  const cutoutRight = cutout.left + cutout.width;

  // Tooltip positioning
  const tooltipStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 10000,
    maxWidth: 300,
    ...(tooltipPosition === 'bottom'
      ? {
          top: cutoutBottom + 16,
          left: Math.max(16, Math.min(cutout.left, window.innerWidth - 316)),
        }
      : {
          bottom: window.innerHeight - cutout.top + 16,
          left: Math.max(16, Math.min(cutout.left, window.innerWidth - 316)),
        }),
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[9998]"
        style={{ pointerEvents: 'none' }}
      >
        {/* 4 overlay regions around the cutout */}
        {/* Top */}
        <div
          style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: Math.max(0, cutout.top),
            background: 'rgba(0,0,0,0.55)',
            pointerEvents: 'auto',
          }}
        />
        {/* Bottom */}
        <div
          style={{
            position: 'absolute', top: cutoutBottom, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.55)',
            pointerEvents: 'auto',
          }}
        />
        {/* Left */}
        <div
          style={{
            position: 'absolute', top: cutout.top, left: 0,
            width: Math.max(0, cutout.left),
            height: cutout.height,
            background: 'rgba(0,0,0,0.55)',
            pointerEvents: 'auto',
          }}
        />
        {/* Right */}
        <div
          style={{
            position: 'absolute', top: cutout.top, left: cutoutRight,
            right: 0,
            height: cutout.height,
            background: 'rgba(0,0,0,0.55)',
            pointerEvents: 'auto',
          }}
        />

        {/* Spotlight ring */}
        <div
          style={{
            position: 'absolute',
            top: cutout.top - 2,
            left: cutout.left - 2,
            width: cutout.width + 4,
            height: cutout.height + 4,
            borderRadius: 16,
            border: '2px solid rgba(255,255,255,0.25)',
            pointerEvents: 'none',
          }}
        />

        {/* Tooltip */}
        <motion.div
          initial={{ opacity: 0, y: tooltipPosition === 'bottom' ? -8 : 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.25 }}
          style={{ ...tooltipStyle, pointerEvents: 'auto' }}
        >
          <div className="bg-card border border-border rounded-2xl shadow-elevated p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <span className="text-[10px] font-semibold text-primary uppercase tracking-wider">
                Step {stepNumber} of {totalSteps}
              </span>
            </div>
            <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
