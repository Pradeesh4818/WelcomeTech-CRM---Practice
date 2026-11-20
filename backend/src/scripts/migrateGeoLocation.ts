import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import Customer from '../models/Customer';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function migrate() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/welcometech-crm';
  console.log('Connecting to:', uri);

  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    const customers = await Customer.find({
      $or: [
        { "branches.geoLocation": { $exists: true } },
        { "productLicenseInfo.contactDetails.geoLocation": { $exists: true } }
      ]
    });

    console.log(`Found ${customers.length} customers to migrate.`);

    for (const customer of customers) {
      const legacyCustomer = customer as any;
      let changed = false;

      if (customer.branches && Array.isArray(customer.branches)) {
        customer.branches = customer.branches.map((b: any) => {
          const raw = b.toObject ? b.toObject() : b;
          if (raw.geoLocation !== undefined) {
            b.locationArea = raw.geoLocation;
            // Mongoose might not allow simple delete if it's a subdoc, 
            // but we've changed the schema now so geoLocation is not in the schema.
            // Using undefined to remove it.
            b.geoLocation = undefined;
            changed = true;
          }
          return b;
        });
      }

      if (legacyCustomer.productLicenseInfo && Array.isArray(legacyCustomer.productLicenseInfo)) {
        legacyCustomer.productLicenseInfo = legacyCustomer.productLicenseInfo.map((p: any) => {
          if (p.contactDetails) {
            const raw = p.contactDetails.toObject ? p.contactDetails.toObject() : p.contactDetails;
            if (raw.geoLocation !== undefined) {
              p.contactDetails.locationArea = raw.geoLocation;
              p.contactDetails.geoLocation = undefined;
              changed = true;
            }
          }
          return p;
        });
      }

      if (changed) {
        // Since we changed the schema, we might need to use markModified if it's a complex object,
        // but here we are assigning directly to properties.
        customer.markModified('branches');
        customer.markModified('productLicenseInfo');
        await customer.save();
        console.log(`Migrated customer: ${customer.name} (${customer._id})`);
      }
    }

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
