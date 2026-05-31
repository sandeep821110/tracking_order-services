import mongoose from "mongoose";

/**
 * Address Model (Stub)
 * In a microservices architecture, this would typically reference
 * the User/Address Service. This stub allows the Tracking Service to work independently.
 */
const addressSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  fullName: String,
  addressLine1: String,
  addressLine2: String,
  city: String,
  state: String,
  postalCode: String,
  country: String,
  phoneNumber: String,
  isDefault: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

addressSchema.index({ user: 1 });

const Address = mongoose.model("Address", addressSchema);
export default Address;
