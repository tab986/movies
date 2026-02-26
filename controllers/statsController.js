// controllers/statsController.js
const Order = require("../models/Orders");
const KinguinProduct = require("../models/KinguinProduct");
const catchAsyncErrors = require("../utils/catchAsyncErrors");

exports.getTopSellingGames = catchAsyncErrors(async (req, res) => {
  const { from, to, topN = 10, tz = "Asia/Baghdad" } = req.query;

  // Adjust status values if your system uses different "success" statuses
  const statusMatch = { status: { $in: ["completed"] } };

  const dateMatch =
    from || to
      ? {
          createdAt: {
            ...(from ? { $gte: new Date(from) } : {}),
            ...(to ? { $lt: new Date(to) } : {}),
          },
        }
      : {};

  // Prefer the actual collection name (avoids hardcoding "kinguinproducts")
  const PRODUCTS = KinguinProduct.collection.name;

  const pipeline = [
    { $match: { ...statusMatch, ...dateMatch } },

    // Normalize to lineItems: either `products[]` or legacy single item
    {
      $addFields: {
        lineItems: {
          $cond: [
            { $gt: [{ $size: { $ifNull: ["$products", []] } }, 0] },
            "$products",
            [
              {
                product: "$product",
                quantity: { $ifNull: ["$quantity", 1] },
                unitPrice: { $ifNull: ["$unitPrice", 0] },
              },
            ],
          ],
        },
      },
    },
    { $unwind: "$lineItems" },

    // Compute common fields
    {
      $addFields: {
        productKid: {
          $convert: {
            input: "$lineItems.product",
            to: "int",
            onError: null,
            onNull: null,
          },
        },
        qty: { $ifNull: ["$lineItems.quantity", 1] },
        lineRevenue: {
          $multiply: [
            { $ifNull: ["$lineItems.quantity", 1] },
            { $ifNull: ["$lineItems.unitPrice", 0] },
          ],
        },
      },
    },
    { $match: { productKid: { $ne: null } } },

    // Aggregate sales by product
    {
      $group: {
        _id: "$productKid",
        units: { $sum: "$qty" },
        revenue: { $sum: "$lineRevenue" },
      },
    },
    { $sort: { units: -1, revenue: -1 } },
    { $limit: Number(topN) },

    // Enrich with product name + one image (override -> images[0] -> thumbnail -> cover)
    {
      $lookup: {
        from: PRODUCTS,
        let: { kid: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $or: [
                  { $eq: ["$_id", "$$kid"] },
                  { $eq: ["$kinguinId", "$$kid"] },
                ],
              },
            },
          },
          {
            $project: {
              _id: 0,
              name: { $ifNull: ["$overrides.name", "$remote.name"] },
              image: {
                $let: {
                  vars: {
                    overImgs: { $ifNull: ["$overrides.images", []] },
                    rImgs: { $ifNull: ["$remote.images", {}] },
                    rThumbFlat: "$remote.thumbnail", // flat fallback (string)
                    rCoverFlat: "$remote.cover", // flat fallback (string)
                  },
                  in: {
                    // 1) overrides.images[0] (string or {thumbnail|url})
                    $cond: [
                      { $gt: [{ $size: "$$overImgs" }, 0] },
                      {
                        $let: {
                          vars: { o0: { $arrayElemAt: ["$$overImgs", 0] } },
                          in: {
                            $cond: [
                              { $eq: [{ $type: "$$o0" }, "object"] },
                              { $ifNull: ["$$o0.thumbnail", "$$o0.url"] },
                              "$$o0",
                            ],
                          },
                        },
                      },
                      // else → 2) remote.images.screenshots[0] (prefer thumbnail)
                      {
                        $let: {
                          vars: {
                            ss: { $ifNull: ["$$rImgs.screenshots", []] },
                            cov: { $ifNull: ["$$rImgs.cover", {}] },
                          },
                          in: {
                            $cond: [
                              { $gt: [{ $size: "$$ss" }, 0] },
                              {
                                $let: {
                                  vars: { s0: { $arrayElemAt: ["$$ss", 0] } },
                                  in: {
                                    $ifNull: ["$$s0.thumbnail", "$$s0.url"],
                                  },
                                },
                              },
                              // 3) cover.thumbnail → cover.url → flat fallbacks
                              {
                                $ifNull: [
                                  "$$cov.thumbnail",
                                  {
                                    $ifNull: [
                                      "$$cov.url",
                                      {
                                        $ifNull: [
                                          "$$rThumbFlat",
                                          "$$rCoverFlat",
                                        ],
                                      },
                                    ],
                                  },
                                ],
                              },
                            ],
                          },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        ],
        as: "prod",
      },
    },
    { $addFields: { prod0: { $arrayElemAt: ["$prod", 0] } } },
    {
      $project: {
        _id: 0,
        product: "$$ROOT._id",
        name: "$prod0.name",
        image: "$prod0.image",
        units: 1,
        revenue: 1,
      },
    },
  ];

  const rows = await Order.aggregate(pipeline);
  const ranked = rows.map((r, i) => ({ rank: i + 1, ...r }));

  res.status(200).json({
    status: "success",
    data: {
      top: ranked,
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

  // STRICT: only completed + kingwin orders across ALL stats
  const statusFilter = { status: { $in: ["completed"] } };

  const dateMatch =
    from || to
      ? {
          createdAt: {
            ...(from ? { $gte: new Date(from) } : {}),
            ...(to ? { $lt: new Date(to) } : {}),
          },
        }
      : {};

  const PRODUCTS = KinguinProduct.collection.name;

  // Normalize orders → lineItems (supports legacy single-product orders)
  const addLineItems = {
    $addFields: {
      lineItems: {
        $cond: [
          { $gt: [{ $size: { $ifNull: ["$products", []] } }, 0] },
          "$products",
          [
            {
              product: "$product",
              quantity: { $ifNull: ["$quantity", 1] },
              unitPrice: "$unitPrice",
            },
          ],
        ],
      },
    },
  };

  const normalizeLineItems = [
    { $unwind: "$lineItems" },
    {
      $addFields: {
        qty: { $ifNull: ["$lineItems.quantity", 1] },
        lineRevenue: {
          $multiply: [
            { $ifNull: ["$lineItems.quantity", 1] },
            { $ifNull: ["$lineItems.unitPrice", 0] },
          ],
        },
        productKid: {
          $convert: {
            input: "$lineItems.product",
            to: "int",
            onError: null,
            onNull: null,
          },
        },
      },
    },
    { $match: { productKid: { $ne: null } } },
  ];

  // Tiny lookup for top-selling cards (name + one image with fallbacks)
  const lookupMinimalForItemCard = {
    $lookup: {
      from: PRODUCTS,
      let: { kid: "$_id" },
      pipeline: [
        {
          $match: {
            $expr: {
              $or: [
                { $eq: ["$_id", "$$kid"] },
                { $eq: ["$kinguinId", "$$kid"] },
              ],
            },
          },
        },
        {
          $project: {
            _id: 0,
            name: { $ifNull: ["$overrides.name", "$remote.name"] },
            image: {
              $let: {
                vars: {
                  imgs: { $ifNull: ["$overrides.images", "$remote.images"] },
                  thumb: "$remote.thumbnail",
                  cover: "$remote.cover",
                },
                in: {
                  $cond: [
                    {
                      $and: [
                        { $isArray: "$$imgs" },
                        { $gt: [{ $size: "$$imgs" }, 0] },
                      ],
                    },
                    { $arrayElemAt: ["$$imgs", 0] },
                    { $ifNull: ["$$thumb", { $ifNull: ["$$cover", null] }] },
                  ],
                },
              },
            },
          },
        },
      ],
      as: "p",
    },
  };

  // Ultra-trim lookup for supplier string only
  const lookupSupplierOnly = {
    $lookup: {
      from: PRODUCTS,
      let: { kid: "$_id" }, // _id is productKid after first group
      pipeline: [
        {
          $match: {
            $expr: {
              $or: [
                { $eq: ["$_id", "$$kid"] },
                { $eq: ["$kinguinId", "$$kid"] },
              ],
            },
          },
        },
        {
          $project: {
            _id: 0,
            supplier: {
              $ifNull: [
                "$remote.supplier",
                {
                  $ifNull: [
                    "$remote.seller",
                    {
                      $ifNull: [
                        "$remote.merchant",
                        {
                          $ifNull: [
                            "$remote.distributor",
                            { $ifNull: ["$remote.publisher", "Kinguin"] },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
      as: "p",
    },
  };

  const pipeline = [
    { $match: { ...statusFilter, ...dateMatch } },
    {
      $facet: {
        // Totals / AOV / unique buyers (from completed + kingwin only)
        perOrder: [
          {
            $group: {
              _id: null,
              revenue: { $sum: "$totalPrice" },
              totalPurchases: { $sum: 1 },
              avgPurchasePrice: { $avg: "$totalPrice" },
              users: { $addToSet: "$user" },
            },
          },
          {
            $project: {
              _id: 0,
              revenue: 1,
              totalPurchases: 1,
              avgPurchasePrice: { $ifNull: ["$avgPurchasePrice", 0] },
              visitorCount: { $size: "$users" },
            },
          },
        ],

        // Countries — map missing/empty/"-"/"—" to IQ
        countries: [
          {
            $group: {
              _id: {
                $let: {
                  vars: {
                    c: { $trim: { input: { $ifNull: ["$country", ""] } } },
                  },
                  in: {
                    $cond: [
                      {
                        $or: [
                          { $eq: ["$$c", ""] },
                          { $eq: ["$$c", "-"] },
                          { $eq: ["$$c", "—"] },
                        ],
                      },
                      "IQ",
                      "$$c",
                    ],
                  },
                },
              },
              orders: { $sum: 1 },
              revenue: { $sum: "$totalPrice" },
            },
          },
          { $project: { _id: 0, country: "$_id", orders: 1, revenue: 1 } },
          { $sort: { revenue: -1 } },
        ],

        // Merchants = your RESELLERS (order.merchants ObjectId)
        merchants: [
          {
            $group: {
              _id: "$merchants", // reseller id
              orders: { $sum: 1 },
              revenue: { $sum: "$totalPrice" },
            },
          },
          {
            $lookup: {
              from: "users", // adjust if your Users collection name differs
              localField: "_id",
              foreignField: "_id",
              as: "u",
              pipeline: [
                { $project: { _id: 0, name: 1, username: 1, email: 1 } },
              ],
            },
          },
          { $addFields: { u0: { $arrayElemAt: ["$u", 0] } } },
          {
            $project: {
              _id: 0,
              resellerId: "$$ROOT._id",
              resellerName: {
                $ifNull: [
                  "$u0.name",
                  { $ifNull: ["$u0.username", "game-wise-website"] },
                ],
              },
              orders: 1,
              revenue: 1,
              aov: {
                $cond: [
                  { $gt: ["$orders", 0] },
                  { $divide: ["$revenue", "$orders"] },
                  0,
                ],
              },
            },
          },
          { $sort: { revenue: -1 } },
        ],

        // Monthly (completed + kingwin only)
        monthly: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m",
                  date: "$createdAt",
                  timezone: tz,
                },
              },
              orders: { $sum: 1 },
              revenue: { $sum: "$totalPrice" },
            },
          },
          { $project: { _id: 0, month: "$_id", orders: 1, revenue: 1 } },
          { $sort: { month: 1 } },
        ],

        // Top selling games (only from the filtered orders)
        perItem: [
          addLineItems,
          ...normalizeLineItems,
          {
            $group: {
              _id: "$productKid",
              quantity: { $sum: "$qty" },
              revenue: { $sum: "$lineRevenue" },
            },
          },
          { $sort: { quantity: -1 } },
          { $limit: Number(topN) },
          lookupMinimalForItemCard,
          { $addFields: { p0: { $arrayElemAt: ["$p", 0] } } }, // array → object
          {
            $project: {
              _id: 0,
              product: "$$ROOT._id",
              name: "$p0.name",
              image: "$p0.image",
              quantity: 1,
              revenue: 1,
            },
          },
        ],

        // Distributors (heuristic; still only on the filtered orders)
        distributors: [
          {
            $addFields: {
              source: {
                $cond: [
                  { $ifNull: ["$kinguinOrderId", false] },
                  "Kinguin",
                  "Manual",
                ],
              },
            },
          },
          {
            $group: {
              _id: "$source",
              orders: { $sum: 1 },
              revenue: { $sum: "$totalPrice" },
            },
          },
          { $project: { _id: 0, distributor: "$_id", orders: 1, revenue: 1 } },
          { $sort: { revenue: -1 } },
        ],

        // Suppliers (sales-based)
        suppliers: [
          addLineItems,
          ...normalizeLineItems,
          {
            $group: {
              _id: "$productKid",
              itemsSold: { $sum: "$qty" },
              revenue: { $sum: "$lineRevenue" },
              ordersSet: { $addToSet: "$_id" },
            },
          },
          lookupSupplierOnly,
          { $addFields: { p0: { $arrayElemAt: ["$p", 0] } } },
          {
            $addFields: { supplier: { $ifNull: ["$p0.supplier", "Kinguin"] } },
          },
          {
            $group: {
              _id: "$supplier",
              itemsSold: { $sum: "$itemsSold" },
              revenue: { $sum: "$revenue" },
              uniqueProducts: { $sum: 1 },
              allOrders: { $push: "$ordersSet" },
            },
          },
          {
            $project: {
              _id: 0,
              supplier: "$$ROOT._id",
              itemsSold: 1,
              revenue: 1,
              uniqueProducts: 1,
              orders: {
                $size: {
                  $reduce: {
                    input: "$allOrders",
                    initialValue: [],
                    in: { $setUnion: ["$$value", "$$this"] },
                  },
                },
              },
            },
          },
          { $sort: { revenue: -1, itemsSold: -1 } },
        ],
      },
    },
    {
      $project: {
        totals: {
          $ifNull: [
            { $arrayElemAt: ["$perOrder", 0] },
            {
              revenue: 0,
              totalPurchases: 0,
              avgPurchasePrice: 0,
              visitorCount: 0,
            },
          ],
        },
        countries: 1,
        merchants: 1,
        monthly: 1,
        topSellingGames: "$perItem",
        distributors: 1,
        suppliers: 1,
      },
    },
  ];

  // Run orders aggregation (only completed + kingwin)
  const aggResult = (await Order.aggregate(pipeline))[0] || {};

  // === Local Kinguin catalog (unchanged; from your DB) ===
  const [catalogTotal, catalogBySupplier] = await Promise.all([
    KinguinProduct.countDocuments({}),
    KinguinProduct.aggregate([
      {
        $project: {
          supplier: {
            $ifNull: [
              "$remote.supplier",
              {
                $ifNull: [
                  "$remote.seller",
                  {
                    $ifNull: [
                      "$remote.merchant",
                      {
                        $ifNull: [
                          "$remote.distributor",
                          { $ifNull: ["$remote.publisher", "Kinguin"] },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      },
      { $group: { _id: "$supplier", catalogProducts: { $sum: 1 } } },
      { $project: { _id: 0, supplier: "$_id", catalogProducts: 1 } },
    ]),
  ]);

  // Merge sales suppliers with catalog suppliers (include zero-sales suppliers)
  const suppliersSales = Array.isArray(aggResult.suppliers)
    ? aggResult.suppliers.slice()
    : [];
  const bySupplier = new Map(suppliersSales.map((s) => [s.supplier, s]));

  for (const row of catalogBySupplier) {
    const cur = bySupplier.get(row.supplier);
    if (cur) cur.catalogProducts = row.catalogProducts;
    else
      bySupplier.set(row.supplier, {
        supplier: row.supplier,
        catalogProducts: row.catalogProducts,
        itemsSold: 0,
        revenue: 0,
        uniqueProducts: 0,
        orders: 0,
      });
  }

  // Compose final suppliers list
  let suppliers = Array.from(bySupplier.values());
  suppliers.sort(
    (a, b) =>
      b.revenue - a.revenue ||
      b.itemsSold - a.itemsSold ||
      (b.catalogProducts || 0) - (a.catalogProducts || 0)
  );

  // Prepend local catalog total row (informational)
  suppliers.unshift({
    supplier: "Kinguin (Catalog)",
    catalogCount: catalogTotal,
    itemsSold: null,
    revenue: null,
    uniqueProducts: null,
    orders: null,
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
        source: "local:KinguinProduct.countDocuments()",
        sandbox: false,
      },
      countries: aggResult.countries || [],
      merchants: aggResult.merchants || [], // now RESSELLERS
      monthly: aggResult.monthly || [],
      roiPerItem: 5800,
      distributors: aggResult.distributors || [],
      totals: aggResult.totals || {
        revenue: 0,
        totalPurchases: 0,
        avgPurchasePrice: 0,
        visitorCount: 0,
      },
      topSellingGames: aggResult.topSellingGames || [],
      suppliers,
    },
  });
});
