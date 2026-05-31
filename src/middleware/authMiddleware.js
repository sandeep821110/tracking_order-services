import jwt from "jsonwebtoken";

const getAccessSecret = () => process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;

const extractAccessToken = (req) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) return auth.split(" ")[1];
  if (req.cookies?.authToken) return req.cookies.authToken;
  return null;
};

export const protect = (req, res, next) => {
  try {
    const token = extractAccessToken(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Not authorized - no token provided",
        code: "NO_TOKEN",
      });
    }

    if (!getAccessSecret()) {
      return res.status(500).json({
        success: false,
        message: "Server configuration error",
        code: "CONFIG_ERROR",
      });
    }

    const decoded = jwt.verify(token, getAccessSecret());

    if (!decoded || !decoded.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid token format - missing user id",
        code: "INVALID_PAYLOAD",
      });
    }

    req.user = {
      _id: decoded.id,
      email: decoded.email || null,
      role: decoded.role || "user",
      isAdmin: decoded.role === "admin",
    };

    if (typeof next === "function") return next();
    return res.status(500).json({ success: false, message: "Server configuration error" });
  } catch (error) {
    let message = "Not authorized";
    let statusCode = 401;

    if (error.name === "TokenExpiredError") {
      message = "Token has expired";
    } else if (error.name === "JsonWebTokenError") {
      message = "Invalid token";
    }

    return res.status(statusCode).json({
      success: false,
      message,
      code: error.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
    });
  }
};

export const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
      code: "NO_AUTH",
    });
  }

  if (!req.user.isAdmin) {
    return res.status(403).json({
      success: false,
      message: "Admin access required",
      code: "FORBIDDEN",
    });
  }

  if (typeof next === "function") return next();
  return res.status(500).json({ success: false, message: "Server configuration error" });
};

export default { protect, adminOnly };
