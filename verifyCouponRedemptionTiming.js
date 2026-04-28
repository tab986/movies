const dot = require("dotenv");
dot.config();
dot.config({ path: "./config.env", override: false });

const { sequelize, Coupon } = require("./post-models");
const { createCoupon, applyCoupon } = require("./utils/coupon");
const { markOrderPaidAndConsumeCouponOnce } = require("./controllers/orderController");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildFakeOrder({ couponCode, userId, referenceId }) {
  return {
    coupon: couponCode,
    user: userId,
    waylReference: referenceId,
    waylPaymentStatus: "pending",
    status: "pending",
    async save() {
      return this;
    },
  };
}

async function run() {
  const couponCode = `VERIFY-${Date.now()}`;
  const userA = "00000000-0000-0000-0000-0000000000a1";
  const userB = "00000000-0000-0000-0000-0000000000b1";

  try {
    await sequelize.authenticate();
    console.log("[verify] postgres connection passed");

    await createCoupon("fixed", 1000, null, couponCode, 2);
    console.log(`[verify] created coupon ${couponCode} (maxUsesPerUser=2)`);

    // /apply validates discount only; usage must still be zero before callback success.
    const applyPreview = await applyCoupon(couponCode, 5000, userA);
    assert(Number(applyPreview.discount) > 0, "Expected non-zero discount on first apply");

    let coupon = await Coupon.findOne({ where: { code: couponCode } });
    const beforeUsageMap = coupon.userUsageByUserId || {};
    assert(
      Object.keys(beforeUsageMap).length === 0,
      "Usage map should be empty before callback consumption"
    );
    console.log("[verify] apply preview did not consume usage");

    const orderA1 = buildFakeOrder({
      couponCode,
      userId: userA,
      referenceId: `VERIFY-ORDER-A1-${Date.now()}`,
    });
    const firstConsume = await markOrderPaidAndConsumeCouponOnce(orderA1);
    assert(firstConsume.couponConsumed === true, "First callback should consume coupon usage");

    const duplicateConsume = await markOrderPaidAndConsumeCouponOnce(orderA1);
    assert(
      duplicateConsume.couponConsumed === false,
      "Duplicate callback for the same finalized order must not consume again"
    );

    coupon = await Coupon.findOne({ where: { code: couponCode } });
    let usageMap = coupon.userUsageByUserId || {};
    assert(Number(usageMap[userA] || 0) === 1, "User A usage should be exactly 1 after idempotent retry");
    assert(Object.keys(usageMap).length === 1, "users/count should reflect one user after first consumption");
    console.log("[verify] idempotent callback consumed usage exactly once for order A1");

    const orderA2 = buildFakeOrder({
      couponCode,
      userId: userA,
      referenceId: `VERIFY-ORDER-A2-${Date.now()}`,
    });
    await markOrderPaidAndConsumeCouponOnce(orderA2);

    coupon = await Coupon.findOne({ where: { code: couponCode } });
    usageMap = coupon.userUsageByUserId || {};
    assert(Number(usageMap[userA] || 0) === 2, "User A usage should be 2 after second successful order");

    let userAThirdApplyFailed = false;
    try {
      await applyCoupon(couponCode, 5000, userA);
    } catch (err) {
      userAThirdApplyFailed = /usage limit reached/i.test(String(err.message || ""));
    }
    assert(userAThirdApplyFailed, "Third apply for user A should fail due to per-user cap");
    console.log("[verify] per-user cap enforced for third apply");

    const userBApply = await applyCoupon(couponCode, 5000, userB);
    assert(Number(userBApply.discount) > 0, "Different user should still pass apply");
    console.log("[verify] different user can still apply before consumption");

    const orderB1 = buildFakeOrder({
      couponCode,
      userId: userB,
      referenceId: `VERIFY-ORDER-B1-${Date.now()}`,
    });
    await markOrderPaidAndConsumeCouponOnce(orderB1);

    coupon = await Coupon.findOne({ where: { code: couponCode } });
    usageMap = coupon.userUsageByUserId || {};
    assert(Number(usageMap[userA] || 0) === 2, "User A usage count should remain 2");
    assert(Number(usageMap[userB] || 0) === 1, "User B usage count should be 1 after consumption");
    assert(Object.keys(usageMap).length === 2, "users/count should reflect two distinct users");
    console.log("[verify] users map/count updates only after callback consumption");

    console.log("[verify] coupon redemption timing checks passed");
  } finally {
    await Coupon.destroy({ where: { code: couponCode } }).catch(() => {});
    await sequelize.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error("[verify] failed:", error?.stack || error?.message || error);
  process.exitCode = 1;
});
