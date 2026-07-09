try {
  const app = require('../server.js');
  module.exports = app;
} catch (err) {
  module.exports = (req, res) => {
    res.status(500).json({
      error: "Failed to require server.js",
      message: err.message,
      stack: err.stack
    });
  };
}
