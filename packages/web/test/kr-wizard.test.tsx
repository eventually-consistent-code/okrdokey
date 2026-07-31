/**
 * Purpose: Wizard tests — step flow, template prefill, interpolated review,
 *          the no-gap guard, the too-many-KRs warning, and the AI path:
 *          teaser vs entry, draft→pick→prefill, feedback→rewrite.
 * Author(s): John Reed
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { KrWizard } from '../src/components/kr-wizard.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const KR_CREATED = {
  id: 'kr-9', objectiveId: 'obj-1', title: 'Reduce p95 API latency from 500ms to 200ms',
  type: 'numeric', unit: 'ms', baseline: 500, target: 200, currentValue: 500,
  currentConfidence: null, score: 0,
};

const SUGGESTIONS = {
  suggestions: [
    { title: 'Grow weekly active users from 100 to 250', type: 'numeric', unit: 'users', baseline: 100, target: 250, rationale: 'usage is the outcome' },
    { title: 'Reduce churn from 5% to 2%', type: 'numeric', unit: '%', baseline: 5, target: 2, rationale: 'decreasing-is-good' },
  ],
};

const FEEDBACK = {
  critique: ['"Launch" is a task, not an outcome', 'no metric attached'],
  rewrite: { title: 'Grow newsletter subscribers from 0 to 500', type: 'numeric', unit: 'subs', baseline: 0, target: 500, rationale: 'countable outcome' },
};

// URL-routed fetch stub — every wizard render hits /ai/status on mount, so
// tests must dispatch by path instead of returning one canned response
function stubApi({
  aiStatus,
  onCreate = () => KR_CREATED,
  onDraft = () => SUGGESTIONS,
  onImprove = () => FEEDBACK,
}: {
  aiStatus: { enabled: boolean; keySource: string | null } | 404;
  onCreate?: () => unknown;
  onDraft?: () => unknown;
  onImprove?: () => unknown;
}): ReturnType<typeof vi.fn> {
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchMock = vi.fn(async (url: string): Promise<Response> => {
    if (url.startsWith('/ai/status')) {
      return Promise.resolve(
        aiStatus === 404
          ? json({ statusCode: 404, error: 'NotFoundError', message: 'not found' }, 404)
          : json(aiStatus),
      );
    }
    if (url === '/ai/draft-krs') return Promise.resolve(json(onDraft()));
    if (url === '/ai/improve-kr') return Promise.resolve(json(onImprove()));
    return Promise.resolve(json(onCreate(), 201));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

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
    stubApi({ aiStatus: 404 });
    renderWizard();
    expect(screen.getByText(/a number that changes/i)).toBeDefined();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Product' }));
    expect(screen.getByText(/weekly active users/i)).toBeDefined();
  });

  it('walks template → measure → review with interpolation and posts', async () => {
    const fetchMock = stubApi({ aiStatus: 404 });

    const { onClose } = renderWizard(1);
    const user = userEvent.setup();

    await user.click(screen.getByText(/p95 API latency/i));
    await user.type(screen.getByLabelText(/baseline/i), '500');
    await user.type(screen.getByLabelText(/target/i), '200');
    await user.click(screen.getByRole('button', { name: 'review' }));

    expect(screen.getByText('Reduce p95 API latency from 500ms to 200ms')).toBeDefined();
    expect(screen.getByText(/2–4 is the sweet spot/i)).toBeDefined();

    await user.click(screen.getByRole('button', { name: /create key result/i }));
    const createCall = fetchMock.mock.calls.find(([u]) => (u as string).includes('key-results'));
    expect(createCall?.[0]).toBe('/objectives/obj-1/key-results');
    expect(JSON.parse((createCall?.[1] as RequestInit).body as string) as unknown).toMatchObject({
      title: 'Reduce p95 API latency from 500ms to 200ms',
      baseline: 500,
      target: 200,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('blocks review when baseline equals target', async () => {
    stubApi({ aiStatus: 404 });
    renderWizard();
    const user = userEvent.setup();
    await user.click(screen.getByText(/p95 API latency/i));
    await user.type(screen.getByLabelText(/baseline/i), '100');
    await user.type(screen.getByLabelText(/target/i), '100');
    expect(screen.getByText(/no gap, no progress/i)).toBeDefined();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'review' }).disabled).toBe(true);
  });

  it('warns amber past 4 key results', async () => {
    stubApi({ aiStatus: 404 });
    renderWizard(5);
    const user = userEvent.setup();
    await user.click(screen.getByText(/p95 API latency/i));
    await user.type(screen.getByLabelText(/baseline/i), '9');
    await user.type(screen.getByLabelText(/target/i), '1');
    await user.click(screen.getByRole('button', { name: 'review' }));
    expect(screen.getByText(/already has 5 key results/i)).toBeDefined();
  });

  it('hides all AI affordances when the feature is off (status 404)', async () => {
    stubApi({ aiStatus: 404 });
    renderWizard();
    await waitFor(() => expect(screen.queryByTestId('ai-draft-entry')).toBeNull());
    expect(screen.queryByTestId('ai-teaser')).toBeNull();
  });

  it('teases when AI is on but no key resolves', async () => {
    stubApi({ aiStatus: { enabled: false, keySource: null } });
    renderWizard();
    expect(await screen.findByTestId('ai-teaser')).toBeDefined();
    expect(screen.queryByTestId('ai-draft-entry')).toBeNull();
  });

  it('drafts suggestions and a picked card prefills measure + review', async () => {
    const fetchMock = stubApi({ aiStatus: { enabled: true, keySource: 'team' } });
    const { onClose } = renderWizard();
    const user = userEvent.setup();

    await user.click(await screen.findByTestId('ai-draft-entry'));
    await user.type(screen.getByPlaceholderText(/pre-launch/i), 'activation matters most');
    await user.click(screen.getByRole('button', { name: /draft suggestions/i }));

    const cards = await screen.findByTestId('ai-suggestions');
    expect(cards.textContent).toContain('weekly active users');
    const draftCall = fetchMock.mock.calls.find(([u]) => u === '/ai/draft-krs');
    expect(JSON.parse((draftCall?.[1] as RequestInit).body as string) as unknown).toMatchObject({
      objectiveId: 'obj-1',
      context: 'activation matters most',
    });

    await user.click(screen.getByText('Grow weekly active users from 100 to 250'));
    // measure step, prefilled with the placeholder numbers
    expect(screen.getByLabelText<HTMLInputElement>(/baseline/i).value).toBe('100');
    expect(screen.getByLabelText<HTMLInputElement>(/target/i).value).toBe('250');

    await user.click(screen.getByRole('button', { name: 'review' }));
    await user.click(screen.getByRole('button', { name: /create key result/i }));
    const createCall = fetchMock.mock.calls.find(([u]) => (u as string).includes('key-results'));
    expect(JSON.parse((createCall?.[1] as RequestInit).body as string) as unknown).toMatchObject({
      title: 'Grow weekly active users from 100 to 250',
      type: 'numeric',
      baseline: 100,
      target: 250,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('feedback critiques the draft and the rewrite applies', async () => {
    stubApi({ aiStatus: { enabled: true, keySource: 'instance' } });
    renderWizard();
    const user = userEvent.setup();

    await user.click(screen.getByText(/p95 API latency/i));
    await user.type(screen.getByLabelText(/baseline/i), '500');
    await user.type(screen.getByLabelText(/target/i), '200');
    await user.click(await screen.findByTestId('ai-feedback'));

    expect(await screen.findByText(/task, not an outcome/i)).toBeDefined();
    await user.click(screen.getByRole('button', { name: /use this rewrite/i }));
    expect(screen.getByLabelText<HTMLInputElement>(/baseline/i).value).toBe('0');
    expect(screen.getByLabelText<HTMLInputElement>(/target/i).value).toBe('500');
    expect(screen.getByText('Grow newsletter subscribers from 0 to 500')).toBeDefined();
  });
});
