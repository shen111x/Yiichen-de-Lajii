const http = require('http');
const path = require('path');
const fs = require('fs');
const { generateProductJson } = require('./generate-product-json');

const repoRoot = path.resolve(__dirname, '../..');
const adminRoot = path.resolve(__dirname, '..');
const docsRoot = path.join(repoRoot, 'docs');
const terminalMapPath = path.join(docsRoot, 'components/delajii-terminal/data/maps/current-map.json');
const port = Number(process.env.PORT || 8790);
const host = process.env.HOST || '127.0.0.1';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.mp4': 'video/mp4',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav'
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

    if (request.method === 'GET' && requestUrl.pathname === '/api/admin-status') {
      sendJson(response, 200, {
        ok: true,
        server: 'admin',
        port,
        repoRoot
      });
      return;
    }

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

    if (request.method === 'POST' && requestUrl.pathname === '/api/launch-delajii-terminal') {
      sendJson(response, 200, {
        ok: true,
        url: `http://127.0.0.1:${port}/docs/components/delajii-terminal/?game-admin=1`
      });
      return;
    }

    if (request.method === 'POST' && requestUrl.pathname === '/api/delajii-terminal/map') {
      const map = normalizeTerminalMap(await readJsonBody(request));
      await writeJsonAtomic(terminalMapPath, map);
      sendJson(response, 200, { ok: true, map });
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

  if (host === '0.0.0.0') {
    console.log(`Network dashboard: http://192.168.1.251:${port}/`);
  }
});

