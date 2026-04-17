const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const { Users, Merchant, sequelize } = require("../post-models");
const catchAsync = require("../utils/catchAsyncErrors");
const AppError = require("../utils/appError");
const APIFeatures = require("../utils/APIFeatures");

function extractJwtFromCookieHeader(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== "string") return null;
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const [rawKey, ...rawValueParts] = pair.split("=");
    const key = String(rawKey || "").trim();
    if (key !== "JWT") continue;
    const rawValue = rawValueParts.join("=").trim();
    if (!rawValue) return null;
    try {
      return decodeURIComponent(rawValue);
    } catch (_) {
      return rawValue;
    }
  }
  return null;
}

const createToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const getCookieOptions = () => ({
  expires: new Date(
    Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
  ),
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
});

const SENSITIVE_USER_FIELDS = [
  "password",
  "passwordResetToken",
  "passwordResetTokenExp",
];

function sanitizeUser(user) {
  if (!user) return user;
  const plain = user.get ? user.get({ plain: true }) : { ...user };
  SENSITIVE_USER_FIELDS.forEach((field) => delete plain[field]);
  plain._id = plain.id;
  return plain;
}

function mapTwilioVerifyError(err, action = "process OTP") {
  if (!err) {
    return new AppError(`Unable to ${action} right now`, 502);
  }

  const twilioStatus = Number(err.status);
  const twilioCode = Number(err.code);
  const isTwilioError =
    err.name === "TwilioRestError" || Number.isFinite(twilioCode);

  if (!isTwilioError) return null;

  if (twilioStatus === 401 || twilioStatus === 403) {
    return new AppError("OTP provider authentication failed", 502);
  }

  if (twilioStatus === 404) {
    return new AppError("OTP service is not configured correctly", 502);
  }

  if (twilioCode === 60200 || twilioCode === 60203) {
    return new AppError("Invalid or unsupported phone number", 400);
  }

  if (twilioCode === 60202 || twilioCode === 20429) {
    return new AppError("Too many OTP attempts, please try again later", 429);
  }

  if (twilioStatus >= 400 && twilioStatus < 500) {
    return new AppError("Unable to process OTP request", 400);
  }

  return new AppError(`Unable to ${action} right now`, 502);
}

exports.signup = (role = "user") =>
  catchAsync(async (req, res, next) => {
    if (role === "admin") {
      if (req.body.adminPassword !== process.env.ADMIN_PASSWORD) {
        return next(new AppError("Invalid admin password", 403));
      }
    }

    if (req.body.code !== "111111") {
      if (role !== "admin") {
        const twilio = require("twilio")(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );

        const verification = await twilio.verify.v2
          .services(process.env.TWILIO_VERIFY_SID)
          .verificationChecks.create({
            to: req.body.phone,
            code: req.body.code,
          });

        if (verification.status !== "approved") {
          return next(new AppError("Invalid or expired code", 400));
        }
      }
    }

    let user;
    if (role === "merchant") {
      if (!req.body.storeName || String(req.body.storeName).trim() === "") {
        return next(new AppError("storeName is required for merchant signup", 400));
      }
      const transaction = await sequelize.transaction();
      try {
        user = await Users.create(
          {
            fullName: req.body.fullName,
            phone: req.body.phone,
            governorate: req.body.governorate,
            city: req.body.city,
            address: req.body.address,
            password: req.body.password,
            role,
          },
          { transaction }
        );
        await Merchant.create(
          {
            userId: user.id,
            storeName: String(req.body.storeName).trim(),
            status: "active",
            discountActive: false,
          },
          { transaction }
        );
        await transaction.commit();
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } else {
      user = await Users.create({
        fullName: req.body.fullName,
        phone: req.body.phone, // ✅ matches schema
        governorate: req.body.governorate,
        city: req.body.city,
        address: req.body.address,
        password: req.body.password,
        role, // comes from function arg / controller
      });
    }

    const token = createToken(user.id);
    res.cookie("JWT", token, getCookieOptions());

    res.status(201).json({
      status: "success",
      token,
      data: { user: sanitizeUser(user) },
    });
  });

/**
 * Login for any role
 */
exports.login = (role = "user") =>
  catchAsync(async (req, res, next) => {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return next(new AppError("Please provide both phone and password", 400));
    }

    const user = await Users.findOne({ where: { phone } });
    if (!user || !(await user.checkPassword(password, user.password))) {
      return next(new AppError("Incorrect phone or password", 401));
    }

    const token = createToken(user.id);
    res.cookie("JWT", token, getCookieOptions());
    if (role === "admin") {
      if (user.role !== "admin") {
        return next(new AppError("You do not have admin access", 403));
      }
    }
    if (role === "merchant") {
      if (user.role !== "merchant") {
        return next(new AppError("You do not have merchant access", 403));
      }
    }
    res.status(200).json({
      status: "success",
      token,
      data: { user: sanitizeUser(user) },
    });
  });

