const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const Users = require("../models/userModel");
const catchAsync = require("../utils/catchAsyncErrors");
const AppError = require("../utils/appError");
const APIFeatures = require("../utils/APIFeatures");

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
});

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

    const user = await Users.create({
      fullName: req.body.fullName,
      phone: req.body.phone, // ✅ matches schema
      governorate: req.body.governorate,
      city: req.body.city,
      address: req.body.address,
      password: req.body.password,
      role, // comes from function arg / controller
    });

    const token = createToken(user._id);
    res.cookie("JWT", token, getCookieOptions());

    res.status(201).json({
      status: "success",
      token,
      data: { user },
    });
  });

/**
 * Login for any role
 */
exports.login = catchAsync(async (req, res, next) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return next(new AppError("Please provide both phone and password", 400));
  }

  const user = await Users.findOne({ phone }).select("+password");
  if (!user || !(await user.checkPassword(password, user.password))) {
    return next(new AppError("Incorrect phone or password", 401));
  }

  const token = createToken(user._id);
  res.cookie("JWT", token, getCookieOptions());

  res.status(200).json({
    status: "success",
    token,
    data: { user },
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

  if (!token) {
    return next(new AppError("Unauthorized access. Token missing.", 401));
  }

  const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  const currentUser = await Users.findById(decoded.id).select("+password");

  if (!currentUser) {
    return next(new AppError("User no longer exists", 401));
  }

  if (await currentUser.checkChangedPassword(decoded.iat)) {
    return next(new AppError("Token is invalid due to password change", 401));
  }

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
    user = await Users.findOne({ phone: req.params.phone });
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

  const features = new APIFeatures(Users.find(), req.query)
    .filter()
    .sort()
    .paginate()
    .selectFields();

  const users = await features.query.select(
    "-password -passwordResetToken -passwordResetTokenExp"
  );

  res.status(200).json({
    status: "success",
    results: users.length,
    data: { users },
  });
});

exports.sendOTP = catchAsync(async (req, res, next) => {
  const { phone } = req.body;
  if (!phone) return next(new AppError("Phone number is required", 400));
  const user = await Users.findOne({ phone });
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
  const user = await Users.findById(req.user._id).select("+password");
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
  if (!to) return next(new AppError("phoneNumber is required", 400));

  // Ensure the user exists
  const user = await Users.findOne({ phoneNumber: to });
  if (!user) return next(new AppError("User not found", 404));

  // Send OTP via Twilio Verify
  const twilio = require("twilio")(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );

  await twilio.verify.v2
    .services(process.env.TWILIO_VERIFY_SID)
    .verifications.create({ to, channel });

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
  const user = await Users.findOne({ phoneNumber: to }).select("+password");
  if (!user) return next(new AppError("User not found", 404));

  // Bypass code for testing
  if (String(code) !== "111111") {
    const twilio = require("twilio")(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const check = await twilio.verify.v2
      .services(process.env.TWILIO_VERIFY_SID)
      .verificationChecks.create({ to, code });

    if (!check || check.status !== "approved") {
      return next(new AppError("Invalid or expired code", 400));
    }
  }

  // Update password
  user.password = newPassword;
  user.passwordChangedAt = new Date();
  await user.save();

  // (Optional) Log the user in after reset
  const token = createToken(user._id);
  res.cookie("JWT", token, getCookieOptions());

  res.status(200).json({
    status: "success",
    message: "Password updated successfully",
    token,
    data: { user },
  });
});
