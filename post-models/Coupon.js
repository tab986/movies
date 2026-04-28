module.exports = (sequelize, DataTypes) => {
  const Coupon = sequelize.define(
    "Coupon",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      code: { type: DataTypes.STRING, allowNull: false, unique: true },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [["percent", "fixed"]] },
      },
      value: { type: DataTypes.FLOAT, allowNull: false },
      expiresAt: DataTypes.DATE,
      active: { type: DataTypes.BOOLEAN, defaultValue: true },
      users: { type: DataTypes.JSONB, defaultValue: [] }, // array of user ids that have used the coupon
      maxUsesPerUser: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        validate: {
          min: 1,
          isInt: true,
        },
      },
      userUsageByUserId: {
        type: DataTypes.JSONB,
        allowNull: false,
        defaultValue: {},
      },
    },
    {
      tableName: "coupons",
      timestamps: true,
    }
  );

  Coupon.prototype.applyDiscount = function (amount) {
    const base = Number(amount) || 0;
    if (!this.active) return 0;
    if (this.expiresAt && new Date(this.expiresAt).getTime() < Date.now()) return 0;
    if (this.type === "percent") return Math.max(0, (base * Number(this.value || 0)) / 100);
    return Math.max(0, Number(this.value || 0));
  };

  return Coupon;
};