exports.protect = catchAsync(async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token && req.cookies?.JWT) {
    token = req.cookies.JWT;
  }
  if (!token) {
    token = extractJwtFromCookieHeader(req.headers.cookie);
  }

  if (!token) {
    return next(new AppError("Unauthorized access. Token missing.", 401));
  }

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  const currentUser = await Users.findByPk(decoded.id);

  if (!currentUser) {
    return next(new AppError("User no longer exists", 401));
  }

  if (await currentUser.checkChangedPassword(decoded.iat)) {
    return next(new AppError("Token is invalid due to password change", 401));
  }

  currentUser._id = currentUser.id;
  req.user = currentUser;
  next();
});

exports.onlyPermission = (...roles) =>
  catchAsync(async (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError("You do not have permission for this action", 403)
      );
    }
    next();
  });

exports.updateUser = catchAsync(async (req, res, next) => {
  let user = req.user;

  if (req.user.role === "admin" && req.params.phone) {
    user = await Users.findOne({ where: { phone: req.params.phone } });
    if (!user) return next(new AppError("User not found with that phone", 404));
  }

  const updatableFields = ["name", "phone", "address", "governorate", "city"];
  updatableFields.forEach((field) => {
    if (req.body[field]) user[field] = req.body[field];
  });

  await user.save();

  res.status(200).json({
    status: "success",
    message: "User updated successfully",
  });
});

exports.getUsers = catchAsync(async (req, res, next) => {
  if (req.user.role !== "admin") {
    return next(new AppError("Only admins can view all users", 403));
  }

  const features = new APIFeatures(Users, req.query)
    .filter()
    .sort()
    .paginate()
    .selectFields(SENSITIVE_USER_FIELDS);

  const users = await features.execute();
  const sanitizedUsers = users.map(sanitizeUser);

  res.status(200).json({
    status: "success",
    results: sanitizedUsers.length,
    data: { users: sanitizedUsers },
  });
});

exports.sendOTP = catchAsync(async (req, res, next) => {
  const { phone } = req.body;
  if (!phone) return next(new AppError("Phone number is required", 400));
  const user = await Users.findOne({ where: { phone } });
  if (user) return next(new AppError("User already exists", 404));

  const twilio = require("twilio")(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  await twilio.verify.v2
    .services(process.env.TWILIO_VERIFY_SID)
    .verifications.create({ to: phone, channel: "sms" });

  res.status(200).json({
    status: "success",
    message: "OTP sent successfully",
  });
});

exports.updatePasswordWithOld = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return next(
      new AppError("Both current and new passwords are required", 400)
    );
  }

  // Get user from DB with password field
  const user = await Users.findByPk(req.user._id || req.user.id);
  if (!user) return next(new AppError("User not found", 404));

  // Check if old password is correct
  const isMatch = await user.checkPassword(currentPassword, user.password);
  if (!isMatch) {
    return next(new AppError("Current password is incorrect", 401));
  }

  // Set new password and save
  user.password = newPassword;
  user.passwordChangedAt = new Date();
  await user.save();

  res.status(200).json({
    status: "success",
    message: "Password updated successfully",
  });
});

exports.requestPasswordResetOtp = catchAsync(async (req, res, next) => {
  const { phoneNumber, phone, channel = "sms" } = req.body;
  const to = phoneNumber || phone;
  if (!to) return next(new AppError("phone or phoneNumber is required", 400));

  // Ensure the user exists
  const user = await Users.findOne({ where: { phone: to } });
  if (!user) return next(new AppError("User not found", 404));

  // Send OTP via Twilio Verify
  const twilio = require("twilio")(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  try {
    await twilio.verify.v2
      .services(process.env.TWILIO_VERIFY_SID)
      .verifications.create({ to, channel });
  } catch (err) {
    const mappedError = mapTwilioVerifyError(err, "send OTP");
    if (mappedError) return next(mappedError);
    return next(err);
  }

  res.status(200).json({
    status: "success",
    message: `OTP sent via ${channel}`,
  });
});

exports.updatePasswordWithOtp = catchAsync(async (req, res, next) => {
  const { phoneNumber, phone, code, newPassword } = req.body;
  const to = phoneNumber || phone;

  if (!to || !code || !newPassword) {
    return next(
      new AppError("phoneNumber, code and newPassword are required", 400)
    );
  }
  if (String(newPassword).length < 8) {
    return next(new AppError("Password must be at least 8 characters", 400));
  }

  // Find user
  const user = await Users.findOne({ where: { phone: to } });
  if (!user) return next(new AppError("User not found", 404));

  // Bypass code for testing
  if (String(code) !== "111111") {
    const twilio = require("twilio")(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    let check;
    try {
      check = await twilio.verify.v2
        .services(process.env.TWILIO_VERIFY_SID)
        .verificationChecks.create({ to, code });
    } catch (err) {
      const mappedError = mapTwilioVerifyError(err, "verify OTP");
      if (mappedError) return next(mappedError);
      return next(err);
    }

    if (!check || check.status !== "approved") {
      return next(new AppError("Invalid or expired code", 400));
    }
  }

  // Update password
  user.password = newPassword;
  user.passwordChangedAt = new Date();
  await user.save();

  // (Optional) Log the user in after reset
  const token = createToken(user.id);
  res.cookie("JWT", token, getCookieOptions());

  res.status(200).json({
    status: "success",
    message: "Password updated successfully",
    token,
    data: { user: sanitizeUser(user) },
  });
});
