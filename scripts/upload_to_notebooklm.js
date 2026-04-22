const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

function printHelp() {
  console.log(`
Usage:
  node upload_to_notebooklm.js --source-dir <dir> --user-data-dir <chrome-user-data> [options]

Required:
  --source-dir <dir>              Folder containing files to upload
  --user-data-dir <dir>           Chrome user data dir

Create new notebook:
  --notebook-name <name>          New notebook name

Append to existing notebook:
  --append
  --notebook-url <url>            Existing notebook URL
  or
  --existing-notebook-name <name> Existing notebook name to click from home

Optional:
  --profile-directory <name>      Chrome profile, e.g. "Default" or "Profile 2"
  --channel <name>                Browser channel, default: chrome
  --executable-path <path>        Explicit browser executable path
  --headless                      Run headless
  --timeout-ms <n>                Default: 120000
  --settle-ms <n>                 Default: 4000
  --retries <n>                   Default: 2
  --max-files <n>                 Limit uploaded file count
  --help                          Show this help
`);
}

function parseArgs(argv) {
  const args = {
    headless: false,
    timeoutMs: 120000,
    settleMs: 4000,
    retries: 2,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    if (key === 'help') {
      args.help = true;
      continue;
    }
    if (key === 'headless') {
      args.headless = true;
      continue;
    }
    if (key === 'append') {
      args.append = true;
      continue;
    }
    const next = argv[i + 1];
    if (next == null) {
      throw new Error(`Missing value for --${key}`);
    }
    args[toCamel(key)] = ['timeout-ms', 'settle-ms', 'retries', 'max-files'].includes(key) ? Number(next) : next;
    i++;
  }
  return args;
}

function toCamel(key) {
  return key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function ensure(cond, msg) {
  if (!cond) throw new Error(msg);
}

function collectFiles(sourceDir, maxFiles) {
  const files = [];
  for (const name of fs.readdirSync(sourceDir)) {
    const full = path.join(sourceDir, name);
    const stat = fs.statSync(full);
    if (stat.isFile()) files.push(full);
  }
  files.sort((a, b) => a.localeCompare(b));
  return typeof maxFiles === 'number' && Number.isFinite(maxFiles) ? files.slice(0, maxFiles) : files;
}

async function clickFirst(page, candidates, timeoutMs) {
  for (const factory of candidates) {
    try {
      const locator = factory(page).first();
      await locator.waitFor({ state: 'visible', timeout: 3000 });
      await locator.click({ timeout: timeoutMs });
      return true;
    } catch {}
  }
  return false;
}

async function waitForVisibleAny(page, candidates, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const factory of candidates) {
      try {
        await factory(page).first().waitFor({ state: 'visible', timeout: 1000 });
        return true;
      } catch {}
    }
  }
  return false;
}

async function waitForGoogleSession(page, timeoutMs) {
  const ok = await waitForVisibleAny(
    page,
    [
      p => p.getByText(/create new notebook/i),
      p => p.getByText(/upload a source/i),
      p => p.getByText(/notebooklm/i),
      p => p.locator('[aria-label*="NotebookLM"]'),
    ],
    timeoutMs
  );
  ensure(ok, 'Login check timed out. Please log into Google in the opened browser window, then rerun.');
}

