import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';

const base = 'http://127.0.0.1:4319';
const browser = await chromium.launch({
  headless: true,
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const results: { timestamp: string; apiRequests: string[]; errors: string[]; scans: unknown[]; passed: boolean } = {
  timestamp: new Date().toISOString(), apiRequests: [], errors: [], scans: [], passed: false,
};
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('request', r => {
    if (r.url().includes('/api/') || r.url().includes('groq.com')) results.apiRequests.push(r.url());
  });
  page.on('pageerror', e => results.errors.push(e.message));
  page.on('console', e => { if (e.type() === 'error') results.errors.push(e.text()); });
  async function scan(name: string) {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    results.scans.push({ name, violations: result.violations });
    assert.deepEqual(result.violations, [], name);
  }
  await page.goto(base);
  await page.locator('.studio-desk h1').waitFor();
  await expect(page.getByRole('button', { name: 'Bring your thesis' })).toBeDisabled();
  await expect(page.getByText('Interactive sample preview · scripted cues, no AI · resets on reload')).toBeVisible();
  await page.screenshot({ path: 'artifacts/preview-desktop.png', fullPage: true, animations: 'disabled' });
  await scan('static preview desktop');
  await page.getByRole('button', { name: /^Timed mock defense/ }).click();
  await expect(page.getByRole('radio', { name: /Mock defense/ })).toBeChecked();
  await page.getByRole('button', { name: 'Enter the rehearsal room' }).click();
  await page.getByLabel('Your answer', { exact: true }).fill('This synthetic proposal contains no collected findings.');
  await page.getByRole('button', { name: 'Submit answer', exact: true }).click();
  await page.getByRole('heading', { name: 'Keep your train of thought.' }).waitFor();
  await expect(page.getByText('Scripted example · not an assessment', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await page.getByRole('button', { name: 'End & review' }).click();
  await page.getByRole('heading', { name: 'Build a clearer response.' }).waitFor();
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(base);
  await page.getByRole('button', { name: /^Guided practice/ }).click();
  await page.getByRole('button', { name: 'Enter the rehearsal room' }).click();
  await page.getByRole('button', { name: /Open evidence notebook/ }).click();
  await page.getByRole('button', { name: 'Answer guide', exact: true }).click();
  await expect(page.locator('.answer-guide')).toBeVisible();
  await scan('static preview mobile notebook');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(results.apiRequests, []);
  assert.deepEqual(results.errors, []);
  results.passed = true;
} finally {
  await browser.close();
  writeFileSync('artifacts/preview-qa.json', JSON.stringify(results, null, 2) + '\n');
}
console.log(JSON.stringify(results, null, 2));
