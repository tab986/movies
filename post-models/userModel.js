const bcrypt = require("bcryptjs");

module.exports = (sequelize, DataTypes) => {
  const Users = sequelize.define(
    "Users",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      fullName: DataTypes.STRING,
      phone: { type: DataTypes.STRING, allowNull: false, unique: true },
      governorate: {
        type: DataTypes.STRING,
        validate: {
          isIn: [
            [
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
            ],
          ],
        },
      },
      city: DataTypes.STRING,
      address: DataTypes.STRING,
      email: {
        type: DataTypes.STRING,
        set(value) {
          this.setDataValue("email", value ? String(value).toLowerCase() : value);
        },
      },
      isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
      profileImage: DataTypes.STRING,
      role: {
        type: DataTypes.STRING,
        defaultValue: "user",
        validate: { isIn: [["user", "admin", "seller", "merchant"]] },
      },
      password: { type: DataTypes.STRING, allowNull: false },
      passwordChangedAt: DataTypes.DATE,
      passwordResetToken: DataTypes.STRING,
      passwordResetTokenExp: DataTypes.DATE,
    },
    {
      tableName: "users",
      timestamps: true,
    }
  );

  Users.beforeCreate(async (user) => {
    if (!user.password) return;
    user.password = await bcrypt.hash(user.password, 12);
  });

  Users.beforeUpdate(async (user) => {
    if (!user.changed("password")) return;
    user.password = await bcrypt.hash(user.password, 12);
    user.passwordChangedAt = new Date();
  });

  Users.prototype.checkPassword = async function (candidatePassword, hashedPassword) {
    return bcrypt.compare(candidatePassword, hashedPassword || this.password);
  };

  Users.prototype.checkChangedPassword = async function (jwtTimestamp) {
    if (!this.passwordChangedAt) return false;
    const changedAtSeconds = Math.floor(
      new Date(this.passwordChangedAt).getTime() / 1000
    );
    return changedAtSeconds > jwtTimestamp;
  };

  Users.associate = (models) => {
    if (models.Merchant) {
      Users.hasOne(models.Merchant, {
        foreignKey: "userId",
        as: "merchantProfile",
      });
    }
  };

  return Users;
};
