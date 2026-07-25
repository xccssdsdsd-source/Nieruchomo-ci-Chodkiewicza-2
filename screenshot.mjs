import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const url = process.argv[2] || 'http://localhost:3000'
const dir = './temporary screenshots'
mkdirSync(dir, { recursive: true })

const browser = await chromium.launch({
  executablePath: 'C:/Users/kajet/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe'
})

async function autoScroll(page) {
  const height = await page.evaluate(() => document.body.scrollHeight)
  const step = 400
  for (let y = 0; y < height; y += step) {
    await page.evaluate(y => window.scrollTo(0, y), y)
    await page.waitForTimeout(80)
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(600)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(300)
}

const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await desktop.goto(url, { waitUntil: 'networkidle' })
await desktop.waitForTimeout(700)
await autoScroll(desktop)
await desktop.screenshot({ path: `${dir}/desktop-full.png`, fullPage: true })
await desktop.close()

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } })
await mobile.goto(url, { waitUntil: 'networkidle' })
await mobile.waitForTimeout(700)
await autoScroll(mobile)
await mobile.screenshot({ path: `${dir}/mobile-full.png`, fullPage: true })
await mobile.close()

await browser.close()
console.log('done')
