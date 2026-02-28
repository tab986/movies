module.exports = (sequelize, DataTypes) => {
  const Reviews = sequelize.define(
    "Reviews",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      userName: { type: DataTypes.STRING, allowNull: false },
      date: { type: DataTypes.STRING, allowNull: false },
      rating: { type: DataTypes.FLOAT, allowNull: false },
      product: { type: DataTypes.UUID, allowNull: false },
      comment: DataTypes.TEXT,
    },
    {
      tableName: "reviews",
      timestamps: true,
      comment:
        "Mongo post-save aggregate hooks are not reproduced; keep rating rollups in service layer.",
    }
  );

  Reviews.associate = (models) => {
    if (models.Products) {
      Reviews.belongsTo(models.Products, { foreignKey: "product", as: "productRef" });
    }
  };

  return Reviews;
};
