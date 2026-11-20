import mongoose from 'mongoose';
import { Settings } from './src/models/Settings';
import EmailTemplate from './src/models/EmailTemplate';
import { sendEmail } from './src/utils/mailer';
import dotenv from 'dotenv';

dotenv.config();

const testSend = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/welcometech-crm');
    console.log('Connected to MongoDB');

    const settings = await Settings.findOne();
    if (!settings) {
      console.error('No settings found');
      process.exit(1);
    }

    // Find any template
    const template = await EmailTemplate.findOne();
    if (!template) {
      console.error('No template found. Please create one first.');
      process.exit(1);
    }

    console.log('Using Template:', template.name);
    console.log('Sending to: test-email@yopmail.com'); // Using a dummy email for testing logic

    const dynamicData = {
      customerName: 'Test Customer',
      productName: 'Test Product',
      expiryDate: '2026-12-31',
      amount: '1000',
      serialNo: 'SN123456'
    };

    let subject = template.subject;
    let body = template.body;

    Object.keys(dynamicData).forEach(key => {
      const value = dynamicData[key as keyof typeof dynamicData] || '';
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, value);
      body = body.replace(regex, value);
    });

    console.log('Interpolated Subject:', subject);
    console.log('Interpolated Body Length:', body.length);

    try {
      const info = await sendEmail({
        host: settings.smtpHost!,
        port: Number(settings.smtpPort),
        user: settings.smtpUser!,
        pass: settings.smtpPassword!,
        secure: settings.mailEncryption === 'ssl',
        fromEmail: settings.senderEmail,
        fromName: settings.mailFromName,
      }, 'test-email@yopmail.com', subject, body);

      console.log('Email sent successfully!');
      console.log('Info:', info);
    } catch (mailError: any) {
      console.error('MAIL SENDING FAILED:');
      console.error('Error Code:', mailError.code);
      console.error('Error Command:', mailError.command);
      console.error('Error Response:', mailError.response);
      console.error('Full Error:', mailError);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Global Error:', err);
  }
};

testSend();
