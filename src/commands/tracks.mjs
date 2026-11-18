// Track commands: list · stats · upload · bulk · edit · artwork · delete · links
import fs from 'node:fs'
import path from 'node:path'
import { Genre, Mood } from '@audius/sdk'
import { client, userByHandle, allTracks, fileOf, mb, mustExist, apiError, die, emit, fmtDur, confirm, trackUrl, embedUrl } from '../core.mjs'

const LOG = () => path.join(process.cwd(), 'published.json')
const readLog = () => fs.existsSync(LOG()) ? JSON.parse(fs.readFileSync(LOG(), 'utf8')) : []
const writeLog = rows => fs.writeFileSync(LOG(), JSON.stringify(rows, null, 1))

function checkMeta (m) {
  if (m.genre && !Object.values(Genre).includes(m.genre)) die(`unknown genre « ${m.genre} » — run: audius-tools genres`)
  if (m.mood && !Object.values(Mood).includes(m.mood)) die(`unknown mood « ${m.mood} » — run: audius-tools genres`)
}

function metaFrom (o) {
  const m = { title: o.title, genre: o.genre }
  if (o.mood) m.mood = o.mood
  if (o.tags) m.tags = String(o.tags)
  if (o.desc || o.description) m.description = o.desc || o.description
  if (o.unlisted !== undefined) m.isUnlisted = o.unlisted === true || o.unlisted === 'true'
  if (o.downloadable) m.isDownloadable = true
  if (o.license) m.license = o.license
  if (o.isrc) m.isrc = o.isrc
  return m
}

async function uploadOne (audius, user, item, onLine = () => {}) {
  let last = -1
  const audio = await audius.uploads.createAudioUpload({
    file: fileOf(item.file), userId: user.id, previewStartSeconds: Number(item.preview || 30),
    onProgress: p => { const v = Math.round(((p?.loaded ?? 0) / (p?.total || 1)) * 100); if (v >= last + 10) { last = v; onLine(` ${v}%`) } }
  }).start()
  if (!audio?.trackCid) throw new Error('storage returned no trackCid: ' + JSON.stringify(audio))
  const cover = item.cover ? await audius.uploads.createImageUpload({ file: fileOf(item.cover) }).start() : null
  const res = await audius.tracks.createTrack({
    userId: user.id,
    metadata: { ...metaFrom(item), trackCid: audio.trackCid, previewCid: audio.previewCid, previewStartSeconds: Number(item.preview || 30),
      origFileCid: audio.origFileCid, origFilename: audio.origFilename, duration: Math.round(audio.duration || 0),
      ...(audio.bpm ? { bpm: audio.bpm } : {}), ...(audio.musicalKey ? { musicalKey: audio.musicalKey } : {}),
      ...(cover ? { coverArtSizes: cover } : {}) }
  })
  return res?.trackId ?? res?.data?.trackId ?? res?.data?.id ?? null
}

