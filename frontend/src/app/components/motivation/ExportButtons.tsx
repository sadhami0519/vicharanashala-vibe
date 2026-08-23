/**
 * ExportButtons — PDF / JPEG export and social share for earned badges.
 *
 * v1 ships with zero new dependencies:
 *   - PDF: window.print() + a hidden printable div with @media print
 *     styles. The browser's "Save as PDF" affordance handles the rest.
 *   - JPEG: hand-rolled <canvas>, drawn via 2D context.
 *   - Share: navigator.share() with download fallback.
 *
 * v1.1 will swap the JPEG path for html2canvas + jspdf when SVG
 * badge art replaces the emoji.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';
import { BadgeProgress } from '@/types/motivation.types';

export interface ExportButtonsProps {
  badges: BadgeProgress[];
}

export function ExportButtons({
  badges,
}: ExportButtonsProps): React.JSX.Element {
  const earned = badges.filter((b) => b.earned);
  const [selected, setSelected] = useState<BadgeProgress | null>(
    earned[0] ?? null,
  );

  if (earned.length === 0) {
    return (
      <section aria-label="Export" className="text-sm text-muted-foreground">
        Earn a badge to enable export.
      </section>
    );
  }

  return (
    <section aria-label="Export" className="space-y-3">
      <h3 className="text-base font-semibold">Export & share</h3>
      {/* Selector for which badge to export */}
      <div className="flex flex-wrap gap-1">
        {earned.map((b) => (
          <button
            key={b.badge.id}
            type="button"
            onClick={() => setSelected(b)}
            className={cn(
              'px-2 py-1 rounded-md text-xs border',
              selected?.badge.id === b.badge.id
                ? 'border-[#FFA500] bg-[#FFD700]/10'
                : 'border-border hover:bg-muted',
            )}
            aria-pressed={selected?.badge.id === b.badge.id}
          >
            {b.badge.emoji} {b.badge.name}
          </button>
        ))}
      </div>
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => selected && handleExportPdf(selected)}
          disabled={!selected}
        >
          Export PDF
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => selected && handleExportJpeg(selected)}
          disabled={!selected}
        >
          Export JPEG
        </Button>
        <Button
          type="button"
          onClick={() => selected && handleShare(selected)}
          disabled={!selected}
        >
          Share
        </Button>
      </div>
      {/* Hidden printable area — only visible during window.print() */}
      {selected && <PrintableBadgeArea badge={selected} />}
    </section>
  );
}

// ── Hidden printable area ──────────────────────────────────────────────────

interface PrintableBadgeAreaProps {
  badge: BadgeProgress;
}

function PrintableBadgeArea({
  badge,
}: PrintableBadgeAreaProps): React.JSX.Element {
  return (
    <div
      id="motivation-print-area"
      className="hidden print:block fixed inset-0 bg-white text-black p-8"
      aria-hidden="true"
    >
      <div className="max-w-md mx-auto border-2 border-[#B8860B] rounded-lg p-8 text-center">
        <p className="text-6xl">{badge.badge.emoji}</p>
        <h1 className="text-3xl font-bold mt-4">{badge.badge.name}</h1>
        <p className="text-sm italic text-gray-600">{badge.badge.sanskrit}</p>
        <p className="text-lg mt-4">{badge.badge.description}</p>
        <p className="text-xs text-gray-500 mt-8">
          Awarded {badge.earnedAt?.toLocaleDateString() ?? ''}
        </p>
      </div>
    </div>
  );
}

// ── PDF (print-to-PDF) ─────────────────────────────────────────────────────

function handleExportPdf(_badge: BadgeProgress): void {
  // Toggle a print-only class on <html> so the printable area renders.
  // Restore after the print dialog closes.
  document.documentElement.classList.add('motivation-printing');
  const cleanup = () => {
    document.documentElement.classList.remove('motivation-printing');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  // Give the browser a tick to apply the class before opening the dialog.
  setTimeout(() => {
    window.print();
  }, 50);
}

// ── JPEG (canvas) ──────────────────────────────────────────────────────────

function handleExportJpeg(badge: BadgeProgress): void {
  const W = 1080;
  const H = 1080;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    alert('Could not render JPEG — your browser does not support canvas.');
    return;
  }

  // Background — gold gradient
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#FFD700');
  grad.addColorStop(1, '#FFA500');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Inner border
  ctx.strokeStyle = '#B8860B';
  ctx.lineWidth = 8;
  ctx.strokeRect(40, 40, W - 80, H - 80);

  // Emoji (large, centred)
  ctx.font = '300px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(badge.badge.emoji, W / 2, H / 2 - 80);

  // Name
  ctx.font = 'bold 72px sans-serif';
  ctx.fillText(badge.badge.name, W / 2, H / 2 + 240);

  // Description
  ctx.font = '36px sans-serif';
  ctx.fillText(badge.badge.description, W / 2, H / 2 + 320);

  // Awarded date
  ctx.font = '24px sans-serif';
  ctx.fillStyle = '#000';
  const awardedText = badge.earnedAt
    ? `Awarded ${badge.earnedAt.toLocaleDateString()}`
    : '';
  ctx.fillText(awardedText, W / 2, H / 2 + 400);

  // Trigger download
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${badge.badge.id}-badge.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/jpeg', 0.92);
}

// ── Share (navigator.share + fallback) ─────────────────────────────────────

async function handleShare(badge: BadgeProgress): Promise<void> {
  const text = `I earned the ${badge.badge.name} badge (${badge.badge.sanskrit}) on Vikram-Betaal!`;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: `${badge.badge.name} — Vikram-Betaal`,
        text,
      });
      return;
    } catch (err) {
      // User cancelled or share failed. Fall through to download.
      console.warn('navigator.share failed, falling back to download', err);
    }
  }
  // Fallback: download JPEG.
  handleExportJpeg(badge);
}