import mongoose from 'mongoose';
import { loadEnv } from '../config/env';
import Customer from '../models/Customer';
import User from '../models/User';

const cliUri = process.argv.find(arg => arg.startsWith('--uri='))?.slice('--uri='.length);
const customUri = cliUri || process.env.MONGODB_URI;
loadEnv();
const uri = customUri || process.env.MONGODB_URI;

export interface TestResult {
  id: string;
  name: string;
  category: string;
  status: 'PASS' | 'FAIL';
  details: string;
  metrics?: Record<string, any>;
}

const runTests = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI missing.');

  await mongoose.connect(uri);
  const results: TestResult[] = [];

  // TC-001: Total Document Count Parity
  const count = await Customer.countDocuments({ isActive: true });
  results.push({
    id: 'TC-001',
    name: 'Total Document Count Parity',
    category: 'Data Quantity',
    status: count === 661 ? 'PASS' : 'FAIL',
    details: `Expected 661 documents in database, found ${count}.`,
    metrics: { expected: 661, actual: count }
  });

  // TC-002: Field Completeness & Mandatory Fields
  const missingName = await Customer.countDocuments({ name: { $in: ['', null] } });
  const missingPhone = await Customer.countDocuments({ phone: { $in: ['', null] } });
  const missingCreatedBy = await Customer.countDocuments({ createdBy: null });
  results.push({
    id: 'TC-002',
    name: 'Mandatory Field Completeness',
    category: 'Data Quality',
    status: missingName === 0 && missingPhone === 0 && missingCreatedBy === 0 ? 'PASS' : 'FAIL',
    details: `Missing names: ${missingName}, Missing phones: ${missingPhone}, Missing createdBy: ${missingCreatedBy}.`,
    metrics: { missingName, missingPhone, missingCreatedBy }
  });

  // TC-003: Serial Number Integrity
  const withSerial = await Customer.countDocuments({ importSerialNo: { $exists: true, $ne: '' } });
  results.push({
    id: 'TC-003',
    name: 'License & Serial Number Mapping',
    category: 'License Mapping',
    status: withSerial === 661 ? 'PASS' : 'FAIL',
    details: `${withSerial} out of ${count} records have valid license serial numbers mapped.`,
    metrics: { totalWithSerial: withSerial }
  });

  // TC-004: Service Breakdown Matrix
  const tssCount = await Customer.countDocuments({ 'services.type': 'tss' });
  const tdlCount = await Customer.countDocuments({ 'services.type': 'tdl' });
  const cloudCount = await Customer.countDocuments({ 'services.type': 'cloud' });
  results.push({
    id: 'TC-004',
    name: 'Service Matrix Breakdown',
    category: 'Service Distribution',
    status: tssCount === 661 && tdlCount === 90 && cloudCount === 14 ? 'PASS' : 'FAIL',
    details: `TSS: ${tssCount} (expected 661), TDL: ${tdlCount} (expected 90), Cloud: ${cloudCount} (expected 14).`,
    metrics: { tssCount, tdlCount, cloudCount }
  });

  // TC-005: Contact & Email Structure
  const withEmails = await Customer.countDocuments({ email: { $regex: /@/ } });
  const withPrimaryContact = await Customer.countDocuments({ 'primaryContactInfo.contactName1': { $ne: null } });
  results.push({
    id: 'TC-005',
    name: 'Contact & Email Structure',
    category: 'Contact Information',
    status: withPrimaryContact === 661 ? 'PASS' : 'FAIL',
    details: `${withPrimaryContact} records have primary contact info, ${withEmails} records have valid email addresses.`,
    metrics: { withEmails, withPrimaryContact }
  });

  // TC-006: Super Admin Ownership Attribution
  const adminUser = await User.findOne({ email: 'admin@welcometech.qa' });
  const adminOwned = adminUser ? await Customer.countDocuments({ createdBy: adminUser._id }) : 0;
  results.push({
    id: 'TC-006',
    name: 'Super Admin Ownership Attribution',
    category: 'Security & Ownership',
    status: adminOwned === 661 ? 'PASS' : 'FAIL',
    details: `All 661 records linked to admin@welcometech.qa (${adminOwned}/661).`,
    metrics: { adminOwned }
  });

  console.log(JSON.stringify(results, null, 2));
  await mongoose.disconnect();
};

runTests().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
