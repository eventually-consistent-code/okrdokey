/**
 * Purpose: Hand-rolled SVG charts — a status donut and a check-in sparkline.
 *          Zero chart deps; ~60 lines buys everything two static charts need.
 * Author(s): John Reed
 */

import type { ReactNode } from 'react';

const DONUT_COLORS = ['var(--color-rag-green)', 'var(--color-rag-yellow)', 'var(--color-rag-red)'];

// counts: [on-track, at-risk, behind]
export function StatusDonut({ counts }: { counts: [number, number, number] }): ReactNode {
  const total = counts[0] + counts[1] + counts[2];
  const C = 2 * Math.PI * 40;
  let offset = 0;
  return (
    <svg viewBox="0 0 100 100" className="size-28" role="img" aria-label="status breakdown">
      <circle cx="50" cy="50" r="40" fill="none" stroke="var(--color-line)" strokeWidth="12" />
      {total > 0 &&
        counts.map((n, i) => {
          const frac = n / total;
          const seg = (
            <circle
              key={i}
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke={DONUT_COLORS[i]}
              strokeWidth="12"
              strokeDasharray={`${frac * C} ${C}`}
              strokeDashoffset={-offset * C}
              transform="rotate(-90 50 50)"
            />
          );
          offset += frac;
          return seg;
        })}
      <text
        x="50"
        y="55"
        textAnchor="middle"
        className="ledger-num"
        fontSize="20"
        fill="var(--color-ink)"
      >
        {total}
      </text>
    </svg>
  );
}

export function Sparkline({ values }: { values: number[] }): ReactNode {
  if (values.length < 2) {
    return <span className="text-xs text-ink-soft">not enough check-ins for a trend yet…</span>;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${28 - ((v - min) / span) * 24}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 32" className="h-8 w-full" preserveAspectRatio="none" role="img" aria-label="check-in trend">
      <polyline points={pts} fill="none" stroke="var(--color-ember)" strokeWidth="1.5" />
    </svg>
  );
}
