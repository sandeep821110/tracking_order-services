import mongoose from "mongoose";
import OrderTracking from "../models/ordertracking.model.js";
import Order from "../models/orderModel.js";
import { TRACKING_STATUS_LIST as STATUS_ENUM, STATUS_TRANSITIONS as VALID_TRANSITIONS, PAGINATION_DEFAULTS } from "../constants/config.js";

// helper: normalize a tracking document and guard against undefined arrays/objects
const normalizeTracking = (trackingDoc) => {
  try {
    const t = trackingDoc && typeof trackingDoc.toObject === "function"
      ? trackingDoc.toObject()
      : (trackingDoc || {});

    // ensure arrays/objects exist
    t.orderSnapshots = Array.isArray(t.orderSnapshots) ? t.orderSnapshots : [];
    t.trackingHistory = Array.isArray(t.trackingHistory) ? t.trackingHistory : [];
    t.deliveryAttempts = Array.isArray(t.deliveryAttempts) ? t.deliveryAttempts : [];

    t.orderSnapshots = t.orderSnapshots.map(snapshot => {
      const s = (snapshot && typeof snapshot === 'object') ? { ...snapshot } : {};
      s.orderProducts = s.orderProducts && typeof s.orderProducts === 'object' ? s.orderProducts : {};
      s.orderProducts.products = Array.isArray(s.orderProducts.products) ? s.orderProducts.products : [];
      s.orderProducts.totals = s.orderProducts.totals && typeof s.orderProducts.totals === 'object' ? s.orderProducts.totals : {};

      // safe reduce: compute itemsTotal from products array
      const productsArr = Array.isArray(s.orderProducts.products) ? s.orderProducts.products : [];
      s.orderProducts.totals.itemsTotal = Number(
        productsArr.reduce((sum, it) => {
          const qty = Number(it?.qty ?? it?.quantity ?? 1) || 0;
          const price = Number(it?.price ?? 0) || 0;
          return sum + price * qty;
        }, 0)
      );

      s.orderProducts.totals.shipping = Number(s.orderProducts.totals.shipping ?? 0) || 0;
      s.orderProducts.totals.tax = Number(s.orderProducts.totals.tax ?? 0) || 0;
      s.orderProducts.totals.discount = Number(s.orderProducts.totals.discount ?? 0) || 0;
      s.orderProducts.totals.grandTotal = Number(
        s.orderProducts.totals.grandTotal ??
        (s.orderProducts.totals.itemsTotal + s.orderProducts.totals.shipping + s.orderProducts.totals.tax - s.orderProducts.totals.discount)
      ) || 0;

      s.items = Array.isArray(s.items) ? s.items : [];
      return s;
    });

    return t;
  } catch (err) {
    console.error("normalizeTracking error:", err);
    // return minimal safe object so listing doesn't break
    return {
      _id: trackingDoc && (trackingDoc._id || trackingDoc.id) || null,
      trackingNumber: trackingDoc?.trackingNumber || null,
      status: trackingDoc?.status || null,
      orderSnapshots: [],
      trackingHistory: Array.isArray(trackingDoc?.trackingHistory) ? trackingDoc.trackingHistory : []
    };
  }
};

