process.env.KINGUIN_API_KEY = process.env.KINGUIN_API_KEY || "validation-key";

const axios = require("axios");
const orderCtrl = require("./controllers/orderController");
const orderRoutes = require("./routes/orderRoutes");
const postModels = require("./post-models");

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const orderState = {
    id: "11111111-1111-1111-1111-111111111111",
    user: "22222222-2222-2222-2222-222222222222",
    waylReference: "WAYL-TEST-REF",
    products: [{ product: "777", quantity: 1 }],
    status: "pending",
    waylPaymentStatus: "pending",
    kinguinOrderId: null,
    keys: [],
    async save() {
      return this;
    },
  };

  const originalAxiosPost = axios.post;
  const originalAxiosGet = axios.get;
  const originalOrderFindOne = postModels.Order.findOne;
  const originalOrderUpdate = postModels.Order.update;
  const originalKinguinFindByPk = postModels.KinguinProduct.findByPk;

  try {
    postModels.Order.findOne = async ({ where, raw }) => {
      if (where?.waylReference && where.waylReference === orderState.waylReference) {
        return orderState;
      }
      if (
        where?.id === orderState.id &&
        where?.user === orderState.user &&
        (orderState.status === "kingwin" || orderState.status === "completed")
      ) {
        if (raw) {
          return { ...orderState };
        }
        return orderState;
      }
      if (where?.kinguinOrderId && where.kinguinOrderId === orderState.kinguinOrderId) {
        return raw ? { ...orderState } : orderState;
      }
      return null;
    };

    postModels.Order.update = async (values, { where }) => {
      if (where?.kinguinOrderId === orderState.kinguinOrderId) {
        Object.assign(orderState, values);
      }
      return [1];
    };

    postModels.KinguinProduct.findByPk = async (id) => {
      if (Number(id) !== 777) return null;
      return {
        id: 777,
        remote: {
          name: "Validation Product",
          offers: [{ availableQty: 5, price: 12.5 }],
          price: 12.5,
        },
      };
    };

    axios.post = async (url, payload) => {
      if (url.includes("/v1/order")) {
        assert(payload.orderExternalId === orderState.id, "orderExternalId should use order.id");
        return { data: { orderId: "KNG-ORDER-123" } };
      }
      throw new Error(`Unexpected axios.post url during validation: ${url}`);
    };

    axios.get = async (url) => {
      if (url.includes("/keys")) {
        return {
          data: [
            {
              serial: "AAAA-BBBB-CCCC",
              type: "TEXT",
              name: "Validation Key",
              kinguinId: 777,
            },
          ],
        };
      }
      throw new Error(`Unexpected axios.get url during validation: ${url}`);
    };

    // 1) Non-paid callbacks are rejected and do not transition to paid.
    {
      const req = { body: { referenceId: orderState.waylReference, paymentStatus: "Pending" } };
      const res = makeRes();
      await orderCtrl.waylCallback(req, res, (err) => {
        if (err) throw err;
      });
      assert(res.statusCode === 422, "Non-paid callback should return 422");
      assert(orderState.waylPaymentStatus === "pending", "Non-paid callback must not mark paid");
      assert(orderState.status === "pending", "Non-paid callback must keep order pending");
    }

    // 2) Paid callback transitions to wayle->kingwin and stores kinguinOrderId.
    {
      const req = {
        body: {
          data: { referenceId: orderState.waylReference, paymentStatus: "Paid" },
          event: "payment.paid",
          referenceId: orderState.waylReference,
          paymentStatus: "Paid",
        },
      };
      const res = makeRes();
      await orderCtrl.waylCallback(req, res, (err) => {
        if (err) throw err;
      });
      assert(res.statusCode === 200, "Paid callback should succeed");
      assert(orderState.waylPaymentStatus === "paid", "Paid callback should mark paid");
      assert(orderState.status === "kingwin", "Paid callback should transition to kingwin");
      assert(
        orderState.kinguinOrderId === "KNG-ORDER-123",
        "Paid callback should persist kinguinOrderId"
      );
    }

    // 3) getOrder should finalize to completed once keys are fetched.
    {
      const req = {
        params: { id: orderState.id },
        user: { id: orderState.user },
      };
      const res = makeRes();
      await orderCtrl.getOrder(req, res);
      assert(res.statusCode === 200, "getOrder should succeed");
      assert(orderState.status === "completed", "Order should transition to completed after keys");
      assert(Array.isArray(orderState.keys) && orderState.keys.length === 1, "Order should store keys");
    }

    // 4) Route contract: POST /wayl-callback with explicit JSON parser.
    const callbackLayer = orderRoutes.stack.find(
      (layer) => layer.route?.path === "/wayl-callback"
    );
    assert(callbackLayer, "Route /wayl-callback must exist");
    assert(callbackLayer.route.methods.post, "Route /wayl-callback must be POST");
    assert(
      callbackLayer.route.stack.some((s) => s.name === "jsonParser"),
      "Route /wayl-callback must include express.json parser middleware"
    );

    console.log("Validation passed:");
    console.log("- Non-paid callback rejected");
    console.log("- Paid callback transitions pending -> wayle -> kingwin");
    console.log("- getOrder transitions kingwin -> completed once keys are available");
    console.log("- Route contract verified: POST /api/v1/orders/wayl-callback with JSON body parser");
  } finally {
    axios.post = originalAxiosPost;
    axios.get = originalAxiosGet;
    postModels.Order.findOne = originalOrderFindOne;
    postModels.Order.update = originalOrderUpdate;
    postModels.KinguinProduct.findByPk = originalKinguinFindByPk;
  }
}

run().catch((err) => {
  console.error("Validation failed:", err.message);
  process.exitCode = 1;
});
