const { Users: User } = require("../post-models");
const { buildPublicFileUrl } = require("../utils/publicFileUrl");

exports.getMyProfileDetails = async (req, res, next) => {
  try {
    const isAdmin = req.user?.role === "admin";
    const targetUserId =
      isAdmin && req.query.user ? req.query.user : req.user?._id || req.user?.id;
    if (!targetUserId) {
      return res.status(401).json({ status: "fail", message: "Unauthorized" });
    }

    const userInstance = await User.findByPk(targetUserId);
    const user = userInstance?.get({ plain: true });
    if (!user || user.isActive === false) {
      return res
        .status(404)
        .json({ status: "fail", message: "User not found" });
    }

    const absoluteProfileImage = buildPublicFileUrl(user.profileImage);
    user.profileImage = absoluteProfileImage || user.profileImage;
    user.profileImageUrl = absoluteProfileImage || null;

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
    const targetId = req.user?._id || req.user?.id;
    const user = await User.findByPk(targetId);
    if (user) {
      await user.update({ isActive: false });
    }
    const updated = user?.get({ plain: true });

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

    const user = await User.findByPk(req.params.userId);
    if (user) {
      await user.update({ isActive: false });
    }
    const updated = user?.get({ plain: true });

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
    const rows = await User.findAll();
    const users = rows.map((row) => row.get({ plain: true }));
    res.status(200).json({ status: "success", results: users.length, users });
  } catch (err) {
    next(err);
  }
};
