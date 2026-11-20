import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import mongoose from 'mongoose';

const CLEAN_SYSTEM_REQUIREMENTS_HTML = `<p style="margin: 0 0 10px 0; line-height: 1.55;">To install Tally Prime, the user needs to have administrator rights (Create, Write, Update, Modify and Delete permissions). Multilingual users must ensure that the operating system supports multiple languages. The Hardware requirements and Operating system required for a Client-Server and a standalone computer are as described below:</p>
<table class="specs-table" data-type="specs" style="width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 10pt; line-height: 1.5;">
  <tbody>
    <tr>
      <td style="width: 190px; font-weight: 700; color: #1e293b; padding: 5px 8px 5px 0; vertical-align: top; white-space: nowrap; border: none; border-bottom: 1px solid #e2e8f0;">Processor</td>
      <td style="width: 15px; text-align: center; vertical-align: top; font-weight: 700; color: #64748b; border: none; border-bottom: 1px solid #e2e8f0;">:</td>
      <td style="padding: 5px 0 5px 8px; vertical-align: top; color: #0f172a; border: none; border-bottom: 1px solid #e2e8f0;">1.8 GHz 64-bit (x64) architecture processor Core2 Duo, Dual Core, Core i3, Core i5, Core i7 equivalent, or above</td>
    </tr>
    <tr>
      <td style="width: 190px; font-weight: 700; color: #1e293b; padding: 5px 8px 5px 0; vertical-align: top; white-space: nowrap; border: none; border-bottom: 1px solid #e2e8f0;">RAM</td>
      <td style="width: 15px; text-align: center; vertical-align: top; font-weight: 700; color: #64748b; border: none; border-bottom: 1px solid #e2e8f0;">:</td>
      <td style="padding: 5px 0 5px 8px; vertical-align: top; color: #0f172a; border: none; border-bottom: 1px solid #e2e8f0;">4 GB or more*</td>
    </tr>
    <tr>
      <td style="width: 190px; font-weight: 700; color: #1e293b; padding: 5px 8px 5px 0; vertical-align: top; white-space: nowrap; border: none; border-bottom: 1px solid #e2e8f0;">Hard Disk space</td>
      <td style="width: 15px; text-align: center; vertical-align: top; font-weight: 700; color: #64748b; border: none; border-bottom: 1px solid #e2e8f0;">:</td>
      <td style="padding: 5px 0 5px 8px; vertical-align: top; color: #0f172a; border: none; border-bottom: 1px solid #e2e8f0;">320 GB Minimum (Excluding Data) editions</td>
    </tr>
    <tr>
      <td style="width: 190px; font-weight: 700; color: #1e293b; padding: 5px 8px 5px 0; vertical-align: top; white-space: nowrap; border: none; border-bottom: 1px solid #e2e8f0;">Operating System</td>
      <td style="width: 15px; text-align: center; vertical-align: top; font-weight: 700; color: #64748b; border: none; border-bottom: 1px solid #e2e8f0;">:</td>
      <td style="padding: 5px 0 5px 8px; vertical-align: top; color: #0f172a; border: none; border-bottom: 1px solid #e2e8f0;">64-bit editions of Microsoft Windows 7, Windows Server 2008 R2, or above</td>
    </tr>
    <tr>
      <td style="width: 190px; font-weight: 700; color: #1e293b; padding: 5px 8px 5px 0; vertical-align: top; white-space: nowrap; border: none; border-bottom: 1px solid #e2e8f0;">Other MS Office Software</td>
      <td style="width: 15px; text-align: center; vertical-align: top; font-weight: 700; color: #64748b; border: none; border-bottom: 1px solid #e2e8f0;">:</td>
      <td style="padding: 5px 0 5px 8px; vertical-align: top; color: #0f172a; border: none; border-bottom: 1px solid #e2e8f0;">64-bit editions of MS Office software such as Excel, Word, and so on</td>
    </tr>
  </tbody>
</table>`;

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  const db = mongoose.connection.db!;

  // 1. Update proposal templates
  const pts = await db.collection('proposaltemplates').find({}).toArray();
  let ptCount = 0;
  for (const pt of pts) {
    let modified = false;
    const blocks = (pt.blocks || []).map((b: any) => {
      if (b.title?.includes('System Requirements') || (b.content && b.content.includes('Processor') && b.content.includes('Core2 Duo'))) {
        modified = true;
        return { ...b, content: CLEAN_SYSTEM_REQUIREMENTS_HTML };
      }
      return b;
    });

    if (modified) {
      await db.collection('proposaltemplates').updateOne({ _id: pt._id }, { $set: { blocks } });
      ptCount++;
      console.log('Updated ProposalTemplate:', pt._id, pt.name);
    }
  }
  console.log(`Updated ${ptCount} proposal templates.`);

  // 2. Update existing proposals
  const props = await db.collection('proposals').find({}).toArray();
  let propCount = 0;
  for (const p of props) {
    let modified = false;
    const blocks = (p.blocks || []).map((b: any) => {
      if (b.title?.includes('System Requirements') || (b.content && b.content.includes('Processor') && b.content.includes('Core2 Duo'))) {
        modified = true;
        return { ...b, content: CLEAN_SYSTEM_REQUIREMENTS_HTML };
      }
      return b;
    });

    if (modified) {
      await db.collection('proposals').updateOne({ _id: p._id }, { $set: { blocks } });
      propCount++;
      console.log('Updated Proposal:', p._id, p.proposalNumber || p.title);
    }
  }
  console.log(`Updated ${propCount} proposals.`);

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
