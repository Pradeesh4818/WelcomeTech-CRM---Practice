import { loadEnv } from '../config/env';
import mongoose from 'mongoose';
import { Settings } from '../models/Settings';

loadEnv();

const fixLogo = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/WelcomeTech_CRM_DEV';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  // We set the logo path to a file that actually exists in uploads/settings:
  // e.g. logo-1778504122735-561263637.png
  const existingLogo = '/uploads/settings/logo-1778504122735-561263637.png';
  
  const result = await Settings.findOneAndUpdate(
    {},
    { logo: existingLogo },
    { new: true, upsert: true }
  );

  console.log('✅ Settings logo updated successfully to:', result.logo);
  process.exit(0);
};

fixLogo().catch((err) => {
  console.error('❌ Error updating settings logo:', err);
  process.exit(1);
});
