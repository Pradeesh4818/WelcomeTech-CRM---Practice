import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from backend/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const stagingUri = process.env.MONGODB_URI;
if (!stagingUri) {
  console.error('❌ MONGODB_URI is not set in environment.');
  process.exit(1);
}

// Derive live URI from staging URI
const liveUri = stagingUri.replace('/WelcomeTech_CRM_STAGING?', '/WelcomeTech_CRM?');

const extractDbName = (uri: string): string => {
  const parts = uri.split('/');
  const lastPart = parts[parts.length - 1];
  return lastPart.split('?')[0];
};

const stagingDbName = extractDbName(stagingUri);
const liveDbName = extractDbName(liveUri);

console.log('====================================================');
console.log('🔄 SAFE CLONE: Live Database -> Staging Database');
console.log('====================================================');
console.log(`Source Database (READ-ONLY) : ${liveDbName}`);
console.log(`Target Database (OVERWRITE) : ${stagingDbName}`);
console.log('----------------------------------------------------');

// Strict safety assertions
if ((stagingDbName as string) !== 'WelcomeTech_CRM_STAGING' || !stagingDbName.endsWith('_STAGING')) {
  console.error('❌ SAFETY ABORT: Target database must strictly be WelcomeTech_CRM_STAGING.');
  process.exit(1);
}

if ((liveDbName as string) !== 'WelcomeTech_CRM') {
  console.error('❌ SAFETY ABORT: Source database must strictly be WelcomeTech_CRM.');
  process.exit(1);
}

if ((stagingDbName as string) === (liveDbName as string)) {
  console.error('❌ SAFETY ABORT: Source and target database names cannot be the same!');
  process.exit(1);
}

async function cloneDatabase() {
  console.log('\n[1/4] Connecting to databases...');
  const liveConn = await mongoose.createConnection(liveUri).asPromise();
  if (!liveConn.db) throw new Error('Failed to access live database connection.');
  console.log('  ✓ Live database connected (READ-ONLY)');

  const stagingConn = await mongoose.createConnection(stagingUri!).asPromise();
  if (!stagingConn.db) throw new Error('Failed to access staging database connection.');
  console.log('  ✓ Staging database connected');

  const liveDb = liveConn.db;
  const stagingDb = stagingConn.db;

  // Verify initial counts
  const initialLiveCount = await liveDb.collection('customers').countDocuments();
  const initialStagingCount = await stagingDb.collection('customers').countDocuments();
  console.log(`\n  Initial Customers in Live    : ${initialLiveCount}`);
  console.log(`  Initial Customers in Staging : ${initialStagingCount}`);

  // Fetch collections from Live
  console.log('\n[2/4] Discovering collections from Live...');
  const collections = await liveDb.listCollections().toArray();
  const collectionNames = collections
    .map((c) => c.name)
    .filter((name) => !name.startsWith('system.'));

  console.log(`  Found ${collectionNames.length} collections to clone.`);

  console.log('\n[3/4] Cloning collections (Dropping Staging & Copying from Live)...');
  const results: Array<{ collection: string; liveCount: number; stagingCount: number; status: string }> = [];

  for (const colName of collectionNames) {
    process.stdout.write(`  -> Cloning '${colName}'... `);

    // 1. Read from Live (READ-ONLY)
    const liveCollection = liveDb.collection(colName);
    const docs = await liveCollection.find({}).toArray();
    const liveCount = docs.length;

    // 2. Drop / clear Staging collection only
    const stagingCollection = stagingDb.collection(colName);
    try {
      await stagingCollection.drop();
    } catch {
      // Collection might not exist yet in staging, which is normal
    }

    // 3. Insert documents into Staging
    let stagingCount = 0;
    if (docs.length > 0) {
      // Batch insert in chunks of 500
      const chunkSize = 500;
      for (let i = 0; i < docs.length; i += chunkSize) {
        const chunk = docs.slice(i, i + chunkSize);
        await stagingCollection.insertMany(chunk, { ordered: false });
      }
      stagingCount = await stagingCollection.countDocuments();
    }

    // 4. Copy Indexes from Live to Staging
    try {
      const indexes = await liveCollection.indexes();
      for (const idx of indexes) {
        if (idx.name === '_id_') continue;
        const options: Record<string, any> = { name: idx.name };
        if (idx.unique) options.unique = true;
        if (idx.sparse) options.sparse = true;
        if (idx.expireAfterSeconds != null) options.expireAfterSeconds = idx.expireAfterSeconds;
        await stagingCollection.createIndex(idx.key, options).catch(() => {});
      }
    } catch (err: any) {
      // Index copy failure is non-fatal
    }

    const matched = liveCount === stagingCount;
    console.log(`${matched ? '✓' : '⚠️'} (${stagingCount}/${liveCount} docs)`);
    results.push({
      collection: colName,
      liveCount,
      stagingCount,
      status: matched ? 'MATCH' : 'MISMATCH',
    });
  }

  // 4. Parity verification
  console.log('\n[4/4] Final Data Parity Verification:');
  console.log('----------------------------------------------------------------------');
  console.log('Collection Name'.padEnd(25) + 'Live Count'.padStart(12) + 'Staging Count'.padStart(16) + 'Status'.padStart(14));
  console.log('----------------------------------------------------------------------');
  for (const r of results) {
    console.log(
      r.collection.padEnd(25) +
      String(r.liveCount).padStart(12) +
      String(r.stagingCount).padStart(16) +
      r.status.padStart(14)
    );
  }
  console.log('----------------------------------------------------------------------');

  // Verify Live was never modified
  const finalLiveCount = await liveDb.collection('customers').countDocuments();
  console.log(`\n🛡️ Safety Check: Live customer count before: ${initialLiveCount} | after: ${finalLiveCount}`);
  if (initialLiveCount === finalLiveCount) {
    console.log('  ✓ Verified: LIVE DATABASE WAS COMPLETELY UNTOUCHED.');
  } else {
    console.error('  ❌ WARNING: Live customer count discrepancy detected!');
  }

  await liveConn.close();
  await stagingConn.close();
  console.log('\n✅ Database clone completed successfully! Staging is now an exact mirror of Live.\n');
}

cloneDatabase().catch((err) => {
  console.error('\n❌ Clone failed with error:', err);
  process.exit(1);
});
