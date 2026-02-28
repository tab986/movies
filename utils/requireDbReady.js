function requireDbReady(options = {}) {
  const dependency = options.dependency || "kinguin catalog";

  return function dbReadinessGuard(req, res, next) {
    const state = req.app?.locals?.startupState;
    if (state?.dbReady) return next();

    const phase = state?.phase || "booting";
    const unavailableReason =
      state?.dbError ||
      "Database startup is still in progress. Please retry shortly.";

    return res.status(503).json({
      status: "unavailable",
      message: `Service temporarily unavailable: ${dependency} is not ready yet.`,
      startup: {
        phase,
        dbReady: false,
        dbAuthenticated: !!state?.dbAuthenticated,
        dbInitEnabled: !!state?.dbInitEnabled,
        dbInitCompleted: !!state?.dbInitCompleted,
        reason: unavailableReason,
      },
    });
  };
}

module.exports = requireDbReady;
