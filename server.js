const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Find LAN IP
const ifaces = os.networkInterfaces();
let ip = 'localhost';
for (const k in ifaces) {
  for (const i of ifaces[k]) {
    if (i.family === 'IPv4' && !i.internal) {
      ip = i.address;
      break;
    }
  }
  if (ip !== 'localhost') break;
}

const DIST = path.join(__dirname, 'dist');
const MIME = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  // SPA fallback: serve index.html for routes without file extension
  if (!path.extname(urlPath)) {
    urlPath = '/index.html';
  }

  const filePath = path.join(DIST, urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Final fallback to index.html for SPA routing
      fs.readFile(path.join(DIST, 'index.html'), (err2, idxData) => {
        if (err2) {
          res.writeHead(404);
          res.end('Not found');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(idxData);
        }
      });
    } else {
      const ext = path.extname(filePath);
      const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
      // Service worker must not be cached by the browser
      if (urlPath === '/sw.js') {
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
      }
      res.writeHead(200, headers);
      res.end(data);
    }
  });
}).listen(5001, '0.0.0.0', () => {
  console.log('Server running at:');
  console.log('  Local:  http://localhost:5001');
  console.log('  LAN:    http://' + ip + ':5001');
});
