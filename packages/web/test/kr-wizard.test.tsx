/**
 * Purpose: Wizard tests — step flow, template prefill, interpolated review,
 *          the no-gap guard, and the too-many-KRs warning.
 * Author(s): John Reed
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KrWizard } from '../src/components/kr-wizard.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderWizard(existingKrCount = 0): { onClose: ReturnType<typeof vi.fn> } {
  const onClose = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <KrWizard objectiveId="obj-1" existingKrCount={existingKrCount} onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

describe('KrWizard', () => {
  it('teaches the lesson up front and shows category templates', async () => {
    renderWizard();
    expect(screen.getByText(/a number that changes/i)).toBeDefined();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Product' }));
    expect(screen.getByText(/weekly active users/i)).toBeDefined();
  });

  it('walks template → measure → review with interpolation and posts', async () => {
    const fetchMock = vi.fn(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'kr-9', objectiveId: 'obj-1', title: 'Reduce p95 API latency from 500ms to 200ms',
            type: 'numeric', unit: 'ms', baseline: 500, target: 200, currentValue: 500,
            currentConfidence: null, score: 0,
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { onClose } = renderWizard(1);
    const user = userEvent.setup();

    await user.click(screen.getByText(/p95 API latency/i));
    await user.type(screen.getByLabelText(/baseline/i), '500');
    await user.type(screen.getByLabelText(/target/i), '200');
    await user.click(screen.getByRole('button', { name: 'review' }));

    expect(screen.getByText('Reduce p95 API latency from 500ms to 200ms')).toBeDefined();
    expect(screen.getByText(/2–4 is the sweet spot/i)).toBeDefined();

    await user.click(screen.getByRole('button', { name: /create key result/i }));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/objectives/obj-1/key-results');
    expect(JSON.parse(init.body as string) as unknown).toMatchObject({
      title: 'Reduce p95 API latency from 500ms to 200ms',
      baseline: 500,
      target: 200,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('blocks review when baseline equals target', async () => {
    renderWizard();
    const user = userEvent.setup();
    await user.click(screen.getByText(/p95 API latency/i));
    await user.type(screen.getByLabelText(/baseline/i), '100');
    await user.type(screen.getByLabelText(/target/i), '100');
    expect(screen.getByText(/no gap, no progress/i)).toBeDefined();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'review' }).disabled).toBe(true);
  });

  it('warns amber past 4 key results', async () => {
    renderWizard(5);
    const user = userEvent.setup();
    await user.click(screen.getByText(/p95 API latency/i));
    await user.type(screen.getByLabelText(/baseline/i), '9');
    await user.type(screen.getByLabelText(/target/i), '1');
    await user.click(screen.getByRole('button', { name: 'review' }));
    expect(screen.getByText(/already has 5 key results/i)).toBeDefined();
  });
});
