import { expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import puppeteer from 'puppeteer';

const baseUrl = process.env.E2E_BASE_URL;
const browserTest = baseUrl ? test : test.skip;
const downloadDirectory = resolve(
  process.env.E2E_DOWNLOAD_DIR ?? 'artifacts/e2e-downloads',
);

async function replaceInput(
  page: import('puppeteer').Page,
  selector: string,
  value: string,
) {
  const input = await page.waitForSelector(selector, { visible: true });
  if (!input) throw new Error(`Input not found: ${selector}`);
  await input.click({ count: 3 });
  await input.type(value);
}

async function selectTeacher(
  page: import('puppeteer').Page,
  inputSelector: string,
  search: string,
  fullName: string,
) {
  await replaceInput(page, inputSelector, search);
  const optionSelector = `[data-teacher-name="${fullName}"]`;
  const option = await page.waitForSelector(optionSelector, { visible: true });
  if (!option) throw new Error(`Teacher option not found: ${fullName}`);
  await option.click();
}

async function clickLabel(page: import('puppeteer').Page, text: string) {
  const id = await page.$$eval(
    'label',
    (labels, expected) =>
      labels.find((label) => label.textContent?.trim() === expected)?.htmlFor,
    text,
  );
  if (!id) throw new Error(`Label not found: ${text}`);
  await page.evaluate(
    (inputId) => document.getElementById(inputId)?.click(),
    id,
  );
}

async function waitForDownload() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (existsSync(downloadDirectory)) {
      const file = readdirSync(downloadDirectory).find(
        (name) => name.endsWith('.pdf') && !name.endsWith('.crdownload'),
      );
      if (file) return resolve(downloadDirectory, file);
    }
    await Bun.sleep(100);
  }
  throw new Error('PDF download did not complete within 30 seconds');
}

browserTest(
  'completes teacher autofill, PDF download, and offline directory reload',
  async () => {
    if (!baseUrl) return;
    const browser = await puppeteer.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1440, height: 900 });
      await page.evaluateOnNewDocument(() => {
        Reflect.deleteProperty(window, 'showOpenFilePicker');
        Reflect.deleteProperty(window, 'showSaveFilePicker');
      });
      page.on('dialog', (dialog) => void dialog.accept());
      const session = await page.createCDPSession();
      await session.send('Browser.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadDirectory,
      });
      await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      expect(
        await page.evaluate(() => 'showOpenFilePicker' in window),
      ).toBeFalse();

      await replaceInput(page, '[data-testid="student-id-input"]', '2003123');
      await replaceInput(
        page,
        '[data-testid="student-name-input"]',
        'Test Student',
      );
      await page.click('[aria-label="subject"]');
      await replaceInput(
        page,
        '[data-testid="course-number-input"]',
        'CSE 3200',
      );
      await replaceInput(
        page,
        '[data-testid="course-title-input"]',
        'Software Engineering',
      );
      await replaceInput(
        page,
        '[data-testid="cover-title-input"]',
        'Backend Integration',
      );

      await page.click('[aria-label="teacher"]');
      await selectTeacher(
        page,
        '[data-testid="primary-teacher-input"]',
        'Sarowar',
        'A H M Sarowar Sattar',
      );
      expect(
        await page.evaluate(() => ({
          name: localStorage.getItem('teacher-name'),
          designation: localStorage.getItem('teacher-designation'),
          department: localStorage.getItem('teacher-department'),
        })),
      ).toEqual({
        name: 'A H M Sarowar Sattar',
        designation: 'Professor',
        department: 'Computer Science & Engineering',
      });

      await selectTeacher(
        page,
        '[data-testid="second-teacher-input"]',
        'Boshir',
        'Prof. Dr. Boshir Ahmed',
      );
      expect(
        await page.evaluate(() =>
          localStorage.getItem('second-teacher-department'),
        ),
      ).toBe('Computer Science & Engineering');

      await page.click('[aria-label="settings"]');
      await clickLabel(page, 'Add watermark');
      await clickLabel(
        page,
        'Add borders to submitted by and submitted to table',
      );
      await page.waitForSelector('.react-pdf__Page__canvas', { visible: true });
      await page.click('[data-testid="download-pdf"]');
      const pdfPath = await waitForDownload();
      const document = await getDocument({
        data: new Uint8Array(readFileSync(pdfPath)),
      }).promise;
      expect(document.numPages).toBe(1);
      const content = await (await document.getPage(1)).getTextContent();
      const text = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      for (const expected of [
        'Test Student',
        'Software Engineering',
        'Backend Integration',
        'A H M Sarowar Sattar',
        'Professor',
      ])
        expect(text).toContain(expected);

      await page.setRequestInterception(true);
      page.on('request', (request) => {
        if (request.url().includes('/api/')) request.abort();
        else request.continue();
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.click('[aria-label="teacher"]');
      await replaceInput(
        page,
        '[data-testid="primary-teacher-input"]',
        'Sarowar',
      );
      await page.waitForSelector('[data-teacher-name="A H M Sarowar Sattar"]', {
        visible: true,
      });
    } finally {
      await browser.close();
    }
  },
  120_000,
);
