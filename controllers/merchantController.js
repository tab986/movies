const { fn, col } = require("sequelize");
const { Op } = require("sequelize");
const {
  Merchant,
  MerchantPurchaseLog,
} = require("../post-models");
const catchAsync = require("../utils/catchAsyncErrors");
const AppError = require("../utils/appError");

async function getMerchantForUser(user) {
  if (!user || user.role !== "merchant") return null;
  return Merchant.findOne({ where: { userId: user.id } });
}

function parseDateRange(query) {
  const { from, to } = query;
  const range = {};
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) range[Op.gte] = d;
  }
  if (to) {
    const d = new Date(to);
    if (!Number.isNaN(d.getTime())) range[Op.lte] = d;
  }
  return Object.keys(range).length ? { createdAt: range } : {};
}

exports.getMyPurchaseLog = catchAsync(async (req, res, next) => {
  const merchant = await getMerchantForUser(req.user);
  if (!merchant) {
    return next(new AppError("Merchant profile not found", 404));
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const where = {
    merchantId: merchant.id,
    ...parseDateRange(req.query),
  };

  const { rows, count } = await MerchantPurchaseLog.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  res.status(200).json({
    status: "success",
    results: rows.length,
    total: count,
    meta: { page, limit },
    data: { purchaseLogs: rows },
  });
});

exports.getMyAnalyticsSummary = catchAsync(async (req, res, next) => {
  const merchant = await getMerchantForUser(req.user);
  if (!merchant) {
    return next(new AppError("Merchant profile not found", 404));
  }

  const where = {
    merchantId: merchant.id,
    ...parseDateRange(req.query),
  };

  const [totalGainIQD, totalLossIQD, totalEarningsIQD, ordersCountRows] =
    await Promise.all([
      MerchantPurchaseLog.sum("gainIQD", { where }) || 0,
      MerchantPurchaseLog.sum("lossIQD", { where }) || 0,
      MerchantPurchaseLog.sum("earningIQD", { where }) || 0,
      MerchantPurchaseLog.findAll({
        attributes: [[fn("COUNT", fn("DISTINCT", col("orderId"))), "orderCount"]],
        where,
        raw: true,
      }),
    ]);

  const ordersCount = Number(ordersCountRows[0]?.orderCount) || 0;

  const itemsCount = await MerchantPurchaseLog.sum("quantity", { where }) || 0;

  res.status(200).json({
    status: "success",
    data: {
      totalGainIQD: Number(totalGainIQD) || 0,
      totalLossIQD: Number(totalLossIQD) || 0,
      totalEarningsIQD: Number(totalEarningsIQD) || 0,
      ordersCount: Number(ordersCount) || 0,
      itemsCount: Number(itemsCount) || 0,
    },
  });
});

exports.getMyMostBoughtItems = catchAsync(async (req, res, next) => {
  const merchant = await getMerchantForUser(req.user);
  if (!merchant) {
    return next(new AppError("Merchant profile not found", 404));
  }

  const where = {
    merchantId: merchant.id,
    ...parseDateRange(req.query),
  };

  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  const rows = await MerchantPurchaseLog.findAll({
    where,
    attributes: [
      "productId",
      [fn("MAX", col("productName")), "productName"],
      [fn("SUM", col("quantity")), "totalQuantity"],
      [fn("SUM", col("gainIQD")), "totalGainIQD"],
      [fn("SUM", col("lossIQD")), "totalLossIQD"],
      [fn("SUM", col("earningIQD")), "totalEarningsIQD"],
    ],
    group: ["productId"],
    order: [[fn("SUM", col("quantity")), "DESC"]],
    limit,
    subQuery: false,
    raw: true,
  });

  res.status(200).json({
    status: "success",
    results: rows.length,
    data: { items: rows },
  });
});

/** Admin: purchase log for a merchant by profile id */
exports.getMerchantPurchaseLogAdmin = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findByPk(req.params.id);
  if (!merchant) {
    return next(new AppError("Merchant not found", 404));
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const where = {
    merchantId: merchant.id,
    ...parseDateRange(req.query),
  };

  const { rows, count } = await MerchantPurchaseLog.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });

  res.status(200).json({
    status: "success",
    results: rows.length,
    total: count,
    meta: { page, limit },
    data: { purchaseLogs: rows },
  });
});

exports.getMerchantAnalyticsSummaryAdmin = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findByPk(req.params.id);
  if (!merchant) {
    return next(new AppError("Merchant not found", 404));
  }

  const where = {
    merchantId: merchant.id,
    ...parseDateRange(req.query),
  };

  const [totalGainIQD, totalLossIQD, totalEarningsIQD, ordersCountRows] =
    await Promise.all([
      MerchantPurchaseLog.sum("gainIQD", { where }) || 0,
      MerchantPurchaseLog.sum("lossIQD", { where }) || 0,
      MerchantPurchaseLog.sum("earningIQD", { where }) || 0,
      MerchantPurchaseLog.findAll({
        attributes: [[fn("COUNT", fn("DISTINCT", col("orderId"))), "orderCount"]],
        where,
        raw: true,
      }),
    ]);

  const ordersCount = Number(ordersCountRows[0]?.orderCount) || 0;

  const itemsCount = await MerchantPurchaseLog.sum("quantity", { where }) || 0;

  res.status(200).json({
    status: "success",
    data: {
      merchantId: merchant.id,
      totalGainIQD: Number(totalGainIQD) || 0,
      totalLossIQD: Number(totalLossIQD) || 0,
      totalEarningsIQD: Number(totalEarningsIQD) || 0,
      ordersCount: Number(ordersCount) || 0,
      itemsCount: Number(itemsCount) || 0,
    },
  });
});

exports.getMerchantMostBoughtAdmin = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findByPk(req.params.id);
  if (!merchant) {
    return next(new AppError("Merchant not found", 404));
  }

  const where = {
    merchantId: merchant.id,
    ...parseDateRange(req.query),
  };

  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));

  const rows = await MerchantPurchaseLog.findAll({
    where,
    attributes: [
      "productId",
      [fn("MAX", col("productName")), "productName"],
      [fn("SUM", col("quantity")), "totalQuantity"],
      [fn("SUM", col("gainIQD")), "totalGainIQD"],
      [fn("SUM", col("lossIQD")), "totalLossIQD"],
      [fn("SUM", col("earningIQD")), "totalEarningsIQD"],
    ],
    group: ["productId"],
    order: [[fn("SUM", col("quantity")), "DESC"]],
    limit,
    subQuery: false,
    raw: true,
  });

  res.status(200).json({
    status: "success",
    results: rows.length,
    data: { merchantId: merchant.id, items: rows },
  });
});
