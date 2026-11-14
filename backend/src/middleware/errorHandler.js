/**
 * 404 Not Found handler for unknown /api/* routes.
 * Always returns JSON in the consistent shape: { success: false, error: ... }
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.originalUrl} — API route not found.`,
  });
}

/**
 * Central error-handling middleware.
 * Catches all unhandled exceptions and database errors, ensuring the server never crashes.
 */
function errorHandler(err, req, res, next) {
  console.error('Unhandled server error:', err);

  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || 'An unexpected internal server error occurred.';

  res.status(statusCode).json({
    success: false,
    error: message,
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};

