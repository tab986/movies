const User = require("../models/userModel");

exports.getMyProfileDetails = async (req, res, next) => {
  try {
    const isAdmin = req.user?.role === "admin";
    const targetUserId =
      isAdmin && req.query.user ? req.query.user : req.user?._id;
    if (!targetUserId) {
      return res.status(401).json({ status: "fail", message: "Unauthorized" });
    }

    const user = await User.findById(targetUserId).lean();
    if (!user || user.isActive === false) {
      return res
        .status(404)
        .json({ status: "fail", message: "User not found" });
    }

    return res.status(200).json({
      status: "success",
      data: {
        user,
      },
    });
  } catch (err) {
    next(err);
  }
};

exports.deleteMe = async (req, res, next) => {
  try {
    const updated = await User.findByIdAndUpdate(
      req.user._id,
      { isActive: false },
      { new: true }
    ).lean();

    if (!updated)
      return res
        .status(404)
        .json({ status: "fail", message: "User not found" });
    res.status(204).json({ status: "success", message: "User deactivated" });
  } catch (err) {
    next(err);
  }
};

exports.adminDeleteUser = async (req, res, next) => {
  try {
    if (req.user?.role !== "admin")
      return res.status(403).json({ status: "fail", message: "Forbidden" });

    const updated = await User.findByIdAndUpdate(
      req.params.userId,
      { isActive: false },
      { new: true }
    ).lean();

    if (!updated)
      return res
        .status(404)
        .json({ status: "fail", message: "User not found" });
    res.status(204).json({ status: "success", message: "User deactivated" });
  } catch (err) {
    next(err);
  }
};

exports.getUsers = async (req, res, next) => {
  try {
    if (req.user?.role !== "admin")
      return res.status(403).json({ status: "fail", message: "Forbidden" });
    const users = await User.find().lean();
    res.status(200).json({ status: "success", results: users.length, users });
  } catch (err) {
    next(err);
  }
};
