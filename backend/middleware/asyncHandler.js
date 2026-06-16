/**
 * Express 4 does not catch rejected promises from async route handlers.
 * Wrap async handlers so failures reach the global error middleware.
 */
function asyncHandler(fn) {
  return function asyncHandlerWrapped(req, res, next) {
    try {
      Promise.resolve(fn(req, res, next)).catch(next);
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { asyncHandler };
