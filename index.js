const fastify = require('fastify')({ logger: false });
const Database = require('better-sqlite3');
const tiletype = require('@mapbox/tiletype');
const path = require('path');
const glob = require('glob');
const tilesDir = process.env.TILESDIR || __dirname; // directory to read mbtiles files
const port = process.env.PORT || 3000; // port the server runs on
const host = process.env.HOST || 'localhost'; // default listen address

// fastify extensions
fastify.register(require('fastify-caching'), {
  privacy: 'private',
  expiresIn: 60 * 60 * 24 // 48 hours
});
fastify.register(require('fastify-cors'));

// Tile
fastify.get('/:database/:z/:x/:y', async (request, reply) => {
  // make it compatible with the old API
  const database =
    path.extname(request.params.database) === '.mbtiles'
      ? request.params.database
      : request.params.database + '.mbtiles';
  const y = path.parse(request.params.y).name;

  const db = new Database(path.join(tilesDir, database), {
    readonly: true
  });

  try {
    const stmt = db.prepare(`
      SELECT tile_data
      FROM tiles
      WHERE
        zoom_level = ?
        AND tile_column = ?
        AND tile_row = ?
    `);

    const row = stmt.get(
      request.params.z,
      request.params.x,
      (1 << request.params.z) - 1 - y
    );

    if (!row) {
      return reply.code(204).send();
    }

    Object.entries(tiletype.headers(row.tile_data)).forEach((h) =>
      reply.header(h[0], h[1])
    );
    reply.send(row.tile_data);
  } catch (err) {
    console.error(err);
    reply.code(500).send('Tile rendering error: ' + err + '\n');
  }
});

// MBtiles meta route
fastify.get('/:database/meta', async (request, reply) => {
  const db = new Database(path.join(tilesDir, request.params.database), {
    readonly: true
  });

  try {
    const stmt = db.prepare(`
      SELECT
        name,
        value
      FROM metadata
    `);

    const rows = stmt.all();
    if (!rows.length) {
      return reply.code(204).send('No metadata present');
    }

    reply.send(rows);
  } catch (err) {
    reply.code(500).send('Error fetching metadata: ' + err + '\n');
  }
});

// MBtiles list
fastify.get('/list', async (request, reply) => {
  glob(tilesDir + '/*.mbtiles', {}, (err, files) => {
    reply.send(files.map((file) => path.basename(file)));
  });
});

// Run the server!
fastify.listen(port, host);
console.log(`tile server listening on port ${port}`);
