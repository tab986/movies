const { sequelize } = require("./post-models/db");
const { Coupon } = require("./post-models");

function toNormalizedUserId(rawValue) {
  return String(rawValue || "").trim();
}

function toUsageCount(rawValue) {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.floor(parsed);
}

function buildMergedUsageMap(coupon) {
  const currentUsageMap =
    coupon.userUsageByUserId && typeof coupon.userUsageByUserId === "object"
      ? coupon.userUsageByUserId
      : {};
  const merged = {};

  for (const [userId, count] of Object.entries(currentUsageMap)) {
    const normalizedUserId = toNormalizedUserId(userId);
    if (!normalizedUserId) continue;
    const normalizedCount = toUsageCount(count);
    if (normalizedCount > 0) {
      merged[normalizedUserId] = normalizedCount;
    }
  }

  const legacyUsers = Array.isArray(coupon.users) ? coupon.users : [];
  for (const legacyUserId of legacyUsers) {
    const normalizedLegacyUserId = toNormalizedUserId(legacyUserId);
    if (!normalizedLegacyUserId) continue;
    if (!Number.isFinite(Number(merged[normalizedLegacyUserId]))) {
      merged[normalizedLegacyUserId] = 1;
    }
  }

  return merged;
}

function toValidMaxUsesPerUser(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return 1;
  return parsed;
}

async function run() {
  let updatedCount = 0;
  let scannedCount = 0;

  try {
    await sequelize.authenticate();

    await sequelize.query(`
      ALTER TABLE coupons
      ADD COLUMN IF NOT EXISTS "maxUsesPerUser" INTEGER NOT NULL DEFAULT 1;
    `);
    await sequelize.query(`
      ALTER TABLE coupons
      ADD COLUMN IF NOT EXISTS "userUsageByUserId" JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);

    const coupons = await Coupon.findAll({
      attributes: ["id", "users", "maxUsesPerUser", "userUsageByUserId"],
    });

    for (const coupon of coupons) {
      scannedCount += 1;
      const mergedUsageMap = buildMergedUsageMap(coupon);
      const normalizedMaxUsesPerUser = toValidMaxUsesPerUser(coupon.maxUsesPerUser);

      const beforeUsageMap = JSON.stringify(coupon.userUsageByUserId || {});
      const afterUsageMap = JSON.stringify(mergedUsageMap);
      const hasUsageChanged = beforeUsageMap !== afterUsageMap;
      const hasMaxUsesChanged = Number(coupon.maxUsesPerUser) !== normalizedMaxUsesPerUser;

      if (!hasUsageChanged && !hasMaxUsesChanged) {
        continue;
      }

      await Coupon.update(
        {
          maxUsesPerUser: normalizedMaxUsesPerUser,
          userUsageByUserId: mergedUsageMap,
        },
        { where: { id: coupon.id } }
      );
      updatedCount += 1;
    }

    console.log(
      `[coupon-backfill] Completed. scanned=${scannedCount}, updated=${updatedCount}`
    );
  } catch (error) {
    console.error("[coupon-backfill] Failed:", error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

run();
