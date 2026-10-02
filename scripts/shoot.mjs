// Headless visual check of the playground. Usage:
//   node scripts/shoot.mjs [url] [outDir]
// Drives the locally installed Chrome/Edge (puppeteer-core, no download) through a
// few interactions and saves screenshots.
import puppeteer from 'puppeteer-core'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const url = process.argv[2] ?? 'http://localhost:5188/'
const out = process.argv[3] ?? 'screenshots'
mkdirSync(out, { recursive: true })

const candidates = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
]
const executablePath = process.env.CHROME_PATH ?? candidates.find((p) => existsSync(p))

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1500,940'],
  defaultViewport: { width: 1500, height: 940, deviceScaleFactor: 1 },
})
const page = await browser.newPage()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const shot = async (name) => {
  await new Promise((r) => setTimeout(r, 700))
  await page.screenshot({ path: join(out, `${name}.png`) })
  console.log('saved', name)
}

/** Clicks the canvas at a point given in room-image pixels. */
async function clickRoom(x, y) {
  const box = await page.$eval('canvas', (c) => {
    const r = c.getBoundingClientRect()
    return { x: r.left, y: r.top, w: r.width, h: r.height, iw: c.width, ih: c.height }
  })
  await page.mouse.click(box.x + (x / box.iw) * box.w, box.y + (y / box.ih) * box.h)
}

/** Clicks the first element matching `selector` whose text includes `text`, retrying while the UI loads. */
async function clickText(selector, text, timeout = 5000) {
  const until = Date.now() + timeout
  while (Date.now() < until) {
    for (const h of await page.$$(selector)) {
      const t = await h.evaluate((el) => el.textContent ?? '')
      if (t.includes(text)) {
        await h.click()
        return true
      }
    }
    await new Promise((r) => setTimeout(r, 150))
  }
  throw new Error(`No ${selector} containing "${text}"`)
}

await page.goto(url, { waitUntil: 'networkidle0' })
await page.waitForFunction(() => document.querySelector('canvas')?.classList.contains('opacity-100'), { timeout: 30000 })
await shot('01-initial')

await clickRoom(820, 560) // sofa
await shot('02-sofa-selected')

await clickText('button', 'Cotton Velvet')
await shot('03-velvet-applied')

await clickText('[role=tab]', 'Looks')
await clickText('button', 'Moody luxe')
await shot('04-preset-moody')

await clickText('[role=tab]', 'Summary')
await shot('05-summary')

await page.keyboard.press('c')
await shot('06-compare')
await page.keyboard.press('c')

await clickText('button', 'Bedroom')
await page.waitForFunction(() => document.querySelector('canvas')?.classList.contains('opacity-100'), { timeout: 30000 })
await clickText('[role=tab]', 'Looks')
await clickText('button', 'Garden retreat')
await shot('07-bedroom-garden')

await clickText('button', 'Kitchen & dining')
await page.waitForFunction(() => document.querySelector('canvas')?.classList.contains('opacity-100'), { timeout: 30000 })
await clickText('button', 'Sage kitchen')
await shot('08-dining-sage')

// Room editor: upload a photo, add a wall, trace it with the pen, fit its plane, preview.
await clickText('button', 'Room editor')
await page.evaluate(() => localStorage.removeItem('madan-room-editor'))
const input = await page.waitForSelector('.room-editor input[type=file]')
await input.uploadFile('public/mock-rooms/living.png')
await page.waitForSelector('.room-editor svg[viewBox="0 0 1600 1000"]')
await clickText('button', 'Add')
await clickText('button', 'Wall')
await page.click('button[aria-label="Pen"]')
const clickSvg = async (x, y) => {
  const b = await page.$eval('.room-editor svg[viewBox="0 0 1600 1000"]', (s) => { const r = s.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })
  await page.mouse.click(b.x + (x / 1600) * b.w, b.y + (y / 1000) * b.h)
}
for (const [x, y] of [[615, 270], [1265, 270], [1265, 690], [615, 690], [615, 270]]) await clickSvg(x, y)
await clickText('button', 'Auto plane')
await clickText('button', 'Paint')
await shot('09-editor')
await clickText('button', 'Preview & save')
await new Promise((r) => setTimeout(r, 2500))
await shot('10-editor-preview')

await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
await shot('11-mobile')

console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors')
await browser.close()
