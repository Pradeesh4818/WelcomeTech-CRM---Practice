/**
 * mergeDuplicateCustomers.ts
 *
 * Merges all Customer documents that share the same company name (case-insensitive, trimmed).
 * For each duplicate group:
 *  - Keeps the document with the most data (master)
 *  - Merges services[], serialNoInfo[], keyContacts[], branches[], partnerDetails[]
 *  - Picks the best/latest value for scalar fields (amcExpiry, tss, tdl, cloud, contacts)
 *  - Deletes the merged-away duplicates
 *
 * Usage:
 *   DRY_RUN=1 npx ts-node -r tsconfig-paths/register src/scripts/mergeDuplicateCustomers.ts
 *   npx ts-node -r tsconfig-paths/register src/scripts/mergeDuplicateCustomers.ts
 */

import mongoose from 'mongoose';
import { loadEnv } from '../config/env';
import Customer from '../models/Customer';

loadEnv();

const DRY_RUN = process.env.DRY_RUN === '1';

// ─── helpers ────────────────────────────────────────────────────────────────

const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Latest of two optional dates */
const latestDate = (a?: Date, b?: Date): Date | undefined => {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
};

/** Pick the non-empty string, preferring the longer/more-detailed one */
const bestStr = (a?: string, b?: string): string | undefined => {
  if (!a && !b) return undefined;
  if (!a) return b;
  if (!b) return a;
  return a.length >= b.length ? a : b;
};

/** Deduplicate an array of objects by a key getter */
function dedupBy<T>(arr: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of arr) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}

// ─── merge logic ─────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;

