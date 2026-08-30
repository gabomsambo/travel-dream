#!/usr/bin/env node
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import WebSocket from 'ws'
import http from 'node:http'

const DOCS = join(process.cwd(), 'docs/screenshots')
const BASE = 'http://localhost:3001'
mkdirSync(DOCS, { recursive: true })

const env = {
  ...process.env,
  CHROME_DEVTOOLS_AXI_BROWSER_URL: 'http://127.0.0.1:9222',
  CHROME_DEVTOOLS_AXI_SESSION: 'td-toaster-missing',
  CHROME_DEVTOOLS_AXI_BRIDGE_TIMEOUT_MS: '180000',
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

async function getPage(urlIncludes = 'localhost:3001') {
  const targets = await new Promise((resolve, reject) => {
    http
      .get('http://127.0.0.1:9222/json/list', (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => resolve(JSON.parse(data)))
      })
      .on('error', reject)
  })
  return (
    targets.find((t) => t.type === 'page' && t.url.includes(urlIncludes)) ??
    targets.find((t) => t.type === 'page')
  )
}

async function withCdp(page, fn) {
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw)
    if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg)
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id
      pending.set(msgId, (msg) => (msg.error ? reject(msg.error) : resolve(msg.result)))
      ws.send(JSON.stringify({ id: msgId, method, params }))
    })
  await new Promise((r) => ws.once('open', r))
  try {
    return await fn(send)
  } finally {
    ws.close()
  }
}

async function evalJs(expr) {
  const page = await getPage()
  return withCdp(page, async (send) => {
    const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails))
    }
    return result.result.value
  })
}

async function navigate(url) {
  const page = await getPage()
  await withCdp(page, async (send) => {
    await send('Page.navigate', { url })
  })
  for (let i = 0; i < 20; i++) {
    const ready = await evalJs(`document.readyState === 'complete' && !!document.querySelector('header')`)
    if (ready) break
    await sleep(300)
  }
  await sleep(1500)
}

async function setViewport(w, h) {
  const page = await getPage()
  await withCdp(page, async (send) => {
    await send('Emulation.setDeviceMetricsOverride', {
      width: w,
      height: h,
      deviceScaleFactor: 1,
      mobile: w < 800,
    })
  })
}

async function screenshot(path) {
  const page = await getPage()
  await withCdp(page, async (send) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(path, Buffer.from(data, 'base64'))
  })
  console.log('screenshot', path)
}

async function readThemeState() {
  return evalJs(`({
    html: document.documentElement.getAttribute('data-theme'),
    cookie: document.cookie.match(/ui-theme=([^;]+)/)?.[1] ?? null,
    upload: getComputedStyle(
      document.querySelector('header button.bg-primary') ||
      [...document.querySelectorAll('header button')].find(b => b.textContent?.trim() === 'Upload') ||
      document.body
    ).backgroundColor
  })`)
}

async function waitTheme(theme) {
  for (let i = 0; i < 24; i++) {
    const state = await readThemeState()
    const ok = theme === 'tropical' ? state.html === 'tropical' : state.html !== 'tropical'
    if (ok) return state
    await sleep(400)
  }
  throw new Error(`theme ${theme} not ready`)
}

async function isTropicalSwitchOn() {
  return evalJs(
    `document.querySelector('button[role="switch"][aria-checked="true"]') !== null && document.querySelector('button[role="switch"]')?.closest('div')?.textContent?.includes('Tropical Boutique UI')`
  )
}

async function toggleTropicalSwitch() {
  return evalJs(`(() => {
    const row = [...document.querySelectorAll('div')].find(d => d.textContent?.includes('Tropical Boutique UI') && d.querySelector('button[role="switch"]'));
    const sw = row?.querySelector('button[role="switch"]');
    if (!sw) return 'missing';
    sw.click();
    return 'toggled';
  })()`)
}

