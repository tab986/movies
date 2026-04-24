const { Merchant, Users, sequelize } = require("../post-models");
const catchAsync = require("../utils/catchAsyncErrors");
const AppError = require("../utils/appError");
const APIFeatures = require("../utils/APIFeatures");

const SENSITIVE_USER_FIELDS = [
  "password",
  "passwordResetToken",
  "passwordResetTokenExp",
];

function validateDiscountPayload(body) {
  const { discountType, discountValue, discountActive } = body;
  if (discountActive === false || discountType == null) {
    return {
      discountType: null,
      discountValue: null,
      discountActive: false,
    };
  }
  const type = String(discountType || "").toLowerCase();
  const val = Number(discountValue);
  if (type !== "percent" && type !== "fixed") {
    throw new AppError("discountType must be percent or fixed", 400);
  }
  if (!Number.isFinite(val) || val <= 0) {
    throw new AppError("discountValue must be a positive number", 400);
  }
  if (type === "percent" && val > 100) {
    throw new AppError("percent discount cannot exceed 100", 400);
  }
  return {
    discountType: type,
    discountValue: val,
    discountActive: true,
  };
}

exports.listMerchants = catchAsync(async (req, res) => {
  const features = new APIFeatures(Merchant, req.query).filter().sort();
  const total = await features.count();
  features.paginate();
  features.options.include = [
    {
      model: Users,
      as: "user",
      attributes: { exclude: SENSITIVE_USER_FIELDS },
    },
  ];
  const merchants = await features.execute();

  res.status(200).json({
    status: "success",
    results: merchants.length,
    total,
    data: { merchants },
  });
});

exports.getMerchant = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findByPk(req.params.id, {
    include: [
      {
        model: Users,
        as: "user",
        attributes: { exclude: SENSITIVE_USER_FIELDS },
      },
    ],
  });
  if (!merchant) {
    return next(new AppError("Merchant not found", 404));
  }
  res.status(200).json({ status: "success", data: { merchant } });
});

exports.createMerchant = catchAsync(async (req, res, next) => {
  const {
    fullName,
    phone,
    password,
    governorate,
    city,
    address,
    storeName,
  } = req.body;

  if (!fullName || !phone || !password || !storeName) {
    return next(
      new AppError("fullName, phone, password, and storeName are required", 400)
    );
  }

  const transaction = await sequelize.transaction();
  try {
    const user = await Users.create(
      {
        fullName,
        phone,
        password,
        governorate,
        city,
        address,
        role: "merchant",
      },
      { transaction }
    );

    const merchant = await Merchant.create(
      {
        userId: user.id,
        storeName: String(storeName).trim(),
        status: "active",
        phone: req.body.merchantPhone || null,
        address: req.body.merchantAddress || null,
        notes: req.body.notes || null,
        discountActive: false,
      },
      { transaction }
    );

    if (req.body.discountType && req.body.discountActive !== false) {
      const d = validateDiscountPayload({
        discountType: req.body.discountType,
        discountValue: req.body.discountValue,
        discountActive: true,
      });
      await merchant.update(
        {
          discountType: d.discountType,
          discountValue: d.discountValue,
          discountActive: d.discountActive,
        },
        { transaction }
      );
    }

    await transaction.commit();

    const full = await Merchant.findByPk(merchant.id, {
      include: [
        {
          model: Users,
          as: "user",
          attributes: { exclude: SENSITIVE_USER_FIELDS },
        },
      ],
    });

    res.status(201).json({ status: "success", data: { merchant: full } });
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
});

exports.updateMerchant = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findByPk(req.params.id);
  if (!merchant) {
    return next(new AppError("Merchant not found", 404));
  }

  const allowed = [
    "storeName",
    "status",
    "phone",
    "address",
    "notes",
  ];
  const updates = {};
  allowed.forEach((k) => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });

  if (Object.keys(updates).length) {
    await merchant.update(updates);
  }

  const full = await Merchant.findByPk(merchant.id, {
    include: [
      {
        model: Users,
        as: "user",
        attributes: { exclude: SENSITIVE_USER_FIELDS },
      },
    ],
  });

  res.status(200).json({ status: "success", data: { merchant: full } });
});

exports.updateMerchantDiscount = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findByPk(req.params.id);
  if (!merchant) {
    return next(new AppError("Merchant not found", 404));
  }

  const d = validateDiscountPayload(req.body);
  await merchant.update({
    discountType: d.discountType,
    discountValue: d.discountValue,
    discountActive: d.discountActive,
  });

  res.status(200).json({ status: "success", data: { merchant } });
});

exports.deleteMerchant = catchAsync(async (req, res, next) => {
  const merchant = await Merchant.findByPk(req.params.id);
  if (!merchant) {
    return next(new AppError("Merchant not found", 404));
  }

  const user = await Users.findByPk(merchant.userId);
  const transaction = await sequelize.transaction();
  try {
    await merchant.destroy({ transaction });
    if (user && user.role === "merchant") {
      await user.update({ role: "user" }, { transaction });
    }
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  res.status(204).json({ status: "success", data: null });
});
