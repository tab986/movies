const { unlink } = require("fs/promises");
const appError = require("./appError");

const deleteFiles = async (paths, next) => {
  try {
    const promises = paths.map((file) => unlink(file));
    await Promise.all(promises);
  } catch (err) {
    return next(new appError(err, 500));
  }
};

module.exports = deleteFiles;
