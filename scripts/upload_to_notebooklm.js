const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function parseArgs(argv) {
  const args = {
    headless: false,
    timeoutMs: 120000,
    settleMs: 3000,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (['source-dir', 'notebook-name', 'user-data-dir', 'channel', 'executable-path'].includes(key)) {
      args[toCamel(key)] = next;
      i++;
      continue;
    }
    if (key === 'headless') {
      args.headless = true;
      continue;
    }
    if (key === 'timeout-ms') {
      args.timeoutMs = Number(next);
      i++;
      continue;
    }
    if (key === 'settle-ms') {
      args.settleMs = Number(next);
      i++;
    }
  }
  return args;
}

function toCamel(key) {
  return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function required(args, key) {
  if (!args[key]) {
    throw new Error(`Missing required --${key.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}`);
  }
}

function collectFiles(sourceDir) {
  const out = [];
  for (const name of fs.readdirSync(sourceDir)) {
    const full = path.join(sourceDir, name);
    const stat = fs.statSync(full);
    if (stat.isFile()) out.push(full);
  }
  return out;
}

async function clickFirst(page, candidates, timeoutMs) {
  for (const candidate of candidates) {
    try {
      const locator = candidate(page);
      await locator.first().waitFor({ state: 'visible', timeout: 3000 });
      await locator.first().click({ timeout: timeoutMs });
      return true;
    } catch {}
  }
  return false;
}

async function waitForGoogleSession(page, timeoutMs) {
  const loggedInHints = [
    () => page.getByText(/create new notebook/i),
    () => page.getByText(/upload a source/i),
    () => page.getByText(/notebooklm/i),
  ];

  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const hint of loggedInHints) {
      try {
        await hint().first().waitFor({ state: 'visible', timeout: 2000 });
        return;
      } catch {}
    }
    await page.waitForTimeout(1500);
  }
  throw new Error('Login check timed out. Please log into Google in the opened browser window, then rerun.');
}

async function ensureNotebookHome(page) {
  await page.goto('https://notebooklm.google.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function createNotebook(page, notebookName, timeoutMs) {
  const created = await clickFirst(
    page,
    [
      p => p.getByRole('button', { name: /create new notebook/i }),
      p => p.getByText(/create new notebook/i),
      p => p.locator('button').filter({ hasText: /create new notebook/i }),
      p => p.getByRole('link', { name: /create new notebook/i }),
    ],
    timeoutMs
  );

  if (!created) {
    throw new Error('Could not find the "Create new notebook" entry point.');
  }

  const textboxCandidates = [
    page.getByRole('textbox'),
    page.locator('input[type="text"]'),
    page.locator('textarea'),
  ];

  for (const box of textboxCandidates) {
    try {
      await box.first().waitFor({ state: 'visible', timeout: 5000 });
      await box.first().fill(notebookName, { timeout: 5000 });
      break;
    } catch {}
  }

  const confirmed = await clickFirst(
    page,
    [
      p => p.getByRole('button', { name: /^create$/i }),
      p => p.getByRole('button', { name: /^done$/i }),
      p => p.getByRole('button', { name: /^continue$/i }),
      p => p.getByText(/^create$/i),
    ],
    timeoutMs
  );

  if (!confirmed) {
    await page.keyboard.press('Enter').catch(() => {});
  }

  await page.waitForTimeout(3000);
}

async function openUpload(page, timeoutMs) {
  const ok = await clickFirst(
    page,
    [
      p => p.getByRole('button', { name: /upload a source/i }),
      p => p.getByText(/upload a source/i),
      p => p.getByRole('button', { name: /add source/i }),
      p => p.getByText(/add source/i),
      p => p.locator('button').filter({ hasText: /upload|source|add/i }),
    ],
    timeoutMs
  );
  if (!ok) throw new Error('Could not find the source upload button.');
}

async function uploadFiles(page, files, timeoutMs, settleMs) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.first().waitFor({ state: 'attached', timeout: timeoutMs });
  await fileInput.first().setInputFiles(files, { timeout: timeoutMs });
  await page.waitForTimeout(settleMs);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  required(args, 'sourceDir');
  required(args, 'notebookName');
  required(args, 'userDataDir');

  const sourceDir = path.resolve(args.sourceDir);
  const files = collectFiles(sourceDir);
  if (!files.length) {
    throw new Error(`No files found in source directory: ${sourceDir}`);
  }

  const context = await chromium.launchPersistentContext(args.userDataDir, {
    channel: args.channel || 'chrome',
    executablePath: args.executablePath || undefined,
    headless: args.headless,
    viewport: { width: 1440, height: 960 },
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    page.setDefaultTimeout(args.timeoutMs);

    await ensureNotebookHome(page);
    await waitForGoogleSession(page, args.timeoutMs);
    await ensureNotebookHome(page);
    await createNotebook(page, args.notebookName, args.timeoutMs);
    await openUpload(page, args.timeoutMs);
    await uploadFiles(page, files, args.timeoutMs, args.settleMs);

    console.log(`Upload flow submitted for ${files.length} files.`);
    console.log(`Notebook: ${args.notebookName}`);
    console.log(`Source dir: ${sourceDir}`);
  } finally {
    if (args.headless) {
      await context.close();
    } else {
      console.log('Browser left open for manual confirmation.');
    }
  }
}

main().catch(err => {
  console.error(err.stack || String(err));
  process.exit(1);
});
