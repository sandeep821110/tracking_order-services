import mongoose from "mongoose";

/**
 * Order Model (Stub)
 * In a microservices architecture, this would typically reference
 * the Order Service. This stub allows the Tracking Service to work independently.
 */
const orderSchema = new mongoose.Schema({
  orderNumber: String,
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  items: Array,
  totalAmount: Number,
  shippingCharges: Number,
  tax: Number,
  discount: Number,
  shippingAddress: { type: mongoose.Schema.Types.ObjectId, ref: "Address" },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

orderSchema.index({ user: 1 });
orderSchema.index({ orderNumber: 1 });

const Order = mongoose.model("Order", orderSchema);
export default Order;
