// BloodLink Backend - Model: AppConfig (Singleton — Remote Config §৬.১১ + App Version §১৪)
const mongoose = require('mongoose');

const appConfigSchema = new mongoose.Schema(
  {
    singletonKey: { type: String, default: 'global', unique: true },

    appName: { type: String, default: 'BloodLink' },
    logoUrl: { type: String, default: '' },
    primaryColor: { type: String, default: '#C62828' },
    secondaryColor: { type: String, default: '#FFFFFF' },
    supportEmail: { type: String, default: 'support@bloodlink.tech' },

    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: { type: String, default: 'We are under maintenance. Please try again shortly.' },

    featureFlags: { type: Map, of: Boolean, default: {} },

    onboarding: [
      {
        title: String,
        description: String,
        imageUrl: String,
      },
    ],

    appVersion: {
      latestVersion: { type: String, default: '1.0.0' },
      latestVersionCode: { type: Number, default: 1 },
      minimumSupportedVersionCode: { type: Number, default: 1 },
      apkUrl: { type: String, default: '' },
      forceUpdate: { type: Boolean, default: false },
      releaseNotes: { type: String, default: '' },
      fileSizeMB: { type: Number, default: 0 },
      sha256: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

// Singleton accessor — না থাকলে default তৈরি করে
appConfigSchema.statics.getConfig = async function () {
  let config = await this.findOne({ singletonKey: 'global' });
  if (!config) config = await this.create({ singletonKey: 'global' });
  return config;
};

module.exports = mongoose.model('AppConfig', appConfigSchema);