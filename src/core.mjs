// Shared helpers: .env loading, argv parsing, SDK client, files, output (table / json / csv).
import fs from 'node:fs'
import path from 'node:path'
import { sdk } from '@audius/sdk'

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')

export function loadEnv () {
  const file = process.env.AUDIUS_ENV ? path.resolve(process.env.AUDIUS_ENV) : path.join(process.cwd(), '.env')
  const out = {}
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && !line.trim().startsWith('#')) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  for (const [k, v] of Object.entries(process.env)) if (k.startsWith('AUDIUS_')) out[k] = v
  out.__file = file
  return out
}

export function parseArgs (argv) {
  const a = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k.startsWith('--')) {
      const [key, inline] = k.slice(2).split('=')
      if (inline !== undefined) { a[key] = inline; continue }
      const n = argv[i + 1]
      if (n === undefined || n.startsWith('--')) a[key] = true; else { a[key] = n; i++ }
    } else a._.push(k)
  }
  return a
}

export const die = (msg, code = 1) => { console.error('✖ ' + msg); process.exit(code) }

/** Read-only client (no credentials needed) or authenticated client (API key + bearer token from .env). */
export function client (env, { write = false } = {}) {
  const appName = env.AUDIUS_APP_NAME || 'audius-tools'
  // Read-only: no apiKey. With an apiKey but no bearer token the SDK waits for a signer that never comes (calls hang).
  if (!write) return sdk({ appName })
  const miss = ['AUDIUS_API_KEY', 'AUDIUS_BEARER_TOKEN', 'AUDIUS_HANDLE'].filter(k => !env[k])
  if (miss.length) die(`missing in ${env.__file}: ${miss.join(', ')} (see .env.example)`, 2)
  return sdk({ appName, apiKey: env.AUDIUS_API_KEY, bearerToken: env.AUDIUS_BEARER_TOKEN })
}

export async function userByHandle (audius, handle) {
  if (!handle) die('no handle: pass --handle <name> or set AUDIUS_HANDLE in .env')
  const r = await audius.users.getUserByHandle({ handle: String(handle).replace(/^@/, '') })
  if (!r?.data?.id) die(`user @${handle} not found`, 3)
  return r.data
}

export async function allTracks (audius, userId) {
  const out = []
  for (let offset = 0; ; offset += 100) {
    const r = await audius.users.getTracksByUser({ id: userId, limit: 100, offset })
    const page = r?.data || []
    out.push(...page)
    if (page.length < 100) return out
  }
}

const MIME = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.aiff': 'audio/aiff', '.ogg': 'audio/ogg',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
export const fileOf = p => ({ buffer: Buffer.from(fs.readFileSync(p)), name: path.basename(p), type: MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' })
export const mb = p => (fs.statSync(p).size / 1e6).toFixed(1) + ' MB'
export const mustExist = (p, what) => { if (!p || !fs.existsSync(p)) die(`${what} not found: ${p}`) }

/** Show the API's real answer (body), never the token. */
export async function apiError (e) {
  let body = ''
  try { body = await e.response?.text() } catch {}
  return `HTTP ${e.response?.status ?? '?'} ${e.response?.statusText ?? ''} — ${body || e.message}`.trim()
}

export const trackUrl = t => t?.permalink ? `https://audius.co${t.permalink}` : `https://audius.co/tracks/${t.id}`
export const embedUrl = (id, kind = 'track', flavor = 'card') => `https://audius.co/embed/${kind}/${id}?flavor=${flavor}`

// ---------- output ----------
export function emit (rows, cols, a) {
  if (a.json) return console.log(JSON.stringify(rows, null, 2))
  if (a.csv) {
    const esc = v => { const s = v == null ? '' : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const text = [cols.map(c => c.h).join(','), ...rows.map(r => cols.map(c => esc(c.v(r))).join(','))].join('\n')
    if (typeof a.csv === 'string') { fs.writeFileSync(a.csv, text + '\n'); return console.log(`✓ ${rows.length} rows → ${a.csv}`) }
    return console.log(text)
  }
  const cells = rows.map(r => cols.map(c => String(c.v(r) ?? '')))
  const w = cols.map((c, i) => Math.min(c.max || 60, Math.max(c.h.length, ...cells.map(x => x[i].length))))
  const line = xs => xs.map((s, i) => (cols[i].right ? s.padStart(w[i]) : s.slice(0, w[i]).padEnd(w[i]))).join('  ')
  console.log(line(cols.map(c => c.h)))
  console.log(w.map(n => '─'.repeat(n)).join('  '))
  for (const c of cells) console.log(line(c))
}

export const fmtDur = s => s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export function confirm (a, plan) {
  console.log(plan)
  if (!a.yes) { console.log('\n(dry run — nothing was sent. Add --yes to apply.)'); process.exit(0) }
}
