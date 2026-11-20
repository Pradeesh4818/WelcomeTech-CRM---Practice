import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import mongoose from 'mongoose';

async function removeOverallTotalFromExistingProposals() {
  const envTarget = process.argv[2] || 'all';
  const uris: { name: string; uri: string }[] = [];

  const prodUri = process.env.MONGODB_URI_PROD || 'mongodb://crm_app:NnVbFTttGCDEOpglOWOKQVfM@187.127.188.185:27017/WelcomeTech_CRM?authSource=WelcomeTech_CRM';
  const stagingUri = process.env.MONGODB_URI_STAGING || 'mongodb://crm_app:NnVbFTttGCDEOpglOWOKQVfM@187.127.188.185:27017/WelcomeTech_CRM_STAGING?authSource=WelcomeTech_CRM';

  if (envTarget === 'production' || envTarget === 'all') {
    uris.push({ name: 'Production', uri: prodUri });
  }
  if (envTarget === 'staging' || envTarget === 'all') {
    uris.push({ name: 'Staging', uri: stagingUri });
  }

  for (const { name, uri } of uris) {
    console.log(`\n========================================`);
    console.log(`🔄 Processing ${name} database: ${uri.replace(/:[^:]*@/, ':****@')}`);
    console.log(`========================================`);

    try {
      const conn = await mongoose.createConnection(uri).asPromise();
      const proposalsCol = conn.collection('proposals');
      const templatesCol = conn.collection('proposaltemplates');

      // 1. Update all existing proposals to ensure overallTotal.show is false
      const proposalRes = await proposalsCol.updateMany(
        {},
        {
          $set: {
            'overallTotal.show': false,
          },
        }
      );
      console.log(`✅ [${name}] Proposals updated: ${proposalRes.matchedCount} matched, ${proposalRes.modifiedCount} modified.`);

      // 2. Update all existing proposal templates to ensure overallTotal.show is false
      const templateRes = await templatesCol.updateMany(
        {},
        {
          $set: {
            'overallTotal.show': false,
          },
        }
      );
      console.log(`✅ [${name}] Proposal Templates updated: ${templateRes.matchedCount} matched, ${templateRes.modifiedCount} modified.`);

      // 3. Verify
      const activeProposalsWithOt = await proposalsCol.countDocuments({ 'overallTotal.show': true });
      const activeTemplatesWithOt = await templatesCol.countDocuments({ 'overallTotal.show': true });
      console.log(`🔍 [${name}] Verification: proposals with overallTotal.show:true = ${activeProposalsWithOt}`);
      console.log(`🔍 [${name}] Verification: templates with overallTotal.show:true = ${activeTemplatesWithOt}`);

      await conn.close();
    } catch (err: any) {
      console.error(`❌ [${name}] Error processing database:`, err.message);
    }
  }

  console.log(`\n🎉 Overall Quotation Total removal from existing data completed successfully!`);
}

removeOverallTotalFromExistingProposals().catch(console.error);

