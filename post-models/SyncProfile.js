module.exports = (sequelize, DataTypes) => {
  const SyncProfile = sequelize.define(
    "SyncProfile",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      name: { type: DataTypes.STRING, unique: true },
      filters: DataTypes.JSONB,
      fields: { type: DataTypes.JSONB, defaultValue: [] },
    },
    {
      tableName: "sync_profiles",
      timestamps: false,
    }
  );

  return SyncProfile;
};
