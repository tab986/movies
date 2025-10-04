const mongoose = require("mongoose");

const keySchema = new mongoose.Schema(
  {
    serial: { type: String },
    type: { type: String },
    name: { type: String },
    kinguinId: { type: Number },
  },
  { _id: false }
);

/*
 * Order schema
 *
 * Historically an order consisted of a single product with a quantity of one. To
 * support shopping carts containing multiple products and quantities we
 * introduce a `products` array. Each entry in the array stores the product
 * identifier, the quantity ordered and the unit price used at checkout. The
 * existing top‑level `product`, `quantity` and `unitPrice` fields are retained
 * for backwards compatibility with any legacy code that still expects them.
 * When creating new orders these legacy fields should either be left
 * undefined or mirror the first entry in the `products` array.
 */
const orderItemSchema = new mongoose.Schema(
  {
    product: { type: String, required: true },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, required: true },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Legacy single product fields. These may be omitted when using the new
    // multi‑item cart logic.
    product: String,
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number },
    // New cart items array. Each entry corresponds to one product in the
    // customer’s cart.
    products: { type: [orderItemSchema], default: [] },
    merchants: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    coupon: { type: String },
    discount: { type: Number, default: 0 }, // discount amount in IQD
    totalPrice: { type: Number, required: true }, // final IQD after discount
    waylReference: { type: String, required: true },
    country: { type: String, default: "IQ" },
    waylPaymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    kinguinOrderId: { type: String }, // from Kinguin placeOrder
    // Store an array of keys rather than a single value. Keys from Kinguin
    // include additional metadata such as serial type, name and kinguinId so we
    // reuse the keySchema defined above.
    keys: { type: [keySchema], default: [] },
    key: String, // maintain the original `key` field for backwards compatibility
    status: {
      type: String,
      enum: ["pending", "completed", "wayle", "kingwin", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);
// orderItemSchema.js (or inline)

// Virtual populate: map the numeric `product` → KinguinProduct.kinguinId
orderItemSchema.virtual("detail", {
  ref: "KinguinProduct", // your model name
  localField: "product", // value in the subdoc (e.g., 7812)
  foreignField: "kinguinId", // field in KinguinProduct
  justOne: true, // one match per item
  // optional: limit returned fields to keep payload lean
});

// models/Order.js
const Products = require("./KinguinProduct"); // or ./KinguinProduct if that's your cache

// ... your existing keySchema/orderItemSchema/orderSchema definitions ...

// Attach per-item product details after reads
async function attachPerItemDetails(docs) {
  if (!docs) return;
  const orders = Array.isArray(docs) ? docs : [docs];

  for (const o of orders) {
    if (!o?.products?.length) continue;

    // loop each product and fetch detail
    await Promise.all(
      o.products.map(async (it) => {
        // you store product as STRING; cast for lookup
        const kid = Number(it.product); // if you join by numeric kinguinId
        // If you join by your Products _id instead, use: const id = it.product as ObjectId

        let detail = null;

        // === Option A: joining by numeric kinguinId on Products/KinguinProduct ===
        if (Number.isFinite(kid)) {
          detail = await Products.findOne(
            { _id: kid } // <-- ensure Products has kinguinId:Number
          ).lean();
        }

        // === Option B (alternative): joining by your Products _id stored in item.product ===
        // const detail = await Products.findById(it.product, { name: 1, originalPrice: 1, image: 1 }).lean();

        if (typeof it.set === "function")
          it.set("detail", detail || null, { strict: false });
        else it.detail = detail || null;
      })
    );
  }
}

// Run after queries (this is where you have the docs to loop over)
orderSchema.post("find", async function (docs) {
  await attachPerItemDetails(docs);
});

orderSchema.post("findOne", async function (doc) {
  await attachPerItemDetails(doc);
});

orderSchema.post(/^findOneAnd/, async function (doc) {
  await attachPerItemDetails(doc);
});

// Export only the Order model from this file
module.exports = mongoose.model("Order", orderSchema);

module.exports = orderItemSchema;

module.exports = mongoose.model("Order", orderSchema);
