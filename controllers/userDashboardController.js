const { Users, Merchant, sequelize } = require("../post-models");

const factory = require("../utils/handlerFactory");
const catchAsync = require("../utils/catchAsyncErrors");
const APIFeatures = require("../utils/APIFeatures");
const AppError = require("../utils/appError");

const SENSITIVE_USER_FIELDS = [
  "password",
  "passwordResetToken",
  "passwordResetTokenExp",
];

exports.createUserAdmin = factory.createOne(Users, "user");

exports.getUsersAdmin = catchAsync(async (req, res, next) => {
  const qs = { ...req.query };
  const includeMerchant =
    qs.includeMerchant === "true" || qs.includeMerchant === "1";
  delete qs.includeMerchant;

  let features = new APIFeatures(Users, qs)
    .filter()
    .sort()
    .selectFields(SENSITIVE_USER_FIELDS);

  if (includeMerchant) {
    features.options.include = [
      {
        model: Merchant,
        as: "merchantProfile",
        required: false,
      },
    ];
  }

  const total = await features.count();
  features.paginate();
  const users = await features.execute();

  res.status(200).json({
    status: "success",
    results: users.length,
    total,
    data: { users },
  });
});

exports.getUserAdmin = factory.getOne(Users, null, "user");

exports.updateUserAdmin = catchAsync(async (req, res, next) => {
  if (req.body.role !== undefined) {
    return next(
      new AppError("Use PATCH /api/v1/dashboard/users/:id/role to update role", 400)
    );
  }
  const docId = req.params.id || req.params.userId;
  if (!docId) {
    return next(new AppError("MISSING_USER_ID", 400));
  }
  if (req.body.password || req.body.passwordConfirm) {
    return next(new AppError("PASSWORD_UPDATE_NOT_ALLOWED", 400));
  }
  const user = await Users.findByPk(docId);
  if (!user) {
    return next(new AppError("USER_NOT_FOUND", 404));
  }
  await user.update(req.body);
  res.status(200).json({
    status: "success",
    data: { user },
  });
});

exports.updateUserRoleAdmin = catchAsync(async (req, res, next) => {
  const userId = req.params.id || req.params.userId;
  if (!userId) return next(new AppError("MISSING_USER_ID", 400));

  const allowedRoles = new Set(["user", "admin", "seller", "merchant"]);
  const nextRole = String(req.body.role || "").trim().toLowerCase();
  if (!allowedRoles.has(nextRole)) {
    return next(
      new AppError("role must be one of: user, admin, seller, merchant", 400)
    );
  }

  const user = await Users.findByPk(userId);
  if (!user) return next(new AppError("USER_NOT_FOUND", 404));

  const currentRole = String(user.role || "").toLowerCase();
  const isPromotingToMerchant = nextRole === "merchant";
  const isDemotingFromMerchant =
    currentRole === "merchant" && nextRole !== "merchant";

  const transaction = await sequelize.transaction();
  try {
    let merchantProfile = await Merchant.findOne({
      where: { userId: user.id },
      transaction,
    });

    if (isPromotingToMerchant && !merchantProfile) {
      const storeName = String(req.body.storeName || "").trim();
      if (!storeName) {
        await transaction.rollback();
        return next(
          new AppError("storeName is required when role is merchant", 400)
        );
      }
      merchantProfile = await Merchant.create(
        {
          userId: user.id,
          storeName,
          status: "active",
          discountActive: false,
          phone: req.body.merchantPhone || null,
          address: req.body.merchantAddress || null,
          notes: req.body.notes || null,
        },
        { transaction }
      );
    }

    if (isDemotingFromMerchant && merchantProfile) {
      await Merchant.destroy({ where: { userId: user.id }, transaction });
      merchantProfile = null;
    }

    if (currentRole !== nextRole) {
      await user.update({ role: nextRole }, { transaction });
    }

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  const updatedUser = await Users.findByPk(user.id, {
    attributes: { exclude: SENSITIVE_USER_FIELDS },
    include: [{ model: Merchant, as: "merchantProfile", required: false }],
  });

  res.status(200).json({
    status: "success",
    data: { user: updatedUser },
  });
});

exports.deleteUserAdmin = factory.deleteOne(Users, "user");