export const tracks = {
  async list (a, env) {
    const audius = client(env); const user = await userByHandle(audius, a.handle || env.AUDIUS_HANDLE)
    const rows = await allTracks(audius, user.id)
    emit(rows, [{ h: 'id', v: t => t.id }, { h: 'title', v: t => t.title, max: 48 }, { h: 'genre', v: t => t.genre },
      { h: 'length', v: t => fmtDur(t.duration), right: true }, { h: 'plays', v: t => t.playCount ?? 0, right: true },
      { h: 'url', v: t => trackUrl(t), max: 70 }], a)
  },

  async stats (a, env) {
    const audius = client(env); const user = await userByHandle(audius, a.handle || env.AUDIUS_HANDLE)
    const rows = await allTracks(audius, user.id)
    for (const t of rows) {
      try { t._comments = (await audius.tracks.getTrackCommentCount({ trackId: t.id }))?.data ?? '' } catch { t._comments = '' }
    }
    rows.sort((x, y) => (y.playCount ?? 0) - (x.playCount ?? 0))
    emit(rows, [{ h: 'id', v: t => t.id }, { h: 'title', v: t => t.title, max: 44 }, { h: 'plays', v: t => t.playCount ?? 0, right: true },
      { h: 'favs', v: t => t.favoriteCount ?? 0, right: true }, { h: 'reposts', v: t => t.repostCount ?? 0, right: true },
      { h: 'comments', v: t => t._comments, right: true }, { h: 'released', v: t => { const d = new Date(t.releaseDate || t.createdAt); return isNaN(d) ? '' : d.toISOString().slice(0, 10) } }], a)
    if (!a.json && !a.csv) {
      const sum = k => rows.reduce((s, t) => s + (t[k] ?? 0), 0)
      console.log(`\n@${user.handle} · ${rows.length} tracks · ${sum('playCount')} plays · ${sum('favoriteCount')} favorites · ${sum('repostCount')} reposts · ${user.followerCount ?? 0} followers`)
    }
  },

  async upload (a, env) {
    for (const k of ['file', 'title', 'genre']) if (!a[k]) die(`--${k} is required`)
    mustExist(a.file, 'audio file'); if (a.cover) mustExist(a.cover, 'cover')
    const meta = metaFrom(a); checkMeta(meta)
    const audius = client(env, { write: true }); const user = await userByHandle(audius, env.AUDIUS_HANDLE)
    confirm(a, `@${user.handle} ← ${a.file} (${mb(a.file)})${a.cover ? ` + cover ${a.cover}` : ''}\n  ${JSON.stringify(meta)}\n  visibility: ${meta.isUnlisted ? 'UNLISTED' : 'PUBLIC'}`)
    try {
      const id = await uploadOne(audius, user, a, s => process.stdout.write(s))
      console.log(`\n✓ published · ${id} · https://audius.co/${user.handle}`)
      writeLog([...readLog(), { at: new Date().toISOString(), file: a.file, title: a.title, trackId: id, unlisted: !!meta.isUnlisted }])
    } catch (e) { die(`Audius refused: ${await apiError(e)}`, 4) }
  },

  async bulk (a, env) {
    const mf = a._[1] || a.manifest; mustExist(mf, 'manifest')
    const m = JSON.parse(fs.readFileSync(mf, 'utf8')); const base = path.dirname(path.resolve(mf))
    const items = (m.tracks || []).map(t => ({ ...(m.defaults || {}), ...t }))
      .map(t => ({ ...t, file: path.resolve(base, t.file), ...(t.cover ? { cover: path.resolve(base, t.cover) } : {}) }))
    const done = new Set(readLog().map(r => `${path.resolve(r.file)}|${r.title}`))
    const todo = items.filter(t => a.force || !done.has(`${t.file}|${t.title}`))
    for (const t of todo) { if (!t.title || !t.genre) die(`each track needs title + genre (${t.file})`); mustExist(t.file, 'audio file'); if (t.cover) mustExist(t.cover, 'cover'); checkMeta(metaFrom(t)) }
    const audius = client(env, { write: true }); const user = await userByHandle(audius, env.AUDIUS_HANDLE)
    confirm(a, `@${user.handle} · ${todo.length} to publish, ${items.length - todo.length} already in published.json (skipped)\n` +
      todo.map((t, i) => `  ${i + 1}. ${t.title} ← ${path.basename(t.file)} (${mb(t.file)})${t.cover ? ' + cover' : ''}${t.unlisted ? ' · unlisted' : ''}`).join('\n'))
    for (const t of todo) {
      process.stdout.write(`↑ ${t.title}`)
      try {
        const id = await uploadOne(audius, user, t, s => process.stdout.write(s))
        console.log(` ✓ ${id}`)
        writeLog([...readLog(), { at: new Date().toISOString(), file: t.file, title: t.title, trackId: id, unlisted: !!t.unlisted }])
      } catch (e) { console.log(''); die(`stopped at « ${t.title} »: ${await apiError(e)} — fix it and run again, finished tracks are skipped`, 4) }
      await new Promise(r => setTimeout(r, Number(a.pause || 3) * 1000))
    }
  },

  async edit (a, env) {
    if (!a.track) die('--track <id> is required')
    const meta = {}
    if (a.title) meta.title = a.title
    if (a.genre) meta.genre = a.genre
    if (a.mood) meta.mood = a.mood
    if (a.tags) meta.tags = String(a.tags)
    if (a.desc || a.description) meta.description = a.desc || a.description
    if (a.license) meta.license = a.license
    if (a.unlisted !== undefined) meta.isUnlisted = a.unlisted !== 'false'
    if (a.public) meta.isUnlisted = false
    if (!Object.keys(meta).length) die('nothing to change: --title --genre --mood --tags --desc --license --unlisted --public')
    checkMeta(meta)
    const audius = client(env, { write: true }); const user = await userByHandle(audius, env.AUDIUS_HANDLE)
    confirm(a, `track ${a.track} ← ${JSON.stringify(meta)}`)
    try { await audius.tracks.updateTrack({ userId: user.id, trackId: a.track, metadata: meta }); console.log(`✓ updated ${a.track}`) } catch (e) { die(`Audius refused: ${await apiError(e)}`, 4) }
  },

  async artwork (a, env) {
    if (!a.track) die('--track <id> is required'); mustExist(a.cover, 'cover')
    const audius = client(env, { write: true }); const user = await userByHandle(audius, env.AUDIUS_HANDLE)
    confirm(a, `track ${a.track} ← cover ${a.cover} (${mb(a.cover)})`)
    try {
      const cid = await audius.uploads.createImageUpload({ file: fileOf(a.cover) }).start()
      await audius.tracks.updateTrack({ userId: user.id, trackId: a.track, metadata: { coverArtSizes: cid } })
      console.log(`✓ cover updated · ${a.track} · cid ${cid}`)
    } catch (e) { die(`Audius refused: ${await apiError(e)}`, 4) }
  },

  async delete (a, env) {
    if (!a.track) die('--track <id> is required')
    const audius = client(env, { write: true }); const user = await userByHandle(audius, env.AUDIUS_HANDLE)
    const t = (await audius.tracks.getTrack({ trackId: a.track }))?.data
    if (!t || String(t.user?.id) !== String(user.id)) die(`track ${a.track} is not one of @${user.handle}'s tracks`)
    if (a.yes && a.confirm !== t.id) die(`deleting is permanent: add --confirm ${t.id} as well as --yes`)
    confirm(a, `DELETE « ${t.title} » (${t.id}, ${t.playCount ?? 0} plays) — permanent`)
    try { await audius.tracks.deleteTrack({ userId: user.id, trackId: t.id }); console.log(`✓ deleted ${t.id}`) } catch (e) { die(`Audius refused: ${await apiError(e)}`, 4) }
  },

  async links (a, env) {
    const audius = client(env)
    let list
    if (a.track) list = [(await audius.tracks.getTrack({ trackId: a.track }))?.data].filter(Boolean)
    else { const user = await userByHandle(audius, a.handle || env.AUDIUS_HANDLE); list = await allTracks(audius, user.id) }
    if (!list.length) die('no track found')
    if (a.md) {
      console.log(list.map(t => `- [${t.title}](${trackUrl(t)})`).join('\n')); return
    }
    for (const t of list) {
      console.log(`${t.title}\n  page   ${trackUrl(t)}\n  embed  <iframe src="${embedUrl(t.id)}" width="100%" height="480" allow="encrypted-media" style="border:none"></iframe>\n  card   ${embedUrl(t.id, 'track', 'compact')}\n`)
    }
  }
}
