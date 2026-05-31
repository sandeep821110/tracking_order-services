import { TRACKING_STATUS_LIST, STATUS_TRANSITIONS, PAGINATION_DEFAULTS } from "../src/constants/config.js";

describe("Constants - Tracking Status", () => {
  test("should have all expected statuses", () => {
    expect(TRACKING_STATUS_LIST).toContain("order_placed");
    expect(TRACKING_STATUS_LIST).toContain("delivered");
    expect(TRACKING_STATUS_LIST).toContain("cancelled");
    expect(TRACKING_STATUS_LIST).toContain("returned");
  });

  test("status transitions should be valid", () => {
    for (const [from, toList] of Object.entries(STATUS_TRANSITIONS)) {
      expect(TRACKING_STATUS_LIST).toContain(from);
      toList.forEach(to => {
        expect(TRACKING_STATUS_LIST).toContain(to);
      });
    }
  });

  test("delivered status should have no transitions", () => {
    expect(STATUS_TRANSITIONS.delivered).toEqual([]);
  });

  test("cancelled status should have no transitions", () => {
    expect(STATUS_TRANSITIONS.cancelled).toEqual([]);
  });

  test("PAGINATION_DEFAULTS should have expected values", () => {
    expect(PAGINATION_DEFAULTS.PAGE).toBe(1);
    expect(PAGINATION_DEFAULTS.LIMIT).toBe(10);
    expect(PAGINATION_DEFAULTS.MAX_LIMIT).toBe(50);
  });
});

describe("Controller - normalizeTracking", () => {
  let normalizeTracking;

  beforeAll(async () => {
    const mod = await import("../src/controllers/orderTracking.controller.js");
    normalizeTracking = mod.createOrderTracking;
  });

  test("module should export all expected functions", async () => {
    const mod = await import("../src/controllers/orderTracking.controller.js");
    expect(mod.createOrderTracking).toBeDefined();
    expect(mod.getTrackingByNumber).toBeDefined();
    expect(mod.updateTrackingStatus).toBeDefined();
    expect(mod.getUserTrackings).toBeDefined();
    expect(mod.adminGetAllTrackings).toBeDefined();
    expect(mod.deleteTracking).toBeDefined();
    expect(mod.addDeliveryAttempt).toBeDefined();
    expect(mod.updateTrackingDetails).toBeDefined();
    expect(mod.getUserTrackingByOrderId).toBeDefined();
    expect(mod.getTrackingByOrderNumber).toBeDefined();
    expect(mod.notifyOrderStatusChange).toBeDefined();
    expect(mod.createTrackingFromOrder).toBeDefined();
  });
});

describe("Model - OrderTracking", () => {
  test("model should be importable", async () => {
    const OrderTracking = (await import("../src/models/ordertracking.model.js")).default;
    expect(OrderTracking).toBeDefined();
    expect(OrderTracking.modelName).toBe("OrderTracking");
  });
});

describe("Routes - orderTracking", () => {
  test("routes should be importable", async () => {
    const router = (await import("../src/routes/ordertracking.route.js")).default;
    expect(router).toBeDefined();
    expect(router.stack).toBeInstanceOf(Array);
  });

  test("should have correct number of route handlers", async () => {
    const router = (await import("../src/routes/ordertracking.route.js")).default;
    const publicRoutes = router.stack.filter(r => r.route && r.route.path.includes("track")).length;
    expect(publicRoutes).toBeGreaterThanOrEqual(1);
  });
});

describe("Middleware - errorHandler", () => {
  test("should be importable", async () => {
    const errorHandler = (await import("../src/middleware/errorHandler.js")).default;
    expect(errorHandler).toBeDefined();
    expect(errorHandler.length).toBe(4);
  });
});

describe("Middleware - authMiddleware", () => {
  test("should export protect and adminOnly", async () => {
    const mod = await import("../src/middleware/authMiddleware.js");
    expect(mod.protect).toBeDefined();
    expect(mod.adminOnly).toBeDefined();
  });
});
