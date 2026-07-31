/**
 * Purpose: Chart math tests — donut segments and sparkline scaling are hand
 *          rolled, so the arithmetic gets pinned here.
 * Author(s): John Reed
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

import { Sparkline, StatusDonut, TimeLine } from '../src/components/charts.js';

describe('StatusDonut', () => {
  it('renders one segment per non-zero bucket and the total in the middle', () => {
    const { container, getByText } = render(<StatusDonut counts={[2, 1, 1]} />);
    // 1 track circle + 3 segments
    expect(container.querySelectorAll('circle')).toHaveLength(4);
    expect(getByText('4')).toBeDefined();
  });

  it('shows only the track when empty', () => {
    const { container, getByText } = render(<StatusDonut counts={[0, 0, 0]} />);
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(getByText('0')).toBeDefined();
  });
});

describe('Sparkline', () => {
  it('scales points across the full width', () => {
    const { container } = render(<Sparkline values={[1, 2, 3]} />);
    const pts = container.querySelector('polyline')?.getAttribute('points') ?? '';
    const xs = pts.split(' ').map((p) => Number(p.split(',')[0]));
    expect(xs[0]).toBe(0);
    expect(xs[2]).toBe(100);
  });

  it('degrades gracefully below two points', () => {
    const { getByText } = render(<Sparkline values={[1]} />);
    expect(getByText(/not enough check-ins/i)).toBeDefined();
  });

  it('tone drives the stroke; accent is the fallback', () => {
    for (const [tone, cssVar] of [
      ['red', '--color-rag-red'],
      ['yellow', '--color-rag-yellow'],
      ['green', '--color-rag-green'],
    ] as const) {
      const { container, unmount } = render(<Sparkline values={[1, 2]} tone={tone} />);
      expect(container.querySelector('polyline')?.getAttribute('stroke')).toBe(`var(${cssVar})`);
      unmount();
    }
    const { container } = render(<Sparkline values={[1, 2]} />);
    expect(container.querySelector('polyline')?.getAttribute('stroke')).toBe('var(--color-ember)');
  });
});

describe('TimeLine', () => {
  const pts = [
    { createdAt: '2026-07-01T00:00:00.000Z', score: 0 },
    { createdAt: '2026-07-08T00:00:00.000Z', score: 0.5 },
    { createdAt: '2026-07-31T00:00:00.000Z', score: 1 },
  ];

  it('spaces points by time, not index', () => {
    const { container } = render(<TimeLine points={pts} />);
    const xs = (container.querySelector('polyline')?.getAttribute('points') ?? '')
      .split(' ')
      .map((p) => Number(p.split(',')[0]));
    // 7 days of 30 → ~23%, decidedly not the midpoint an index axis would give
    expect(xs[0]).toBe(0);
    expect(xs[1]).toBeGreaterThan(20);
    expect(xs[1]).toBeLessThan(28);
    expect(xs[2]).toBe(100);
  });

  it('labels the span and takes a tone', () => {
    const { container, getByText } = render(<TimeLine points={pts} tone="green" />);
    expect(getByText('2026-07-01')).toBeDefined();
    expect(getByText('2026-07-31')).toBeDefined();
    expect(container.querySelector('polyline')?.getAttribute('stroke')).toBe('var(--color-rag-green)');
  });

  it('degrades below two points', () => {
    const { getByText } = render(<TimeLine points={[pts[0]!]} />);
    expect(getByText(/not enough check-ins/i)).toBeDefined();
  });
});
