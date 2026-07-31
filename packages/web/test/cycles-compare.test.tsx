/**
 * Purpose: Cycle-over-cycle compare strip — two cycles render rows with
 *          avg-score bars and status counts from their summaries; a lone
 *          cycle shows no strip.
 * Author(s): John Reed
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CyclesPage } from '../src/pages/cycles.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CYCLES = [
  { id: 'c2', name: '2026-Q4', startsOn: '2026-10-01', endsOn: '2026-12-31', status: 'open' },
  { id: 'c1', name: '2026-Q3', startsOn: '2026-07-01', endsOn: '2026-09-30', status: 'closed' },
];

function summaryFor(id: string): unknown {
  const cycle = CYCLES.find((c) => c.id === id);
  const objectives =
    id === 'c1'
      ? [
          { id: 'o1', title: 'A', teamId: null, ownerUserId: 'u', score: 0.8, status: 'on-track', trend: [] },
          { id: 'o2', title: 'B', teamId: null, ownerUserId: 'u', score: 0.4, status: 'behind', trend: [] },
        ]
      : [{ id: 'o3', title: 'C', teamId: null, ownerUserId: 'u', score: 0.5, status: 'at-risk', trend: [] }];
  return {
    cycle,
    elapsed: 1,
    objectives,
    teams: [],
    personal: { avgScore: 0, counts: { 'on-track': 0, 'at-risk': 0, behind: 0 } },
  };
}

function stubApi(cycles: typeof CYCLES): void {
  const json = (body: unknown): Response =>
    new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string): Promise<Response> => {
      if (url === '/cycles') return Promise.resolve(json(cycles));
      const m = /^\/cycles\/([^/]+)\/summary$/.exec(url);
      if (m) return Promise.resolve(json(summaryFor(m[1] ?? '')));
      return Promise.resolve(json({}));
    }),
  );
}

function renderPage(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CyclesPage />
    </QueryClientProvider>,
  );
}

describe('cycle-over-cycle compare', () => {
  it('renders a row per cycle with avg score and status counts', async () => {
    stubApi(CYCLES);
    renderPage();
    expect(await screen.findByText(/cycle over cycle/i)).toBeDefined();
    // Q3: mean(0.8, 0.4) = 0.60 with 1 on-track / 0 at-risk / 1 behind
    expect(await screen.findByText('0.60')).toBeDefined();
    // Q4: single at-risk objective at 0.50
    expect(await screen.findByText('0.50')).toBeDefined();
    const bars = document.querySelectorAll('.bg-ember');
    expect(bars.length).toBeGreaterThanOrEqual(2);
  });

  it('shows no strip with fewer than two cycles', async () => {
    stubApi([CYCLES[0]!]);
    renderPage();
    await waitFor(() => expect(screen.queryByText(/cycle over cycle/i)).toBeNull());
  });
});
