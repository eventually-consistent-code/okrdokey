/**
 * Purpose: Cycle rollover end-to-end — progress in one cycle, roll it
 *          forward from the cycles page, and find the objective reborn in
 *          the next cycle with a fresh baseline while the source closes.
 * Author(s): John Reed
 */

import { expect, test } from '@playwright/test';

const email = `roll-${Date.now()}@example.com`;

test('close + rollover carries unfinished work into the next cycle', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Roller');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/password/i).fill('correct-horse-battery');
  await page.getByRole('button', { name: 'sign up' }).click();

  // two cycles (unique names — cycles are instance-global across specs)
  // cycles are instance-global: an earlier spec may have created some, so
  // go straight to the cycles page (ai-draft.spec owns the empty-state check)
  await page.getByRole('link', { name: 'cycles' }).click();
  await page.getByLabel('Name').fill('2027-Q1');
  await page.getByRole('button', { name: 'create cycle' }).click();
  await expect(page.getByText('2027-01-01 → 2027-03-31')).toBeVisible();
  await page.getByLabel('Name').fill('2027-Q2');
  await page.getByRole('button', { name: 'create cycle' }).click();
  await expect(page.getByText('2027-04-01 → 2027-06-30')).toBeVisible();

  // objective with a mid-flight KR in Q1 — pin the picker first, the
  // default is whatever open cycle sorts first instance-wide
  await page.getByRole('link', { name: 'dashboard' }).click();
  await page.getByRole('combobox').selectOption({ label: '2027-Q1' });
  await page.getByRole('button', { name: '+ objective' }).click();
  await page.getByLabel(/what are you trying to change/i).fill('Halve support load');
  await page.getByRole('button', { name: 'create', exact: true }).click();
  await page.getByText('Halve support load').click();
  await page.getByRole('button', { name: '+ key result' }).click();
  await page.getByLabel('Title').fill('Tickets 100 → 50');
  await page.getByLabel('Baseline').fill('100');
  await page.getByLabel('Target').fill('50');
  await page.getByRole('button', { name: 'add', exact: true }).click();
  await page.getByRole('button', { name: 'check in' }).click();
  await page.getByLabel(/current value/i).fill('80');
  await page.getByRole('radio', { name: 'on it' }).click();
  await page.getByRole('button', { name: 'save check-in' }).click();
  await expect(page.getByText('0.40').first()).toBeVisible();

  // roll Q1 forward into Q2
  await page.getByRole('link', { name: 'cycles' }).click();
  const q1Card = page.locator('.rise', { hasText: '2027-01-01 → 2027-03-31' }).first();
  await q1Card.getByRole('button', { name: 'roll over…' }).click();
  await page.getByRole('combobox').selectOption({ label: '2027-Q2' });
  await page.getByRole('button', { name: 'roll forward' }).click();
  await expect(page.getByText(/1 objectives · 1 key results/i)).toBeVisible();
  await page.getByRole('button', { name: 'done' }).click();

  // source closed, clone lives in Q2 with a fresh baseline
  await expect(q1Card.getByText('closed')).toBeVisible();
  await page.getByRole('link', { name: 'dashboard' }).click();
  await page.getByRole('combobox').selectOption({ label: '2027-Q2' });
  await page.getByText('Halve support load').click();
  await expect(page.getByText(/baseline 80/)).toBeVisible();
  await expect(page.getByText('0.00').first()).toBeVisible();
});
