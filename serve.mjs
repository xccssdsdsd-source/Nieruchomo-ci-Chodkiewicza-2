import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { extname, join } from 'path'

const port = 3001
const root = process.cwd()

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
}

createServer(async (req, res) => {
  const path = req.url === '/' ? '/index.html' : decodeURIComponent(req.url.split('?')[0])
  try {
    const data = await readFile(join(root, path))
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
}).listen(port, () => console.log(`http://localhost:${port}`))
