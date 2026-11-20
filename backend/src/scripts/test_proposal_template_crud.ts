import mongoose from 'mongoose';
import { ProposalTemplate } from '../models/index';
import User from '../models/User';
import { loadEnv } from '../config/env';
import jwt from 'jsonwebtoken';

loadEnv();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/welcometech-crm';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const API_URL = 'http://localhost:8080/api/v1';

async function runCrudTest() {
  console.log('=== STARTING PROPOSAL TEMPLATE CRUD TESTS ===');
  await mongoose.connect(MONGODB_URI);

  // 1. Get an admin user
  const admin = (await User.findOne({ role: { $in: ['admin', 'super_admin'] } })) || (await User.findOne({}));
  if (!admin) {
    console.error('FAIL: No user found in database.');
    process.exit(1);
  }

  const token = jwt.sign(
    { id: admin._id, email: admin.email, role: admin.role },
    JWT_SECRET,
    { expiresIn: '1d' }
  );

  const req = async (endpoint: string, options: RequestInit = {}): Promise<{ status: number; data: any }> => {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    const data: any = await res.json();
    return { status: res.status, data };
  };

  const results: { test: string; status: 'PASSED' | 'FAILED'; details?: any }[] = [];

  // TEST 1: CREATE Proposal Template
  let createdId = '';
  try {
    const createPayload = {
      name: `Test Template ${Date.now()}`,
      title: 'Automated Test Service Proposal',
      validForDays: 14,
      discount: 10,
      status: 'active',
      isActive: true,
      terms: '1. Net 30 days.\n2. Warranty included.',
      templateImage: 'data:image/svg+xml;utf8,<svg></svg>',
      templateFooterImage: 'data:image/svg+xml;utf8,<svg></svg>',
      items: [
        {
          description: 'Initial Setup & Diagnostic',
          qty: 1,
          unitPrice: 1500,
          total: 1500
        },
        {
          description: 'Consultation & Implementation',
          qty: 2,
          unitPrice: 2000,
          total: 4000
        }
      ],
      blocks: [
        {
          id: `block-${Date.now()}`,
          type: 'table',
          title: 'Scope of Work',
          items: [
            {
              id: Date.now(),
              type: 'item',
              no: 1,
              description: 'Initial Setup & Diagnostic',
              qty: 1,
              unitPrice: 1500
            },
            {
              id: Date.now() + 1,
              type: 'item',
              no: 2,
              description: 'Consultation & Implementation',
              qty: 2,
              unitPrice: 2000
            }
          ]
        }
      ]
    };

    const res = await req('/proposal-templates', {
      method: 'POST',
      body: JSON.stringify(createPayload)
    });

    if (res.data?.success && res.data?.data?._id) {
      createdId = res.data.data._id;
      results.push({ test: '1. CREATE Proposal Template (POST /proposal-templates)', status: 'PASSED', details: `Created ID: ${createdId}` });
    } else {
      results.push({ test: '1. CREATE Proposal Template', status: 'FAILED', details: res.data });
    }
  } catch (err: any) {
    results.push({ test: '1. CREATE Proposal Template', status: 'FAILED', details: err.message });
  }

  // TEST 2: READ ALL Proposal Templates
  try {
    const res = await req('/proposal-templates');
    const list = res.data?.data || [];
    const found = list.some((t: any) => t._id === createdId);
    if (found) {
      results.push({ test: '2. READ ALL Proposal Templates (GET /proposal-templates)', status: 'PASSED', details: `Found in list of ${list.length} templates` });
    } else {
      results.push({ test: '2. READ ALL Proposal Templates', status: 'FAILED', details: 'Created template not found in list' });
    }
  } catch (err: any) {
    results.push({ test: '2. READ ALL Proposal Templates', status: 'FAILED', details: err.message });
  }

  // TEST 3: READ ONE Proposal Template
  try {
    const res = await req(`/proposal-templates/${createdId}`);
    if (res.data?.success && res.data?.data?.name) {
      results.push({ test: '3. READ ONE Proposal Template (GET /proposal-templates/:id)', status: 'PASSED', details: `Name: ${res.data.data.name}` });
    } else {
      results.push({ test: '3. READ ONE Proposal Template', status: 'FAILED', details: res.data });
    }
  } catch (err: any) {
    results.push({ test: '3. READ ONE Proposal Template', status: 'FAILED', details: err.message });
  }

  // TEST 4: UPDATE / PATCH Proposal Template (Modifying title, items, validity, discount, blocks)
  const updatedName = `Updated Template ${Date.now()}`;
  try {
    const updatePayload = {
      name: updatedName,
      title: 'Updated Engineering Services Proposal',
      validForDays: 30,
      discount: 15,
      status: 'active',
      isActive: true,
      terms: 'Updated terms: Full payment upon milestone 1.',
      items: [
        {
          description: 'Revised System Architecture Overhaul',
          qty: 3,
          unitPrice: 5000,
          total: 15000
        }
      ],
      blocks: [
        {
          id: `block-updated-${Date.now()}`,
          type: 'table',
          title: 'Revised Scope of Work',
          items: [
            {
              id: Date.now() + 10,
              type: 'item',
              no: 1,
              description: 'Revised System Architecture Overhaul',
              qty: 3,
              unitPrice: 5000
            }
          ]
        }
      ]
    };

    const res = await req(`/proposal-templates/${createdId}`, {
      method: 'PATCH',
      body: JSON.stringify(updatePayload)
    });

    if (res.data?.success && res.data?.data?.name === updatedName) {
      results.push({ test: '4. UPDATE Proposal Template (PATCH /proposal-templates/:id)', status: 'PASSED', details: `Updated Name: ${res.data.data.name}` });
    } else {
      results.push({ test: '4. UPDATE Proposal Template', status: 'FAILED', details: res.data });
    }
  } catch (err: any) {
    results.push({ test: '4. UPDATE Proposal Template', status: 'FAILED', details: err.message });
  }

  // TEST 5: VERIFY PERSISTED UPDATE IN DATABASE
  try {
    const verifyDoc = await ProposalTemplate.findById(createdId);
    if (verifyDoc && verifyDoc.name === updatedName && verifyDoc.validForDays === 30 && verifyDoc.discount === 15 && verifyDoc.items.length === 1 && verifyDoc.items[0].unitPrice === 5000) {
      results.push({ test: '5. VERIFY PERSISTENCE (Direct DB & API Check)', status: 'PASSED', details: `Verified discount=15%, validity=30, lineItems=${verifyDoc.items.length}, total=${verifyDoc.items[0].total}` });
    } else {
      results.push({ test: '5. VERIFY PERSISTENCE', status: 'FAILED', details: verifyDoc });
    }
  } catch (err: any) {
    results.push({ test: '5. VERIFY PERSISTENCE', status: 'FAILED', details: err.message });
  }

  // TEST 6: DELETE Proposal Template
  try {
    const res = await req(`/proposal-templates/${createdId}`, {
      method: 'DELETE'
    });

    if (res.data?.success) {
      results.push({ test: '6. DELETE Proposal Template (DELETE /proposal-templates/:id)', status: 'PASSED', details: 'Deleted successfully' });
    } else {
      results.push({ test: '6. DELETE Proposal Template', status: 'FAILED', details: res.data });
    }
  } catch (err: any) {
    results.push({ test: '6. DELETE Proposal Template', status: 'FAILED', details: err.message });
  }

  // TEST 7: VERIFY DELETED STATE
  try {
    const checkDeleted = await ProposalTemplate.findById(createdId);
    if (!checkDeleted) {
      results.push({ test: '7. VERIFY DELETION (Direct DB Check)', status: 'PASSED', details: 'Confirmed template document removed from database' });
    } else {
      results.push({ test: '7. VERIFY DELETION', status: 'FAILED', details: 'Template still exists in DB' });
    }
  } catch (err: any) {
    results.push({ test: '7. VERIFY DELETION', status: 'FAILED', details: err.message });
  }

  console.log('\n=== TEST RESULTS SUMMARY ===');
  results.forEach(r => {
    console.log(`[${r.status}] ${r.test} - ${r.details ? JSON.stringify(r.details) : ''}`);
  });

  await mongoose.disconnect();
  process.exit(0);
}

runCrudTest().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
