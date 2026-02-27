// This file defines the SyncState and SyncProfile models. SyncState
// stores a single document tracking the last successful delta sync.
// SyncProfile holds configuration for import filters and the list of
// fields to pull from Kinguin for the remote product (to reduce
// payload size if you only care about specific fields).

const mongoose = require('mongoose');

// A SyncProfile defines optional filters (e.g. tags, regionId) and a
// list of remote fields to import. Only one profile, named 'default',
// is supported at the moment.
const SyncProfileSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  filters: mongoose.Schema.Types.Mixed,
  fields: [String],
}, { _id: false });

// SyncState stores simple key/value pairs, currently used to save
// lastSync timestamp across worker runs.
const SyncStateSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

const SyncProfile = mongoose.model('SyncProfile', SyncProfileSchema);
const SyncState = mongoose.model('SyncState', SyncStateSchema);

module.exports = { SyncProfile, SyncState };