function mergeGroup(docs: Doc[]): { master: Doc; deleteIds: string[] } {
  // Pick master: doc with the most data
  const sorted = [...docs].sort((a, b) => {
    const sa = (a.services?.length ?? 0) + (a.serialNoInfo?.length ?? 0) + (a.keyContacts?.length ?? 0);
    const sb = (b.services?.length ?? 0) + (b.serialNoInfo?.length ?? 0) + (b.keyContacts?.length ?? 0);
    return sb - sa;
  });

  const master = sorted[0];
  const rest = sorted.slice(1);
  const deleteIds = rest.map((d) => String(d._id));

  // ── Merge services[] ──────────────────────────────────────────────────────
  const allServices: Doc[] = [
    ...(master.services ?? []),
    ...rest.flatMap((d: Doc) => d.services ?? []),
  ];
  master.services = dedupBy(allServices, (s) =>
    `${s.type || ''}|${(s.product || '').toLowerCase().trim()}|${(s.licenseSerialNo || '').toLowerCase().trim()}`
  );

  // ── Merge serialNoInfo[] ──────────────────────────────────────────────────
  const allSerialNos: Doc[] = [
    ...(master.serialNoInfo ?? []),
    ...rest.flatMap((d: Doc) => d.serialNoInfo ?? []),
  ];
  master.serialNoInfo = dedupBy(allSerialNos, (s) => {
    const lic = (s.licenses?.[0]?.licenceSerialNo ?? '').toLowerCase().trim();
    return `${(s.product || '').toLowerCase().trim()}|${lic}`;
  });

  // ── Merge keyContacts[] ───────────────────────────────────────────────────
  const allContacts: Doc[] = [
    ...(master.keyContacts ?? []),
    ...rest.flatMap((d: Doc) => d.keyContacts ?? []),
  ];
  master.keyContacts = dedupBy(
    allContacts,
    (c) => `${(c.mobile || '').replace(/\s/g, '')}|${(c.contactName || '').toLowerCase().trim()}`
  );

  // ── Merge branches[] ─────────────────────────────────────────────────────
  const allBranches: Doc[] = [
    ...(master.branches ?? []),
    ...rest.flatMap((d: Doc) => d.branches ?? []),
  ];
  master.branches = dedupBy(allBranches, (b) =>
    (b.branchName || b.locationArea || '').toLowerCase().trim()
  );

  // ── Merge partnerDetails[] ────────────────────────────────────────────────
  const allPartners: Doc[] = [
    ...(master.partnerDetails ?? []),
    ...rest.flatMap((d: Doc) => d.partnerDetails ?? []),
  ];
  master.partnerDetails = dedupBy(allPartners, (p) =>
    (p.companyName || p.fullName || '').toLowerCase().trim()
  );

  // ── Merge groupCompanies[] ────────────────────────────────────────────────
  const allGroups: Doc[] = [
    ...(master.groupCompanies ?? []),
    ...rest.flatMap((d: Doc) => d.groupCompanies ?? []),
  ];
  master.groupCompanies = dedupBy(allGroups, (g) => (g.name || '').toLowerCase().trim());

  // ── Scalar: pick best values from rest ───────────────────────────────────
  for (const d of rest) {
    if (d.amcExpiry) master.amcExpiry = latestDate(master.amcExpiry, d.amcExpiry);
    const statusRank: Record<string, number> = { active: 4, expiring: 3, expired: 2, none: 1 };
    if ((statusRank[d.amcStatus] ?? 0) > (statusRank[master.amcStatus] ?? 0)) {
      master.amcStatus = d.amcStatus;
    }
    const existingProducts: string[] = master.products ?? [];
    const newProducts: string[] = d.products ?? [];
    master.products = [...new Set([...existingProducts, ...newProducts])];
    master.contact = bestStr(master.contact, d.contact);
    master.phone = bestStr(master.phone, d.phone);
    master.email = bestStr(master.email, d.email);
    master.address = bestStr(master.address, d.address);
    master.notes = [master.notes, d.notes].filter(Boolean).join(' | ') || master.notes;
    if (d.companyInfo) {
      master.companyInfo = master.companyInfo ?? {};
      for (const key of Object.keys(d.companyInfo)) {
        if (!master.companyInfo[key]) master.companyInfo[key] = d.companyInfo[key];
      }
    }
    if (d.tssDetails) {
      if (!master.tssDetails) master.tssDetails = d.tssDetails;
      else master.tssDetails.endDate = latestDate(master.tssDetails.endDate, d.tssDetails.endDate);
    }
    if (d.tdlDetails) {
      if (!master.tdlDetails) master.tdlDetails = d.tdlDetails;
      else master.tdlDetails.endDate = latestDate(master.tdlDetails.endDate, d.tdlDetails.endDate);
    }
    if (d.cloudDetails) {
      if (!master.cloudDetails) master.cloudDetails = d.cloudDetails;
      else master.cloudDetails.cloudExpiryDate = latestDate(master.cloudDetails.cloudExpiryDate, d.cloudDetails.cloudExpiryDate);
    }
    if (!master.primaryContactInfo?.mobile && d.primaryContactInfo?.mobile) {
      master.primaryContactInfo = d.primaryContactInfo;
    }
    if (!master.secondaryContactInfo?.mobile && d.secondaryContactInfo?.mobile) {
      master.secondaryContactInfo = d.secondaryContactInfo;
    }
  }

  return { master, deleteIds };
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function run() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB');
  console.log(DRY_RUN ? 'DRY RUN mode — no writes' : 'LIVE mode — changes WILL be saved');

  const all = await Customer.find({}).lean();
  console.log(`Total customer records: ${all.length}`);

  const groups = new Map<string, typeof all>();
  for (const doc of all) {
    const key = normName(doc.name || '');
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(doc);
  }

  const dupGroups = [...groups.entries()].filter(([, docs]) => docs.length > 1);
  console.log(`Duplicate groups found: ${dupGroups.length}`);

  let totalMerged = 0;
  let totalDeleted = 0;
  const report: { name: string; mergedCount: number; services: number }[] = [];

  for (const [key, docs] of dupGroups) {
    const { master, deleteIds } = mergeGroup(docs as Doc[]);
    console.log(`"${docs[0].name}" (${docs.length} docs) -> 1 master, services: ${master.services?.length ?? 0}`);

    if (!DRY_RUN) {
      await Customer.findByIdAndUpdate(master._id, {
        $set: {
          services: master.services,
          serialNoInfo: master.serialNoInfo,
          keyContacts: master.keyContacts,
          branches: master.branches,
          partnerDetails: master.partnerDetails,
          groupCompanies: master.groupCompanies,
          products: master.products,
          amcExpiry: master.amcExpiry,
          amcStatus: master.amcStatus,
          contact: master.contact,
          phone: master.phone,
          email: master.email,
          address: master.address,
          notes: master.notes,
          companyInfo: master.companyInfo,
          tssDetails: master.tssDetails,
          tdlDetails: master.tdlDetails,
          cloudDetails: master.cloudDetails,
          primaryContactInfo: master.primaryContactInfo,
          secondaryContactInfo: master.secondaryContactInfo,
        },
      });
      await Customer.deleteMany({ _id: { $in: deleteIds } });
    }

    totalMerged += docs.length - 1;
    totalDeleted += deleteIds.length;
    report.push({ name: docs[0].name, mergedCount: docs.length, services: master.services?.length ?? 0 });
  }

  console.log('='.repeat(60));
  console.log(`DONE`);
  console.log(`Duplicate groups: ${dupGroups.length}`);
  console.log(`Records merged away: ${totalMerged}`);
  console.log(`Records deleted: ${totalDeleted}`);
  console.log(`Records remaining: ${all.length - totalDeleted}`);
  if (DRY_RUN) console.log('(DRY RUN - no changes saved)');
  console.log('='.repeat(60));

  console.log('\nTop merged companies:');
  report
    .sort((a, b) => b.mergedCount - a.mergedCount)
    .slice(0, 30)
    .forEach((r, i) =>
      console.log(`  ${i + 1}. ${r.name} — ${r.mergedCount} rows merged, ${r.services} services`)
    );

  await mongoose.disconnect();
  console.log('Disconnected');
}

run().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
