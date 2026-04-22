const { createServer } = require('http')
const { parse } = require('url')
const next = require('next')

const port = parseInt(process.env.PORT, 10) || 3000
const app = next({ dev: false })
const handle = app.getRequestHandler()
let ready = false

// Listen immediately so Cloud Run's TCP health check passes right away
const server = createServer((req, res) => {
  if (!ready) {
    res.writeHead(503, { 'Retry-After': '2' })
    res.end('Starting...')
    return
  }
  handle(req, res, parse(req.url, true))
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Listening on 0.0.0.0:${port} — initializing Next.js...`)
  app.prepare()
    .then(() => {
      ready = true
      console.log(`Next.js ready on port ${port}`)
    })
    .catch(err => {
      console.error('Next.js failed to start:', err)
      process.exit(1)
    })
})
