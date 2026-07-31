/**
 * Purpose: AI drafting end-to-end against the mock Anthropic server —
 *          sign up, raise an objective, open the guided wizard, draft
 *          suggestions, pick one, and land it as a real key result.
 * Author(s): John Reed
 */

import { expect, test } from '@playwright/test';

const email = `ai-${Date.now()}@example.com`;

test('wizard drafts KR suggestions with AI and creates the picked one', async ({ page }) => {
  // sign up + minimal scaffolding
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Drafty');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/password/i).fill('correct-horse-battery');
  await page.getByRole('button', { name: 'sign up' }).click();

  await expect(page.getByText('No cycles yet.')).toBeVisible();
  await page.getByRole('button', { name: 'create a cycle' }).click();
  await page.getByLabel('Name').fill('2026-Q4');
  await page.getByRole('button', { name: 'create cycle' }).click();
  await expect(page.getByText('2026-10-01 → 2026-12-31')).toBeVisible();

  await page.getByRole('link', { name: 'dashboard' }).click();
  await page.getByRole('button', { name: '+ objective' }).click();
  await page.getByLabel(/what are you trying to change/i).fill('Grow the product');
  await page.getByRole('button', { name: 'create', exact: true }).click();

  // open the guided wizard — instance key resolves, so the AI entry shows
  await page.getByText('Grow the product').click();
  await page.getByRole('button', { name: /guided/i }).click();
  await page.getByTestId('ai-draft-entry').click();

  // draft against the mock, pick the first suggestion
  await page.getByRole('button', { name: 'draft suggestions' }).click();
  await expect(page.getByTestId('ai-suggestions')).toBeVisible();
  await page.getByText('Grow weekly active users from 100 to 250').click();

  // placeholder numbers prefilled; land it
  await expect(page.getByLabel(/baseline/i)).toHaveValue('100');
  await page.getByRole('button', { name: 'review' }).click();
  await page.getByRole('button', { name: 'create key result' }).click();
  await expect(page.getByText('Grow weekly active users from 100 to 250')).toBeVisible();
});
