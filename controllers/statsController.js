const { Order, KinguinProduct } = require("../post-models");
const catchAsyncErrors = require("../utils/catchAsyncErrors");
const { Op } = require("sequelize");

function buildOrderWhere(from, to) {
  const where = { status: { [Op.in]: ["completed", "kingwin"] } };
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt[Op.gte] = new Date(from);
    if (to) where.createdAt[Op.lt] = new Date(to);
  }
  return where;
}

function buildLineItems(order) {
  if (Array.isArray(order.products) && order.products.length) return order.products;
  if (order.product) {
    return [
      {
        product: order.product,
        quantity: order.quantity || 1,
        unitPrice: order.unitPrice || 0,
      },
    ];
  }
  return [];
}

exports.getTopSellingGames = catchAsyncErrors(async (req, res) => {
  const { from, to, topN = 10, tz = "Asia/Baghdad" } = req.query;
  const where = buildOrderWhere(from, to);
  const orders = await Order.findAll({ where, raw: true });

  const perProduct = new Map();
  for (const order of orders) {
    const items = buildLineItems(order);
    items.forEach((item) => {
      const pid = Number(item.product);
      if (!Number.isFinite(pid)) return;
      const prev = perProduct.get(pid) || { units: 0, revenue: 0 };
      const qty = Number(item.quantity) || 1;
      const unitPrice = Number(item.unitPrice) || 0;
      perProduct.set(pid, {
        units: prev.units + qty,
        revenue: prev.revenue + qty * unitPrice,
      });
    });
  }

  const sorted = Array.from(perProduct.entries())
    .sort((a, b) => b[1].units - a[1].units || b[1].revenue - a[1].revenue)
    .slice(0, Number(topN));
  const ids = sorted.map(([id]) => id);
  const products = await KinguinProduct.findAll({ where: { id: { [Op.in]: ids } }, raw: true });
  const byId = new Map(products.map((p) => [p.id, p]));

  const top = sorted.map(([id, v], index) => {
    const p = byId.get(id);
    return {
      rank: index + 1,
      product: id,
      name: p?.overrides?.name || p?.remote?.name || null,
      image: p?.overrides?.images?.[0] || p?.remote?.images?.cover?.url || null,
      units: v.units,
      revenue: v.revenue,
    };
  });

  res.status(200).json({
    status: "success",
    data: {
      top,
      meta: {
        topN: Number(topN),
        from: from ? new Date(from) : null,
        to: to ? new Date(to) : null,
        timezone: tz,
      },
    },
  });
});

exports.getDashboardStats = catchAsyncErrors(async (req, res) => {
  const { from, to, tz = "Asia/Baghdad", topN = 10 } = req.query;
  const where = buildOrderWhere(from, to);

  const [orders, catalogTotal] = await Promise.all([
    Order.findAll({ where, raw: true }),
    KinguinProduct.count(),
  ]);

  const revenue = orders.reduce((sum, o) => sum + (Number(o.totalPrice) || 0), 0);
  const totalPurchases = orders.length;
  const avgPurchasePrice = totalPurchases ? revenue / totalPurchases : 0;
  const visitorCount = new Set(orders.map((o) => o.user).filter(Boolean)).size;

  const countriesMap = new Map();
  orders.forEach((o) => {
    const country = String(o.country || "IQ").trim() || "IQ";
    const row = countriesMap.get(country) || { country, orders: 0, revenue: 0 };
    row.orders += 1;
    row.revenue += Number(o.totalPrice) || 0;
    countriesMap.set(country, row);
  });

  const topReq = { query: { from, to, topN } };
  const topPayload = await new Promise((resolve, reject) => {
    exports.getTopSellingGames(
      topReq,
      { status: () => ({ json: resolve }) },
      reject
    );
  });

  res.status(200).json({
    status: "success",
    data: {
      timeRange: {
        from: from ? new Date(from) : null,
        to: to ? new Date(to) : null,
        timezone: tz,
      },
      kinguinCatalog: {
        count: catalogTotal,
        source: "local:KinguinProduct.count()",
        sandbox: false,
      },
      countries: Array.from(countriesMap.values()).sort((a, b) => b.revenue - a.revenue),
      merchants: [],
      monthly: [],
      roiPerItem: 5800,
      distributors: [],
      totals: {
        revenue,
        totalPurchases,
        avgPurchasePrice,
        visitorCount,
      },
      topSellingGames: topPayload?.data?.top || [],
      suppliers: [],
    },
  });
});
