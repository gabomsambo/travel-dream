#!/usr/bin/env node
/**
 * Notification triage screenshots — silent success, inline error, surviving toast.
 * Both themes with Upload-button colour proof (classic blue vs tropical teal).
 */
import { execSync, execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import http from 'node:http'
import WebSocket from 'ws'

const DOCS = join(process.cwd(), 'docs/screenshots')
const BASE = process.env.BASE || 'http://localhost:3001'
mkdirSync(DOCS, { recursive: true })

const SESSION = 'td-notification-triage'
const env = {
  ...process.env,
  CHROME_DEVTOOLS_AXI_BROWSER_URL: 'http://127.0.0.1:9222',
  CHROME_DEVTOOLS_AXI_SESSION: SESSION,
  CHROME_DEVTOOLS_AXI_BRIDGE_TIMEOUT_MS: '180000',
}

const COOKIE_FILE = '/tmp/td-toast-cookies.txt'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function axi(args) {
  return execFileSync('chrome-devtools-axi', args, { env, encoding: 'utf8', timeout: 120000 })
}

async function getPage() {
  const targets = await new Promise((resolve, reject) => {
    http
      .get('http://127.0.0.1:9222/json/list', (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => resolve(JSON.parse(data)))
      })
      .on('error', reject)
  })
  return targets.find((t) => t.type === 'page' && t.url.includes('localhost:3001')) ?? targets.find((t) => t.type === 'page')
}

async function withCdp(fn) {
  const page = await getPage()
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

function parseNetscapeCookies(file) {
  const cookies = []
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    let line = raw
    let httpOnly = false
    if (line.startsWith('#HttpOnly_')) {
      httpOnly = true
      line = line.replace('#HttpOnly_', '')
    } else if (!line || line.startsWith('#')) continue
    const parts = line.split('\t')
    if (parts.length < 7) continue
    cookies.push({
      name: parts[5],
      value: parts[6],
      domain: parts[0],
      path: parts[2] || '/',
      httpOnly,
      secure: parts[3] === 'TRUE',
    })
  }
  return cookies
}

async function evalJs(expr) {
  return withCdp(async (send) => {
    const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  })
}

async function installCookies() {
  await withCdp(async (send) => {
    await send('Network.enable')
    for (const c of parseNetscapeCookies(COOKIE_FILE)) {
      await send('Network.setCookie', { ...c, url: BASE })
    }
  })
}

async function screenshot(path) {
  await withCdp(async (send) => {
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
    ).backgroundColor,
    toastCount: document.querySelectorAll('[data-sonner-toast]').length
  })`)
}

async function ensureTheme(theme) {
  axi(['open', `${BASE}/settings`])
  await sleep(2000)
  const wantTropical = theme === 'tropical'
  const on = await evalJs(
    `document.querySelector('button[role="switch"]')?.closest('div')?.textContent?.includes('Tropical Boutique UI') && document.querySelector('button[role="switch"]')?.getAttribute('aria-checked') === 'true'`
  )
  if (on !== wantTropical) {
    await evalJs(`(() => {
      const row = [...document.querySelectorAll('div')].find(d => d.textContent?.includes('Tropical Boutique UI') && d.querySelector('button[role="switch"]'));
      row?.querySelector('button[role="switch"]')?.click();
      return 'toggled';
    })()`)
    await sleep(3500)
  }
  for (let i = 0; i < 20; i++) {
    const state = await readThemeState()
    const ok = wantTropical ? state.html === 'tropical' : state.html !== 'tropical'
    if (ok) return state
    await sleep(400)
  }
  throw new Error(`theme ${theme} not applied`)
}

async function dismissToasts() {
  await evalJs(`(() => {
    document.querySelectorAll('[data-sonner-toast] [data-close-button]').forEach(b => b.click());
    return document.querySelectorAll('[data-sonner-toast]').length;
  })()`)
  await sleep(300)
}

async function captureInlineError(theme) {
  await dismissToasts()
  axi(['open', `${BASE}/collections`])
  await sleep(2000)
  await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('New Collection'));
    btn?.click();
    return !!btn;
  })()`)
  await sleep(800)
  await evalJs(`(() => {
    const create = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Create');
    create?.click();
    return !!create;
  })()`)
  await sleep(600)
  const state = await readThemeState()
  await screenshot(join(DOCS, `notify-triage-inline-error-${theme}.png`))
  return { scenario: 'inline-error', theme, ...state }
}

async function captureSilentSuccess(theme) {
  await dismissToasts()
  axi(['open', `${BASE}/collections`])
  await sleep(2000)
  const stamp = Date.now()
  await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('New Collection'));
    btn?.click();
    return !!btn;
  })()`)
  await sleep(600)
  await evalJs(`(() => {
    const input = document.querySelector('input#name, input[placeholder*="Collection"], dialog input');
    if (input) {
      input.value = 'Triage Silent ${stamp}';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return input?.value ?? null;
  })()`)
  await sleep(400)
  await evalJs(`(() => {
    const create = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Create' && !b.disabled);
    create?.click();
    return !!create;
  })()`)
  await sleep(2500)
  const state = await readThemeState()
  if (state.toastCount > 0) {
    throw new Error(`expected silent create in ${theme}, saw ${state.toastCount} toast(s)`)
  }
  await screenshot(join(DOCS, `notify-triage-silent-success-${theme}.png`))
  return { scenario: 'silent-success', theme, ...state }
}

async function captureSurvivingToast(theme) {
  await dismissToasts()
  axi(['open', `${BASE}/settings`])
  await sleep(1500)
  await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Export All Data'));
    btn?.scrollIntoView({ block: 'center' });
    btn?.click();
    return btn?.textContent ?? 'missing';
  })()`)
  for (let i = 0; i < 30; i++) {
    const count = await evalJs(`document.querySelectorAll('[data-sonner-toast]').length`)
    if (count > 0) break
    await sleep(300)
  }
  await sleep(700)
  const state = await readThemeState()
  if (state.toastCount === 0) throw new Error(`expected export toast in ${theme}`)
  await screenshot(join(DOCS, `notify-triage-toast-survived-${theme}.png`))
  return { scenario: 'toast-survived', theme, ...state }
}

async function main() {
  execSync('chrome-devtools-axi stop 2>/dev/null || true', { env, stdio: 'ignore' })
  axi(['start'])
  axi(['open', `${BASE}/library`])
  axi(['resize', '1440', '900'])
  await installCookies()

  const log = []
  for (const theme of ['classic', 'tropical']) {
    const themeState = await ensureTheme(theme)
    log.push({ step: 'theme-ready', theme, ...themeState })
    log.push(await captureInlineError(theme))
    log.push(await captureSilentSuccess(theme))
    log.push(await captureSurvivingToast(theme))
  }

  writeFileSync(join(DOCS, 'notify-triage-theme-log.json'), JSON.stringify(log, null, 2))
  console.log('done', log)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
