/**
 * Application constants and configuration
 */

export const TRACKING_STATUS = {
  ORDER_PLACED: 'order_placed',
  ORDER_CONFIRMED: 'order_confirmed',
  PROCESSING: 'processing',
  PACKED: 'packed',
  SHIPPED: 'shipped',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  RETURNED: 'returned',
};

export const TRACKING_STATUS_LIST = Object.values(TRACKING_STATUS);

export const STATUS_TRANSITIONS = {
  order_placed: ['order_confirmed', 'cancelled'],
  order_confirmed: ['processing', 'packed', 'shipped', 'cancelled'],
  processing: ['packed', 'shipped', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
  returned: [],
};

export const DELIVERY_ATTEMPT_STATUS = {
  SUCCESSFUL: 'successful',
  FAILED: 'failed',
  RESCHEDULED: 'rescheduled',
};

export const DELIVERY_ATTEMPT_STATUS_LIST = Object.values(DELIVERY_ATTEMPT_STATUS);

export const CARRIER_NAMES = [
  'FedEx',
  'UPS',
  'USPS',
  'DHL',
  'Amazon',
  'Custom Carrier',
];

export const API_RESPONSE_CODES = {
  SUCCESS: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_ERROR: 500,
};

export const ERROR_MESSAGES = {
  INVALID_OBJECT_ID: 'Invalid ID format',
  TRACKING_NOT_FOUND: 'Tracking not found',
  ORDER_NOT_FOUND: 'Order not found',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Access forbidden',
  ADMIN_ONLY: 'Admin access required',
  INVALID_STATUS: 'Invalid tracking status',
  INVALID_TRANSITION: 'Invalid status transition',
  DUPLICATE_TRACKING: 'Tracking already exists for this order',
  INTERNAL_ERROR: 'Internal server error',
};

export const SUCCESS_MESSAGES = {
  CREATED: 'Tracking created successfully',
  UPDATED: 'Tracking updated successfully',
  DELETED: 'Tracking deleted successfully',
  FETCHED: 'Tracking fetched successfully',
};

export const PAGINATION_DEFAULTS = {
  PAGE: 1,
  LIMIT: 10,
  MAX_LIMIT: 50,
  ADMIN_MAX_LIMIT: 100,
  ADMIN_DEFAULT_LIMIT: 20,
};

export const TRACKING_NUMBER_CONFIG = {
  PREFIX: 'CHOSEMOODETRK',
  FORMAT: 'CHOSEMOODETRK + 16 random digits',
  MIN_LENGTH: 6,
  MAX_LENGTH: 64,
};

export default {
  TRACKING_STATUS,
  TRACKING_STATUS_LIST,
  STATUS_TRANSITIONS,
  DELIVERY_ATTEMPT_STATUS,
  DELIVERY_ATTEMPT_STATUS_LIST,
  CARRIER_NAMES,
  API_RESPONSE_CODES,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  PAGINATION_DEFAULTS,
  TRACKING_NUMBER_CONFIG,
};
