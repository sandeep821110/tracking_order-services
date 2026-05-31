import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import { protect, adminOnly } from "../src/middleware/authMiddleware.js";

function buildReq(token, overrides = {}) {
  return {
    headers: token ? { authorization: `Bearer ${token}` } : {},
    cookies: {},
    ...overrides,
  };
}
function buildRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("authMiddleware - protect", () => {
  const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
  const validToken = jwt.sign({ id: "507f1f77bcf86cd799439011", email: "test@test.com", role: "user" }, secret, { expiresIn: "1h" });
  const adminToken = jwt.sign({ id: "507f1f77bcf86cd799439012", email: "admin@test.com", role: "admin" }, secret, { expiresIn: "1h" });
  const expiredToken = jwt.sign({ id: "507f1f77bcf86cd799439011" }, secret, { expiresIn: "0s" });

  test("should return 401 when no token provided", () => {
    const req = buildReq(null);
    const res = buildRes();
    const next = jest.fn();

    protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "NO_TOKEN" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("should set req.user with valid user token", () => {
    const req = buildReq(validToken);
    const res = buildRes();
    const next = jest.fn();

    protect(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user._id).toBe("507f1f77bcf86cd799439011");
    expect(req.user.isAdmin).toBe(false);
  });

  test("should set req.user with admin token", () => {
    const req = buildReq(adminToken);
    const res = buildRes();
    const next = jest.fn();

    protect(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user.isAdmin).toBe(true);
    expect(req.user.role).toBe("admin");
  });

  test("should return 401 with expired token", () => {
    const req = buildReq(expiredToken);
    const res = buildRes();
    const next = jest.fn();

    protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "TOKEN_EXPIRED" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("should return 401 with invalid token", () => {
    const req = buildReq("invalid-token-string");
    const res = buildRes();
    const next = jest.fn();

    protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test("should extract token from cookie", () => {
    const req = { headers: {}, cookies: { authToken: validToken } };
    const res = buildRes();
    const next = jest.fn();

    protect(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user._id).toBe("507f1f77bcf86cd799439011");
  });
});

describe("authMiddleware - adminOnly", () => {
  test("should return 401 when no user on request", () => {
    const req = { user: null };
    const res = buildRes();
    const next = jest.fn();

    adminOnly(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "NO_AUTH" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("should return 403 when user is not admin", () => {
    const req = { user: { _id: "123", isAdmin: false } };
    const res = buildRes();
    const next = jest.fn();

    adminOnly(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "FORBIDDEN" })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test("should call next when user is admin", () => {
    const req = { user: { _id: "123", isAdmin: true } };
    const res = buildRes();
    const next = jest.fn();

    adminOnly(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
