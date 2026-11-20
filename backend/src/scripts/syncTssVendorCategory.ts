/**
 * One-time migration: sync vendorCategory from AMC → TSS service for all customers.
 * Run: ts-node src/scripts/syncTssVendorCategory.ts
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || '';

async function run() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected.\n');

  const db = mongoose.connection.db!;
  const collection = db.collection('customers');

  // Find all customers that have at least one 'amc' service
  const customers = await collection.find({
    'services.type': 'amc',
  }).toArray();

  console.log(`Found ${customers.length} customers with an AMC service.\n`);

  let fixed = 0;
  let skipped = 0;

  for (const customer of customers) {
    const services: any[] = customer.services || [];
    const amcService = services.find((s: any) => s.type === 'amc');
    const tssService = services.find((s: any) => s.type === 'tss');

    if (!amcService) {
      skipped++;
      continue;
    }

    const custName = (customer.name || '').trim().toLowerCase();
    const amcComp = (amcService.companyName || '').trim();
    const amcPartnerFromCompany = (amcComp && amcComp.toLowerCase() !== custName) ? amcComp : undefined;

    const rawAmcVendor = (amcService.vendorCategory || '').trim();
    const targetVendor = (rawAmcVendor && rawAmcVendor.toLowerCase() !== 'welcome')
      ? rawAmcVendor
      : (amcPartnerFromCompany || rawAmcVendor);

    if (!targetVendor) {
      skipped++;
      continue;
    }

    const currentAmcVendor = (amcService.vendorCategory || '').trim();
    const currentTssVendor = (tssService?.vendorCategory || '').trim();

    const needsAmcFix = currentAmcVendor !== targetVendor;
    const needsTssFix = tssService && currentTssVendor !== targetVendor;

    if (!needsAmcFix && !needsTssFix) {
      skipped++;
      continue; // Already in sync
    }

    console.log(
      `  [${customer.customerNo || customer._id}] ${customer.name || '—'} ` +
      `AMC: "${currentAmcVendor}" -> "${targetVendor}" | ` +
      `TSS: "${currentTssVendor}" -> "${targetVendor}"`
    );

    const updatedServices = services.map((s: any) => {
      if (s.type === 'amc' && needsAmcFix) return { ...s, vendorCategory: targetVendor };
      if (s.type === 'tss' && needsTssFix) return { ...s, vendorCategory: targetVendor };
      return s;
    });

    await collection.updateOne(
      { _id: customer._id },
      {
        $set: {
          services: updatedServices,
          ...(needsAmcFix && customer.amcDetails ? { 'amcDetails.vendorCategory': targetVendor } : {}),
          ...(needsTssFix && customer.tssDetails ? { 'tssDetails.vendorCategory': targetVendor } : {}),
        },
      }
    );

    fixed++;
  }

  console.log(`\nMigration complete.`);
  console.log(`   Fixed  : ${fixed} customers`);
  console.log(`   Skipped: ${skipped} (already in sync)`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
