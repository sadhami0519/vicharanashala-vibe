/**
 * GoldenButton — floating entry point to the motivation system.
 *
 * Sits in the corner of the spaced repetition page, glows with a
 * CSS-only pulse animation, and opens a slide-in panel on click.
 * The panel host (`MotivationPanel`) is loaded lazily on first
 * open to keep the spaced-repetition page bundle lean.
 *
 * Accessibility:
 *   - `aria-label` describes the action
 *   - `aria-expanded` reflects the panel state
 *   - `prefers-reduced-motion` disables the pulse animation
 *   - `:focus-visible` adds a 2px ring for keyboard users
 */

import { useState, lazy, Suspense } from 'react';
import { cn } from '@/utils/utils';

// Lazy-load the panel so the spaced-repetition page bundle stays
// small. The motivation system is read-only and rarely visited.
const MotivationPanel = lazy(() =>
  import('./motivation/MotivationPanel').then((m) => ({
    default: m.MotivationPanel,
  })),
);

export interface GoldenButtonProps {
  /** Whether to render the button. Hidden on login / public pages. */
  visible?: boolean;
  /** Optional className for positioning overrides. */
  className?: string;
}

export function GoldenButton({
  visible = true,
  className,
}: GoldenButtonProps): React.JSX.Element | null {
  const [open, setOpen] = useState(false);

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open motivation"
        aria-expanded={open}
        className={cn(
          // Positioning — fixed bottom-right, above content, below modals.
          'fixed bottom-6 right-6 md:bottom-8 md:right-8 z-40',
          // Size — 56px on mobile, 64px on desktop.
          'h-14 w-14 md:h-16 md:w-16',
          // Shape — round, gold gradient, deep gold border.
          'rounded-full border-2 border-[#B8860B]',
          'bg-gradient-to-br from-[#FFD700] to-[#FFA500]',
          // Typography — large emoji centre.
          'flex items-center justify-center text-2xl md:text-3xl',
          // Glow + hover.
          'shadow-[0_0_24px_rgba(255,215,0,0.6)]',
          'hover:shadow-[0_0_32px_rgba(255,215,0,0.9)]',
          'hover:scale-105 active:scale-95',
          'transition-all duration-200 ease-out',
          // Pulse animation — CSS-only, 3s cycle.
          'animate-golden-pulse',
          // Focus ring for keyboard users.
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#B8860B] focus-visible:ring-offset-2',
          // Cursor.
          'cursor-pointer',
          className,
        )}
      >
        🪷
      </button>
      {open && (
        <Suspense fallback={null}>
          <MotivationPanel open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
