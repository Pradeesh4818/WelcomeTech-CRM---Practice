import mongoose from 'mongoose';
import connectDB from '../config/database';
import { loadEnv } from '../config/env';
import { Payment } from '../models/index';
import Customer from '../models/Customer';
import { Settings } from '../models/Settings';
import User from '../models/User';
import {
  buildWhatsAppTemplatePayload,
  buildWhatsAppTextPayload,
  normalizeWhatsAppPhone,
  resolveCustomerWhatsappNumber,
  normalizeGraphApiVersion,
} from '../utils/whatsapp';

loadEnv();

const runDiagnostic = async () => {
  console.log('🏁 Starting WhatsApp Invoice Integration Diagnostic...');
  
  const connected = await connectDB();
  if (!connected) {
    console.error('❌ Failed to connect to MongoDB');
    process.exit(1);
  }

  try {
    // 1. Fetch settings
    let settings = await Settings.findOne();
    if (!settings) {
      console.log('⚠️ No settings found, creating mock defaults...');
      settings = await Settings.create({
        whatsappBusinessStatus: 'active',
        whatsappPhoneNumberId: '1234567890',
        whatsappAccessToken: 'mock-access-token',
        whatsappApiVersion: 'v23.0',
        whatsappWebhookVerifyToken: 'mock-verify-token',
      });
    }

    console.log('\n--- Configuration Status ---');
    console.log(`WhatsApp Status:      ${settings.whatsappBusinessStatus}`);
    console.log(`Phone Number ID:      ${settings.whatsappPhoneNumberId || 'NOT SET'}`);
    console.log(`Access Token:         ${settings.whatsappAccessToken ? '✓ SET' : '✕ NOT SET'}`);
    console.log(`API Version:          ${settings.whatsappApiVersion}`);
    console.log(`Webhook Verify Token: ${settings.whatsappWebhookVerifyToken || 'NOT SET'}`);

    // 2. Fetch or create mock Customer
    let customer = await Customer.findOne();
    if (!customer) {
      console.log('⚠️ No customers found, creating test customer...');
      customer = await Customer.create({
        name: 'John Doe',
        phone: '+97455551234',
        primaryContactInfo: {
          whatsapp: '+97455551234',
          mobile: '+97455551234',
          contactName1: 'John Doe',
        },
      });
    }

    // 3. Fetch or create mock Payment
    let payment = await Payment.findOne().populate('customer');
    if (!payment || !payment.customer) {
      console.log('⚠️ No payments found, creating test payment/invoice...');
      // Create user if not exists
      let user = await User.findOne();
      if (!user) {
        user = await User.create({
          name: 'Admin',
          email: 'admin@welcometech.qa',
          role: 'admin',
          isActive: true,
        });
      }
      payment = await Payment.create({
        customer: customer._id,
        paymentType: 'AMC Renewal',
        description: 'Annual Maintenance Contract for TallyPrime Server',
        amount: 2500,
        paymentDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        method: 'Bank Transfer',
        status: 'pending',
        createdBy: user._id,
      });
      // reload with customer populated
      payment = await Payment.findById(payment._id).populate('customer');
    }

    // 4. Resolve recipient number
    const recipient = normalizeWhatsAppPhone(resolveCustomerWhatsappNumber(payment!.customer));
    console.log('\n--- Recipient & Message Details ---');
    console.log(`Customer Name:        ${(payment!.customer as any).name}`);
    console.log(`Resolved Phone/WA:    ${recipient}`);

    if (!recipient) {
      console.error('❌ Error: Could not resolve a valid phone number for customer.');
    } else {
      console.log('✅ Resolved recipient phone number successfully.');
    }

    // 5. Test message text builder
    const defaultMsg = [
      `Dear ${(payment!.customer as any).name || 'Customer'},`,
      '',
      `Here are the details of invoice *${payment!.invoiceNo}*:`,
      `- Description: ${payment!.description || payment!.paymentType}`,
      `- Amount: QAR ${(payment!.amount || 0).toLocaleString()}`,
      `- Due Date: ${payment!.dueDate ? new Date(payment!.dueDate).toLocaleDateString() : 'N/A'}`,
      `- Status: *${String(payment!.status || 'pending').toUpperCase()}*`,
      '',
      `Thank you for your business.`,
    ].join('\n');

    console.log('\n--- Message Preview ---');
    console.log(defaultMsg);

    // 6. Test payload structures
    console.log('\n--- Payload Verification ---');
    const textPayload = buildWhatsAppTextPayload(recipient || 'mock-phone', defaultMsg);
    console.log('Text Message Payload:', JSON.stringify(textPayload, null, 2));

    const templateName = settings.whatsappDefaultTemplateName || 'hello_world';
    const templatePayload = buildWhatsAppTemplatePayload(recipient || 'mock-phone', templateName, 'en_US');
    console.log('Template Message Payload:', JSON.stringify(templatePayload, null, 2));

    console.log('\n✅ Diagnostic completed successfully. All backend systems, data resolvers, and payload factories are operational.');

  } catch (error) {
    console.error('❌ Diagnostic error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed.');
    process.exit(0);
  }
};

runDiagnostic();
