module.exports = (sequelize, DataTypes) => {
  const PhysicalProduct = sequelize.define(
    "PhysicalProduct",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      seller: { type: DataTypes.UUID, allowNull: false },
      remote: { type: DataTypes.JSONB, defaultValue: {} },
      overrides: { type: DataTypes.JSONB, defaultValue: {} },
      derived: { type: DataTypes.JSONB, defaultValue: {} },
      flags: { type: DataTypes.JSONB, defaultValue: {} },
    },
    {
      tableName: "physical_products",
      timestamps: true,
      comment:
        "Source file is currently commented in Mongo; represented here for parity.",
    }
  );

  PhysicalProduct.associate = (models) => {
    if (models.Users) {
      PhysicalProduct.belongsTo(models.Users, {
        foreignKey: "seller",
        as: "sellerRef",
      });
    }
  };

  return PhysicalProduct;
};
