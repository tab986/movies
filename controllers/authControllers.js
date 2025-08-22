const catchAsyncErrors = require("../utils/catchAsyncErrors");
const Users = require("../models/userModel");

const appError = require("../utils/appError");
const jwt = require("jsonwebtoken");
const { promisify } = require("util");
const APIFeatures = require("../utils/APIFeatures");

let cookieOptions = {
  expires: new Date(
    Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 1000 * 60 * 60 * 24
  ),
  httpOnly: true,
};

const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

exports.updateUser = catchAsyncErrors(async (req, res, next) => {
  if (req.admin) {
    const user = await Users.findOne({ phoneNumber: req.params.phoneNumber });

    if (!user) return next(new appError("incorrect phoneNumber number", 400));
    req.user = user;
  }
  req.user.fullName = req.body.fullName || req.user.fullName;
  req.user.phoneNumber = req.body.phoneNumber || req.user.phoneNumber;
  req.user.address = req.body.address || req.user.address;

  req.user.city = req.body.city || req.user.city;
  await req.user.save();

  res.status(200).json({
    status: "success",
    message: "user updated",
  });
});

// exports.updatePublisher = catchAsyncErrors(async (req, res, next) => {
//   if (req.admin) {
//     const publisher = await Publisher.findOne({ email: req.params.email });
//     if (!publisher) return next(new appError('incorrect email', 400));
//     req.publisher = publisher;
//   }
//   const { email, fullName, phoneNumber } = req.body;

//   req.publisher.fullName = fullName || req.publisher.fullName;
//   req.publisher.phoneNumber = phoneNumber || req.publisher.phoneNumber;
//   req.publisher.email = email || req.publisher.email;

//   await req.publisher.save();

//   res.status(200).json({
//     status: 'success',
//     message: 'publisher updated',
//   });
// });

exports.signup = (role = "user") => {
  return catchAsyncErrors(async (req, res, next) => {
    if (role === "admin") {
      if (!(req.body.adminPassword === process.env.ADMIN_PASSWORD))
        return next(
          new appError("yor are not allowd to make this action", 400)
        );
    }
    const existingUser = await Users.findOne({
      phoneNumber: req.body.phoneNumber,
    });
    if (existingUser) {
      return next(new appError("user allready exist", 400));
    }

    let user;
    user = await Users.create({
      fullName: req.body.fullName,
      phoneNumber: req.body.phoneNumber,
      // image: 'public/images/user/default-avatar-icon-of-user.jpg',
      address: req.body.address,
      city: req.body.city,
      password: req.body.password,
      role,
    });

    const token = createToken(user._id);
    if (process.env.NODE_ENV === "production") cookieOptions.secure = true;
    res.cookie("JWT", token, cookieOptions);
    res.status(201).json({
      status: "success",
      token,
      data: {
        user: user,
      },
    });
  });
};

exports.login = catchAsyncErrors(async (req, res, next) => {
  const { phoneNumber, password } = req.body;

  if (!phoneNumber || !password)
    return next(new appError("please insert phoneNumber and passowrd", 400));

  const user = await Users.findOne({ phoneNumber }).select("+password");

  if (!user || !(await user.checkPassword(password, user.password)))
    return next(new appError("incorrect phoneNumber or password", 400));

  const token = createToken(user._id);

  if (process.env.NODE_ENV === "production") cookieOptions.secure = true;
  res.cookie("JWT", token, cookieOptions);
  res.status(200).json({
    status: "success",
    token,
    data: {
      user: user,
    },
  });
});

exports.protect = catchAsyncErrors(async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) return next(new appError("yor are not authorized", 401));

  const decodedToken = await promisify(jwt.verify)(
    token,
    process.env.JWT_SECRET
  );

  const stillExistingUser = await Users.findById(decodedToken.id).select(
    "+password"
  );

  if (!stillExistingUser)
    return next(new appError("this user does no longer exist", 401));

  if (await stillExistingUser.checkChangedPassword(decodedToken.iat))
    return next(new appError("token is no longer valid", 401));

  req.user = stillExistingUser;

  next();
});
exports.onlyPermission = (...roles) => {
  return catchAsyncErrors(async (req, res, next) => {
    if (!roles.includes(req.user.role))
      return next(new appError("you dont have permission", 403));
    next();
  });
};

// exports.getPublishers = catchAsyncErrors(async (req, res, next) => {
//   let publishers;
//   if (req.admin) {
//     const features = new APIFeatures(Publisher.find().populate(), req.query)
//       .filter()
//       .sort()
//       .paginate()
//       .selectFields();

//     publishers = await features.query.select(
//       '-password -passwordResetTokenExp -passwordResetToken',
//     );
//   } else {
//     publishers = await Publisher.find().select('fullName _id ');
//   }
//   if (!publishers) {
//     return next(new appError('publishers not found', 404));
//   }

//   res.status(200).json({
//     status: 'success',
//     results: publishers.length,
//     data: {
//       publishers,
//     },
//   });
// });

exports.getUsers = catchAsyncErrors(async (req, res, next) => {
  let users;
  if (req.admin) {
    const features = new APIFeatures(Users.find().populate(), req.query)
      .filter()
      .sort()
      .paginate()
      .selectFields();

    users = await features.query.select(
      "-password -passwordResetTokenExp -passwordResetToken"
    );
  }
  if (!users) {
    return next(new appError("users not found", 404));
  }

  res.status(200).json({
    status: "success",
    results: users.length,
    data: {
      users,
    },
  });
});
