import { jest } from "@jest/globals";
import errorHandler from "../src/middleware/errorHandler.js";

function buildReq(overrides = {}) {
  return { path: "/test", method: "GET", ...overrides };
}
function buildRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("errorHandler", () => {

  test("should handle CastError with 400", () => {
    const err = { name: "CastError", message: "Invalid ObjectId" };
    const req = buildReq();
    const res = buildRes();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "Invalid ID format" })
    );
  });

  test("should handle ValidationError with 400", () => {
    const err = {
      name: "ValidationError",
      message: "Validation failed",
      errors: { field: { message: "Field is required" } },
    };
    const req = buildReq();
    const res = buildRes();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false })
    );
  });

  test("should handle duplicate key error (11000) with 409", () => {
    const err = { name: "MongoServerError", code: 11000, keyPattern: { email: 1 }, message: "Duplicate key" };
    const req = buildReq();
    const res = buildRes();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(409);
  });

  test("should handle JWT errors with 401", () => {
    const err = { name: "JsonWebTokenError", message: "jwt malformed" };
    const req = buildReq();
    const res = buildRes();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test("should handle generic errors with 500", () => {
    const err = new Error("Something went wrong");
    const req = buildReq();
    const res = buildRes();

    errorHandler(err, req, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: "Something went wrong" })
    );
  });

  test("should not send response if headers already sent", () => {
    const err = new Error("test");
    const req = buildReq();
    const res = buildRes();
    res.headersSent = true;

    const next = jest.fn();
    errorHandler(err, req, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.json).not.toHaveBeenCalled();
  });
});
