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
        {
          name: "idx_kinguin_price_min_num",
          fields: [
            sequelize.literal(`(NULLIF("derived"->>'priceMin', '')::double precision)`),
          ],
        },
        {
          name: "idx_kinguin_remote_genres_gin",
          using: "gin",
          fields: [sequelize.literal(`("remote"->'genres')`)],
        },
        {
          name: "idx_kinguin_remote_tags_gin",
          using: "gin",
          fields: [sequelize.literal(`("remote"->'tags')`)],
        },
        {
          name: "idx_kinguin_hidden_instock_expr",
          fields: [
            sequelize.literal(`(("flags"->>'hidden') IS DISTINCT FROM 'true')`),
            sequelize.literal(`("derived"->'inStock')`),
          ],
        },
      ],
    }
  );

  return KinguinProduct;
};
