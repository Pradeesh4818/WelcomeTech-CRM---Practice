import mongoose from 'mongoose';
import connectDB from '../config/database';
import Customer from '../models/Customer';
import { AMC } from '../models/index';

const DAY_MS = 24 * 60 * 60 * 1000;

const computeAMCStatus = (expiryDate?: Date | null, now = new Date(), soon = new Date(Date.now() + 30 * DAY_MS)): 'active' | 'expiring' | 'expired' => {
  if (!expiryDate || Number.isNaN(new Date(expiryDate).getTime())) return 'expired';
  const expiry = new Date(expiryDate);
  if (expiry < now) return 'expired';
  if (expiry <= soon) return 'expiring';
  return 'active';
};

const parseDateOrUndefined = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const toNumberOrUndefined = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

async function main() {
  const connected = await connectDB();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 30 * DAY_MS);

    const customers = await Customer.find({ isActive: true });
    console.log(`Processing ${customers.length} customers...`);

    let syncedCount = 0;
    let createdCount = 0;

    for (const cust of customers) {
      // Find the best expiry date and start date from the customer's uploaded data
      const primaryLicense = Array.isArray(cust.serialNoInfo) ? cust.serialNoInfo[0] : null;
      
      const customerExpiry =
        parseDateOrUndefined(cust.amcDetails?.endDate) ||
        parseDateOrUndefined(cust.amcExpiry) ||
        parseDateOrUndefined(primaryLicense?.endDate) ||
        parseDateOrUndefined(primaryLicense?.tssExpiryDate);

      if (!customerExpiry) continue;

      const customerStart =
        parseDateOrUndefined(cust.amcDetails?.startDate) ||
        parseDateOrUndefined(primaryLicense?.startDate) ||
        parseDateOrUndefined((cust as any).createdAt) ||
        now;

      const status = computeAMCStatus(customerExpiry, now, soon);
      const product =
        String(cust.amcDetails?.details || primaryLicense?.product || (Array.isArray(cust.products) && cust.products[0]) || 'TallyPrime Gold').trim();
      const licenceType =
        String(primaryLicense?.licenceType || cust.licenceType || 'Standard').trim();
      const amount =
        toNumberOrUndefined(cust.amcDetails?.value) ??
        toNumberOrUndefined(cust.amcDetails?.currentPrice) ??
        toNumberOrUndefined(cust.amcDetails?.actualPrice) ??
        0;

      // Find all existing AMCs for this customer
      const existingAmcs = await AMC.find({ customer: cust._id });

      if (existingAmcs.length > 0) {
        for (const amc of existingAmcs) {
          amc.expiryDate = customerExpiry;
          amc.startDate = customerStart;
          amc.status = status;
          if (amount > 0 && (!amc.amount || amc.amount === 0)) {
            amc.amount = amount;
          }
          await amc.save();
          syncedCount++;
        }
      } else {
        // Create AMC if customer has an active/expiring/expired AMC status
        if (cust.amcStatus && ['active', 'expiring', 'expired'].includes(cust.amcStatus)) {
          await AMC.create({
            customer: cust._id,
            product,
            licenceType,
            startDate: customerStart,
            expiryDate: customerExpiry,
            amount,
            status,
            renewalHistory: [],
            createdBy: cust.createdBy,
          });
          createdCount++;
        }
      }

      // Also ensure Customer summary fields are aligned
      let customerNeedsSave = false;
      if (cust.amcStatus !== status) {
        cust.amcStatus = status;
        customerNeedsSave = true;
      }
      if (cust.amcExpiry?.getTime() !== customerExpiry.getTime()) {
        cust.amcExpiry = customerExpiry;
        customerNeedsSave = true;
      }
      if (cust.amcDetails && cust.amcDetails.status !== status) {
        cust.amcDetails.status = status;
        customerNeedsSave = true;
      }
      if (cust.amcDetails && cust.amcDetails.endDate?.getTime?.() !== customerExpiry.getTime()) {
        cust.amcDetails.endDate = customerExpiry;
        customerNeedsSave = true;
      }
      if (customerNeedsSave) {
        await cust.save();
      }
    }

    console.log(`\nSynchronization Complete!`);
    console.log(`- Synced AMC records: ${syncedCount}`);
    console.log(`- Created missing AMC records: ${createdCount}`);

  } catch (err) {
    console.error('Error during synchronization:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed.');
    process.exit(0);
  }
}

main();
