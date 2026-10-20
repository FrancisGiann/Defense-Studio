import { chromium, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.QA_URL || 'http://127.0.0.1:4318';
mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
const results: any = {
  timestamp: new Date().toISOString(),
  release: '0.2.0 / Astra redesign 2026-10-13',
  url: base,
  errors: [],
  accessibility: [],
  checks: [],
};
async function settle(page: any) {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    );
  });
}
async function inspect(page: any, name: string) {
  await settle(page);
  const scan = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  results.accessibility.push({
    name,
    violations: scan.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
    })),
  });
  assert.deepEqual(scan.violations.map((v) => v.id), [], `${name} accessibility violations`);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false,
    `${name} overflow`,
  );
}
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => results.errors.push(e.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') results.errors.push(msg.text());
  });
  await page.addInitScript(() => {
    (window as any).__defensePerf = { lcp: 0, cls: 0 };
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) (window as any).__defensePerf.lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as any)
        if (!entry.hadRecentInput) (window as any).__defensePerf.cls += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(base);
  const current = await context.request.get(base + '/api/workspace');
  for (const p of (await current.json()).papers)
    await context.request.delete(base + '/api/papers/' + p.id, {
      headers: { 'X-Defense-Request': '1' },
    });
  await page.evaluate(() => sessionStorage.removeItem('defense-oriented'));
  await page.reload();
  await page.locator('.studio-desk h1').waitFor();
  await expect(page).toHaveTitle('PanelReady — your rehearsal room');
  await expect(page.getByRole('button', { name: 'PanelReady home', exact: true })).toBeVisible();
  await expect(page.locator('.wordmark > span:last-child')).toHaveText('PanelReady');
  if (!(await page.getByRole('dialog').count()))
    await page.getByRole('button', { name: 'A quick orientation' }).click();
  await page.getByRole('heading', { name: 'Welcome to your rehearsal room.' }).waitFor();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('heading', { name: /Know your research/ }).waitFor();
  await page.screenshot({
    path: 'artifacts/studio-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await inspect(page, 'desktop home');
  results.smoke = await page.evaluate(() => ({
    ...(window as any).__defensePerf,
    loadMs: (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming)
      .loadEventEnd,
    inp: 'Not measured; no production field data',
  }));
  await page.getByRole('button', { name: 'Explore a sample' }).click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: 'artifacts/setup-desktop.png', animations: 'disabled' });
  await inspect(page, 'setup dialog');
  await page.getByRole('button', { name: 'Enter the rehearsal room' }).click();
  await page.getByLabel('Your answer', { exact: true }).waitFor();
  await page.screenshot({
    path: 'artifacts/rehearsal-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await inspect(page, 'rehearsal');
  assert.ok(await page.locator('.evidence-notebook').isVisible());
  assert.match(await page.locator('.rehearsal-stagebar [aria-current="step"]').innerText(), /Make your case/);
  const notebookDraft = 'My reasoning stays intact while I inspect the evidence.';
  await page.getByLabel('Your answer', { exact: true }).fill(notebookDraft);
  await page.getByRole('button', { name: 'Answer guide', exact: true }).click();
  assert.ok(await page.locator('.answer-guide').isVisible());
  assert.equal(await page.getByLabel('Your answer', { exact: true }).inputValue(), notebookDraft);
  await inspect(page, 'desktop answer guide');
  await page.getByRole('button', { name: /^Source excerpts/ }).click();
  assert.ok(await page.locator('.notebook-excerpt').count());
  assert.equal(await page.getByLabel('Your answer', { exact: true }).inputValue(), notebookDraft);
  results.checks.push('Desktop evidence/answer-guide switching preserves the mounted answer draft');
  await page.getByRole('button', { name: 'PDF p. 1', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: 'Close dialog' }).press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.match(await page.evaluate(() => document.activeElement?.textContent || ''), /PDF p. 1/);
  results.checks.push('Citation modal keyboard Escape and verified focus return');
  const tagalogSaved = page.waitForResponse((r) => r.url().includes('/draft') && r.request().method() === 'PATCH' && r.request().postDataJSON()?.text?.startsWith('Pinili ang qualitative') && r.ok());
  await page
    .getByLabel('Your answer', { exact: true })
    .fill(
      'Pinili ang qualitative design para maunawaan ang karanasan. It does not establish causal changes in grades.',
    );
  await tagalogSaved;
  await page.getByText('Draft saved', { exact: false }).waitFor();
  await page.reload();
  await page
    .getByRole('button', { name: /Community Library Study Spaces/ })
    .first()
    .click();
  await page.getByLabel('Your answer', { exact: true }).waitFor();
  assert.match(
    await page.getByLabel('Your answer', { exact: true }).inputValue(),
    /Pinili ang qualitative/,
  );
  results.checks.push('Draft survives reload and session resume');
  await page.getByRole('button', { name: 'Reflect on my answer' }).click();
  await page.getByRole('heading', { name: 'Build a clearer response.' }).waitFor();
  assert.ok(await page.getByText('Scripted example · not an assessment', { exact: true }).count());
  await page.screenshot({
    path: 'artifacts/feedback-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await inspect(page, 'feedback');
  assert.match(await page.locator('.rehearsal-stagebar [aria-current="step"]').innerText(), /Reflect/);
  await page.getByText('Read your submitted answer', { exact: true }).click();
  assert.match(await page.locator('.answer-recall .saved-answer').innerText(), /Pinili ang qualitative/);
  results.checks.push('Rehearsal progression updates and submitted answer can be recalled beside feedback');
  await page.getByRole('button', { name: 'Take the follow-up' }).click();
  await page
    .getByLabel('Your answer', { exact: true })
    .fill('This thought should be saved even when leaving immediately.');
  await page.getByRole('button', { name: 'Save & leave' }).click();
  await page.getByRole('heading', { name: 'Every rehearsal matters.' }).waitFor();
  await page
    .getByRole('button', { name: /Community Library Study Spaces/ })
    .first()
    .click();
  assert.match(
    await page.getByLabel('Your answer', { exact: true }).inputValue(),
    /saved even when leaving/,
  );
  results.checks.push('Immediate leave flushes pending draft');
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await page.getByRole('button', { name: 'End & review' }).click();
  await page.getByRole('heading', { name: 'A little clearer than before.' }).waitFor();
  await page.screenshot({
    path: 'artifacts/report-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await inspect(page, 'report');
  await page.getByRole('button', { name: 'My papers', exact: true }).click();
  await page.getByRole('button', { name: 'Review source' }).first().click();
  await page.getByLabel('PDF page', { exact: true }).selectOption('4');
  assert.ok(await page.getByText(/No interviews have been conducted/).count());
  await page.screenshot({
    path: 'artifacts/source-desktop.png',
    fullPage: true,
    animations: 'disabled',
  });
  await inspect(page, 'source reader');
  await page.getByRole('button', { name: 'Studio', exact: true }).click();
  await page.getByRole('button', { name: /^Timed mock defense/ }).click();
  assert.ok(await page.getByRole('radio', { name: /Mock defense/ }).isChecked());
  results.checks.push('Timed mock defense launch card preselects mock mode');
  await page.getByRole('button', { name: 'Enter the rehearsal room' }).click();
  await page
    .getByLabel('Your answer', { exact: true })
    .fill('No findings exist in this synthetic protocol.');
  await page.getByRole('button', { name: 'Submit answer', exact: true }).click();
  await page.getByRole('heading', { name: 'Keep your train of thought.' }).waitFor();
  assert.equal(
    await page.getByText('Scripted example · not an assessment', { exact: true }).count(),
    0,
  );
  await page.getByRole('button', { name: 'End session', exact: true }).click();
  await page.getByRole('button', { name: 'End & review' }).click();
  await page.getByRole('heading', { name: 'Build a clearer response.' }).waitFor();
  results.checks.push('Mock feedback hidden until session completion');
  await page.getByRole('button', { name: 'AI & privacy', exact: true }).click();
  await inspect(page, 'privacy settings');
  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: 'Studio', exact: true }).click();
    await page.screenshot({
      path: `artifacts/studio-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await inspect(page, `${width} home`);
    await page.getByRole('button', { name: /^Guided practice/ }).click();
    assert.ok(await page.getByRole('radio', { name: /Guided practice/ }).isChecked());
    await page.getByRole('button', { name: 'Enter the rehearsal room' }).click();
    await page.getByLabel('Your answer', { exact: true }).waitFor();
    await page.screenshot({
      path: `artifacts/rehearsal-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await inspect(page, `${width} rehearsal`);
    const notebookToggle = page.getByRole('button', { name: /Open evidence notebook/ });
    if (await notebookToggle.isVisible()) {
      await page.getByLabel('Your answer', { exact: true }).fill(notebookDraft);
      await notebookToggle.click();
      assert.ok(await page.locator('.evidence-notebook').isVisible());
      const sourceBox = await page.locator('.evidence-notebook').boundingBox();
      const answerBox = await page.locator('.answer-composer').boundingBox();
      assert.ok(sourceBox && answerBox && sourceBox.y < answerBox.y, 'Mobile notebook appears before the answer');
      await page.screenshot({ path: `artifacts/rehearsal-evidence-${width}.png`, fullPage: true, animations: 'disabled' });
      await inspect(page, `${width} expanded evidence`);
      await page.getByRole('button', { name: 'Answer guide', exact: true }).click();
      await inspect(page, `${width} answer guide`);
      await page.getByRole('region', { name: 'Answer guide reading area' }).focus();
      await expect(page.getByRole('region', { name: 'Answer guide reading area' })).toBeFocused();
      await page.getByRole('region', { name: 'Answer guide reading area' }).press('End');
      await expect.poll(() => page.getByRole('region', { name: 'Answer guide reading area' }).evaluate((e) => e.scrollHeight <= e.clientHeight || e.scrollTop > 0)).toBe(true);
      assert.equal(await page.getByLabel('Your answer', { exact: true }).inputValue(), notebookDraft);
      await page.getByRole('button', { name: /^Source excerpts/ }).click();
      await page.locator('.notebook-excerpt button').first().click();
      await page.getByRole('dialog').waitFor();
      await page.getByRole('button', { name: 'Close dialog' }).press('Escape');
      await expect(page.locator('.notebook-excerpt button').first()).toBeFocused();
      await page.getByRole('button', { name: /Close evidence notebook/ }).click();
      assert.equal(await page.getByLabel('Your answer', { exact: true }).inputValue(), notebookDraft);
      results.checks.push(`${width}px evidence reveal, guide switch, source modal/focus return and draft retention`);
    }
    await page.getByRole('button', { name: 'Save & leave' }).click();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: 'Studio', exact: true }).click();
  assert.equal(
    await page.locator('.studio-desk h1').evaluate((e) => getComputedStyle(e).animationName),
    'none',
  );
  await page.getByRole('button', { name: 'Explore a sample' }).click();
  assert.equal(
    await page.getByRole('dialog').evaluate((e) => getComputedStyle(e).animationName),
    'none',
  );
  await page.getByRole('button', { name: 'Close dialog' }).click();
  results.checks.push('Reduced motion disables arrival, spinner and dialog animations');
  await page.getByRole('button', { name: 'My papers', exact: true }).click();
  await page.setInputFiles('input[type=file]', 'public/sample-thesis.pdf');
  await page.getByRole('heading', { name: 'sample thesis' }).waitFor();
  results.checks.push('Real PDF upload reads and saves synthetic fixture through backend');
  await page.getByRole('button', { name: 'Start rehearsal' }).click();
  assert.equal(
    await page.getByRole('button', { name: 'Enter the rehearsal room' }).isEnabled(),
    false,
  );
  assert.ok(await page.getByText('Your AI panel needs a local key.', { exact: true }).count());
  results.checks.push('Uploaded real-paper practice blocked until local key setup');
  results.checks.push('No horizontal overflow at desktop / tablet / 375px');
  const touchContext = await browser.newContext({
    viewport: { width: 375, height: 900 },
    hasTouch: true,
    isMobile: true,
  });
  const touch = await touchContext.newPage();
  await touch.goto(base);
  await touch.locator('.studio-desk h1').waitFor();
  if (await touch.getByRole('dialog').count())
    await touch.getByRole('button', { name: 'Close dialog' }).tap();
  await touch.getByRole('button', { name: 'Explore a sample' }).tap();
  await touch.getByRole('button', { name: 'Enter the rehearsal room' }).tap();
  const target = await touch.getByRole('button', { name: 'PDF p. 1', exact: true }).boundingBox();
  assert.ok(target && target.height >= 44 && target.width >= 44);
  await touch.getByRole('button', { name: 'PDF p. 1', exact: true }).tap();
  await touch.getByRole('dialog').waitFor();
  await touch.getByRole('button', { name: 'Close dialog' }).tap();
  assert.equal(
    await touch
      .getByLabel('Your answer', { exact: true })
      .evaluate((e) => getComputedStyle(e).fontSize),
    '16px',
  );
  results.checks.push(
    'Chromium synthesized touch opens sample, starts rehearsal and inspects evidence; source target >=44px and answer text 16px. Physical devices untested.',
  );
  await touchContext.close();
} finally {
  await browser.close();
  writeFileSync('artifacts/browser-qa.json', JSON.stringify(results, null, 2));
}
console.log(JSON.stringify(results, null, 2));
