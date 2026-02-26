module.exports = (sequelize, DataTypes) => {
  const Home = sequelize.define(
    "Home",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      mainSection: { type: DataTypes.JSONB, defaultValue: {} },
      mainCategories: { type: DataTypes.JSONB, defaultValue: [] },
      about: { type: DataTypes.JSONB, defaultValue: {} },
      footer: { type: DataTypes.JSONB, defaultValue: {} },
    },
    {
      tableName: "homes",
      timestamps: true,
      comment:
        "Nested Mongo sections are represented as JSONB to preserve original shape.",
    }
  );

  return Home;
};
