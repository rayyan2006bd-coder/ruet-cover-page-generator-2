import { expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import puppeteer, { type Page } from 'puppeteer';

const baseUrl = process.env.E2E_BASE_URL;
const browserTest = baseUrl ? test : test.skip;
const artifactDirectory = resolve(
  process.env.E2E_ARTIFACT_DIR ?? 'artifacts/responsive-qa',
);

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

type DomAudit = {
  duplicateIds: string[];
  horizontalOverflow: number;
  imagesWithoutAlt: string[];
  smallTargets: string[];
  unnamedControls: string[];
};

async function replaceInput(page: Page, selector: string, value: string) {
  const input = await page.waitForSelector(selector, { visible: true });
  if (!input) throw new Error(`Input not found: ${selector}`);
  await input.click({ count: 3 });
  await input.type(value);
}

async function auditDom(page: Page): Promise<DomAudit> {
  return page.evaluate(() => {
    const isVisible = (element: Element) => {
      const node = element as HTMLElement;
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      );
    };
    const describe = (element: Element) => {
      const node = element as HTMLElement;
      return `${element.tagName.toLowerCase()}${node.id ? `#${node.id}` : ''}${
        node.getAttribute('aria-label')
          ? `[aria-label="${node.getAttribute('aria-label')}"]`
          : ''
      }`;
    };
    const accessibleName = (element: Element) => {
      const node = element as HTMLElement;
      const labelledBy = node
        .getAttribute('aria-labelledby')
        ?.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
        .filter(Boolean)
        .join(' ');
      const labels =
        'labels' in element
          ? Array.from((element as HTMLInputElement).labels ?? [])
              .map((label) => label.textContent?.trim() ?? '')
              .filter(Boolean)
              .join(' ')
          : '';
      return (
        node.getAttribute('aria-label')?.trim() ||
        labelledBy ||
        labels ||
        node.getAttribute('title')?.trim() ||
        node.textContent?.trim() ||
        ''
      );
    };

    const ids = Array.from(document.querySelectorAll<HTMLElement>('[id]')).map(
      (element) => element.id,
    );
    const duplicateIds = ids.filter(
      (id, index) => id && ids.indexOf(id) !== index,
    );
    const controls = Array.from(
      document.querySelectorAll(
        'button, input:not([type="hidden"]), select, textarea, a[href]',
      ),
    ).filter(isVisible);
    const targets = Array.from(
      document.querySelectorAll(
        'button, a[href], [role="button"], [role="tab"], input[type="submit"]',
      ),
    ).filter(isVisible);
    const imagesWithoutAlt = Array.from(document.querySelectorAll('img'))
      .filter((image) => !image.hasAttribute('alt'))
      .map(describe);
    const unnamedControls = controls
      .filter((element) => !accessibleName(element))
      .map(describe);
    const smallTargets = targets
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 24 || rect.height < 24;
      })
      .map(describe);

    return {
      duplicateIds: [...new Set(duplicateIds)],
      horizontalOverflow: Math.max(
        0,
        document.documentElement.scrollWidth - window.innerWidth,
      ),
      imagesWithoutAlt,
      smallTargets,
      unnamedControls,
    };
  });
}

browserTest(
  'stays usable and accessible across phone, tablet, and laptop widths',
  async () => {
    if (!baseUrl) return;
    mkdirSync(artifactDirectory, { recursive: true });
    const browser = await puppeteer.launch({ headless: true });
    const report: Record<string, unknown> = {};

    try {
      for (const viewport of viewports) {
        const page = await browser.newPage();
        const pageErrors: string[] = [];
        const failedRequests: string[] = [];
        page.on('pageerror', (error) => pageErrors.push(error.message));
        page.on('requestfailed', (request) => {
          const url = request.url();
          if (
            !url.startsWith('http://localhost:8787') &&
            !url.includes('api.nabilsnigdho.dev')
          ) {
            failedRequests.push(
              `${request.failure()?.errorText ?? 'failed'} ${url}`,
            );
          }
        });
        await page.setViewport({
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: 1,
          isMobile: viewport.name === 'mobile',
          hasTouch: viewport.name !== 'desktop',
        });
        await page.evaluateOnNewDocument(() => {
          (window as typeof window & { __qaCLS?: number }).__qaCLS = 0;
          try {
            new PerformanceObserver((list) => {
              for (const entry of list.getEntries()) {
                const shift = entry as PerformanceEntry & {
                  hadRecentInput?: boolean;
                  value?: number;
                };
                if (!shift.hadRecentInput) {
                  const qaWindow = window as typeof window & {
                    __qaCLS?: number;
                  };
                  qaWindow.__qaCLS =
                    (qaWindow.__qaCLS ?? 0) + (shift.value ?? 0);
                }
              }
            }).observe({ type: 'layout-shift', buffered: true });
          } catch {
            // LayoutShift is not exposed by every Chromium build.
          }
        });
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('[aria-label="student"]', {
          visible: true,
        });
        await page.waitForFunction(
          () => !document.getElementById('loading-toast'),
        );
        await page.screenshot({
          path: resolve(artifactDirectory, `${viewport.name}-editor.png`),
        });

        const domAudit = await auditDom(page);
        await page.keyboard.press('Tab');
        const firstFocus = await page.evaluate(
          () => document.activeElement?.tagName ?? '',
        );
        const performance = await page.evaluate(() => {
          const navigation = performance.getEntriesByType('navigation')[0] as
            | PerformanceNavigationTiming
            | undefined;
          return {
            cls: (window as typeof window & { __qaCLS?: number }).__qaCLS ?? 0,
            domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? 0,
            loadMs: navigation?.loadEventEnd ?? 0,
            transferBytes: performance
              .getEntriesByType('resource')
              .reduce(
                (total, entry) =>
                  total +
                  ((entry as PerformanceResourceTiming).transferSize ?? 0),
                0,
              ),
          };
        });

        expect(domAudit.horizontalOverflow).toBe(0);
        expect(domAudit.duplicateIds).toEqual([]);
        expect(domAudit.imagesWithoutAlt).toEqual([]);
        expect(domAudit.smallTargets).toEqual([]);
        expect(domAudit.unnamedControls).toEqual([]);
        expect(firstFocus).not.toBe('BODY');
        expect(pageErrors).toEqual([]);
        expect(failedRequests).toEqual([]);

        if (viewport.name === 'mobile') {
          await page.click('[aria-label="subject"]');
          await page.click('[data-testid="course-directory-trigger"]');
          const openDirectoryAudit = await auditDom(page);
          expect(openDirectoryAudit.horizontalOverflow).toBe(0);
          await replaceInput(
            page,
            '[placeholder="Search code, title, or department…"]',
            'IPES 1202',
          );
          await page.click('[data-course-code="IPES 1202"]');
          expect(
            await page.$eval(
              '[data-testid="course-number-input"]',
              (element) => (element as HTMLInputElement).value,
            ),
          ).toBe('IPES 1202');
          expect(
            await page.$eval(
              '[data-testid="course-title-input"]',
              (element) => (element as HTMLInputElement).value,
            ),
          ).toBe('Shop Practice-I');
          await page.screenshot({
            path: resolve(artifactDirectory, 'mobile-course-selected.png'),
          });

          await page.click('[aria-label="teacher"]');
          const input = await page.waitForSelector(
            '[data-testid="primary-teacher-input"]',
            { visible: true },
          );
          if (!input) throw new Error('Primary teacher input was not visible.');
          await input.type('Sarowar');
          const option = await page.waitForSelector(
            '[data-teacher-name="A H M Sarowar Sattar"]',
            { visible: true },
          );
          if (!option) throw new Error('Teacher option was not visible.');
          await option.click();
          expect(
            await page.$eval(
              '[data-testid="primary-teacher-input"]',
              (element) => (element as HTMLInputElement).value,
            ),
          ).toBe('A H M Sarowar Sattar');
          await page.screenshot({
            path: resolve(artifactDirectory, 'mobile-teacher-selected.png'),
          });
          await page.click('button[aria-label="Preview cover"]');
          await page.waitForSelector('.react-pdf__Page__canvas', {
            visible: true,
            timeout: 60_000,
          });
          await page.screenshot({
            path: resolve(artifactDirectory, 'mobile-preview.png'),
          });
        }

        if (viewport.name === 'desktop') {
          await page.waitForSelector('.react-pdf__Page__canvas', {
            visible: true,
            timeout: 60_000,
          });
          await page.click('button[aria-label="Open workspace"]');
          await page.waitForSelector('[role="dialog"]', { visible: true });
          expect(
            await page.$eval('[role="dialog"]', (node) => node.textContent),
          ).toContain('Local workspace');
          await page.screenshot({
            path: resolve(artifactDirectory, 'desktop-workspace.png'),
          });
        }

        report[viewport.name] = {
          domAudit,
          firstFocus,
          pageErrors,
          failedRequests,
          performance,
        };
        await page.close();
      }

      console.log(`RESPONSIVE_QA ${JSON.stringify(report)}`);
    } finally {
      await browser.close();
    }
  },
  180_000,
);
