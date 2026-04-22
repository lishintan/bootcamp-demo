const http = require('http')
const port = parseInt(process.env.PORT, 10) || 3000

http.createServer((req, res) => {
  res.writeHead(200)
  res.end('ok')
}).listen(port, '0.0.0.0', () => {
  console.log('listening on', port)
})
