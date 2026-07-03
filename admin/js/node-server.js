const http = require('http');
const path = require('path');
const fs = require('fs');
const { generateProductJson } = require('./generate-product-json');

const repoRoot = path.resolve(__dirname, '../..');
const adminRoot = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 8790);
const host = process.env.HOST || '0.0.0.0';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (request, response) => {
  try {
    setCorsHeaders(response);

    if (request.method === 'OPTIONS') {
      response.writeHead(204);
      response.end();
      return;
    }

    const requestUrl = new URL(request.url, `http://${host}:${port}`);

    if (request.method === 'POST' && requestUrl.pathname === '/api/generate-product-json') {
      const lines = [];

      await generateProductJson({
        repoRoot,
        log(message) {
          lines.push(message);
        }
      });

      sendJson(response, 200, { ok: true, log: lines.join('\n') });
      return;
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendText(response, 405, 'Method not allowed');
      return;
    }

    serveStatic(request, response);
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error && error.stack ? error.stack : String(error)
    });
  }
});

server.listen(port, host, () => {
  console.log(`Admin dashboard: http://127.0.0.1:${port}/`);
  console.log(`Network dashboard: http://192.168.1.251:${port}/`);
});

function serveStatic(request, response) {
  const url = new URL(request.url, `http://localhost:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.resolve(adminRoot, relativePath);

  if (!filePath.startsWith(adminRoot + path.sep) && filePath !== adminRoot) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(response, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    response.end(content);
  });
}

function sendJson(response, statusCode, payload) {
  setCorsHeaders(response);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, statusCode, message) {
  setCorsHeaders(response);
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(message);
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}
