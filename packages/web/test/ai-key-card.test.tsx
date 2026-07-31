/**
 * Purpose: AI key panel tests — hidden when the feature is off, entry →
 *          save → masked last-4, server rejection surfaces, revoke.
 * Author(s): John Reed
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AiKeyCard } from '../src/components/ai-key-card.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const KEY_ROW = {
  teamId: 'team-1',
  keyLast4: 'wxyz',
  createdAt: '2026-07-30T12:00:00.000Z',
  lastUsedAt: null,
};

function stubApi({
  featureOn,
  hasKey,
  putStatus = 200,
}: {
  featureOn: boolean;
  hasKey: boolean;
  putStatus?: number;
}): ReturnType<typeof vi.fn> {
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    if (url.startsWith('/ai/status')) {
      return Promise.resolve(
        featureOn
          ? json({ enabled: false, keySource: null })
          : json({ statusCode: 404, error: 'NotFoundError', message: 'not found' }, 404),
      );
    }
    if (url.endsWith('/ai-key') && init?.method === 'PUT') {
      return Promise.resolve(
        putStatus === 200
          ? json(KEY_ROW)
          : json({ statusCode: 400, error: 'BadRequestError', message: 'Anthropic rejected this key — check it and try again' }, 400),
      );
    }
    if (url.endsWith('/ai-key') && init?.method === 'DELETE') {
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    // GET current key
    return Promise.resolve(
      hasKey ? json(KEY_ROW) : json({ statusCode: 404, error: 'NotFoundError', message: 'no team key set' }, 404),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderCard(): void {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <AiKeyCard teamId="team-1" />
    </QueryClientProvider>,
  );
}

describe('AiKeyCard', () => {
  it('renders nothing when the AI feature is off', async () => {
    stubApi({ featureOn: false, hasKey: false });
    renderCard();
    await waitFor(() => expect(screen.queryByText(/AI drafting/i)).toBeNull());
  });

  it('shows masked last-4 and revoke when a key exists', async () => {
    const fetchMock = stubApi({ featureOn: true, hasKey: true });
    renderCard();
    expect((await screen.findByTestId('ai-key-masked')).textContent).toContain('wxyz');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'revoke' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, i]) => (i as RequestInit | undefined)?.method === 'DELETE')).toBe(true),
    );
  });

  it('saves an entered key through PUT', async () => {
    const fetchMock = stubApi({ featureOn: true, hasKey: false });
    renderCard();
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('ai-key-input'), 'sk-ant-test-good-key-aaaaaaaaaaaa');
    await user.click(screen.getByRole('button', { name: /save key/i }));
    await waitFor(() => {
      const put = fetchMock.mock.calls.find(([, i]) => (i as RequestInit | undefined)?.method === 'PUT');
      expect(put).toBeDefined();
      expect(JSON.parse((put?.[1] as RequestInit).body as string) as unknown).toMatchObject({
        key: 'sk-ant-test-good-key-aaaaaaaaaaaa',
      });
    });
  });

  it('surfaces the server rejection verbatim', async () => {
    stubApi({ featureOn: true, hasKey: false, putStatus: 400 });
    renderCard();
    const user = userEvent.setup();
    await user.type(await screen.findByTestId('ai-key-input'), 'sk-ant-test-bad-key-bbbbbbbbbbbbb');
    await user.click(screen.getByRole('button', { name: /save key/i }));
    expect(await screen.findByText(/Anthropic rejected this key/i)).toBeDefined();
  });
});
