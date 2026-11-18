// Playlists and albums: create (with cover, from track ids) · add · remove · list
import { client, userByHandle, fileOf, mustExist, apiError, die, emit, confirm, embedUrl } from '../core.mjs'

const ids = s => String(s || '').split(',').map(x => x.trim()).filter(Boolean)

export const collections = {
  async create (a, env, { album = false } = {}) {
    const name = a.title || a.name; if (!name) die('--title is required')
    const trackIds = ids(a.tracks); if (a.cover) mustExist(a.cover, 'cover')
    const audius = client(env, { write: true }); const user = await userByHandle(audius, env.AUDIUS_HANDLE)
    confirm(a, `@${user.handle} · new ${album ? 'ALBUM' : 'playlist'} « ${name} »${a.private ? ' (private)' : ''}\n  tracks: ${trackIds.join(', ') || '—'}${a.cover ? `\n  cover: ${a.cover}` : ''}`)
    try {
      const cover = a.cover ? await audius.uploads.createImageUpload({ file: fileOf(a.cover) }).start() : undefined
      const now = Math.floor(Date.now() / 1000)
      const metadata = { playlistName: name, isAlbum: album, ...(a.desc ? { description: a.desc } : {}), ...(a.private ? { isPrivate: true } : {}),
        ...(a.genre ? { genre: a.genre } : {}), ...(a.tags ? { tags: String(a.tags) } : {}), ...(cover ? { playlistImageSizesMultihash: cover } : {}),
        playlistContents: trackIds.map((trackId, i) => ({ trackId, timestamp: now + i })) }
      const r = await audius.playlists.createPlaylist({ userId: user.id, metadata })
      const id = r?.playlistId ?? r?.data?.playlistId ?? r?.data?.id
      console.log(`✓ ${album ? 'album' : 'playlist'} created · ${id ?? '?'}${id ? ` · embed ${embedUrl(id, album ? 'album' : 'playlist')}` : ''}`)
    } catch (e) { die(`Audius refused: ${await apiError(e)}`, 4) }
  },

  async add (a, env, { remove = false } = {}) {
    if (!a.playlist || !a.track) die('--playlist <id> and --track <id> are required')
    const audius = client(env, { write: true }); const user = await userByHandle(audius, env.AUDIUS_HANDLE)
    confirm(a, `${remove ? 'remove' : 'add'} track ${a.track} ${remove ? 'from' : 'to'} playlist ${a.playlist}`)
    try {
      if (remove) await audius.playlists.removeTrackFromPlaylist({ userId: user.id, playlistId: a.playlist, trackIndex: Number(a.index ?? 0) })
      else await audius.playlists.addTrackToPlaylist({ userId: user.id, playlistId: a.playlist, trackId: a.track })
      console.log('✓ done')
    } catch (e) { die(`Audius refused: ${await apiError(e)}`, 4) }
  },

  async list (a, env) {
    const audius = client(env); const user = await userByHandle(audius, a.handle || env.AUDIUS_HANDLE)
    const [pl, al] = await Promise.all([audius.users.getPlaylistsByUser({ id: user.id, limit: 100 }), audius.users.getAlbumsByUser({ id: user.id, limit: 100 })])
    const rows = [...(al?.data || []).map(x => ({ ...x, _k: 'album' })), ...(pl?.data || []).map(x => ({ ...x, _k: 'playlist' }))]
    emit(rows, [{ h: 'id', v: x => x.id }, { h: 'kind', v: x => x._k }, { h: 'name', v: x => x.playlistName, max: 44 },
      { h: 'tracks', v: x => x.trackCount ?? x.playlistContents?.length ?? '', right: true }, { h: 'favs', v: x => x.favoriteCount ?? 0, right: true }], a)
  }
}
