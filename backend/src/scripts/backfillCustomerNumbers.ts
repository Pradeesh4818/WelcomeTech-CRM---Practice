import mongoose from 'mongoose';
import connectDB from '../config/database';
import Customer from '../models/Customer';
import { Counter } from '../models/Counter';

async function main() {
  const connected = await connectDB();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  try {
    const totalCustomers = await Customer.countDocuments({});
    console.log(`Found ${totalCustomers} total customer record(s) in database.`);

    if (totalCustomers === 0) {
      console.log('No customers found to update.');
      return;
    }

    // Fetch all customers sorted by creation time / ID
    const customers = await Customer.find({}).sort({ createdAt: 1, _id: 1 });

    console.log(`Assigning sequential customer numbers starting from WT0001...`);
    let count = 0;
    for (let i = 0; i < customers.length; i++) {
      const seq = i + 1;
      const customerNumber = `WT${String(seq).padStart(4, '0')}`;
      const doc = customers[i];

      await Customer.updateOne(
        { _id: doc._id },
        { $set: { customerNumber } }
      );
      count++;
      if (count <= 5 || count === totalCustomers || count % 50 === 0) {
        console.log(`  [${count}/${totalCustomers}] ${doc.name} -> ${customerNumber}`);
      }
    }

    // Set the Counter sequence so new customers created will continue from next number
    await Counter.findByIdAndUpdate(
      'customer',
      { $set: { seq: totalCustomers } },
      { upsert: true, new: true }
    );

    console.log(`\n✅ Successfully updated all ${count} customer(s) with customer numbers (WT0001 - WT${String(totalCustomers).padStart(4, '0')}).`);
    console.log(`✅ Counter sequence 'customer' set to ${totalCustomers}.`);

  } catch (err) {
    console.error('Error backfilling customer numbers:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Database connection closed.');
    process.exit(0);
  }
}

main();
