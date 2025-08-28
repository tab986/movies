const mongoose = require("mongoose");

const governorates = [
  "بغداد",
  "البصرة",
  "نينوى",
  "الأنبار",
  "أربيل",
  "السليمانية",
  "دهوك",
  "كركوك",
  "صلاح الدين",
  "ديالى",
  "واسط",
  "ميسان",
  "ذي قار",
  "المثنى",
  "القادسية",
  "بابل",
  "كربلاء",
  "النجف",
];

const usersSchema = new mongoose.Schema(
  {
    fullName: String,
    phoneNumber: { type: String, index: true, sparse: true },
    governorate: { type: String, enum: governorates },
    city: String,
    address: String,
    notes: String,
    role: { type: String, enum: ["user", "admin"], default: "user" },
    password: {
      type: String,
      // required: [true, "insert the user password"],
      minlength: 8,
      select: false,
    },
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetTokenExp: Date,
    // paymentMethods: [
    //   {
    //     provider: String,       // "payoneer" | "stripe" | "paypal"
    //     externalId: String,     // provider customer id
    //     label: String,          // "main card"
    //     last4: String
    //   }
    // ],
    // addresses: [
    //   {
    //     label: String,
    //     governorate: String,
    //     city: String,
    //     addressLine: String,
    //     phoneNumber: String,
    //     notes: String
    //   }
    // ],
    // defaultAddressId: mongoose.Schema.Types.ObjectId
  },
  { timestamps: true }
);

usersSchema.pre("save", function (next) {
  if (!this.isModified("password") || this.isNew) return next();
  this.passwordChangedAt = Date.now() - 1000 * 60 * 5;
  next();
});

usersSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

usersSchema.pre(/^find/, function (next) {
  this.find({ active: { $ne: false } });
  next();
});

usersSchema.methods.checkPassword = async function (
  inputPassword,
  userPassword
) {
  return await bcrypt.compare(inputPassword, userPassword);
};

usersSchema.methods.checkChangedPassword = async function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const holder = parseInt(this.passwordChangedAt.getTime() / 1000, 10);

    return JWTTimestamp < holder;
  }

  return false;
};

usersSchema.methods.resetPasswordToken = function () {
  const resetToken = crypto.randomBytes(13).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.passwordResetTokenExp = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

const Users = mongoose.model("Users", usersSchema);

module.exports = Users;
