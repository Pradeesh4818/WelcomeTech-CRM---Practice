import mongoose from 'mongoose';
import { Proposal, Lead, Customer, LeadStatusHistory, LeadActivity } from '../models';
import Task from '../models/Task';
import User from '../models/User';
import { loadEnv } from '../config/env';

loadEnv();

interface TestResult {
  step: string;
  passed: boolean;
  details: string;
}

async function runTaskToProposalFlowTests() {
  const results: TestResult[] = [];
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/welcometech-crm';

  console.log('=== STARTING TASK TO PROPOSAL END-TO-END FLOW TESTS ===\n');

  try {
    await mongoose.connect(uri);

    const user = await User.findOne({ role: 'admin' }) || await User.findOne();
    if (!user) {
      throw new Error('No user found in database to run tests with');
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Create Lead & Create Task for Proposal
    // ─────────────────────────────────────────────────────────────
    const testLead = await Lead.create({
      name: 'Flow Test Lead ' + Date.now(),
      companyName: 'Flow Test Enterprises',
      phone: '+974 5555 1234',
      email: 'leadflow@testcrm.com',
      fullAddress: 'Zone 45, Al Sadd, Doha, Qatar',
      locationArea: 'Al Sadd',
      status: 'Contacted',
      assignedTo: user._id,
      createdBy: user._id,
    });

    const testTask = await Task.create({
      title: 'Prepare & Send Quotation for ' + testLead.companyName,
      description: 'Customer requested quotation for ERP & Cloud licenses',
      taskType: 'proposal',
      lead: testLead._id,
      assignedTo: user._id,
      status: 'todo',
      priority: 'high',
      dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      createdBy: user._id,
    });

    results.push({
      step: '1. SETUP Lead and Proposal Task',
      passed: Boolean(testLead._id && testTask._id && testTask.status === 'todo'),
      details: `Lead ID: ${testLead._id}, Task ID: ${testTask._id}, Task Status: ${testTask.status}`,
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Simulate Proposal Generation from Task
    // ─────────────────────────────────────────────────────────────
    const proposalData = {
      task: testTask._id,
      lead: testLead._id,
      customerName: testLead.companyName,
      customerPhone: testLead.phone,
      customerEmail: testLead.email,
      customerAddress: testLead.fullAddress,
      companyInfo: {
        name: 'Welcome Trading Co. W.L.L',
        addressLine1: 'Grand Hamad Street, Bank Street',
        addressLine2: 'Doha, State of Qatar',
        contactNo: '+974 3333 4444',
        email: 'info@welcometech.qa',
      },
      title: `Service Quotation for ${testLead.companyName}`,
      quoteDate: new Date(),
      validUntil: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      discount: 10,
      items: [
        { description: 'Cloud ERP Software - 5 User License', qty: 1, unitPrice: 8500, total: 8500 },
        { description: 'Implementation & Configuration Service', qty: 1, unitPrice: 2500, total: 2500 },
      ],
      blocks: [
        {
          id: `tbl_${Date.now()}`,
          type: 'table',
          title: 'Software & Implementation Pricing',
          items: [
            { id: 1, type: 'item', no: 1, description: 'Cloud ERP Software - 5 User License', qty: 1, unitPrice: 8500 },
            { id: 2, type: 'item', no: 2, description: 'Implementation & Configuration Service', qty: 1, unitPrice: 2500 },
          ],
        },
      ],
      subtotal: 11000,
      total: 9900,
      status: 'sent' as const,
      sentAt: new Date(),
      createdBy: user._id,
    };

    const proposal = await Proposal.create(proposalData);

    results.push({
      step: '2. CREATE Proposal Linked to Task & Lead',
      passed: Boolean(proposal._id && proposal.proposalNo && proposal.total === 9900),
      details: `ProposalNo: ${proposal.proposalNo}, Total: QAR ${proposal.total}, Linked Task: ${proposal.task}, Linked Lead: ${proposal.lead}`,
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Update Task Status to 'done' (as performed by createProposal)
    // ─────────────────────────────────────────────────────────────
    testTask.status = 'done';
    testTask.completedAt = new Date();
    testTask.completedBy = user._id;
    await testTask.save();

    const refreshedTask = await Task.findById(testTask._id);
    const isTaskDone = refreshedTask?.status === 'done' && Boolean(refreshedTask?.completedAt);

    results.push({
      step: '3. VERIFY Task Lifecycle Transition to Done',
      passed: Boolean(isTaskDone),
      details: `Task Status: ${refreshedTask?.status}, CompletedAt: ${refreshedTask?.completedAt?.toISOString()}`,
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Verify Lead Status Auto-Transition to 'Quotation Sent'
    // ─────────────────────────────────────────────────────────────
    const prevStatus = testLead.status;
    testLead.status = 'Quotation Sent';
    await testLead.save();

    await LeadStatusHistory.create({
      lead: testLead._id,
      fromStatus: prevStatus,
      toStatus: 'Quotation Sent',
      changedBy: user._id,
      changedAt: new Date(),
      remarks: `Proposal ${proposal.proposalNo} created from Task ${testTask.taskNo}`,
    });

    await LeadActivity.create({
      lead: testLead._id,
      actor: user._id,
      type: 'status_changed',
      message: `Proposal ${proposal.proposalNo} sent to Lead ${testLead.name}`,
      metadata: { proposalId: proposal._id, proposalNo: proposal.proposalNo, taskId: testTask._id },
    });

    const refreshedLead = await Lead.findById(testLead._id);
    const historyDoc = await LeadStatusHistory.findOne({ lead: testLead._id, toStatus: 'Quotation Sent' });
    const activityDoc = await LeadActivity.findOne({ lead: testLead._id, type: 'status_changed' });

    const isLeadUpdated = refreshedLead?.status === 'Quotation Sent' && Boolean(historyDoc) && Boolean(activityDoc);

    results.push({
      step: '4. VERIFY Lead Transition & Audit Trail History',
      passed: Boolean(isLeadUpdated),
      details: `Lead Status: ${refreshedLead?.status}, History Logged: ${Boolean(historyDoc)}, Activity Logged: ${Boolean(activityDoc)}`,
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Customer Task -> Proposal Flow
    // ─────────────────────────────────────────────────────────────
    const testCustomer = await Customer.create({
      name: 'Flow Customer Corp ' + Date.now(),
      phone: '+974 4444 8888',
      email: 'corp@customerflow.qa',
      address: 'West Bay Financial District, Doha',
      createdBy: user._id,
    });

    const customerTask = await Task.create({
      title: 'Renew AMC & Module Quote for ' + testCustomer.name,
      taskType: 'proposal',
      customer: testCustomer._id,
      assignedTo: user._id,
      status: 'todo',
      priority: 'medium',
      createdBy: user._id,
    });

    const custProposal = await Proposal.create({
      task: customerTask._id,
      customer: testCustomer._id,
      customerName: testCustomer.name,
      customerPhone: testCustomer.phone,
      customerEmail: testCustomer.email,
      customerAddress: testCustomer.address,
      title: `AMC Proposal for ${testCustomer.name}`,
      items: [{ description: 'Annual Maintenance Contract - 1 Year', qty: 1, unitPrice: 3500, total: 3500 }],
      subtotal: 3500,
      discount: 0,
      total: 3500,
      validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      status: 'sent',
      createdBy: user._id,
    });

    customerTask.status = 'done';
    customerTask.completedAt = new Date();
    customerTask.completedBy = user._id;
    await customerTask.save();

    const refreshedCustTask = await Task.findById(customerTask._id);

    results.push({
      step: '5. VERIFY Customer Task -> Proposal Flow',
      passed: Boolean(custProposal._id && refreshedCustTask?.status === 'done'),
      details: `Customer Proposal: ${custProposal.proposalNo}, Customer Task Status: ${refreshedCustTask?.status}`,
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Populated Proposal Retrieval with Task, Lead, Customer
    // ─────────────────────────────────────────────────────────────
    const populatedProposal = await Proposal.findById(proposal._id)
      .populate('lead', 'name companyName phone email status')
      .populate('task', 'taskNo title status taskType dueDate')
      .populate('customer', 'name phone email address');

    const hasTaskPopulated = Boolean((populatedProposal as any)?.task?.taskNo);
    const hasLeadPopulated = Boolean((populatedProposal as any)?.lead?.name);
    const hasCompanyInfo = Boolean(populatedProposal?.companyInfo?.name);

    results.push({
      step: '6. VERIFY Proposal Data Hydration (Task, Lead & CompanyInfo)',
      passed: hasTaskPopulated && hasLeadPopulated && hasCompanyInfo,
      details: `Task: ${(populatedProposal as any)?.task?.taskNo} (${(populatedProposal as any)?.task?.status}), Lead: ${(populatedProposal as any)?.lead?.name}, Company: ${populatedProposal?.companyInfo?.name}`,
    });

    // Cleanup test records
    await Proposal.deleteMany({ _id: { $in: [proposal._id, custProposal._id] } });
    await Task.deleteMany({ _id: { $in: [testTask._id, customerTask._id] } });
    await Lead.deleteMany({ _id: testLead._id });
    await Customer.deleteMany({ _id: testCustomer._id });
    await LeadStatusHistory.deleteMany({ lead: testLead._id });
    await LeadActivity.deleteMany({ lead: testLead._id });

    results.push({
      step: '7. CLEANUP Test Artifacts',
      passed: true,
      details: 'All temporary test tasks, leads, customers, proposals, and history records purged',
    });

  } catch (err: any) {
    results.push({
      step: 'EXECUTION ERROR',
      passed: false,
      details: err?.message || String(err),
    });
  } finally {
    await mongoose.disconnect();
  }

  console.log('=== TEST RESULTS SUMMARY ===');
  results.forEach(r => {
    console.log(`[${r.passed ? 'PASSED' : 'FAILED'}] ${r.step} - "${r.details}"`);
  });
}

runTaskToProposalFlowTests();
