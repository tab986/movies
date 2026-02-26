const Users = require("../models/userModel");

const factory = require("../utils/handlerFactory");

exports.createUserAdmin = factory.createOne(Users, "user");

exports.getUsersAdmin = factory.getAll(Users, "users");

exports.getUserAdmin = factory.getOne(Users, "user");

exports.updateUserAdmin = factory.updateOne(Users, "user");

exports.deleteUserAdmin = factory.deleteOne(Users, "user");
