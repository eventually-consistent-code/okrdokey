/**
 * Purpose: Chart math tests — donut segments and sparkline scaling are hand
 *          rolled, so the arithmetic gets pinned here.
 * Author(s): John Reed
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(cleanup);

import { Sparkline, StatusDonut } from '../src/components/charts.js';

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
