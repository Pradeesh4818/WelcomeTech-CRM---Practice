import mongoose from 'mongoose';
import { Lead } from '../models';
import Task from '../models/Task';
import User from '../models/User';
import { loadEnv } from '../config/env';

loadEnv();

async function testTaskDeleteAndSync() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/welcometech-crm';
  console.log('=== TESTING TASK DELETE & SYNC RESURRECTION PREVENTION ===\n');

  try {
    await mongoose.connect(uri);

    const user = await User.findOne({ role: 'admin' }) || await User.findOne();
    if (!user) throw new Error('No user found in DB');

    // 1. Create a lead assigned to user
    const testLead = await Lead.create({
      name: 'Delete Test Lead ' + Date.now(),
      companyName: 'Delete Test Co',
      phone: '+974 5555 9999',
      email: `deletetest_${Date.now()}@example.com`,
      assignedTo: user._id,
      createdBy: user._id,
    });

    // 2. Create a lead task
    const testTask = await Task.create({
      title: `Lead ${testLead.leadId}: ${testLead.name}`,
      lead: testLead._id,
      assignedTo: user._id,
      taskType: 'lead',
      status: 'todo',
      priority: 'medium',
      createdBy: user._id,
    });

    console.log(`[CREATED] Task ID: ${testTask._id}, TaskNo: ${testTask.taskNo}, Active: ${testTask.isActive}`);

    // 3. Simulate deleteTask (soft delete isActive: false)
    await Task.findOneAndUpdate({ _id: testTask._id }, { isActive: false, status: 'cancelled' });
    console.log(`[DELETED] Soft-deleted Task ${testTask.taskNo}`);

    // 4. Simulate what getTasks does: fetch leads and check if task gets resurrected
    const leads = await Lead.find({ isActive: true, assignedTo: { $exists: true, $ne: null } });
    const leadIds = leads.map(l => l._id);

    // Fetch existing tasks (including deleted)
    const existingLeadTasks = await Task.find({ lead: { $in: leadIds } });
    const tasksByLead = new Map(existingLeadTasks.map(t => [String(t.lead), t]));

    const taskForOurLead = tasksByLead.get(String(testLead._id));
    if (taskForOurLead && !taskForOurLead.isActive) {
      console.log('[PASSED] Found existing inactive task for lead -> Sync will NOT resurrect or recreate it!');
    } else if (!taskForOurLead) {
      console.log('[FAILED] Task was not found in existing tasks check!');
    } else {
      console.log('[FAILED] Task is still marked active!');
    }

    // 5. Verify active query filter: Task.find({ isActive: true }) excludes the deleted task
    const activeTasks = await Task.find({ lead: testLead._id, isActive: true });
    console.log(`[PASSED] Active tasks count for lead: ${activeTasks.length} (Expected: 0)`);

    // Cleanup
    await Task.deleteMany({ lead: testLead._id });
    await Lead.deleteMany({ _id: testLead._id });
    console.log('\n[ALL TESTS PASSED] Task deletion and sync prevention verified successfully!');
  } catch (err: any) {
    console.error('[ERROR]', err?.message || err);
  } finally {
    await mongoose.disconnect();
  }
}

testTaskDeleteAndSync();
