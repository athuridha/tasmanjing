let app;
try {
  app = require('../server.js');
} catch (err) {
  console.error('[Vercel API] Failed to load server.js:', err);
  app = (req, res) => {
    res.status(500).json({
      error: "Failed to require server.js",
      message: err.message,
      stack: err.stack
    });
  };
}

module.exports = app;
