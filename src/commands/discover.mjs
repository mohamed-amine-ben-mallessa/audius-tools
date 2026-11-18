// Read-only discovery (no account needed): trending · search · comments · genres · me / check
import { Genre, Mood } from '@audius/sdk'
import { client, userByHandle, die, emit, fmtDur, trackUrl } from '../core.mjs'

const trackCols = [{ h: '#', v: t => t._i, right: true }, { h: 'title', v: t => t.title, max: 40 }, { h: 'artist', v: t => '@' + (t.user?.handle ?? ''), max: 22 },
  { h: 'genre', v: t => t.genre, max: 16 }, { h: 'length', v: t => fmtDur(t.duration), right: true }, { h: 'plays', v: t => t.playCount ?? 0, right: true },
  { h: 'url', v: t => trackUrl(t), max: 64 }]
const numbered = xs => (xs || []).map((t, i) => ({ ...t, _i: i + 1 }))

export const discover = {
  async trending (a, env) {
    const audius = client(env)
    const time = ['week', 'month', 'year', 'allTime'].includes(a.time) ? a.time : 'week'
    const fn = a.underground ? 'getUndergroundTrendingTracks' : 'getTrendingTracks'
    const r = await audius.tracks[fn]({ limit: Number(a.limit || 20), ...(a.genre && !a.underground ? { genre: a.genre } : {}), ...(a.underground ? {} : { time }) })
    emit(numbered(r?.data), trackCols, a)
  },

  async search (a, env) {
    const q = a._.slice(1).join(' ') || a.query; if (!q) die('usage: audius-tools search <words> [--genre Techno] [--users]')
    const audius = client(env)
    if (a.users) {
      const r = await audius.users.searchUsers({ query: q, limit: Number(a.limit || 20) })
      return emit(numbered(r?.data), [{ h: '#', v: u => u._i, right: true }, { h: 'handle', v: u => '@' + u.handle }, { h: 'name', v: u => u.name, max: 30 },
        { h: 'followers', v: u => u.followerCount ?? 0, right: true }, { h: 'tracks', v: u => u.trackCount ?? 0, right: true }], a)
    }
    const r = await audius.tracks.searchTracks({ query: q, limit: Number(a.limit || 20), ...(a.genre ? { genre: [a.genre] } : {}) })
    emit(numbered(r?.data), trackCols, a)
  },

  async comments (a, env) {
    if (!a.track) die('--track <id> is required')
    const audius = client(env)
    const r = await audius.tracks.getTrackComments({ trackId: a.track, limit: Number(a.limit || 50) })
    const rows = (r?.data || []).map((c, i) => ({ ...c, _i: i + 1 }))
    const users = Object.fromEntries((r?.related?.users || []).map(u => [u.id, u.handle]))
    emit(rows, [{ h: '#', v: c => c._i, right: true }, { h: 'by', v: c => '@' + (users[c.userId] ?? c.userId) }, { h: 'at', v: c => String(c.createdAt || '').slice(0, 16) },
      { h: 'comment', v: c => String(c.message || '').replace(/\s+/g, ' '), max: 80 }], a)
  },

  genres () {
    console.log('Genres: ' + Object.values(Genre).join(' · '))
    console.log('\nMoods:  ' + Object.values(Mood).join(' · '))
  },

  async me (a, env) {
    const audius = client(env); const u = await userByHandle(audius, a.handle || env.AUDIUS_HANDLE)
    const rows = [['handle', '@' + u.handle], ['name', u.name], ['id', u.id], ['followers', u.followerCount], ['following', u.followeeCount],
      ['tracks', u.trackCount], ['playlists', u.playlistCount], ['albums', u.albumCount], ['reposts', u.repostCount],
      ['verified', u.isVerified ? 'yes' : 'no'], ['profile', `https://audius.co/${u.handle}`]]
    if (a.json) return console.log(JSON.stringify(u, null, 2))
    for (const [k, v] of rows) console.log(`${k.padEnd(10)} ${v ?? ''}`)
  },

  async check (a, env) {
    const audius = client(env, { write: true }); const u = await userByHandle(audius, env.AUDIUS_HANDLE)
    console.log(`✓ API reachable · @${u.handle} (« ${u.name} », id ${u.id}) · ${u.trackCount ?? '?'} track(s)`)
    try {
      const apps = (await audius.users.getAuthorizedApps?.({ id: u.id }))?.data || []
      const k = env.AUDIUS_API_KEY.toLowerCase().replace(/^0x/, '')
      const ours = apps.find(x => [x.address, x.apiKey].some(v => String(v || '').toLowerCase().replace(/^0x/, '') === k))
      console.log(ours ? '✓ your app is authorised to write on this account' : `⚠ your app is not in the authorised apps (${apps.map(x => x.name).join(', ') || 'none'}): writes may be refused`)
    } catch (e) { console.log('  (authorised apps not available: ' + String(e.message || e).split('\n')[0] + ')') }
  }
}
