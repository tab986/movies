module.exports = (sequelize, DataTypes) => {
  const KinguinProduct = sequelize.define(
    "KinguinProduct",
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, allowNull: false },
      officialStore: { type: DataTypes.JSONB, defaultValue: {} },
      remote: { type: DataTypes.JSONB, defaultValue: {} },
      overrides: { type: DataTypes.JSONB, defaultValue: {} },
      derived: { type: DataTypes.JSONB, defaultValue: {} },
      flags: { type: DataTypes.JSONB, defaultValue: {} },
    },
    {
      tableName: "kinguin_products",
      timestamps: true,
      indexes: [
        { fields: ["createdAt"] },
        { fields: ["updatedAt"] },
      ],
    }
  );

  return KinguinProduct;
};
