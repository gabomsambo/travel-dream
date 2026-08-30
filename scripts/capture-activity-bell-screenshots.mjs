#!/usr/bin/env node
/**
 * Live screenshots for the header activity bell in both visual themes.
 *
 * Requires: Chromium with --remote-debugging-port=9222, chrome-devtools-axi
 * attached to that port, and the app on :3001 with AUTH_URL matching.
 */
import { execSync, execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import http from 'node:http'
import WebSocket from 'ws'

const DOCS = join(process.cwd(), 'docs/screenshots')
const BASE = process.env.BASE || 'http://localhost:3001'
const BASE_ORIGIN = new URL(BASE).origin
mkdirSync(DOCS, { recursive: true })

const SESSION = process.env.CHROME_DEVTOOLS_AXI_SESSION || 'td-activity-bell'
const env = {
  ...process.env,
  CHROME_DEVTOOLS_AXI_BROWSER_URL: 'http://127.0.0.1:9222',
  CHROME_DEVTOOLS_AXI_SESSION: SESSION,
  CHROME_DEVTOOLS_AXI_BRIDGE_TIMEOUT_MS: '180000',
}

const COOKIE_FILE = '/tmp/td-toast-cookies.txt'

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function axi(args) {
  try {
    return execFileSync('chrome-devtools-axi', args, { env, encoding: 'utf8', timeout: 120000 })
  } catch (err) {
    const extra = [err.stdout, err.stderr].filter(Boolean).join('\n')
    throw new Error(`chrome-devtools-axi ${args.join(' ')}\n${extra}`)
  }
}

function parseAxiEval(out) {
  const line = out.split('\n').find(l => l.startsWith('result:'))
  if (!line) return out.trim()
  const raw = line.slice('result:'.length).trim()
  try {
    let value = JSON.parse(raw)
    if (typeof value === 'string') {
      try { value = JSON.parse(value) } catch { /* keep string */ }
    }
    return value
  } catch {
    return raw
  }
}

function selectedPageUrl() {
  const out = axi(['pages'])
  const line = out.split('\n').map(l => l.trim()).find(l => /,(true)$/.test(l))
  if (!line) return null
  const parts = line.split(',')
  return parts.slice(1, -1).join(',')
}

async function getPage() {
  const targets = await new Promise((resolve, reject) => {
    http
      .get('http://127.0.0.1:9222/json/list', res => {
        let data = ''
        res.on('data', c => (data += c))
        res.on('end', () => resolve(JSON.parse(data)))
      })
      .on('error', reject)
  })
  const selected = selectedPageUrl()
  return (
    (selected && targets.find(t => t.type === 'page' && t.url === selected)) ||
    targets.find(t => t.type === 'page' && t.url.startsWith(BASE_ORIGIN) && t.url.includes('/library')) ||
    targets.find(t => t.type === 'page' && t.url.startsWith(BASE_ORIGIN)) ||
    targets.find(t => t.type === 'page')
  )
}

async function withCdp(fn) {
  const page = await getPage()
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  ws.on('message', raw => {
    const msg = JSON.parse(raw)
    if (msg.id && pending.has(msg.id)) pending.get(msg.id)(msg)
  })
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const msgId = ++id
      pending.set(msgId, msg => (msg.error ? reject(msg.error) : resolve(msg.result)))
      ws.send(JSON.stringify({ id: msgId, method, params }))
    })
  await new Promise(r => ws.once('open', r))
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
    } else if (!line || line.startsWith('#')) {
      continue
    }
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

const COMPLETE_JOB = [
  {
    id: 'session_demo_done',
    kind: 'mass-upload',
    counts: {
      uploaded: 0,
      queued: 0,
      extracting: 0,
      enriching: 0,
      completed: 487,
      failed: 9,
      stalled: 4,
      cancelled: 0,
    },
    total: 500,
    placesCreated: 118,
    announced: true,
    updatedAt: new Date().toISOString(),
  },
]

