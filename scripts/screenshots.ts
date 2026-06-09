/**
 * Drives the real UI in headless Chrome and saves screenshots to /tmp/whl-shots.
 * Verifies: name gate, home, lounge lobby, live game board with a traced word,
 * and results. Run with the dev server up:  npx tsx scripts/screenshots.ts
 */
import { mkdirSync } from 'node:fs'
import puppeteer, { type Page } from 'puppeteer-core'

const BASE = process.env.SMOKE_URL ?? 'http://localhost:5199'
const OUT = '/tmp/whl-shots'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function shoot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log(`shot: ${name}`)
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-first-run', '--hide-scrollbars'],
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  })
  const page = await browser.newPage()
  page.on('pageerror', (err) => console.error('PAGE ERROR:', String(err)))
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('CONSOLE ERROR:', msg.text())
  })

  // 1. name gate
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' })
  await shoot(page, '1-name-gate')

  // 2. create identity through the UI
  await page.type('.input', 'Wesley')
  await page.click('.btn-primary')
  await page.waitForSelector('.code-chip')
  await shoot(page, '2-claim-code')
  await page.click('.btn-primary')
  await page.waitForSelector('.seg')
  await sleep(600)
  await shoot(page, '3-home')

  // 3. deal a ranked board through the UI
  const segButtons = await page.$$('.seg button')
  await segButtons[1]!.click() // ranked
  await sleep(200)
  const deal = await page.$$('.btn-primary')
  await deal[deal.length - 1]!.click()
  await page.waitForSelector('.standings, .panel', { timeout: 10_000 })
  await page.waitForFunction(() => location.pathname.startsWith('/l/'))
  await sleep(700)
  await shoot(page, '4-lounge-lobby')

  // 4. start the round and trace a word with synthetic touches
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')]
    buttons.find((b) => b.textContent?.startsWith('Play'))?.click()
  })
  await page.waitForSelector('.board-grid', { timeout: 10_000 })
  await sleep(400)
  await shoot(page, '5-game-board')

  // trace tiles 0 -> 1 -> 2 with a touch drag (real pointer events)
  const grid = await page.$('.board-grid')
  const box = (await grid!.boundingBox())!
  const cell = box.width / 4
  const pt = (i: number) => ({
    x: box.x + ((i % 4) + 0.5) * cell,
    y: box.y + (Math.floor(i / 4) + 0.5) * cell,
  })
  const p0 = pt(0)
  const p1 = pt(1)
  const p2 = pt(2)
  await page.touchscreen.touchStart(p0.x, p0.y)
  await sleep(80)
  await page.touchscreen.touchMove(p1.x, p1.y)
  await sleep(80)
  await page.touchscreen.touchMove(p2.x, p2.y)
  await sleep(80)
  await shoot(page, '6-game-tracing')
  await page.touchscreen.touchEnd()
  await sleep(600)
  await shoot(page, '7-game-after-submit')

  // 5. end the round, land on results/lobby
  await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')]
    buttons.find((b) => b.textContent?.includes('End round'))?.click()
  })
  await page.waitForSelector('.standings', { timeout: 10_000 })
  await sleep(700)
  await shoot(page, '8-results')

  await browser.close()
  console.log(`done -> ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