function serveStatic(request, response) {
  const url = new URL(request.url, `http://localhost:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const servingDocs = pathname === '/docs' || pathname.startsWith('/docs/');
  const root = servingDocs ? docsRoot : adminRoot;
  let relativePath = servingDocs ? pathname.replace(/^\/docs\/?/, '') : pathname.replace(/^\/+/, '');
  if (!relativePath || relativePath.endsWith('/')) relativePath += 'index.html';
  const filePath = path.resolve(root, relativePath);

  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error) {
      sendText(response, error.code === 'ENOENT' ? 404 : 500, error.code === 'ENOENT' ? 'Not found' : 'Server error');
      return;
    }

    if (!stats.isFile()) {
      sendText(response, 404, 'Not found');
      return;
    }

    const contentType = mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const range = parseByteRange(request.headers.range, stats.size);

    if (request.headers.range && !range) {
      response.writeHead(416, {
        'Content-Range': `bytes */${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store'
      });
      response.end();
      return;
    }

    const start = range ? range.start : 0;
    const end = range ? range.end : stats.size - 1;
    const headers = {
      'Content-Type': contentType,
      'Content-Length': Math.max(0, end - start + 1),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store'
    };

    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${stats.size}`;

    response.writeHead(range ? 206 : 200, headers);

    if (request.method === 'HEAD') {
      response.end();
      return;
    }

    const stream = fs.createReadStream(filePath, range ? { start, end } : undefined);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  });
}

function parseByteRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0 || (!match[1] && !match[2])) return null;

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
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

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on('data', chunk => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        reject(new Error('Request body is too large'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(new Error('Invalid map JSON'));
      }
    });
    request.on('error', reject);
  });
}

function normalizeTerminalMap(input) {
  if (!input || input.id !== 'current-map' || !Array.isArray(input.entities)) {
    throw new Error('Invalid deLajii Terminal map');
  }

  return {
    id: 'current-map',
    name: String(input.name || 'Current Map'),
    size: finiteNumber(input.size, 'map size'),
    floorHeight: finiteNumber(input.floorHeight, 'floor height'),
    spawn: normalizeSpawn(input.spawn),
    ground: {
      width: finiteNumber(input.ground && input.ground.width, 'ground width'),
      depth: finiteNumber(input.ground && input.ground.depth, 'ground depth'),
      textureRepeat: {
        x: finiteNumber(input.ground && input.ground.textureRepeat && input.ground.textureRepeat.x, 'ground repeat x'),
        y: finiteNumber(input.ground && input.ground.textureRepeat && input.ground.textureRepeat.y, 'ground repeat y')
      }
    },
    entities: input.entities.map(normalizeMapEntity)
  };
}

function normalizeMapEntity(entity, index) {
  if (!entity || typeof entity.id !== 'string' || typeof entity.asset !== 'string') {
    throw new Error(`Invalid map entity at index ${index}`);
  }

  const normalized = {
    id: entity.id,
    asset: entity.asset,
    position: normalizePosition(entity.position, `${entity.id} position`),
    rotation: finiteNumber(entity.rotation || 0, `${entity.id} rotation`),
    collider: normalizeCollider(entity.collider, `${entity.id} collider`)
  };

  if (typeof entity.category === 'string') normalized.category = entity.category;
  if (entity.size) {
    normalized.size = {
      width: finiteNumber(entity.size.width, `${entity.id} width`),
      height: finiteNumber(entity.size.height, `${entity.id} height`),
      depth: finiteNumber(entity.size.depth, `${entity.id} depth`)
    };
  }
  return normalized;
}

function normalizeCollider(collider, label) {
  const normalized = {
    minX: finiteNumber(collider && collider.minX, `${label} minX`),
    maxX: finiteNumber(collider && collider.maxX, `${label} maxX`),
    minZ: finiteNumber(collider && collider.minZ, `${label} minZ`),
    maxZ: finiteNumber(collider && collider.maxZ, `${label} maxZ`),
    top: finiteNumber(collider && collider.top, `${label} top`)
  };

  if (Number.isFinite(collider && collider.bottom)) normalized.bottom = collider.bottom;
  if (collider && collider.version === 1) normalized.version = 1;
  if (collider && (
    collider.collisionRule === 'item'
    || collider.collisionRule === 'environment'
    || collider.collisionRule === 'character'
  )) {
    normalized.collisionRule = collider.collisionRule;
  }
  if (collider && collider.collisionRule === 'character') {
    normalized.centerX = finiteNumber(collider.centerX, `${label} centerX`);
    normalized.centerZ = finiteNumber(collider.centerZ, `${label} centerZ`);
    normalized.radius = finiteNumber(collider.radius, `${label} radius`);
  }
  if (collider && collider.solid === true) normalized.solid = true;
  if (collider && collider.blocksWhileSupported === true) {
    normalized.blocksWhileSupported = true;
  }
  if (Array.isArray(collider && collider.segments)) {
    normalized.segments = collider.segments.map((segment, index) => ({
      startX: finiteNumber(segment && segment.startX, `${label} segment ${index} startX`),
      startZ: finiteNumber(segment && segment.startZ, `${label} segment ${index} startZ`),
      endX: finiteNumber(segment && segment.endX, `${label} segment ${index} endX`),
      endZ: finiteNumber(segment && segment.endZ, `${label} segment ${index} endZ`),
      bottom: finiteNumber(segment && segment.bottom, `${label} segment ${index} bottom`),
      top: finiteNumber(segment && segment.top, `${label} segment ${index} top`)
    }));
  }

  return normalized;
}

function normalizePosition(position, label) {
  return {
    x: finiteNumber(position && position.x, `${label} x`),
    y: finiteNumber(position && position.y, `${label} y`),
    z: finiteNumber(position && position.z, `${label} z`)
  };
}

function normalizeSpawn(spawn) {
  const normalized = normalizePosition(spawn, 'spawn');
  if (Number.isFinite(spawn && spawn.yaw)) normalized.yaw = spawn.yaw;
  if (Number.isFinite(spawn && spawn.pitch)) normalized.pitch = spawn.pitch;
  return normalized;
}

function finiteNumber(value, label) {
  if (!Number.isFinite(value)) throw new Error(`Invalid ${label}`);
  return value;
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await fs.promises.writeFile(temporaryPath, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await fs.promises.rename(temporaryPath, filePath);
}
