/**
 * Purpose: Check-in dialog tests — the sub-30-second flow must actually post
 *          value + confidence + note to the right endpoint.
 * Author(s): John Reed
 */

import type { KeyResultResponse } from '@okrdokey/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CheckInDialog } from '../src/components/check-in-dialog.js';

const kr: KeyResultResponse = {
  id: 'kr-1',
  objectiveId: 'obj-1',
  title: 'Churn 5% → 2%',
  type: 'numeric',
  unit: '%',
  baseline: 5,
  target: 2,
  currentValue: 3.5,
  currentConfidence: 'green',
  score: 0.5,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDialog(onClose = vi.fn()): { onClose: ReturnType<typeof vi.fn> } {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CheckInDialog kr={kr} objectiveId="obj-1" onClose={onClose} />
    </QueryClientProvider>,
  );
  return { onClose };
}

describe('CheckInDialog', () => {
  it('shows the KR and defaults to its current value', () => {
    renderDialog();
    expect(screen.getByText('Churn 5% → 2%')).toBeDefined();
    expect((screen.getByLabelText(/current value/i) as HTMLInputElement).value).toBe('3.5');
  });

  it('posts value + picked confidence + note, then closes', async () => {
    const fetchMock = vi.fn(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'ci-1',
            keyResultId: 'kr-1',
            value: 3.1,
            confidence: 'red',
            note: 'rough week',
            authorUserId: 'u1',
            createdAt: new Date().toISOString(),
          }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { onClose } = renderDialog();
    const user = userEvent.setup();

    const value = screen.getByLabelText(/current value/i);
    await user.clear(value);
    await user.type(value, '3.1');
    await user.click(screen.getByRole('radio', { name: /in trouble/i }));
    await user.type(screen.getByLabelText(/note/i), 'rough week');
    await user.click(screen.getByRole('button', { name: /save check-in/i }));

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/key-results/kr-1/check-ins');
    expect(JSON.parse(String(init.body))).toMatchObject({
      value: 3.1,
      confidence: 'red',
      note: 'rough week',
    });
    expect(onClose).toHaveBeenCalled();
  });
});
