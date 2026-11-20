import mongoose from 'mongoose';
import connectDB from '../config/database';
import Customer from '../models/Customer';

const TARGET_EMAIL = 'sabarishthavamani@gmail.com';

async function main() {
  const connected = await connectDB();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  try {
    const totalCustomers = await Customer.countDocuments({});
    console.log(`Found ${totalCustomers} customer records in database.`);

    // Update all direct and nested fields
    const res1 = await Customer.updateMany(
      {},
      {
        $set: {
          email: TARGET_EMAIL,
          'primaryContactInfo.email': TARGET_EMAIL,
          'secondaryContactInfo.email': TARGET_EMAIL,
          'amcDetails.email': TARGET_EMAIL,
          'tdlDetails.email': TARGET_EMAIL,
          'cloudDetails.email': TARGET_EMAIL,
          'tssDetails.email': TARGET_EMAIL,
        },
      }
    );

    // Also update array elements for keyContacts, branches, partnerDetails
    await Customer.updateMany(
      { 'keyContacts.0': { $exists: true } },
      { $set: { 'keyContacts.$[].email': TARGET_EMAIL } }
    );
    await Customer.updateMany(
      { 'branches.0': { $exists: true } },
      { $set: { 'branches.$[].email': TARGET_EMAIL } }
    );
    await Customer.updateMany(
      { 'partnerDetails.0': { $exists: true } },
      { $set: { 'partnerDetails.$[].email': TARGET_EMAIL } }
    );

    console.log(`\n✅ Successfully updated all customer email fields to ${TARGET_EMAIL}!`);
    console.log(`Matched: ${res1.matchedCount}, Modified: ${res1.modifiedCount}`);

  } catch (err) {
    console.error('Error updating customer emails:', err);
  } finally {
    await mongoose.disconnect();
    console.log('\nDatabase connection closed.');
    process.exit(0);
  }
}

main();