async function ensureTheme(theme) {
  await navigate(`${BASE}/settings`)
  const wantTropical = theme === 'tropical'
  if (wantTropical !== (await isTropicalSwitchOn())) {
    await toggleTropicalSwitch()
    await sleep(3500)
  }
  const state = await waitTheme(theme)
  console.log('theme', theme, state)
}

async function waitForToast(textIncludes) {
  const needle = textIncludes?.toLowerCase() ?? ''
  for (let i = 0; i < 40; i++) {
    const match = await evalJs(`(() => {
      const toasts = [...document.querySelectorAll('[data-sonner-toast]')];
      const hit = toasts.find(el => el.textContent?.trim());
      if (!hit) return null;
      const text = hit.textContent.trim();
      ${needle ? `if (!text.toLowerCase().includes(${JSON.stringify(needle)})) return { waiting: text };` : ''}
      return { text, count: toasts.length };
    })()`)
    if (match?.text) return match
    await sleep(300)
  }
  const leftover = await evalJs(
    `[...document.querySelectorAll('[data-sonner-toast]')].map(el => el.textContent?.trim()).filter(Boolean)`
  )
  throw new Error(
    `toast did not appear${textIncludes ? ` (${textIncludes})` : ''}${leftover.length ? `; saw: ${leftover.join(' | ')}` : ''}`
  )
}

async function restoreFetch() {
  await evalJs(`(() => {
    if (window.__origFetch) window.fetch = window.__origFetch;
    return 'restored';
  })()`)
}

async function dismissToasts() {
  await evalJs(`(() => {
    document.querySelectorAll('[data-sonner-toast] [data-close-button]').forEach(btn => btn.click());
    return 'dismissed';
  })()`)
  await sleep(300)
}

async function clickExportAllData() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await evalJs(`(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Export All Data'));
      if (!btn) return { status: 'missing' };
      if (btn.disabled || btn.textContent?.includes('Exporting')) return { status: 'busy', text: btn.textContent };
      btn.scrollIntoView({ block: 'center' });
      btn.click();
      return { status: 'clicked' };
    })()`)
    if (result.status === 'clicked') return
    await sleep(500)
  }
  throw new Error('Export All Data button not clickable')
}

async function toastSuccessShot(name) {
  await restoreFetch()
  await dismissToasts()
  await navigate(`${BASE}/settings`)
  await sleep(500)
  await clickExportAllData()
  await waitForToast('exported successfully')
  await sleep(600)
  await screenshot(join(DOCS, name))
}

async function mockExportFailure() {
  await evalJs(`(() => {
    window.__origFetch = window.__origFetch || window.fetch;
    window.fetch = async (u, ...a) => String(u).includes('/api/export/all')
      ? new Response('fail', { status: 500 })
      : window.__origFetch(u, ...a);
    return 'mocked';
  })()`)
}

async function toastErrorShot(name) {
  await restoreFetch()
  await dismissToasts()
  await navigate(`${BASE}/settings`)
  await mockExportFailure()
  await clickExportAllData()
  await waitForToast('Failed to export')
  await sleep(400)
  await screenshot(join(DOCS, name))
  await restoreFetch()
}

async function beforeShot(theme) {
  await navigate(`${BASE}/library`)
  await screenshot(join(DOCS, `toast-before-${theme}-library.png`))
}

execSync('chrome-devtools-axi stop 2>/dev/null || true', { env })
execSync('chrome-devtools-axi start', { stdio: 'inherit', env })
await setViewport(1440, 900)

for (const theme of ['classic', 'tropical']) {
  await ensureTheme(theme)
  await beforeShot(theme)
  await toastSuccessShot(`toast-after-${theme}-success.png`)
  await toastErrorShot(`toast-after-${theme}-error.png`)
}

await setViewport(780, 900)
await ensureTheme('classic')
await toastSuccessShot('toast-after-classic-narrow-success.png')
await setViewport(1440, 900)

console.log('done')