// CREATE OrderTracking (Admin)
export const createOrderTracking = async (req, res, next) => {
  try {
    if (!req.user?.isAdmin) {
      return res.status(403).json({ success: false, message: "Admin only" });
    }

    const { orderId: rawOrderId, orderNumber, orderData, deliveryInstructions, carrier, estimatedDeliveryDate, currentLocation } = req.body || {};

    // --- Resolve order either from orderData or from local DB ---
    let order;

    if (orderData) {
      order = typeof orderData === 'string' ? JSON.parse(orderData) : orderData;
      if (!order || !order._id) {
        return res.status(400).json({ success: false, message: "Invalid orderData: missing _id" });
      }
    } else {
      let resolvedId = rawOrderId;

      if (orderNumber && !resolvedId) {
        const found = await Order.findOne({ orderNumber }).select("_id").lean();
        if (!found) return res.status(404).json({ success: false, message: "Order not found by orderNumber" });
        resolvedId = found._id;
      }

      if (!resolvedId || !mongoose.Types.ObjectId.isValid(String(resolvedId))) {
        return res.status(400).json({ success: false, message: "Valid orderId or orderNumber is required" });
      }

      order = await Order.findById(resolvedId).populate("shippingAddress").populate("user").lean();
      if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    }

    // --- Check for existing tracking ---
    const orderObjectId = mongoose.Types.ObjectId.isValid(String(order._id))
      ? new mongoose.Types.ObjectId(order._id)
      : order._id;

    const existing = await OrderTracking.findOne({ orders: orderObjectId });
    if (existing) {
      return res.status(409).json({ success: false, message: "Tracking already exists for this order", data: existing });
    }

    // --- Build order snapshot ---
    const products = (order.items || []).map(item => ({
      productId: item.productId || item.product || undefined,
      sku: item.sku || undefined,
      name: item.name || item.productName || "",
      variant: item.size || item.variant || "",
      qty: item.quantity || item.qty || 1,
      price: item.price || 0,
      tax: item.tax || 0,
      weight: item.weight,
      image: item.productImage || (item.product && item.product.firstImage) || ""
    }));

    const itemsTotal = products.reduce((sum, p) => sum + (p.price * p.qty), 0);

    const orderSnapshot = {
      orderId: orderObjectId,
      orderNumber: order.orderNumber || order.orderId,
      orderProducts: {
        products,
        totals: {
          itemsTotal,
          shipping: Number(order.shippingCharges ?? order.shipping ?? 0) || 0,
          tax: Number(order.tax ?? 0) || 0,
          discount: Number(order.discount ?? 0) || 0,
          grandTotal: Number(order.totalAmount ?? order.total ?? 0) || 0
        }
      },
      items: order.items || [],
      paymentMethod: order.paymentMethod || undefined,
      status: order.orderStatus || order.status || undefined,
      user: order.user
        ? (typeof order.user === "object" && order.user !== null
          ? { userId: order.user._id || order.userId, name: order.user.name || "", email: order.user.email || "" }
          : { userId: order.userId || order.user || "", name: "", email: "" })
        : (order.userId ? { userId: order.userId, name: "", email: "" } : undefined),
      createdAt: order.createdAt || new Date()
    };

    // --- Build address snapshot ---
    let addressSnapshot;
    if (order.shippingAddress) {
      const sa = order.shippingAddress;
      addressSnapshot = {
        addressId: sa._id || order.shippingAddressId || undefined,
        fullName: sa.fullName || "",
        addressLine1: sa.addressLine1 || "",
        city: sa.city || "",
        postalCode: sa.pincode || sa.postalCode || "",
        country: sa.country || "",
        phoneNumber: sa.phoneNumber || sa.phone || ""
      };
    }

    // --- Resolve customer user ID ---
    let customerUserId;
    if (order.user && typeof order.user === "object") {
      customerUserId = order.user._id;
    } else if (order.userId) {
      customerUserId = order.userId;
    } else if (typeof order.user === "string") {
      customerUserId = order.user;
    }

    // --- Create tracking document ---
    const trackingNumber = await OrderTracking.generateTrackingNumber();

    const doc = {
      orders: [orderObjectId],
      orderSnapshots: [orderSnapshot],
      user: customerUserId || req.user._id,
      shippingAddressSnapshot: addressSnapshot,
      trackingNumber,
      deliveryInstructions,
      carrier: carrier && typeof carrier === "string" ? { name: carrier } : (carrier || undefined),
      estimatedDeliveryDate: estimatedDeliveryDate ? new Date(estimatedDeliveryDate) : undefined,
      currentLocation,
      status: "order_placed",
      trackingHistory: [{
        status: "order_placed",
        location: currentLocation || "Warehouse",
        description: "Order tracking created",
        timestamp: new Date()
      }],
      isActive: true
    };

    const tracking = await OrderTracking.create(doc);
    await tracking.populate([
      { path: "orders", select: "orderNumber totalAmount items user" },
      { path: "shippingAddress" }
    ]);

    return res.status(201).json({ success: true, data: normalizeTracking(tracking) });
  } catch (err) {
    console.error("createOrderTracking error:", err.name, err.message);
    if (err && err.code === 11000) {
      return res.status(409).json({ success: false, message: "Duplicate tracking generated, try again" });
    }
    return res.status(500).json({ success: false, message: err.message || "Internal server error" });
  }
};

