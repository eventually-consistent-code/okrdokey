/**
 * Purpose: The whole product in one walk: sign up, make a cycle, raise an
 *          objective with a decreasing-is-good KR, check in, watch the
 *          dashboard score it. Exercises SPA fallback + auth scoping + the
 *          real API in one pass.
 * Author(s): John Reed
 */

import { expect, test } from '@playwright/test';

const email = `smoke-${Date.now()}@example.com`;

test('signup → cycle → objective → check-in → dashboard', async ({ page }) => {
  // sign up
  await page.goto('/signup');
  await page.getByLabel('Name').fill('Smokey');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel(/password/i).fill('correct-horse-battery');
  await page.getByRole('button', { name: 'sign up' }).click();

  // no cycles yet — the dashboard should point us at cycle creation
  await expect(page.getByText('No cycles yet.')).toBeVisible();
  await page.getByRole('button', { name: 'create a cycle' }).click();

  // quarter shortcut
  await page.getByLabel('Name').fill('2026-Q3');
  await page.getByRole('button', { name: 'create cycle' }).click();
  await expect(page.getByText('2026-07-01 → 2026-09-30')).toBeVisible();

  // objective
  await page.getByRole('link', { name: 'dashboard' }).click();
  await page.getByRole('button', { name: '+ objective' }).click();
  await page.getByLabel(/what are you trying to change/i).fill('Reduce churn');
  await page.getByRole('button', { name: 'create', exact: true }).click();

  // open it, add a decreasing-is-good KR
  await page.getByText('Reduce churn').click();
  await page.getByRole('button', { name: '+ key result' }).click();
  await page.getByLabel('Title').fill('Churn 5% → 2%');
  await page.getByLabel('Baseline').fill('5');
  await page.getByLabel('Target').fill('2');
  await page.getByLabel('Unit').fill('%');
  await page.getByRole('button', { name: 'add', exact: true }).click();
  await expect(page.getByText('Churn 5% → 2%')).toBeVisible();

  // check in at 3.5 (halfway) with green confidence
  await page.getByRole('button', { name: 'check in' }).click();
  await page.getByLabel(/current value/i).fill('3.5');
  await page.getByRole('radio', { name: 'on it' }).click();
  await page.getByRole('button', { name: 'save check-in' }).click();

  // score lands at 0.50
  await expect(page.getByText('0.50').first()).toBeVisible();

  // dashboard reflects it
  await page.getByRole('link', { name: 'dashboard' }).click();
  await expect(page.getByText('Reduce churn')).toBeVisible();
  await expect(page.getByText('0.50').first()).toBeVisible();

  // deep-link refresh survives the SPA fallback
  await page.reload();
  await expect(page.getByText('Reduce churn')).toBeVisible();
});
