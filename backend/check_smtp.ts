import mongoose from 'mongoose';
import { Settings } from './src/models/Settings';
import dotenv from 'dotenv';

dotenv.config();

const test = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/welcometech-crm');
    console.log('Connected to MongoDB');

    const settings = await Settings.findOne();
    if (!settings) {
      console.log('No settings found');
    } else {
      console.log('SMTP Config:');
      console.log('Host:', settings.smtpHost);
      console.log('Port:', settings.smtpPort);
      console.log('User:', settings.smtpUser);
      console.log('From Email:', settings.senderEmail);
      console.log('From Name:', settings.mailFromName);
      console.log('Encryption:', settings.mailEncryption);
      console.log('Password exists:', !!settings.smtpPassword);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
};

test();
