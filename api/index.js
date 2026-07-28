let app;
let loadError = null;

try {
  app = require('../server.js');
} catch (err) {
  loadError = err;
  console.error('[Vercel API] Failed to load server.js:', err);
}

module.exports = (req, res) => {
  if (loadError || !app) {
    return res.status(500).json({
      success: false,
      error: `Failed to require server.js: ${loadError ? loadError.message : 'Unknown error'}`,
      details: loadError ? loadError.stack : null
    });
  }
  return app(req, res);
};
