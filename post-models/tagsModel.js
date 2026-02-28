module.exports = (sequelize, DataTypes) => {
  const Tag = sequelize.define(
    "Tag",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING, allowNull: false, unique: true },
      color: { type: DataTypes.STRING, allowNull: false },
    },
    {
      tableName: "tags",
      timestamps: true,
      comment:
        "Mongo virtual productCount is not direct SQL schema; compute with aggregate queries.",
    }
  );

  return Tag;
};