const BOOTSTRAP = `(() => {
  const orig = window.fetch.bind(window);
  window.__origFetch = orig;
  window.fetch = async (input, init) => {
    const url = String(input);
    const scenario = sessionStorage.getItem('td-activity-scenario') || 'idle';
    if (url.includes('/api/upload/sessions?status=active&hasUploads=true&limit=')) {
      if (scenario === 'active') {
        return new Response(JSON.stringify({
          status: 'success',
          sessions: [{
            id: 'session_demo_live',
            status: 'active',
            startedAt: new Date().toISOString(),
            meta: { uploadedFiles: Array.from({ length: 500 }, (_, i) => 'src_' + i) },
          }],
        }), { headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ status: 'success', sessions: [] }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/api/mass-upload/status')) {
      if (scenario === 'active') {
        return new Response(JSON.stringify({
          status: 'success',
          sessionId: 'session_demo_live',
          counts: {
            uploaded: 0, queued: 258, extracting: 17, enriching: 42,
            completed: 183, failed: 0, stalled: 0, cancelled: 0,
          },
          total: 500,
          placesCreated: 42,
          failedErrors: [],
        }), { headers: { 'content-type': 'application/json' } });
      }
    }
    return orig(input, init);
  };
})()`

async function installBootstrap() {
  await withCdp(async send => {
    await send('Network.enable')
    await send('Page.enable')
    await send('Page.addScriptToEvaluateOnNewDocument', { source: BOOTSTRAP })
    const cookies = parseNetscapeCookies(COOKIE_FILE)
    for (const cookie of cookies) {
      await send('Network.setCookie', {
        name: cookie.name,
        value: cookie.value,
        url: BASE + '/',
        path: cookie.path || '/',
        httpOnly: cookie.name.startsWith('authjs.'),
        secure: false,
      })
    }
  })
}

async function evalCdp(expression) {
  return withCdp(async send => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    })
    if (result.exceptionDetails) {
      throw new Error(JSON.stringify(result.exceptionDetails))
    }
    return result.result.value
  })
}

async function readThemeState() {
  return evalCdp(`({
    html: document.documentElement.getAttribute('data-theme'),
    cookie: document.cookie.match(/ui-theme=([^;]+)/)?.[1] ?? null,
    upload: getComputedStyle(
      [...document.querySelectorAll('header button')].find(b => b.textContent?.includes('Upload')) || document.body
    ).backgroundColor
  })`)
}

async function waitHeader() {
  for (let i = 0; i < 40; i++) {
    const ready = await evalCdp(`!!document.querySelector('header button[aria-label^="Activity"]')`)
    if (ready === true) return
    await sleep(400)
  }
  throw new Error(`header did not appear at ${await evalCdp('location.href')}`)
}

async function waitTheme(theme) {
  for (let i = 0; i < 24; i++) {
    const state = await readThemeState()
    const ok = theme === 'tropical' ? state.html === 'tropical' : state.html !== 'tropical'
    if (ok) return state
    await sleep(400)
  }
  throw new Error(`theme ${theme} not ready: ${JSON.stringify(await readThemeState())}`)
}

async function openLibrary() {
  axi(['open', `${BASE}/library`])
  await waitHeader()
  await sleep(800)
}

