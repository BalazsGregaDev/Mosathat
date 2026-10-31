import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
const gyoker = process.argv[2]
const v = JSON.parse(await readFile(process.argv[3], 'utf8'))
const minta = (src) => new RegExp('^' + src.replace(/:kod\*/g, '.*').replace(/\(\.\*\)/g, '.*') + '$')
const TIPUS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webp': 'image/webp', '.json': 'application/json' }
http.createServer(async (req, res) => {
  const ut = decodeURIComponent(req.url.split('?')[0])
  let fajl = join(gyoker, ut)
  let van = false
  try { van = (await stat(fajl)).isFile() } catch { van = false }
  if (!van) {
    const r = v.rewrites.find((x) => minta(x.source).test(ut))
    fajl = join(gyoker, r ? r.destination : '/index.html')
  }
  for (const h of v.headers) if (minta(h.source).test(ut)) for (const { key, value } of h.headers) res.setHeader(key, value)
  try {
    const tartalom = await readFile(fajl)
    res.setHeader('Content-Type', TIPUS[extname(fajl)] ?? 'application/octet-stream')
    res.end(tartalom)
  } catch { res.statusCode = 404; res.end('nincs') }
}).listen(5180)
