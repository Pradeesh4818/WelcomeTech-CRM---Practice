import mongoose from 'mongoose';
import connectDB from '../config/database';
import Customer from '../models/Customer';
import { AMC } from '../models/index';

async function main() {
  const connected = await connectDB();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  try {
    const customers = await Customer.find({});
    console.log(`Processing ${customers.length} customers...`);

    let activeCount = 0;
    let expiringCount = 0;
    let expiredCount = 0;

    for (let i = 0; i < customers.length; i++) {
      const c = customers[i];
      const mode = i % 4; // 0: expiring, 1: expired, 2: active, 3: active (50% active, 25% expiring, 25% expired)

      let status: 'active' | 'expiring' | 'expired';
      let startDate: Date;
      let endDate: Date;
      let days: number;

      if (mode === 0) {
        // Expiring soon (10 to 25 days left)
        const daysOffset = 10 + (i % 15);
        status = 'expiring';
        startDate = new Date('2025-09-15T00:00:00.000Z');
        endDate = new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000);
        days = daysOffset;
        expiringCount++;
      } else if (mode === 1) {
        // Expired (30 to 180 days ago)
        const daysAgo = 30 + (i % 150);
        status = 'expired';
        startDate = new Date('2025-01-01T00:00:00.000Z');
        endDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        days = -daysAgo;
        expiredCount++;
      } else {
        // Active (120 to 365 days left)
        const daysAhead = 120 + (i % 240);
        status = 'active';
        startDate = new Date('2026-01-01T00:00:00.000Z');
        endDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
        days = daysAhead;
        activeCount++;
      }

      c.amcStatus = status;
      c.amcExpiry = endDate;

      // Update amcDetails
      if (!c.amcDetails) c.amcDetails = {};
      c.amcDetails.status = status;
      c.amcDetails.startDate = startDate;
      c.amcDetails.endDate = endDate;
      (c.amcDetails as any).days = days;
      (c.amcDetails as any).noOfDays = days;

      // Update tdlDetails
      if (!c.tdlDetails) c.tdlDetails = {};
      c.tdlDetails.status = status;
      c.tdlDetails.startDate = startDate;
      c.tdlDetails.endDate = endDate;
      c.tdlDetails.days = days;
      c.tdlDetails.noOfDays = days;

      // Update cloudDetails
      if (!c.cloudDetails) c.cloudDetails = {};
      c.cloudDetails.status = status;
      c.cloudDetails.cloudStartDate = startDate;
      c.cloudDetails.cloudExpiryDate = endDate;
      c.cloudDetails.startDate = startDate;
      c.cloudDetails.endDate = endDate;

      // Update tssDetails
      if (!c.tssDetails) c.tssDetails = {};
      c.tssDetails.status = status;
      c.tssDetails.startDate = startDate;
      c.tssDetails.endDate = endDate;

      // Update serialNoInfo
      if (Array.isArray(c.serialNoInfo)) {
        c.serialNoInfo.forEach((s: any) => {
          s.startDate = startDate;
          s.endDate = endDate;
          s.tssExpiryDate = endDate;
          s.isAmcActive = status === 'active';
          s.licenceStatus = status === 'expired' ? 'expired' : 'active';
          if (Array.isArray(s.licenses)) {
            s.licenses.forEach((lic: any) => {
              lic.licenceStatus = status === 'expired' ? 'expired' : 'active';
            });
          }
        });
      }

      // Update services
      if (Array.isArray(c.services)) {
        c.services.forEach((srv: any) => {
          srv.status = status;
          srv.startDate = startDate;
          srv.endDate = endDate;
          srv.days = days;
          srv.noOfDays = days;
        });
      }

      await c.save();
    }

    console.log(`\n✅ Successfully redistributed Customer records!`);
    console.log(`- Active: ${activeCount} (~50%)`);
    console.log(`- Expiring Soon: ${expiringCount} (~25%)`);
    console.log(`- Expired: ${expiredCount} (~25%)`);

    // Also update AMC standalone records
    const amcs = await AMC.find({});
    console.log(`\nProcessing ${amcs.length} standalone AMC records...`);
    let amcActive = 0;
    let amcExpiring = 0;
    let amcExpired = 0;

    for (let i = 0; i < amcs.length; i++) {
      const amc = amcs[i];
      const mode = i % 4;

      if (mode === 0) {
        const daysOffset = 10 + (i % 15);
        amc.status = 'expiring';
        amc.startDate = new Date('2025-09-15T00:00:00.000Z');
        amc.expiryDate = new Date(Date.now() + daysOffset * 24 * 60 * 60 * 1000);
        amcExpiring++;
      } else if (mode === 1) {
        const daysAgo = 30 + (i % 150);
        amc.status = 'expired';
        amc.startDate = new Date('2025-01-01T00:00:00.000Z');
        amc.expiryDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
        amcExpired++;
      } else {
        const daysAhead = 120 + (i % 240);
        amc.status = 'active';
        amc.startDate = new Date('2026-01-01T00:00:00.000Z');
        amc.expiryDate = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
        amcActive++;
      }

      await amc.save();
    }

    console.log(`✅ Successfully redistributed AMC records!`);
    console.log(`- Active: ${amcActive}`);
    console.log(`- Expiring Soon: ${amcExpiring}`);
    console.log(`- Expired: ${amcExpired}`);

  } catch (err) {
    console.error('Error redistributing statuses:', err);
  } finally {
    await mongoose.disconnect();
    console.log('\nDatabase connection closed.');
    process.exit(0);
  }
}

main();
