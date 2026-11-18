#!/usr/bin/env node
// audius-tools — a CLI for independent artists on Audius: publish, bulk-upload, edit, re-cover, organise and measure your music.
import { loadEnv, parseArgs, die } from '../src/core.mjs'
import { tracks } from '../src/commands/tracks.mjs'
import { collections } from '../src/commands/collections.mjs'
import { discover } from '../src/commands/discover.mjs'

const HELP = `audius-tools — manage your music on Audius from the terminal

ACCOUNT
  check                                   API key + bearer token work, app authorised to write?
  me [--handle x]                         profile counters (followers, tracks, playlists…)

YOUR TRACKS
  list   [--handle x] [--json|--csv[=file]]          every track with id, plays and link
  stats  [--handle x] [--json|--csv[=file]]          plays, favorites, reposts, comments per track + totals
  upload --file f.mp3 --title "…" --genre Techno [--mood Dark] [--tags a,b] [--desc "…"] [--cover c.jpg] [--unlisted] [--downloadable]
  bulk   manifest.json [--pause 3] [--force]         publish a whole folder; resumes safely (published.json)
  edit   --track <id> [--title|--genre|--mood|--tags|--desc|--license] [--unlisted|--public]
  artwork --track <id> --cover c.jpg                 replace a published track's cover
  delete --track <id> --yes --confirm <id>           permanent
  links  [--track <id>] [--md]                       page URL, embeddable player (iframe), Markdown list

PLAYLISTS & ALBUMS
  playlist --title "…" --tracks id1,id2 [--cover c.jpg] [--desc "…"] [--private]
  album    --title "…" --tracks id1,id2 [--cover c.jpg] [--desc "…"]
  playlist-add --playlist <id> --track <id>        playlist-remove --playlist <id> --track <id> --index <n>
  collections [--handle x]                         your playlists and albums

DISCOVER (no account needed)
  trending [--genre Techno] [--time week|month|year|allTime] [--underground] [--limit 20]
  search <words> [--genre Trap] [--users]
  comments --track <id>
  genres                                          valid --genre / --mood values

Every write is a DRY RUN until you add --yes. Credentials: ./.env (or AUDIUS_ENV=path), see .env.example.
Cover art generator: python covers.py examples/covers.json (see README).`

const a = parseArgs(process.argv.slice(2)); const cmd = a._[0]; const env = loadEnv()
const R = {
  check: () => discover.check(a, env), me: () => discover.me(a, env),
  list: () => tracks.list(a, env), stats: () => tracks.stats(a, env), upload: () => tracks.upload(a, env), bulk: () => tracks.bulk(a, env),
  edit: () => tracks.edit(a, env), artwork: () => tracks.artwork(a, env), delete: () => tracks.delete(a, env), links: () => tracks.links(a, env),
  playlist: () => collections.create(a, env), album: () => collections.create(a, env, { album: true }),
  'playlist-add': () => collections.add(a, env), 'playlist-remove': () => collections.add(a, env, { remove: true }), collections: () => collections.list(a, env),
  trending: () => discover.trending(a, env), search: () => discover.search(a, env), comments: () => discover.comments(a, env), genres: () => discover.genres()
}
if (!cmd || a.help || cmd === 'help') { console.log(HELP); process.exit(0) }
if (!R[cmd]) die(`unknown command « ${cmd} » — run: audius-tools help`)
// The SDK waits on unref'd timers (node selection, retries): without a live handle Node would exit before the answer arrives.
const keepAlive = setInterval(() => {}, 1 << 30)
try { await R[cmd](); clearInterval(keepAlive); process.exit(0) } catch (e) { clearInterval(keepAlive); die(e?.message || String(e)) }
