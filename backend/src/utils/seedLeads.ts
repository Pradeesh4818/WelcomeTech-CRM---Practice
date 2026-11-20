import { loadEnv } from '../config/env';
import mongoose from 'mongoose';
import User from '../models/User';
import { Lead, LeadActivity, LeadStatusHistory, LeadStatus } from '../models/Lead';

loadEnv();

type DummyLead = {
  name: string;
  email: string;
  phone: string;
  countryCode: string;
  companyName: string;
  source: string;
  status: LeadStatus;
  priority: 'low' | 'medium' | 'high' | 'critical';
  notes: string;
};

const DUMMY_LEADS: DummyLead[] = [
  {
    name: 'Ibrahim Al Marri',
    email: 'ibrahim.almarri@qatartrade.qa',
    phone: '66112233',
    countryCode: 'QA',
    companyName: 'Qatar Trade Links',
    source: 'website',
    status: 'new',
    priority: 'medium',
    notes: 'Interested in AMC onboarding package.',
  },
  {
    name: 'Sara Nadeem',
    email: 'sara.nadeem@zenretail.qa',
    phone: '66223344',
    countryCode: 'QA',
    companyName: 'Zen Retail Hub',
    source: 'referral',
    status: 'contacted',
    priority: 'high',
    notes: 'Requested product demo for finance team.',
  },
  {
    name: 'Vishal Menon',
    email: 'vishal.menon@deltafoods.qa',
    phone: '66334455',
    countryCode: 'QA',
    companyName: 'Delta Foods Qatar',
    source: 'instagram',
    status: 'in_progress',
    priority: 'high',
    notes: 'Comparing Tally and Zoho stack.',
  },
  {
    name: 'Nawal Ahmed',
    email: 'nawal.ahmed@brightlogix.qa',
    phone: '66445566',
    countryCode: 'QA',
    companyName: 'Bright Logix',
    source: 'manual',
    status: 'qualified',
    priority: 'critical',
    notes: 'Ready for proposal this week.',
  },
  {
    name: 'Fahad Kareem',
    email: 'fahad.kareem@northgate.qa',
    phone: '66556677',
    countryCode: 'QA',
    companyName: 'Northgate Services',
    source: 'google_ads',
    status: 'follow_up',
    priority: 'medium',
    notes: 'Follow-up call scheduled for next Monday.',
  },
];

const findOrCreateCreator = async () => {
  const existingAdmin = await User.findOne({ email: 'admin@welcometech.qa' });
  if (existingAdmin) return existingAdmin;

  const anyUser = await User.findOne();
  if (anyUser) return anyUser;

  return User.create({
    name: 'System Admin',
    email: 'admin@welcometech.qa',
    password: 'password123',
    role: 'admin',
    isActive: true,
  });
};

const seedLeads = async () => {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/welcometech-crm';
  await mongoose.connect(uri);
  console.log('Connected to MongoDB');

  const creator = await findOrCreateCreator();
  const assignee = await User.findOne({ isActive: true, _id: { $ne: creator._id } }).select('_id');

  let inserted = 0;
  let skipped = 0;

  for (const item of DUMMY_LEADS) {
    const existing = await Lead.findOne({
      $or: [{ email: item.email.toLowerCase() }, { phone: item.phone }],
    }).select('_id');

    if (existing) {
      skipped += 1;
      continue;
    }

    const lead = await Lead.create({
      ...item,
      email: item.email.toLowerCase(),
      assignedTo: assignee?._id,
      createdBy: creator._id,
    });

    await LeadStatusHistory.create({
      lead: lead._id,
      toStatus: lead.status,
      changedBy: creator._id,
      changedAt: new Date(),
      remarks: 'Dummy lead seeded',
    });

    await LeadActivity.create({
      lead: lead._id,
      actor: creator._id,
      type: 'lead_created',
      message: `Lead ${lead.leadId} created via seed`,
      metadata: { seed: true },
    });

    inserted += 1;
  }

  console.log('Dummy leads seed complete');
  console.log(`Inserted: ${inserted}`);
  console.log(`Skipped (already existed): ${skipped}`);
  await mongoose.disconnect();
};

seedLeads().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
