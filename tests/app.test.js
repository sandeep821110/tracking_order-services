import request from "supertest";
import app from "../src/app.js";

describe("App - Health & Status", () => {

  test("GET / should return service info", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/tracking/i);
    expect(res.body.status).toBe("running");
  });

  test("GET /health should return service health", async () => {
    const res = await request(app).get("/health");
    expect([200, 503]).toContain(res.status);
    expect(res.body.success).toBe(true);
    expect(res.body.services).toHaveProperty("mongodb");
    expect(res.body.services).toHaveProperty("redis");
    expect(res.body.services).toHaveProperty("rabbitmq");
  });

  test("GET /status should return detailed status", async () => {
    const res = await request(app).get("/status");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty("uptime");
    expect(res.body).toHaveProperty("services");
    expect(res.body).toHaveProperty("memory");
  });

  test("GET /nonexistent should return 404", async () => {
    const res = await request(app).get("/nonexistent-route");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