async function gotoNotebookHome(page) {
  await page.goto('https://notebooklm.google.com/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function createNotebook(page, notebookName, timeoutMs) {
  const created = await clickFirst(
    page,
    [
      p => p.getByRole('button', { name: /create new notebook/i }),
      p => p.getByRole('link', { name: /create new notebook/i }),
      p => p.getByText(/create new notebook/i),
      p => p.locator('button').filter({ hasText: /create new notebook/i }),
    ],
    timeoutMs
  );
  ensure(created, 'Could not find the "Create new notebook" entry point.');

  const boxes = [
    page.getByRole('textbox'),
    page.locator('input[type="text"]'),
    page.locator('textarea'),
  ];
  let filled = false;
  for (const box of boxes) {
    try {
      await box.first().waitFor({ state: 'visible', timeout: 5000 });
      await box.first().fill(notebookName, { timeout: 5000 });
      filled = true;
      break;
    } catch {}
  }
  ensure(filled, 'Could not find the notebook name input box.');

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

async function openExistingNotebook(page, args, timeoutMs) {
  if (args.notebookUrl) {
    await page.goto(args.notebookUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    return;
  }

  ensure(args.existingNotebookName, 'Append mode requires --notebook-url or --existing-notebook-name.');
  await gotoNotebookHome(page);

  const opened = await clickFirst(
    page,
    [
      p => p.getByText(new RegExp(escapeRegExp(args.existingNotebookName), 'i')),
      p => p.getByRole('link', { name: new RegExp(escapeRegExp(args.existingNotebookName), 'i') }),
      p => p.locator('[role="button"]').filter({ hasText: new RegExp(escapeRegExp(args.existingNotebookName), 'i') }),
    ],
    timeoutMs
  );
  ensure(opened, `Could not open existing notebook: ${args.existingNotebookName}`);
  await page.waitForLoadState('networkidle').catch(() => {});
}

async function openUploadEntry(page, timeoutMs) {
  const opened = await clickFirst(
    page,
    [
      p => p.getByRole('button', { name: /upload a source/i }),
      p => p.getByText(/upload a source/i),
      p => p.getByRole('button', { name: /add source/i }),
      p => p.getByText(/add source/i),
      p => p.getByRole('button', { name: /add/i }),
      p => p.locator('button').filter({ hasText: /upload|source|add/i }),
    ],
    timeoutMs
  );
  ensure(opened, 'Could not find the source upload button.');
}

async function setFiles(page, files, timeoutMs) {
  const input = page.locator('input[type="file"]').first();
  await input.waitFor({ state: 'attached', timeout: timeoutMs });
  await input.setInputFiles(files, { timeout: timeoutMs });
}

async function waitForUploadSignals(page, files, timeoutMs, settleMs) {
  const started = Date.now();
  const names = files.map(file => path.basename(file));

  while (Date.now() - started < timeoutMs) {
    let seen = 0;
    for (const name of names) {
      const patterns = [
        page.getByText(new RegExp(escapeRegExp(name), 'i')),
        page.locator(`text=${name}`),
      ];
      let matched = false;
      for (const locator of patterns) {
        try {
          if (await locator.first().isVisible({ timeout: 500 })) {
            matched = true;
            break;
          }
        } catch {}
      }
      if (matched) seen++;
    }

    const hasBusy = await hasVisibleAny(page, [
      p => p.getByText(/uploading|processing|adding source/i),
      p => p.locator('[role="progressbar"]'),
      p => p.locator('mat-progress-bar'),
      p => p.locator('.progress, [class*="progress"]'),
    ]);

    if (seen > 0 && !hasBusy) {
      await page.waitForTimeout(settleMs);
      return;
    }

    await page.waitForTimeout(1500);
  }

  console.warn('Upload completion signal timed out. Files may still be processing in NotebookLM.');
}

async function hasVisibleAny(page, candidates) {
  for (const factory of candidates) {
    try {
      if (await factory(page).first().isVisible({ timeout: 500 })) return true;
    } catch {}
  }
  return false;
}

async function runOnce(args) {
  const sourceDir = path.resolve(args.sourceDir);
  ensure(fs.existsSync(sourceDir), `Source folder not found: ${sourceDir}`);
  ensure(fs.statSync(sourceDir).isDirectory(), `Source path is not a folder: ${sourceDir}`);

  const files = collectFiles(sourceDir, args.maxFiles);
  ensure(files.length > 0, `No files found in source directory: ${sourceDir}`);

  const launchOptions = {
    channel: args.channel || 'chrome',
    executablePath: args.executablePath || undefined,
    headless: !!args.headless,
    viewport: { width: 1440, height: 960 },
    args: [],
  };
  if (args.profileDirectory) {
    launchOptions.args.push(`--profile-directory=${args.profileDirectory}`);
  }

  const context = await chromium.launchPersistentContext(path.resolve(args.userDataDir), launchOptions);
  try {
    const page = context.pages()[0] || await context.newPage();
    page.setDefaultTimeout(args.timeoutMs);

    await gotoNotebookHome(page);
    await waitForGoogleSession(page, args.timeoutMs);

    if (args.append) {
      await openExistingNotebook(page, args, args.timeoutMs);
    } else {
      ensure(args.notebookName, 'Create mode requires --notebook-name.');
      await gotoNotebookHome(page);
      await createNotebook(page, args.notebookName, args.timeoutMs);
    }

    await openUploadEntry(page, args.timeoutMs);
    await setFiles(page, files, args.timeoutMs);
    await waitForUploadSignals(page, files, args.timeoutMs, args.settleMs);

    console.log(`Upload flow submitted for ${files.length} files.`);
    console.log(`Source dir: ${sourceDir}`);
    if (args.append) {
      console.log(`Append mode: true`);
      if (args.notebookUrl) console.log(`Notebook URL: ${args.notebookUrl}`);
      if (args.existingNotebookName) console.log(`Notebook name: ${args.existingNotebookName}`);
    } else {
      console.log(`Notebook: ${args.notebookName}`);
    }
  } finally {
    if (args.headless) {
      await context.close();
    } else {
      console.log('Browser left open for manual confirmation.');
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  ensure(args.sourceDir, 'Missing required --source-dir');
  ensure(args.userDataDir, 'Missing required --user-data-dir');

  const retries = Number.isFinite(args.retries) ? Math.max(0, args.retries) : 0;
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Retrying upload flow (${attempt}/${retries})...`);
      }
      await runOnce(args);
      return;
    } catch (err) {
      lastErr = err;
      console.error(`Attempt ${attempt + 1} failed: ${err.message}`);
    }
  }

  throw lastErr;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

main().catch(err => {
  console.error(err.stack || String(err));
  process.exit(1);
});
