import mongoose from 'mongoose';
import connectDB from '../config/database';
import { Lead, LeadActivity, LeadFollowUp, LeadNote, LeadStatusHistory, LeadNotification } from '../models/Lead';
import Task from '../models/Task';
import { Counter } from '../models/Counter';

const purgeAllLeadsAndTasks = async () => {
  const connected = await connectDB();
  if (!connected) {
    console.error('❌ Failed to connect to MongoDB');
    process.exit(1);
  }

  try {
    console.log('🧹 Purging all Leads, Tasks, and related activity records from DB...');

    const [
      leadsRes,
      tasksRes,
      actRes,
      fuRes,
      notesRes,
      historyRes,
      notifRes,
      counterRes,
    ] = await Promise.all([
      Lead.deleteMany({}),
      Task.deleteMany({}),
      LeadActivity.deleteMany({}),
      LeadFollowUp.deleteMany({}),
      LeadNote.deleteMany({}),
      LeadStatusHistory.deleteMany({}),
      LeadNotification.deleteMany({}),
      Counter.deleteMany({ _id: { $in: ['lead', 'task'] } }),
    ]);

    console.log(`✅ Leads deleted: ${leadsRes.deletedCount}`);
    console.log(`✅ Tasks deleted: ${tasksRes.deletedCount}`);
    console.log(`✅ Lead Activities deleted: ${actRes.deletedCount}`);
    console.log(`✅ Lead Follow-Ups deleted: ${fuRes.deletedCount}`);
    console.log(`✅ Lead Notes deleted: ${notesRes.deletedCount}`);
    console.log(`✅ Lead Status Histories deleted: ${historyRes.deletedCount}`);
    console.log(`✅ Lead Notifications deleted: ${notifRes.deletedCount}`);
    console.log(`✅ Counters reset: ${counterRes.deletedCount}`);
    console.log('🎉 All tasks and leads have been completely purged from the database!');
  } catch (error) {
    console.error('❌ Error purging records:', error);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

purgeAllLeadsAndTasks();