async function applyScenario(scenario, theme) {
  axi(['open', `${BASE}/library`])
  await waitHeader()
  const ownerUserId = await evalCdp(`fetch('/api/auth/session')
    .then(response => response.json())
    .then(session => session?.user?.id ?? null)`)
  if (!ownerUserId) {
    throw new Error('authenticated user id is required to seed activity jobs')
  }
  const storageKey = `td:activity-jobs:v1:${ownerUserId}`
  const completedJobs = COMPLETE_JOB.map(job => ({ ...job, ownerUserId }))
  await withCdp(async send => {
    await send('Runtime.evaluate', {
      expression: `
        sessionStorage.setItem('td-activity-scenario', ${JSON.stringify(scenario)});
        document.cookie = 'ui-theme=${theme}; path=/; max-age=31536000; samesite=lax';
        ${scenario === 'complete'
          ? `localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(JSON.stringify(completedJobs))});`
          : `localStorage.removeItem(${JSON.stringify(storageKey)});`}
        'ok'
      `,
      returnByValue: true,
    })
    await send('Page.enable')
    await send('Page.reload', { ignoreCache: true })
  })
  await sleep(1000)
  await waitHeader()
  if (scenario === 'active') {
    const injected = await withCdp(async send => {
      const result = await send('Runtime.evaluate', {
        expression: `
          sessionStorage.setItem('td-activity-scenario', 'active');
          const s = document.createElement('script');
          s.textContent = ${JSON.stringify(BOOTSTRAP)};
          document.documentElement.appendChild(s);
          s.remove();
          typeof window.__origFetch
        `,
        returnByValue: true,
      })
      return result.result ? result.result.value : result.value
    })
    console.log('fetch inject', injected)
    await sleep(6500)
  }
  const state = await waitTheme(theme)
  console.log('ready', theme, scenario, {
    ...state,
    href: await evalCdp('location.href'),
    fetchPatched: await evalCdp('typeof window.__origFetch === "function"'),
    scenario: await evalCdp('sessionStorage.getItem("td-activity-scenario")'),
    indicator: await evalCdp('!!document.querySelector("[data-testid=activity-bell-indicator]")'),
  })
  return state
}

async function waitCdp(expression, label) {
  for (let i = 0; i < 20; i++) {
    const value = await evalCdp(expression)
    if (value) return value
    await sleep(400)
  }
  throw new Error(`missing ${label}`)
}

function clickActivityBell() {
  const snap = axi(['snapshot'])
  const hit = snap.split('\n').find(l => /button\s+"Activity/i.test(l) && /uid=/.test(l))
  if (!hit) {
    throw new Error(`activity bell not in snapshot:\n${snap.slice(0, 2500)}`)
  }
  const uid = hit.match(/uid=([\w:]+)/)?.[1]
  if (!uid) throw new Error(`no uid in ${hit}`)
  axi(['click', `@${uid}`])
}

async function shot(name) {
  const dest = join(DOCS, name)
  await withCdp(async send => {
    const { data } = await send('Page.captureScreenshot', { format: 'png' })
    writeFileSync(dest, Buffer.from(data, 'base64'))
  })
  console.log('screenshot', dest)
}

async function main() {
  execSync('chrome-devtools-axi stop 2>/dev/null || true', { env, stdio: 'ignore' })
  axi(['start'])
  axi(['selectpage', '1'])
  axi(['open', `${BASE}/login`])
  axi(['resize', '1440', '900'])
  await installBootstrap()

  const notes = []

  for (const theme of ['classic', 'tropical']) {
    let state = await applyScenario('idle', theme)
    notes.push({ theme, scenario: 'idle', ...state })
    await shot(`activity-bell-rest-${theme}.png`)

    state = await applyScenario('active', theme)
    notes.push({ theme, scenario: 'active', ...state })
    await waitCdp(`!!document.querySelector('[data-testid="activity-bell-indicator"]')`, 'active indicator')
    await shot(`activity-bell-active-${theme}.png`)
    clickActivityBell()
    await waitCdp(`document.body.innerText.includes('Processing 183 of 500')`, 'active summary')
    await sleep(300)
    await shot(`activity-bell-popover-active-${theme}.png`)

    state = await applyScenario('complete', theme)
    notes.push({ theme, scenario: 'complete', ...state })
    await waitCdp(`!!document.querySelector('[data-testid="activity-bell-indicator"]')`, 'complete indicator')
    clickActivityBell()
    await waitCdp(`document.body.innerText.includes('487 processed')`, 'complete summary')
    await sleep(300)
    await shot(`activity-bell-popover-complete-${theme}.png`)
  }

  writeFileSync(join(DOCS, 'activity-bell-theme-log.json'), JSON.stringify(notes, null, 2))
  console.log('theme log', notes)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
