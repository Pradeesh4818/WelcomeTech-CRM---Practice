import mongoose from 'mongoose';
import connectDB from '../config/database';
import Customer from '../models/Customer';
import { AMC } from '../models/index';
import { calculateStartDateFromExpiry } from '../controllers/crmController';

const healHistory = (history: any[] = []): { healed: any[]; count: number } => {
  let count = 0;
  const healed = history.map((item) => {
    if (item && item.period === 'Initial Contract' && item.expiryDate) {
      if (!item.startDate || new Date(item.startDate) > new Date(item.expiryDate)) {
        const healedStart = new Date(calculateStartDateFromExpiry(item.expiryDate, item.period || '1 Year'));
        count++;
        return {
          ...item,
          startDate: healedStart,
          renewedOn: item.renewedOn && new Date(item.renewedOn) > new Date(item.expiryDate) ? healedStart : (item.renewedOn || healedStart),
        };
      }
    }
    return item;
  });
  return { healed, count };
};

const run = async () => {
  await connectDB();
  console.log('Connected to DB for initial renewal dates healing...');

  const customers = await Customer.find({});
  let totalCustomersHealed = 0;

  for (const c of customers) {
    let modified = false;

    // Check tssDetails
    if (c.tssDetails?.renewalHistory?.length) {
      const { healed, count } = healHistory(c.tssDetails.renewalHistory);
      if (count > 0) {
        c.tssDetails.renewalHistory = healed as any;
        c.tssDetails.initialStartDate = healed[0].startDate;
        c.tssDetails.initialEndDate = healed[0].expiryDate;
        modified = true;
      }
    }

    // Check tdlDetails
    if (c.tdlDetails?.renewalHistory?.length) {
      const { healed, count } = healHistory(c.tdlDetails.renewalHistory);
      if (count > 0) {
        c.tdlDetails.renewalHistory = healed as any;
        c.tdlDetails.initialStartDate = healed[0].startDate;
        c.tdlDetails.initialEndDate = healed[0].expiryDate;
        modified = true;
      }
    }

    // Check cloudDetails
    if (c.cloudDetails?.renewalHistory?.length) {
      const { healed, count } = healHistory(c.cloudDetails.renewalHistory);
      if (count > 0) {
        c.cloudDetails.renewalHistory = healed as any;
        c.cloudDetails.initialStartDate = healed[0].startDate;
        c.cloudDetails.initialEndDate = healed[0].expiryDate;
        modified = true;
      }
    }

    // Check services
    if (c.services?.length) {
      c.services.forEach((s: any) => {
        if (s.renewalHistory?.length) {
          const { healed, count } = healHistory(s.renewalHistory);
          if (count > 0) {
            s.renewalHistory = healed as any;
            s.initialStartDate = healed[0].startDate;
            s.initialEndDate = healed[0].expiryDate;
            modified = true;
          }
        }
      });
    }

    if (modified) {
      await c.save();
      totalCustomersHealed++;
      console.log(`[Customer Healed] ${c.customerNumber || c._id}: ${c.name}`);
    }
  }

  // Check AMCs
  const amcs = await AMC.find({});
  let totalAmcsHealed = 0;
  for (const amc of amcs) {
    if (amc.renewalHistory?.length) {
      const { healed, count } = healHistory(amc.renewalHistory);
      if (count > 0) {
        amc.renewalHistory = healed as any;
        amc.initialStartDate = healed[0].startDate;
        amc.initialExpiryDate = healed[0].expiryDate;
        await amc.save();
        totalAmcsHealed++;
        console.log(`[AMC Healed] ${amc._id}`);
      }
    }
  }

  console.log(`Finished healing: ${totalCustomersHealed} customers, ${totalAmcsHealed} AMCs.`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Healing failed:', err);
  process.exit(1);
});
