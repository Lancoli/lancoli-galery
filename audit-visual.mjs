import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const routes = [
  'index.html',
  'contact.html',
  'demarche.html',
  'feuillets.html',
  'graffiti.html',
  'horla.html',
  'leaving-home.html',
  'lyon.html',
  'projets.html'
];

const widths = [1920, 1440, 1280];
const colorSchemes = ['light', 'dark'];

async function captureRoute(page, route, width, colorScheme) {
  const height = 1080;
  await page.setViewportSize({ width, height });

  // Navigate to the route
  const url = `file://${join(__dirname, route)}`;
  await page.goto(url, { waitUntil: 'networkidle' });

  // Set color scheme
  await page.emulateMedia({ colorScheme });

  // Wait a bit for transitions
  await page.waitForTimeout(500);

  // Take screenshot
  const outputDir = join(__dirname, 'captures', 'audit-visual');
  mkdirSync(outputDir, { recursive: true });

  const filename = `${route.replace('.html', '')}_${width}w_${colorScheme}.png`;
  await page.screenshot({
    path: join(outputDir, filename),
    fullPage: true
  });

  console.log(`✓ ${filename}`);
}

async function runAudit() {
  console.log('Audit visuel Lancoli');
  console.log('='.repeat(50));

  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  let total = 0;
  for (const route of routes) {
    console.log(`\nRoute: ${route}`);
    for (const width of widths) {
      for (const colorScheme of colorSchemes) {
        await captureRoute(page, route, width, colorScheme);
        total++;
      }
    }
  }

  await browser.close();

  console.log('\n' + '='.repeat(50));
  console.log(`${total} captures effectuées`);
  console.log(`Dossier: captures/audit-visual/`);
}

runAudit().catch(console.error);