// GET Tracking by trackingNumber (Public)
export const getTrackingByNumber = async (req, res) => {
  const { trackingNumber } = req.params;
  if (!trackingNumber) return res.status(400).json({ success: false, message: "trackingNumber required" });

  const tracking = await OrderTracking.findOne({ trackingNumber }).populate([
    { path: "orders", select: "orderNumber totalAmount items user" },
    { path: "shippingAddress" }
  ]);

  if (!tracking) return res.status(404).json({ success: false, message: "Tracking not found" });

  res.json({ success: true, data: normalizeTracking(tracking) });
}

// UPDATE Tracking Status (Admin)
export const updateTrackingStatus = async (req, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ success: false, message: "Admin only" });

  const { trackingNumber } = req.params;
  const { status, location, description } = req.body || {};

  if (!trackingNumber) return res.status(400).json({ success: false, message: "trackingNumber required" });
  if (!status || !STATUS_ENUM.includes(status)) return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${STATUS_ENUM.join(", ")}` });

  const tracking = await OrderTracking.findOne({ trackingNumber });
  if (!tracking) return res.status(404).json({ success: false, message: "Tracking not found" });

  const currentStatus = tracking.status || (Array.isArray(tracking.trackingHistory) && tracking.trackingHistory.length ? tracking.trackingHistory[tracking.trackingHistory.length - 1].status : "order_placed");
  const allowed = VALID_TRANSITIONS[currentStatus] || [];

  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: `Invalid status transition from ${currentStatus} to ${status}`, allowedTransitions: allowed });
  }

  tracking.status = status;
  if (location) tracking.currentLocation = location;

  tracking.trackingHistory.push({
    status,
    location: location || tracking.currentLocation || "Unknown",
    description: description || "",
    timestamp: new Date()
  });

  if (status === "delivered") tracking.actualDeliveryDate = new Date();
  if (["cancelled", "returned"].includes(status)) tracking.isActive = false;

  await tracking.save();

  const populated = await tracking.populate([{ path: "orders", select: "orderNumber totalAmount user" }, { path: "shippingAddress" }]);
  res.json({ success: true, data: normalizeTracking(populated), nextAllowedTransitions: VALID_TRANSITIONS[status] || [] });
}

// Get user trackings (authenticated)
export const getUserTrackings = async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, message: "Authentication required" });

  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const skip = (page - 1) * limit;

  const userOrders = await Order.find({ user: req.user._id }).select("_id");
  const orderIds = userOrders.map((o) => o._id);
  if (!orderIds.length) return res.json({ success: true, data: [], pagination: { page, limit, total: 0 } });

  const query = { orders: { $in: orderIds } };
  if (req.query.status) query.status = req.query.status;

  const [items, total] = await Promise.all([
    OrderTracking.find(query)
      .populate([{ path: "orders", select: "orderNumber totalAmount" }, { path: "shippingAddress" }])
      .sort("-createdAt")
      .skip(skip)
      .limit(limit),
    OrderTracking.countDocuments(query),
  ]);

  res.json({ success: true, data: (items || []).map(normalizeTracking), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

// Admin: list all trackings
export const adminGetAllTrackings = async (req, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ success: false, message: "Admin only" });

  const page = Math.max(1, parseInt(req.query.page) || PAGINATION_DEFAULTS.PAGE);
  const limit = Math.min(parseInt(req.query.limit) || PAGINATION_DEFAULTS.ADMIN_DEFAULT_LIMIT, PAGINATION_DEFAULTS.ADMIN_MAX_LIMIT);
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.orderId && mongoose.Types.ObjectId.isValid(req.query.orderId)) filter.orders = req.query.orderId;

  const [items, total] = await Promise.all([
    OrderTracking.find(filter)
      .populate([{ path: "orders", select: "orderNumber totalAmount user" }, { path: "shippingAddress" }])
      .sort("-createdAt")
      .skip(skip)
      .limit(limit)
      .lean(),
    OrderTracking.countDocuments(filter),
  ]);

  const safeItems = (items || []).map(it => {
    try { return normalizeTracking(it); }
    catch (e) {
      console.error("adminGetAllTrackings normalize error for id %s:", it?._id || it?.id, e);
      return { _id: it?._id || it?.id || null, trackingNumber: it?.trackingNumber || null };
    }
  });

  res.json({ success: true, data: safeItems, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}

// Admin: delete tracking
export const deleteTracking = async (req, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ success: false, message: "Admin only" });

  const { trackingNumber } = req.params;
  const tracking = await OrderTracking.findOneAndDelete({ trackingNumber });
  if (!tracking) return res.status(404).json({ success: false, message: "Tracking not found" });

  res.json({ success: true, message: "Tracking deleted" });
}

// Admin: add delivery attempt
export const addDeliveryAttempt = async (req, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ success: false, message: "Admin only" });

  const { trackingNumber } = req.params;
  const { status, reason, nextAttemptDate } = req.body || {};

  if (!trackingNumber) return res.status(400).json({ success: false, message: "trackingNumber required" });

  const validStatuses = ["successful", "failed", "rescheduled"];
  if (!status || !validStatuses.includes(status)) return res.status(400).json({ success: false, message: `Invalid attempt status. Allowed: ${validStatuses.join(", ")}` });

  const tracking = await OrderTracking.findOne({ trackingNumber });
  if (!tracking) return res.status(404).json({ success: false, message: "Tracking not found" });

  tracking.deliveryAttempts.push({ status, reason, nextAttemptDate: nextAttemptDate ? new Date(nextAttemptDate) : undefined, timestamp: new Date() });
  await tracking.save();

  const populated = await tracking.populate([{ path: "orders", select: "orderNumber totalAmount user" }, { path: "shippingAddress" }]);
  res.json({ success: true, data: normalizeTracking(populated) });
}

// Admin: update tracking details
export const updateTrackingDetails = async (req, res) => {
  if (!req.user?.isAdmin) return res.status(403).json({ success: false, message: "Admin only" });

  const { trackingNumber } = req.params;
  const { carrier, estimatedDeliveryDate, deliveryInstructions } = req.body || {};

  if (!trackingNumber) return res.status(400).json({ success: false, message: "trackingNumber required" });

  const tracking = await OrderTracking.findOne({ trackingNumber });
  if (!tracking) return res.status(404).json({ success: false, message: "Tracking not found" });

  if (carrier) {
    if (!tracking.carrier) tracking.carrier = {};
    if (carrier.name) tracking.carrier.name = carrier.name;
    if (carrier.contactNumber) tracking.carrier.contactNumber = carrier.contactNumber;
    tracking.markModified("carrier");
  }

  if (estimatedDeliveryDate) tracking.estimatedDeliveryDate = new Date(estimatedDeliveryDate);
  if (deliveryInstructions !== undefined) tracking.deliveryInstructions = deliveryInstructions;

  await tracking.save();
  const populated = await tracking.populate([{ path: "orders", select: "orderNumber totalAmount user" }, { path: "shippingAddress" }]);
  res.json({ success: true, data: normalizeTracking(populated) });
}

// User: get tracking by order id
export const getUserTrackingByOrderId = async (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, message: "Authentication required" });

  const { orderId } = req.params;
  if (!orderId) return res.status(400).json({ success: false, message: "orderId required" });

  const tracking = await OrderTracking.findOne({
    'orderSnapshots.orderId': orderId,
    user: req.user._id
  }).populate([{ path: "orders", select: "orderNumber totalAmount items" }, { path: "shippingAddress" }]);
  if (!tracking) return res.status(404).json({ success: false, message: "Tracking not found for this order" });

  res.json({ success: true, data: normalizeTracking(tracking) });
}

// find by orderNumber
export const getTrackingByOrderNumber = async (req, res) => {
  const { orderNumber } = req.params;
  if (!orderNumber) return res.status(400).json({ success: false, message: 'orderNumber required' });

  const tracking = await OrderTracking.findOne({ 'orderSnapshots.orderNumber': orderNumber })
    .populate([{ path: 'orders', select: 'orderNumber totalAmount items user' }, { path: 'shippingAddress' }]);
  if (!tracking) return res.status(404).json({ success: false, message: 'Tracking not found for this orderNumber' });

  res.json({ success: true, data: normalizeTracking(tracking) });
}

// internal notifyOrderStatusChange
export const notifyOrderStatusChange = async (orderId, status, location = undefined, description = undefined) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) throw new Error('Invalid orderId');
  if (!status || !STATUS_ENUM.includes(status)) throw new Error(`Invalid status: ${status}`);

  const tracking = await OrderTracking.findOne({ orders: orderId });
  if (!tracking) return null;

  const currentStatus = tracking.status || (Array.isArray(tracking.trackingHistory) && tracking.trackingHistory.length ? tracking.trackingHistory[tracking.trackingHistory.length - 1].status : 'order_placed');
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(status)) throw new Error(`Invalid transition from ${currentStatus} to ${status}`);

  tracking.status = status;
  if (location) tracking.currentLocation = location;

  tracking.trackingHistory.push({ status, location: location || tracking.currentLocation || 'Unknown', description: description || '', timestamp: new Date() });
  if (status === 'delivered') tracking.actualDeliveryDate = new Date();
  if (['cancelled', 'returned'].includes(status)) tracking.isActive = false;

  await tracking.save();
  return tracking;
};

// Internal: auto-create tracking when order is placed (called from order service)
export const createTrackingFromOrder = async (req, res) => {
  const { orderId, orderNumber, userId, items, shippingAddress, totalAmount, paymentMethod } = req.body || {};
  if (!orderId || !userId) {
    return res.status(400).json({ success: false, message: "orderId and userId required" });
  }

  const existing = await OrderTracking.findOne({ 'orderSnapshots.orderId': orderId });
  if (existing) {
    return res.json({ success: true, data: normalizeTracking(existing), message: "Tracking already exists" });
  }

  const products = (items || []).map(item => ({
    productId: item.productId?._id || item.productId || undefined,
    name: item.name || item.productName || "",
    qty: item.quantity || item.qty || 1,
    price: item.price || 0,
  }));

  const trackingNumber = await OrderTracking.generateTrackingNumber();

  const doc = {
    user: userId,
    trackingNumber,
    status: "order_placed",
    orderSnapshots: [{
      orderId,
      orderNumber: orderNumber || "",
      orderProducts: {
        products,
        totals: {
          itemsTotal: products.reduce((s, p) => s + (p.price * p.qty), 0),
          grandTotal: Number(totalAmount || 0),
        }
      },
      items: items || [],
      user: { userId, name: "", email: "" },
    }],
    shippingAddressSnapshot: shippingAddress ? {
      fullName: shippingAddress.fullName || "",
      addressLine1: shippingAddress.addressLine1 || "",
      city: shippingAddress.city || "",
      postalCode: shippingAddress.postalCode || shippingAddress.pincode || "",
      country: shippingAddress.country || "IN",
      phoneNumber: shippingAddress.phoneNumber || "",
    } : undefined,
    trackingHistory: [{
      status: "order_placed",
      location: "Warehouse",
      description: "Order tracking created automatically",
      timestamp: new Date(),
    }],
    isActive: true,
  };

  const tracking = await OrderTracking.create(doc);
  res.status(201).json({ success: true, data: normalizeTracking(tracking) });
};
