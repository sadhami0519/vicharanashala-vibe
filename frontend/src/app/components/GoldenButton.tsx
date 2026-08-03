/**
 * GoldenButton — inline entry point to the motivation system.
 *
 * Renders inline within the retention dashboard h1 row, immediately
 * after the InfoPopover ("i").
 *
 * STYLING (revised 2026-08-03 after Emie said the amber-gold palette
 * clashed with the rest of the dashboard and the chip dwarfed the
 * streak badge next to it). The chip now uses the app's neutral
 * surface tokens (`bg-muted/40 border-border text-foreground`) and
 * is sized to peer with the streak badge (`h-7` / 28px, crown icon
 * at `text-base` / 16px). The amber gradient was dropped; the CTA
 * label retains the same hover-expand behaviour in app colors.
 *
 * Hover behaviour: on hover (and only when the user has not asked for
 * reduced motion), the chip expands horizontally into a pill that
 * reveals the call-to-action copy. The CTA text is hidden at narrow
 * widths (mobile / small viewports) since touch devices have no hover,
 * and the expanded pill would otherwise crowd narrow screens.
 *
 * The panel host (`MotivationPanel`) is loaded lazily on first open
 * to keep the spaced-repetition page bundle lean.
 *
 * Accessibility:
 *   - `aria-label` describes the action (full text)
 *   - `aria-expanded` reflects the panel state
 *   - `prefers-reduced-motion` disables the hover-expand
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

const CTA_LABEL = 'Ready to ascend in your court ranks?';

export interface GoldenButtonProps {
  /** Whether to render the button. Hidden on login / public pages. */
  visible?: boolean;
  /** Optional className for positioning / spacing overrides. */
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
      {/*
        Inline flex chip sized to sit on the h1's `text-2xl` (24px)
        baseline. `self-center` is the safety net if the parent flex
        row ever drifts from `items-center`. The chip uses the app's
        gold palette (border + gradient) so it reads as "ascend into
        the courts" without shouting.
      */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={CTA_LABEL}
        aria-expanded={open}
        title={CTA_LABEL}
        className={cn(
          'group inline-flex items-center self-center',
          // Size - h-7 (28px) peers with the streak badge next to it.
          // Previously h-9 (36px) + text-2xl crown; Emie flagged that
          // it dwarfed the rest of the dashboard header (2026-08-03).
          'h-7 rounded-full',
          // Neutral app colors (revised 2026-08-03): previously used
          // amber-600 + amber-800 gradient which clashed with the
          // muted dashboard palette. Now uses the same surface tokens
          // the rest of the page uses (bg-muted/40, border-border,
          // text-foreground) so the button reads as part of the UI,
          // not a separate widget.
          'border border-border bg-muted/40 text-foreground',
          'hover:bg-muted/60',
          // Typography + spacing.
          'gap-0 px-0',
          // Click feedback.
          'active:scale-95',
          // Cursor.
          'cursor-pointer',
          // Transition for the expand.
          'motion-safe:transition-all motion-safe:duration-200 motion-safe:ease-out',
          // Focus ring for keyboard users. Uses the app's primary
          // ring token so the focus indicator matches the rest of
          // the UI.
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          className,
        )}
      >
        {/*
          The crown icon is the visible glyph at rest. Sized at
          text-base (16px) to peer with the streak badge (text-sm
          14px) and the InfoPopover "i" next to it. Previously
          text-2xl (24px) which read as a separate widget.
          `flex-shrink-0` keeps it from being crushed when the pill
          expands.
        */}
        <span
          aria-hidden="true"
          className="flex items-center justify-center w-7 h-7 flex-shrink-0 text-base leading-none"
        >
          👑
        </span>

        {/*
          CTA label: revealed on hover via the same `max-w-0` ->
          `max-w-[360px]` trick as before. `whitespace-nowrap` keeps
          the text on one line. Hidden below `sm:` since touch has
          no hover. Text color now uses app tokens (text-foreground)
          since the chip background is muted.
        */}
        <span
          aria-hidden="true"
          className={cn(
            'hidden sm:inline-block',
            'text-sm font-semibold tracking-tight text-foreground',
            'overflow-hidden whitespace-nowrap',
            // Collapsed: 0 width, 0 padding, 0 opacity.
            'max-w-0 opacity-0',
            // Hover-expand (motion-safe only): reveal label.
            'motion-safe:group-hover:max-w-[360px] motion-safe:group-hover:opacity-100',
            'motion-safe:group-hover:pl-2 motion-safe:group-hover:pr-4',
            // Reduced-motion users stay on the round button only.
            'motion-reduce:max-w-0 motion-reduce:opacity-0',
          )}
        >
          {CTA_LABEL}
        </span>
      </button>
      {open && (
        <Suspense fallback={null}>
          <MotivationPanel open={open} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}