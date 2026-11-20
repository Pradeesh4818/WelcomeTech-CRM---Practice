import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const TARGET_PHONE = '9944400587';

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri || !uri.includes('WelcomeTech_CRM_STAGING')) {
    console.error('ABORTING: Not running on WelcomeTech_CRM_STAGING!');
    process.exit(1);
  }

  console.log(`Connecting to local/staging database: ${uri}...`);
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  if (!db) {
    console.error('Failed to get db handle');
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`UPDATING ALL PHONE & MOBILE NUMBERS TO "${TARGET_PHONE}"`);
  console.log(`======================================================\n`);

  // 1. Customers
  const customerCol = db.collection('customers');
  const custCount = await customerCol.countDocuments();
  console.log(`Found ${custCount} customer documents.`);

  const custRes = await customerCol.updateMany(
    {},
    [
      {
        $set: {
          phone: TARGET_PHONE,
          contact: TARGET_PHONE,
          'primaryContactInfo.mobile': TARGET_PHONE,
          'primaryContactInfo.whatsapp': TARGET_PHONE,
          'primaryContactInfo.landline': TARGET_PHONE,
          'secondaryContactInfo.mobile': TARGET_PHONE,
          'secondaryContactInfo.whatsapp': TARGET_PHONE,
          'secondaryContactInfo.landline': TARGET_PHONE,
          // update branches array if present
          branches: {
            $map: {
              input: { $ifNull: ['$branches', []] },
              as: 'b',
              in: {
                $mergeObjects: ['$$b', { mobile: TARGET_PHONE }]
              }
            }
          },
          // update keyContacts array if present
          keyContacts: {
            $map: {
              input: { $ifNull: ['$keyContacts', []] },
              as: 'k',
              in: {
                $mergeObjects: ['$$k', { mobile: TARGET_PHONE, whatsapp: TARGET_PHONE, landline: TARGET_PHONE }]
              }
            }
          },
          // update partnerDetails array if present
          partnerDetails: {
            $map: {
              input: { $ifNull: ['$partnerDetails', []] },
              as: 'p',
              in: {
                $mergeObjects: ['$$p', { phone: TARGET_PHONE }]
              }
            }
          },
          // update serialNoInfo contactDetails
          serialNoInfo: {
            $map: {
              input: { $ifNull: ['$serialNoInfo', []] },
              as: 's',
              in: {
                $mergeObjects: [
                  '$$s',
                  {
                    contactDetails: {
                      $mergeObjects: [
                        { $ifNull: ['$$s.contactDetails', {}] },
                        { mobile: TARGET_PHONE }
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      }
    ]
  );
  console.log(`✓ Customers updated: ${custRes.modifiedCount} modified.`);

  // 2. Leads
  const leadCol = db.collection('leads');
  const leadCount = await leadCol.countDocuments();
  console.log(`Found ${leadCount} lead documents.`);
  const leadRes = await leadCol.updateMany(
    {},
    {
      $set: { phone: TARGET_PHONE }
    }
  );
  console.log(`✓ Leads updated: ${leadRes.modifiedCount} modified.`);

  // 3. Users (Employee / Staff)
  const userCol = db.collection('users');
  const userCount = await userCol.countDocuments();
  console.log(`Found ${userCount} user documents.`);
  const userRes = await userCol.updateMany(
    {},
    {
      $set: { phone: TARGET_PHONE }
    }
  );
  console.log(`✓ Users updated: ${userRes.modifiedCount} modified.`);

  // 4. Tickets
  const ticketCol = db.collection('tickets');
  const ticketCount = await ticketCol.countDocuments();
  console.log(`Found ${ticketCount} ticket documents.`);
  const ticketRes = await ticketCol.updateMany(
    {},
    {
      $set: { phoneNumber: TARGET_PHONE }
    }
  );
  console.log(`✓ Tickets updated: ${ticketRes.modifiedCount} modified.`);

  // 5. Proposals
  const propCol = db.collection('proposals');
  const propCount = await propCol.countDocuments();
  console.log(`Found ${propCount} proposal documents.`);
  const propRes = await propCol.updateMany(
    {},
    {
      $set: {
        customerPhone: TARGET_PHONE,
        'companyInfo.contactNo': TARGET_PHONE
      }
    }
  );
  console.log(`✓ Proposals updated: ${propRes.modifiedCount} modified.`);

  // 6. Proposal Templates
  const templateCol = db.collection('proposaltemplates');
  const templateCount = await templateCol.countDocuments();
  console.log(`Found ${templateCount} proposal template documents.`);
  const templateRes = await templateCol.updateMany(
    {},
    {
      $set: {
        'companyInfo.contactNo': TARGET_PHONE
      }
    }
  );
  console.log(`✓ Proposal Templates updated: ${templateRes.modifiedCount} modified.`);

  // 7. Settings
  const settingsCol = db.collection('settings');
  const settingsCount = await settingsCol.countDocuments();
  console.log(`Found ${settingsCount} settings documents.`);
  const settingsRes = await settingsCol.updateMany(
    {},
    {
      $set: {
        companyPhone: TARGET_PHONE,
        whatsapp: TARGET_PHONE
      }
    }
  );
  console.log(`✓ Settings updated: ${settingsRes.modifiedCount} modified.`);

  console.log(`\n======================================================`);
  console.log(`ALL PHONE/MOBILE NUMBERS SUCCESSFULLY SET TO ${TARGET_PHONE}`);
  console.log(`======================================================\n`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error during update:', err);
  process.exit(1);
});
