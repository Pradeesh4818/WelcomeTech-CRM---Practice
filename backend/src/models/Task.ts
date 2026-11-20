import mongoose, { Document, Schema } from 'mongoose';
import { nextSequence, highestExistingNumber } from './Counter';

export const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'review', 'forwarded', 'done', 'cancelled'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export const TASK_TYPES = ['general', 'customer', 'lead', 'ticket', 'amc', 'tdl', 'tss', 'cloud', 'call', 'payment', 'proposal'] as const;

export type TaskStatus = typeof TASK_STATUSES[number];
export type TaskPriority = typeof TASK_PRIORITIES[number];
export type TaskType = typeof TASK_TYPES[number];

export interface ITaskHistoryItem {
  action: 'created' | 'status_change' | 'forwarded' | 'completed' | 'reopened' | 'updated' | 'comment' | 'proposal' | 'lost';
  fromStatus?: TaskStatus;
  toStatus?: TaskStatus;
  fromAssignee?: mongoose.Types.ObjectId;
  toAssignee?: mongoose.Types.ObjectId;
  performedBy?: mongoose.Types.ObjectId;
  comment?: string;
  createdAt?: Date;
}

export interface ITask extends Document {
  taskNo: string;
  title: string;
  description?: string;
  taskDate?: Date;
  taskType: TaskType;
  customer?: mongoose.Types.ObjectId;
  lead?: mongoose.Types.ObjectId;
  ticket?: mongoose.Types.ObjectId;
  assignedTo: mongoose.Types.ObjectId;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: Date;
  tags: string[];
  createdBy?: mongoose.Types.ObjectId;
  completedBy?: mongoose.Types.ObjectId;
  forwardedBy?: mongoose.Types.ObjectId;
  completedAt?: Date;
  isActive: boolean;
  history: ITaskHistoryItem[];
  createdAt: Date;
  updatedAt: Date;
}

const TaskSchema = new Schema<ITask>(
  {
    taskNo: { type: String, unique: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    taskDate: { type: Date, default: Date.now, index: true },
    taskType: { type: String, enum: TASK_TYPES, default: 'general', index: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', index: true },
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', index: true },
    ticket: { type: Schema.Types.ObjectId, ref: 'Ticket', index: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: TASK_STATUSES, default: 'todo', index: true },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'medium', index: true },
    dueDate: { type: Date, index: true },
    tags: [{ type: String, trim: true }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    completedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    forwardedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    completedAt: { type: Date },
    isActive: { type: Boolean, default: true, index: true },
    history: [
      {
        action: { type: String, required: true },
        fromStatus: { type: String },
        toStatus: { type: String },
        fromAssignee: { type: Schema.Types.ObjectId, ref: 'User' },
        toAssignee: { type: Schema.Types.ObjectId, ref: 'User' },
        performedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        comment: { type: String },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

TaskSchema.index({ status: 1, assignedTo: 1, dueDate: 1 });
TaskSchema.index({ lead: 1, isActive: 1 });
TaskSchema.index({ ticket: 1, isActive: 1 });
TaskSchema.index({ title: 'text', description: 'text', taskNo: 'text', tags: 'text' });

TaskSchema.pre('save', async function (next) {
  if (!this.taskNo) {
    // Atomic sequence — avoids both duplicate-after-delete and concurrent-create races.
    const seq = await nextSequence('task', () => highestExistingNumber(mongoose.model('Task'), 'taskNo'));
    this.taskNo = `TASK-${String(seq).padStart(5, '0')}`;
  }
  next();
});

export default mongoose.model<ITask>('Task', TaskSchema);
