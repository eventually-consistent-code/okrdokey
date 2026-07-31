/**
 * Purpose: Rollover dialog + data card tests — happy path with the
 *          re-link warning, and the import preview/error/commit flow.
 * Author(s): John Reed
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DataCard } from '../src/components/data-card.js';
import { RolloverDialog } from '../src/components/rollover-dialog.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CYCLES = [
  { id: 'c1', name: '2026-Q3', startsOn: '2026-07-01', endsOn: '2026-09-30', status: 'open' as const },
  { id: 'c2', name: '2026-Q4', startsOn: '2026-10-01', endsOn: '2026-12-31', status: 'open' as const },
  { id: 'c0', name: '2026-Q2', startsOn: '2026-04-01', endsOn: '2026-06-30', status: 'closed' as const },
];

function withClient(node: React.ReactElement): React.ReactElement {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{node}</QueryClientProvider>;
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('RolloverDialog', () => {
  it('offers only other open cycles, rolls, and shows the re-link warning', async () => {
    const fetchMock = vi.fn(async () =>
      Promise.resolve(
        json({
          clonedObjectives: 2,
          clonedKeyResults: 3,
          skippedObjectives: 1,
          skippedKeyResults: 1,
          hadLinks: [{ title: 'Issues 0→20' }],
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(withClient(<RolloverDialog source={CYCLES[0]!} cycles={CYCLES} onClose={vi.fn()} />));
    // target select excludes the source and the closed cycle
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['2026-Q4']);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /roll forward/i }));

    expect(await screen.findByText(/2 objectives · 3 key results/i)).toBeDefined();
    expect(screen.getByText(/re-link these key results/i)).toBeDefined();
    expect(screen.getByText(/Issues 0→20/)).toBeDefined();

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/cycles/c1/rollover');
    expect(JSON.parse(init.body as string) as unknown).toMatchObject({
      targetCycleId: 'c2',
      archiveSource: true,
    });
  });
});

describe('DataCard import flow', () => {
  it('previews, surfaces row errors, then commits a clean import', async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return Promise.resolve(
          json({
            dryRun: true,
            creates: { objectives: 0, keyResults: 0 },
            preview: [],
            errors: [{ line: 2, message: 'unknown cycle "2099-Q9"' }],
          }),
        );
      }
      if (call === 2) {
        return Promise.resolve(
          json({
            dryRun: true,
            creates: { objectives: 1, keyResults: 2 },
            preview: [{ title: 'Grow', teamName: null, cycleName: '2026-Q4', keyResults: 2 }],
            errors: [],
          }),
        );
      }
      return Promise.resolve(
        json({
          dryRun: false,
          creates: { objectives: 1, keyResults: 2 },
          preview: [],
          errors: [],
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(withClient(<DataCard />));
    const user = userEvent.setup();
    const box = screen.getByTestId('import-csv');

    // bad preview: error row, no commit button
    await user.type(box, 'header...');
    await user.click(screen.getByRole('button', { name: /preview import/i }));
    expect(await screen.findByText(/unknown cycle/)).toBeDefined();
    expect(screen.queryByRole('button', { name: /^import/i })).toBeNull();

    // clean preview → commit appears → import
    await user.type(box, 'more');
    await user.click(screen.getByRole('button', { name: /preview import/i }));
    expect(await screen.findByText(/Grow — 2 KRs/)).toBeDefined();
    await user.click(screen.getByRole('button', { name: /import 1 objectives/i }));
    expect(await screen.findByTestId('import-done')).toBeDefined();
  });
});
