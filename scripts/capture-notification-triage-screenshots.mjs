#!/usr/bin/env node
/**
 * Notification triage screenshots — silent success, inline error, surviving toast.
 * Both themes with Upload-button colour proof (classic blue vs tropical teal).
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import http from 'node:http'
import WebSocket from 'ws'

const DOCS = join(process.cwd(), 'docs/screenshots')
const BASE = process.env.BASE || 'http://localhost:3001'
const BASE_HOST = new URL(BASE).host
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

async function getPage(urlHint) {
  const targets = await new Promise((resolve, reject) => {
    http
      .get('http://127.0.0.1:9222/json/list', (res) => {
        let data = ''
        res.on('data', (c) => (data += c))
        res.on('end', () => resolve(JSON.parse(data)))
      })
      .on('error', reject)
  })
  const pages = targets.filter((t) => t.type === 'page' && t.url.includes(BASE_HOST))
  if (urlHint) {
    const matches = pages.filter((t) => t.url.includes(urlHint))
    if (matches.length > 0) return matches[0]
  }
  return pages[0]
}

async function withCdp(fn, urlHint) {
  const page = await getPage(urlHint)
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

async function evalJs(expr, urlHint) {
  return withCdp(async (send) => {
    const result = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
    return result.result.value
  }, urlHint)
}

async function installCookies() {
  await withCdp(async (send) => {
    await send('Network.enable')
    for (const c of parseNetscapeCookies(COOKIE_FILE)) {
      await send('Network.setCookie', { ...c, url: BASE })
    }
  })
}

async function screenshot(path, urlHint) {
  await withCdp(async (send) => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(path, Buffer.from(data, 'base64'))
  }, urlHint)
  console.log('screenshot', path)
}

async function readThemeState(urlHint) {
  return evalJs(`({
    html: document.documentElement.getAttribute('data-theme'),
    cookie: document.cookie.match(/ui-theme=([^;]+)/)?.[1] ?? null,
    upload: getComputedStyle(
      document.querySelector('header button.bg-primary') ||
      [...document.querySelectorAll('header button')].find(b => b.textContent?.trim() === 'Upload') ||
      document.body
    ).backgroundColor,
    toastCount: document.querySelectorAll('[data-sonner-toast]').length
  })`, urlHint)
}

async function ensureTheme(theme) {
  axi(['open', `${BASE}/settings`])
  await sleep(2000)
  const wantTropical = theme === 'tropical'
  const on = await evalJs(
    `document.querySelector('button[role="switch"]')?.closest('div')?.textContent?.includes('Tropical Boutique UI') && document.querySelector('button[role="switch"]')?.getAttribute('aria-checked') === 'true'`,
    '/settings'
  )
  if (on !== wantTropical) {
    await evalJs(`(() => {
      const row = [...document.querySelectorAll('div')].find(d => d.textContent?.includes('Tropical Boutique UI') && d.querySelector('button[role="switch"]'));
      row?.querySelector('button[role="switch"]')?.click();
      return 'toggled';
    })()`, '/settings')
    await sleep(3500)
  }
  for (let i = 0; i < 20; i++) {
    const state = await readThemeState('/settings')
    const ok = wantTropical ? state.html === 'tropical' : state.html !== 'tropical'
    if (ok) return state
    await sleep(400)
  }
  throw new Error(`theme ${theme} not applied`)
}

async function dismissToasts(urlHint) {
  await evalJs(`(() => {
    document.querySelectorAll('[data-sonner-toast] [data-close-button]').forEach(b => b.click());
    return document.querySelectorAll('[data-sonner-toast]').length;
  })()`, urlHint)
  await sleep(300)
}

async function openCreateDialog(theme) {
  const opened = await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('New Collection'));
    btn?.click();
    return !!btn;
  })()`, '/collections')
  if (!opened) throw new Error(`New Collection button not found in ${theme}`)
  await sleep(800)
  const hasInput = await evalJs(`!!document.querySelector('input#name')`, '/collections')
  if (!hasInput) throw new Error(`create dialog did not open in ${theme}`)
}

async function captureInlineError(theme) {
  await dismissToasts('/collections')
  axi(['open', `${BASE}/collections`])
  await sleep(2000)
  await openCreateDialog(theme)

  const submitted = await evalJs(`(() => {
    const input = document.querySelector('input#name');
    if (!input) return false;
    input.focus();
    const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    input.dispatchEvent(new KeyboardEvent('keydown', init));
    input.dispatchEvent(new KeyboardEvent('keyup', init));
    return true;
  })()`, '/collections')
  if (!submitted) throw new Error(`name input not found in ${theme}`)
  await sleep(600)

  const state = await readThemeState('/collections')
  const inlineError = await evalJs(`(() => {
    const el = [...document.querySelectorAll('p')].find(p => p.textContent?.trim() === 'Collection name is required');
    return el ? el.textContent.trim() : null;
  })()`, '/collections')
  if (!inlineError) throw new Error(`expected inline name error in ${theme}, found none`)
  if (state.toastCount > 0) {
    throw new Error(`expected inline-only validation error in ${theme}, saw ${state.toastCount} toast(s)`)
  }
  await screenshot(join(DOCS, `notify-triage-inline-error-${theme}.png`), '/collections')
  return { scenario: 'inline-error', theme, inlineError, ...state }
}

async function captureSilentSuccess(theme) {
  await dismissToasts('/collections')
  axi(['open', `${BASE}/collections`])
  await sleep(2000)
  const name = `Triage Silent ${Date.now()}`
  await openCreateDialog(theme)

  const typed = await evalJs(`(() => {
    const input = document.querySelector('input#name');
    if (!input) return null;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, ${JSON.stringify(name)});
    input.dispatchEvent(new Event('input', { bubbles: true }));
    return input.value;
  })()`, '/collections')
  if (typed !== name) throw new Error(`name not typed in ${theme}, input holds ${typed}`)
  await sleep(400)

  const clicked = await evalJs(`(() => {
    const create = [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Create Collection');
    if (!create || create.disabled) return false;
    create.click();
    return true;
  })()`, '/collections')
  if (!clicked) throw new Error(`Create Collection button missing or disabled in ${theme}`)
  await sleep(1500)

  let landed = { dialogOpen: true, listed: false }
  for (let i = 0; i < 24; i++) {
    landed = await evalJs(
      `({ dialogOpen: !!document.querySelector('input#name'), listed: document.body.textContent.includes(${JSON.stringify(name)}) })`,
      '/collections'
    )
    if (!landed.dialogOpen && landed.listed) break
    await sleep(500)
  }
  const state = await readThemeState('/collections')
  if (landed.dialogOpen) throw new Error(`create dialog still open in ${theme} — submit did not land`)
  if (!landed.listed) throw new Error(`created collection not visible in ${theme}`)
  if (state.toastCount > 0) {
    throw new Error(`expected silent create in ${theme}, saw ${state.toastCount} toast(s)`)
  }
  await screenshot(join(DOCS, `notify-triage-silent-success-${theme}.png`), '/collections')
  return { scenario: 'silent-success', theme, created: name, ...state }
}

async function captureSurvivingToast(theme) {
  await dismissToasts('/settings')
  axi(['open', `${BASE}/settings`])
  await sleep(2000)
  await evalJs(`(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('Export All Data'));
    btn?.scrollIntoView({ block: 'center' });
    btn?.click();
    return btn?.textContent ?? 'missing';
  })()`, '/settings')
  let visibleToast = false
  for (let i = 0; i < 80; i++) {
    visibleToast = await evalJs(`(() => {
      const toast = document.querySelector('[data-sonner-toast]');
      if (!toast) return false;
      const style = getComputedStyle(toast);
      const bounds = toast.getBoundingClientRect();
      return Number.parseFloat(style.opacity) >= 0.9 && bounds.height > 0 && bounds.top >= 70;
    })()`, '/settings')
    if (visibleToast) {
      await sleep(150)
      visibleToast = await evalJs(`(() => {
        const toast = document.querySelector('[data-sonner-toast]');
        if (!toast) return false;
        const style = getComputedStyle(toast);
        const bounds = toast.getBoundingClientRect();
        return Number.parseFloat(style.opacity) >= 0.9 && bounds.height > 0 && bounds.top >= 70;
      })()`, '/settings')
      if (visibleToast) break
    }
    await sleep(250)
  }
  const state = await readThemeState('/settings')
  if (!visibleToast || state.toastCount === 0) throw new Error(`expected visible export toast in ${theme}`)
  await screenshot(join(DOCS, `notify-triage-toast-survived-${theme}.png`), '/settings')
  return { scenario: 'toast-survived', theme, ...state }
}

async function main() {
  // Attach to headless Chrome on :9222 (launched separately with --remote-debugging-port).
  try {
    axi(['pages'])
  } catch {
    throw new Error('Chrome not reachable on CHROME_DEVTOOLS_AXI_BROWSER_URL — launch headless Chrome first')
  }
  try {
    axi(['open', `${BASE}/library`])
  } catch {
    axi(['newpage', `${BASE}/library`])
  }
  axi(['resize', '1440', '900'])
  await installCookies()
  axi(['open', `${BASE}/library`])
  await sleep(1500)

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
