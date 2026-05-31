/**
 * Global error handling middleware
 * Must be the last middleware in Express app
 * CRITICAL: Must have exactly 4 parameters (err, req, res, next) for Express to recognize it as error handler
 */
const errorHandler = (err, req, res, next) => {
  // Ensure res is not already sent
  if (res.headersSent) {
    return next(err);
  }

  console.error("❌ Error caught:", {
    name: err.name,
    message: err.message,
    code: err.code,
    path: req.path,
    method: req.method,
  });
  
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // Handle specific error types
  if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid ID format";
  }

  if (err.name === "ValidationError") {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
  }

  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern)[0];
    message = `Duplicate ${field}: This ${field} already exists`;
  }

  // Handle JWT errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Invalid or expired token";
  }

  // Ensure we always send a response
  const response = {
    success: false,
    message,
  };

  // Include error details for debugging when appropriate
  const exposeStack = process.env.NODE_ENV === "development" || process.env.DEBUG_ERRORS === "true" || (err && typeof err.message === 'string' && err.message.includes('next is not a function'));
  if (exposeStack) {
    response.error = err.stack;
    response.details = err;
  }

  try {
    return res.status(statusCode).json(response);
  } catch (sendErr) {
    console.error("❌ Failed to send error response:", sendErr);
    return res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};

export default errorHandler;
