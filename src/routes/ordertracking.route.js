import express from 'express';
import { protect, adminOnly } from '../middleware/authMiddleware.js';
import {
  createOrderTracking,
  getTrackingByNumber,
  updateTrackingStatus,
  getUserTrackings,
  adminGetAllTrackings,
  deleteTracking,
  addDeliveryAttempt,
  updateTrackingDetails,
  getUserTrackingByOrderId,
  getTrackingByOrderNumber,
  createTrackingFromOrder
} from '../controllers/orderTracking.controller.js';

const router = express.Router();

/**
 * ============================================
 *          PUBLIC ROUTES (No auth required)
 * ============================================
 */

// GET /api/v1/tracking/track/:trackingNumber
// Get tracking info by tracking number (publicly accessible)
router.get('/track/:trackingNumber', getTrackingByNumber);

// GET /api/v1/tracking/by-order/:orderNumber
// Get tracking by order number
router.get('/by-order/:orderNumber', getTrackingByOrderNumber);

/**
 * ============================================
 *     PROTECTED USER ROUTES (Auth required)
 * ============================================
 */

// GET /api/v1/tracking/my-orders
// Get current user's all order trackings
router.get('/my-orders', protect, getUserTrackings);

// GET /api/v1/tracking/my-orders/:orderId
// Get specific order tracking by order ID
router.get('/my-orders/:orderId', protect, getUserTrackingByOrderId);

/**
 * ============================================
 *        ADMIN ONLY ROUTES (Admin required)
 * ============================================
 */

// POST /api/v1/tracking/admin
// Create new order tracking (Admin)
router.post('/admin', protect, adminOnly, createOrderTracking);

// GET /api/v1/tracking/admin/all
// List all trackings with pagination (Admin)
router.get('/admin/all', protect, adminOnly, adminGetAllTrackings);

// PUT /api/v1/tracking/admin/:trackingNumber/status
// Update tracking status (Admin)
router.put('/admin/:trackingNumber/status', protect, adminOnly, updateTrackingStatus);

// PUT /api/v1/tracking/admin/:trackingNumber/attempt
// Add delivery attempt (Admin)
router.put('/admin/:trackingNumber/attempt', protect, adminOnly, addDeliveryAttempt);

// PUT /api/v1/tracking/admin/:trackingNumber/details
// Update tracking details like carrier, delivery date, instructions (Admin)
router.put('/admin/:trackingNumber/details', protect, adminOnly, updateTrackingDetails);

// DELETE /api/v1/tracking/admin/:trackingNumber
// Delete tracking record (Admin)
router.delete('/admin/:trackingNumber', protect, adminOnly, deleteTracking);

/**
 * ============================================
 *     INTERNAL ROUTES (No auth - service-to-service)
 * ============================================
 */

// POST /api/v1/tracking/internal/create-from-order
// Auto-create tracking when order is placed (called by order service)
router.post('/internal/create-from-order', createTrackingFromOrder);

export default router;    