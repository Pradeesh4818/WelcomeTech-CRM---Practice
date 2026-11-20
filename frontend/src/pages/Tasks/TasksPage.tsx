import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Columns,
  Edit,
  Eye,
  MapPin,
  Plus,
  Search,
  Tag,
  Trash2,
  UserCheck,
  Users,
  Download,
  UserPlus,
  ArrowRight,
  FileText,
  Sparkles,
  MessageSquare,
  Clock,
  Calendar,
  CalendarPlus,
  Send,
  Briefcase,
  Check,
  XCircle,
  Play,
  History,
  Mail,
  Layers,
  ExternalLink,
  Hash,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../utils/api';
import { Customer, Lead, Proposal, Task, TaskDashboard, TaskPriority, TaskStatus, TaskType, User } from '../../types';
import { fmt, PAGE_SIZE_OPTIONS, STATUS_LABELS, combineDateTime, extractDate, extractTime } from '../../utils/helpers';
import { stripDateSuffix, buildProposalNumber } from '../../utils/quotationHelpers';
import { Avatar, Badge, ConfirmDialog, DetailItem, EmptyState, InputField, Modal, Select, SelectField, SkeletonRow, Spinner, Pagination } from '../../components/ui';
import { exportExcelRows } from '../../utils/excelExport';
import { useAuthStore } from '../../store/authStore';
import { hasPermission, isUserAdmin } from '../../utils/rbac';
import { useDateFilter } from '../../context/DateFilterContext';

const TASK_STATUSES: { value: TaskStatus | 'proposal' | 'lost'; label: string }[] = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'review', label: 'Review' },
  { value: 'forwarded', label: 'Forwarded' },
  { value: 'proposal', label: 'Proposal' },
  { value: 'done', label: 'Completed' },
  { value: 'lost', label: 'Not Interested' },
];

const TASK_DATE_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'All Dates' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'upcoming', label: 'Upcoming' },
];

const getTaskStatusOptions = (task?: Task | null) => {
  const hasClientOrLead = Boolean(
    task?.customer ||
    task?.lead ||
    task?.taskType === 'customer' ||
    task?.taskType === 'lead' ||
    task?.taskType === 'proposal'
  );
  if (hasClientOrLead) {
    return TASK_STATUSES;
  }
  return TASK_STATUSES.filter((s) => s.value !== 'proposal' && s.value !== 'lost');
};

const isTaskLost = (task?: Task | null) => {
  if (!task) return false;
  if (task.tags?.some((t) => /lost|not[\s_-]?interested/i.test(t))) return true;
  if (task.history?.some((h) => h.action === ('lost' as any))) return true;
  if (/budget constraints|went with competitor|no response|requirements changed|project cancelled|not interested|lost/i.test(task.description || '')) return true;
  return false;
};

const TASK_PRIORITIES: { value: TaskPriority | ''; label: string }[] = [
  { value: '', label: '— Select Priority —' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'customer', label: 'Customer' },
  { value: 'lead', label: 'Lead' },
  { value: 'ticket', label: 'Ticket' },
  { value: 'amc', label: 'AMC' },
  { value: 'tdl', label: 'TDL' },
  { value: 'tss', label: 'TSS' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'call', label: 'Call' },
  { value: 'payment', label: 'Payment' },
  { value: 'proposal', label: 'Proposal' },
];

type TaskForm = {
  taskDate: string;
  taskTime?: string;
  taskType: TaskType;
  description: string;
  assignedTo: string;
  priority: TaskPriority | '';
  status: TaskStatus;
  dueDate: string;
  dueTime?: string;
  customerId: string;
  leadId: string;
  targetScope: 'office' | 'client';
};

const createInitialForm = (defaultAssignee = ''): TaskForm => ({
  taskDate: extractDate(new Date()),
  taskTime: extractTime(new Date()),
  taskType: 'general',
  description: '',
  assignedTo: defaultAssignee,
  priority: '',
  status: 'todo',
  dueDate: '',
  dueTime: '',
  customerId: '',
  leadId: '',
  targetScope: 'office',
});

const initialForm: TaskForm = createInitialForm();

const entityId = (value?: User | Customer | Lead | string | null): string => {
  if (!value) return '';
  if (typeof value === 'object') {
    return (value as any)._id ? String((value as any)._id) : '';
  }
  return String(value);
};
const dateValue = (value?: string): string => (value ? value.slice(0, 10) : '');
const openStatuses: TaskStatus[] = ['todo', 'in_progress', 'review', 'forwarded'];
const taskLead = (task: Task): Lead | null => (task.lead && typeof task.lead === 'object' ? task.lead : null);
const taskLeadId = (task: Task): string => taskLead(task)?.leadId || '';

const PIPELINE_COLUMNS: { status: TaskStatus; label: string; tone: string }[] = [
  { status: 'todo', label: 'To Do', tone: 'gold' },
  { status: 'in_progress', label: 'In Progress', tone: 'blue' },
  { status: 'review', label: 'Review', tone: 'purple' },
  { status: 'forwarded', label: 'Forwarded', tone: 'cyan' },
  { status: 'done', label: 'Completed', tone: 'green' },
];

const toForm = (task: Task): TaskForm => {
  const custId = entityId(task.customer);
  const tDate = task.taskDate || task.createdAt;
  return {
    taskDate: extractDate(tDate),
    taskTime: extractTime(tDate),
    taskType: task.taskType || (custId ? 'customer' : 'general'),
    description: task.description || '',
    assignedTo: entityId(task.assignedTo),
    priority: task.priority || 'medium',
    status: task.status,
    dueDate: extractDate(task.dueDate),
    dueTime: extractTime(task.dueDate),
    customerId: custId,
    leadId: entityId(task.lead),
    targetScope: custId ? 'client' : 'office',
  };
};

const toPayload = (form: TaskForm, isNew = false): Record<string, unknown> => {
  const now = new Date();
  const taskTime = form.taskTime || extractTime(now);
  return {
    title: form.targetScope === 'office'
      ? 'Office Task'
      : `${TASK_TYPES.find((type) => type.value === form.taskType)?.label || 'Customer'} Task`,
    taskDate: combineDateTime(form.taskDate || extractDate(now), taskTime) || now,
    taskType: form.targetScope === 'office' ? 'general' : (form.taskType || 'customer'),
    description: form.description || undefined,
    assignedTo: form.assignedTo || undefined,
    status: form.status,
    priority: form.priority || 'medium',
    dueDate: combineDateTime(form.dueDate, form.dueTime),
    customer: form.targetScope === 'client' ? (form.customerId || undefined) : undefined,
    lead: form.leadId || undefined,
    tags: form.targetScope === 'office' ? 'office' : form.taskType,
  };
};

const isOverdue = (task: Task): boolean => {
  if (!task.dueDate || !openStatuses.includes(task.status)) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(task.dueDate).getTime() < today.getTime();
};

export const getTaskDisplayDescription = (task: Task): string => {
  if (Array.isArray(task.history) && task.history.length > 0) {
    for (let i = task.history.length - 1; i >= 0; i--) {
      const h = task.history[i];
      if (h && h.comment && typeof h.comment === 'string' && h.comment.trim() && h.comment.trim() !== '—') {
        return h.comment.trim();
      }
    }
  }
  return task.description || '';
};

import { buildTaskAuditTimeline } from '../../utils/timelineHelpers';

const getTaskTimeline = (task: Task) => buildTaskAuditTimeline(task);

const TASK_INVALIDATION_KEYS = [
  ['tasks'],
  ['tasks-dashboard'],
  ['task-staff'],
  ['engineers'],
  ['employees-active-for-leads'],
  ['leads'],
  ['lead-dashboard'],
  ['lead-detail'],
];

const TasksPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const userRole = (typeof user?.role === 'string' ? user.role : (user?.role as any)?.name || '').toLowerCase();
  const isAdmin = isUserAdmin(user);
  const navigate = useNavigate();

  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'view' | 'edit'>('create');
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [historyTask, setHistoryTask] = useState<Task | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [statusPromptTask, setStatusPromptTask] = useState<{
    task: Task;
    targetStatus: TaskStatus;
    comment: string;
    statusDate?: string;
    statusTime?: string;
  } | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'employee'>('employee');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(() => {
    if (!isAdmin) return user?._id || null;
    const fromParam = searchParams.get('assignedTo');
    if (fromParam) return fromParam === 'all' ? null : fromParam;
    return user?._id || null;
  });
  const [form, setForm] = useState<TaskForm>(initialForm);

  React.useEffect(() => {
    const q = searchParams.get('search');
    if (q !== null) {
      setSearch(q);
    }
    if (isAdmin) {
      const emp = searchParams.get('assignedTo');
      if (emp) {
        setSelectedEmployeeId(emp === 'all' ? null : emp);
      }
    }
  }, [searchParams, isAdmin]);

  const canDeleteTask = (task: Task) => {
    const creatorId = entityId(task.createdBy);
    const currentUserId = user?._id;
    return Boolean(creatorId && currentUserId && (creatorId === currentUserId || isAdmin));
  };

  const canUpdateTaskStatus = (task: Task, isForwardedOut = false) => {
    if (isForwardedOut) return false;
    return true;
  };

  const [page, setPage] = useState(1);
  const { isFiltered, startDate, endDate, filterType, label: headerDateLabel } = useDateFilter();
  const hasActiveDateFilter = isFiltered && !!startDate && !!endDate && filterType !== 'all';
  const headerDateKey = hasActiveDateFilter ? `${startDate}_${endDate}` : 'all';

  const taskDateOptions = useMemo(() => {
    if (hasActiveDateFilter) {
      return [
        { value: 'all', label: `Header: ${headerDateLabel}` },
        ...TASK_DATE_OPTIONS.filter((opt) => opt.value !== 'all'),
      ];
    }
    return TASK_DATE_OPTIONS;
  }, [hasActiveDateFilter, headerDateLabel]);

  React.useEffect(() => { setPage(1); }, [search, statusFilter, priorityFilter, dateFilter, employeeFilter, headerDateKey]);

  const { data: staff, isLoading: isLoadingStaff } = useQuery({
    queryKey: ['task-staff'],
    queryFn: async () => {
      const res = await api.get('/engineers');
      return res.data.data as User[];
    },
  });

  React.useEffect(() => {
    if (!isAdmin) {
      if (user?._id && selectedEmployeeId !== user._id) {
        setSelectedEmployeeId(user._id);
      }
      return;
    }
    if (staff && staff.length > 0 && !selectedEmployeeId) {
      if (user?._id && staff.some((s) => s._id === user._id)) {
        setSelectedEmployeeId(user._id);
      } else {
        setSelectedEmployeeId(staff[0]._id);
      }
    }
  }, [isAdmin, staff, user, selectedEmployeeId]);

  const { data: customers, isLoading: customersLoading } = useQuery({
    queryKey: ['task-customers-lookup'],
    enabled: modalOpen,
    queryFn: async () => {
      const res = await api.get('/customers/lookup');
      return (res.data?.data || []) as Customer[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: selectedCustomerDoc } = useQuery({
    queryKey: ['single-customer-for-task', form.customerId],
    queryFn: async () => {
      if (!form.customerId) return null;
      const res = await api.get(`/customers/${form.customerId}`);
      return res.data?.data as Customer;
    },
    enabled: !!form.customerId && !(customers || []).some((c: any) => c._id === form.customerId),
    staleTime: 5 * 60 * 1000,
  });

  const customerOptions = useMemo(() => {
    const list: any[] = [...(customers || [])];
    if (selectedCustomerDoc && !list.some((c) => c._id === selectedCustomerDoc._id)) {
      list.unshift(selectedCustomerDoc);
    }
    return list.map((c: any) => {
      const name = c.companyInfo?.customerName || c.name || c.companyName || 'Customer';
      const phone = c.phone || c.contact || c.keyContacts?.[0]?.mobile || '';
      return {
        value: c._id,
        label: `${name}${phone ? ` (${phone})` : ''}`.trim(),
      };
    });
  }, [customers, selectedCustomerDoc]);

  const { data: leadsData } = useQuery({
    queryKey: ['task-leads'],
    queryFn: async () => {
      const res = await api.get('/leads?limit=all');
      return (res.data?.data || []) as Lead[];
    },
  });
  const leads = leadsData || [];

  const { data: dashboardData } = useQuery({
    queryKey: ['tasks-dashboard', headerDateKey],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (hasActiveDateFilter) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const res = await api.get('/tasks/dashboard', { params });
      return res.data.data as TaskDashboard;
    },
  });

  const employeeFilterOptions = useMemo(() => {
    return [
      { value: 'all', label: 'All Employees' },
      ...(staff || [])
        .filter((emp): emp is User => Boolean(emp && emp._id))
        .map((emp) => ({
          value: emp._id,
          label: emp.name || 'Unknown',
        })),
    ];
  }, [staff]);

  const { data: employeeTasksData, isLoading: isLoadingEmployeeTasks } = useQuery({
    queryKey: ['tasks', 'employee', selectedEmployeeId, search, statusFilter, priorityFilter, dateFilter, headerDateKey],
    queryFn: async () => {
      if (!selectedEmployeeId) return { data: [], total: 0 };
      const params: Record<string, string> = { limit: '200', page: '1', assignedTo: selectedEmployeeId };
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== 'all') params.status = statusFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;
      if (dateFilter !== 'all') params.dateFilter = dateFilter;
      if (hasActiveDateFilter) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const res = await api.get('/tasks', { params });
      return res.data as unknown as { data: Task[]; total: number };
    },
    enabled: !!selectedEmployeeId && viewMode === 'employee',
  });

  const employeeTasks = employeeTasksData?.data || [];
  
  const [pageSize, setPageSize] = useState('10');
  
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', search, statusFilter, priorityFilter, dateFilter, isAdmin ? employeeFilter : 'me', page, pageSize, headerDateKey],
    queryFn: async () => {
      const params: Record<string, string> = { limit: pageSize, page: String(page) };
      if (search.trim()) params.search = search.trim();
      if (statusFilter !== 'all') params.status = statusFilter;
      if (priorityFilter !== 'all') params.priority = priorityFilter;
      if (dateFilter !== 'all') params.dateFilter = dateFilter;
      if (isAdmin && employeeFilter !== 'all') params.assignedTo = employeeFilter;
      if (hasActiveDateFilter) {
        params.startDate = startDate;
        params.endDate = endDate;
      }
      const res = await api.get('/tasks', { params });
      return res.data as unknown as { data: Task[]; pages: number; total: number; };
    },
  });

  const tasks: Task[] = data?.data || [];
  const exportTasks = async () => {
    const params: Record<string, string> = { limit: '5000', page: '1' };
    if (search.trim()) params.search = search.trim();
    if (statusFilter !== 'all') params.status = statusFilter;
    if (priorityFilter !== 'all') params.priority = priorityFilter;
    if (dateFilter !== 'all') params.dateFilter = dateFilter;
    if (isAdmin && employeeFilter !== 'all') params.assignedTo = employeeFilter;
    if (hasActiveDateFilter) {
      params.startDate = startDate;
      params.endDate = endDate;
    }
    const res = await api.get('/tasks', { params });
    exportExcelRows('tasks', 'Tasks', res.data?.data || []);
  };
  const dashboard = dashboardData || {
    total: 0,
    open: 0,
    completed: 0,
    overdue: 0,
    dueToday: 0,
    myTasks: 0,
    critical: 0,
    byStatus: [],
    byPriority: [],
    upcoming: [],
  };

  const invalidateAll = async () => {
    await Promise.all(TASK_INVALIDATION_KEYS.map(key => queryClient.invalidateQueries({ queryKey: key })));
  };

  const staffOptions = useMemo(
    () =>
      (staff || []).map((u: User) => {
        const roleObj = u.role as any;
        const rawRole = typeof roleObj === 'object' && roleObj !== null ? roleObj.name : (typeof u.role === 'string' ? u.role : '');
        const isHexId = /^[0-9a-fA-F]{24}$/.test(String(rawRole).trim());
        const roleName = isHexId ? '' : rawRole;
        const formattedRole = roleName ? ` (${String(roleName).replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())})` : '';
        const count = u.openTaskCount !== undefined ? ` • ${u.openTaskCount} ${u.openTaskCount === 1 ? 'task' : 'tasks'}` : '';
        return {
          value: u._id,
          label: `${u.name}${formattedRole}${count}`,
        };
      }),
    [staff]
  );

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await api.post('/tasks', toPayload(form, true));
      return res.data.data as Task;
    },
    meta: { invalidateQueryKeys: TASK_INVALIDATION_KEYS },
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Task created');
      setModalOpen(false);
      setForm(createInitialForm());
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to create task'),
  });

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!activeTask) return null;
      const res = await api.patch(`/tasks/${activeTask._id}`, toPayload(form, false));
      return res.data.data as Task;
    },
    meta: { invalidateQueryKeys: TASK_INVALIDATION_KEYS },
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Task updated');
      setModalOpen(false);
      setActiveTask(null);
      setForm(createInitialForm());
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update task'),
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status, comment, statusDate, statusTime }: { id: string; status: TaskStatus; comment?: string; statusDate?: string; statusTime?: string }) => {
      const payload: Record<string, unknown> = { status };
      if (comment) {
        payload.description = comment;
        payload.remarks = comment;
        payload.comment = comment;
      }
      if (statusDate) {
        const timePart = statusTime || '00:00';
        payload.completedAt = new Date(`${statusDate}T${timePart}:00`).toISOString();
      }
      const res = await api.patch(`/tasks/${id}`, payload);
      return res.data.data as Task;
    },
    meta: { invalidateQueryKeys: TASK_INVALIDATION_KEYS },
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Task status updated');
      setStatusPromptTask(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update status'),
  });

  const assignMut = useMutation({
    mutationFn: async ({ id, assignedTo }: { id: string; assignedTo: string }) => {
      const res = await api.patch(`/tasks/${id}/assign`, { assignedTo });
      return res.data.data as Task;
    },
    meta: { invalidateQueryKeys: TASK_INVALIDATION_KEYS },
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Task assigned');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to assign task'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => api.delete(`/tasks/${id}`),
    meta: { invalidateQueryKeys: TASK_INVALIDATION_KEYS },
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Task deleted');
      setDeleteId(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to delete task'),
  });

  const { data: proposalTemplates = [] } = useQuery<any[]>({
    queryKey: ['proposal-templates-active'],
    queryFn: async () => {
      const res = await api.get('/proposal-templates');
      return res.data?.data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const [handoverTask, setHandoverTask] = useState<Task | null>(null);
  const [handoverForm, setHandoverForm] = useState({
    status: 'done' as TaskStatus,
    actionType: 'complete' as 'forward' | 'complete' | 'proposal' | 'lost',
    completionDate: '',
    completionTime: '',
    assignedTo: '',
    dueDate: '',
    description: '',
    reason: '',
    proposalNotes: '',
    additionalNotes: '',
    scheduleFollowUp: false,
    nextAssignee: '',
    nextDueDate: '',
    nextType: 'call' as 'call' | 'meeting' | 'email' | 'task' | 'demo',
    nextDescription: '',
    proposalType: '',
    proposalTemplateId: '',
    proposalEmail: '',
    proposalCc: '',
    proposalNo: '',
    quoteDate: '',
    existingProposalId: null as string | null,
    isProposalSentLocally: false,
    sentProposalInfo: null as { proposalNo?: string; sentAt?: string; to?: string; cc?: string } | null,
  });

  const forwardStaffOptions = useMemo(
    () =>
      staffOptions.filter((opt) => opt.value !== (handoverTask ? entityId(handoverTask.assignedTo) : user?._id)),
    [staffOptions, handoverTask, user]
  );

  const getNowDateTimeStrings = () => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${min}` };
  };

  const openHandover = (task: Task, targetStatus: TaskStatus = 'done', defaultAction: 'forward' | 'complete' | 'proposal' | 'lost' = 'complete') => {
    const { date: defaultDate, time: defaultTime } = getNowDateTimeStrings();

    const leadObj = typeof task.lead === 'object' && task.lead ? (task.lead as any) : null;
    const customerObj = typeof task.customer === 'object' && task.customer ? (task.customer as any) : null;
    const initialEmail = leadObj?.email || customerObj?.email || customerObj?.primaryContactInfo?.email || '';

    const interestedProd = leadObj?.interestedProduct || '';
    const matchedTemplate = (proposalTemplates || []).find((t: any) =>
      interestedProd && (t.name?.toLowerCase().includes(interestedProd.toLowerCase()) || t.title?.toLowerCase().includes(interestedProd.toLowerCase()))
    ) || (proposalTemplates || [])[0];

    const defaultPropType = matchedTemplate?.name || interestedProd || 'Standard Quotation';
    const defaultTemplateId = matchedTemplate?._id || '';

    setHandoverTask(task);
    setHandoverForm({
      status: targetStatus,
      actionType: defaultAction,
      completionDate: defaultDate,
      completionTime: defaultTime,
      assignedTo: '',
      dueDate: '',
      description: '',
      reason: '',
      proposalNotes: '',
      additionalNotes: '',
      scheduleFollowUp: false,
      nextAssignee: '',
      nextDueDate: '',
      nextType: 'call',
      nextDescription: '',
      proposalType: defaultPropType,
      proposalTemplateId: defaultTemplateId,
      proposalEmail: initialEmail,
      proposalCc: '',
      proposalNo: '',
      quoteDate: defaultDate,
      existingProposalId: null,
      isProposalSentLocally: false,
      sentProposalInfo: null,
    });
  };

  React.useEffect(() => {
    const followUpTaskId = searchParams.get('followUpTaskId') || searchParams.get('handoverTaskId');
    if (followUpTaskId) {
      api.get(`/tasks/${followUpTaskId}`)
        .then((res) => {
          const t = res.data?.data;
          if (t) {
            openHandover(t, 'todo', 'proposal');
          }
        })
        .catch(() => {});
    }
  }, [searchParams]);

  const leadIdForHandover = handoverTask
    ? (typeof handoverTask.lead === 'object' && handoverTask.lead ? (handoverTask.lead as any)._id : handoverTask.lead)
    : undefined;

  const { data: fullLeadData } = useQuery({
    queryKey: ['lead-detail-for-task', leadIdForHandover],
    enabled: !!leadIdForHandover && handoverForm.actionType === 'proposal',
    queryFn: async () => {
      const res = await api.get(`/leads/${leadIdForHandover}`);
      return res.data?.data;
    },
  });

  React.useEffect(() => {
    if (handoverTask && handoverForm.actionType === 'proposal') {
      if (!handoverForm.proposalEmail && fullLeadData?.email) {
        setHandoverForm((prev) => ({ ...prev, proposalEmail: fullLeadData.email }));
      }
      if (!handoverForm.proposalTemplateId && proposalTemplates.length > 0) {
        const prod = (typeof handoverTask.lead === 'object' && (handoverTask.lead as any)?.interestedProduct) || fullLeadData?.interestedProduct || '';
        const matched = proposalTemplates.find((t: any) =>
          prod && (t.name?.toLowerCase().includes(prod.toLowerCase()) || t.title?.toLowerCase().includes(prod.toLowerCase()))
        ) || proposalTemplates[0];
        if (matched) {
          setHandoverForm((prev) => ({
            ...prev,
            proposalTemplateId: matched._id,
            proposalType: prev.proposalType && prev.proposalType !== 'Standard Quotation' ? prev.proposalType : matched.name,
          }));
        }
      }
    }
  }, [handoverTask, handoverForm.actionType, fullLeadData, proposalTemplates]);

  const { data: linkedProposalsData } = useQuery({
    queryKey: ['task-proposals-status', handoverTask?._id, leadIdForHandover],
    enabled: !!handoverTask && handoverForm.actionType === 'proposal',
    queryFn: async () => {
      const params: Record<string, string> = { limit: '10' };
      if (handoverTask?._id) params.task = String(handoverTask._id);
      if (leadIdForHandover) params.lead = String(leadIdForHandover);
      const res = await api.get('/proposals', { params });
      return (res.data?.data || []) as Proposal[];
    },
  });

  const { data: nextProposalData } = useQuery({
    queryKey: ['next-proposal-number', handoverForm.quoteDate],
    enabled: !!handoverTask && handoverForm.actionType === 'proposal',
    queryFn: async () => {
      const res = await api.get('/proposals/next-number', {
        params: handoverForm.quoteDate ? { date: handoverForm.quoteDate } : {},
      });
      return res.data?.data;
    },
    staleTime: 30 * 1000,
  });

  const latestProposal = useMemo(() => {
    if (!handoverTask) return null;
    const props = linkedProposalsData || [];
    const taskProp = props.find((p) => {
      const pTaskId = typeof p.task === 'object' && p.task ? (p.task as any)._id : p.task;
      return pTaskId && String(pTaskId) === String(handoverTask._id);
    });
    if (taskProp) return taskProp;
    return props.find((p) => p.status === 'sent' || p.status === 'accepted') || null;
  }, [handoverTask, linkedProposalsData]);

  const isProposalSent = useMemo(() => {
    if (!handoverTask) return false;
    if (handoverForm.isProposalSentLocally) return true;
    if (latestProposal && (latestProposal.status === 'sent' || latestProposal.status === 'accepted')) {
      const pTaskId = typeof latestProposal.task === 'object' && latestProposal.task ? (latestProposal.task as any)._id : latestProposal.task;
      if (pTaskId && String(pTaskId) === String(handoverTask._id)) {
        return true;
      }
    }
    return false;
  }, [handoverTask, handoverForm.isProposalSentLocally, latestProposal]);

  // Synchronize proposalNo and quoteDate when handoverTask, latestProposal, or nextProposalData changes
  React.useEffect(() => {
    if (handoverTask && handoverForm.actionType === 'proposal') {
      if (latestProposal) {
        const existingQuoteDate = latestProposal.quoteDate
          ? new Date(latestProposal.quoteDate).toISOString().slice(0, 10)
          : '';
        setHandoverForm((prev) => ({
          ...prev,
          existingProposalId: latestProposal._id ? String(latestProposal._id) : null,
          proposalNo: prev.proposalNo || latestProposal.proposalNo || '',
          quoteDate: prev.quoteDate || existingQuoteDate || getNowDateTimeStrings().date,
        }));
      } else if (nextProposalData?.nextProposalNo && !handoverForm.proposalNo) {
        setHandoverForm((prev) => ({
          ...prev,
          proposalNo: nextProposalData.nextProposalNo,
        }));
      }
    }
  }, [handoverTask, handoverForm.actionType, latestProposal, nextProposalData?.nextProposalNo]);

  const handleQuoteDateChange = (newDate: string) => {
    setHandoverForm((prev) => {
      const includeDate = Boolean(nextProposalData?.proposalIncludeDate);
      const baseNo = stripDateSuffix(prev.proposalNo || nextProposalData?.nextProposalNo || 'WT-Q1001');
      const updatedNo = includeDate ? buildProposalNumber(baseNo, true, newDate) : prev.proposalNo;
      return {
        ...prev,
        quoteDate: newDate,
        proposalNo: updatedNo,
      };
    });
  };

  const handleProposalNoChange = (newNo: string) => {
    setHandoverForm((prev) => ({
      ...prev,
      proposalNo: newNo,
    }));
  };

  const proposalTemplateOptions = useMemo(() => {
    if (proposalTemplates && proposalTemplates.length > 0) {
      return proposalTemplates.map((t: any) => ({
        value: String(t._id),
        label: t.name ? (t.title && t.title !== t.name ? `${t.name} (${t.title})` : t.name) : 'Template',
      }));
    }
    return [
      { value: 'Standard Quotation', label: 'Standard Quotation' },
      { value: 'AMC Service Quotation', label: 'AMC Service Quotation' },
      { value: 'Tally Software Quotation', label: 'Tally Software Quotation' },
      { value: 'Cloud Hosting Quotation', label: 'Cloud Hosting Quotation' },
    ];
  }, [proposalTemplates]);

  const selectedProposalOptionValue = useMemo(() => {
    if (handoverForm.proposalTemplateId) {
      const match = proposalTemplateOptions.find((o) => o.value === String(handoverForm.proposalTemplateId));
      if (match) return match.value;
    }
    if (handoverForm.proposalType) {
      const match = proposalTemplateOptions.find(
        (o) => o.value === handoverForm.proposalType || o.label.toLowerCase().includes(handoverForm.proposalType.toLowerCase())
      );
      if (match) return match.value;
    }
    return proposalTemplateOptions[0]?.value || '';
  }, [handoverForm.proposalTemplateId, handoverForm.proposalType, proposalTemplateOptions]);

  const handleProposalTemplateChange = (val: string) => {
    const tpl = proposalTemplates.find((t: any) => String(t._id) === String(val) || t.name === val);
    setHandoverForm((p) => ({
      ...p,
      proposalTemplateId: tpl?._id ? String(tpl._id) : (proposalTemplates.length > 0 ? '' : val),
      proposalType: tpl?.name || val,
    }));
  };

  const [isSendingProposal, setIsSendingProposal] = useState(false);

  const handleSendProposal = async () => {
    if (!handoverTask) return;
    const recipientEmail = handoverForm.proposalEmail.trim();
    if (!recipientEmail) {
      toast.error('Please enter the recipient client email address.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipientEmail)) {
      toast.error('Please enter a valid client email address.');
      return;
    }

    if (!handoverForm.proposalType && !handoverForm.proposalTemplateId) {
      toast.error('Please select a proposal type / template.');
      return;
    }

    setIsSendingProposal(true);
    try {
      const leadId = typeof handoverTask.lead === 'object' && handoverTask.lead ? (handoverTask.lead as any)._id : handoverTask.lead;
      const custId = typeof handoverTask.customer === 'object' && handoverTask.customer ? (handoverTask.customer as any)._id : handoverTask.customer;
      const leadName = typeof handoverTask.lead === 'object' && handoverTask.lead ? ((handoverTask.lead as any).companyName || (handoverTask.lead as any).name) : '';
      const selectedTpl = (proposalTemplates || []).find((t: any) => t._id === handoverForm.proposalTemplateId || t.name === handoverForm.proposalType);

      const payload = {
        id: handoverForm.existingProposalId || undefined,
        to: recipientEmail,
        cc: handoverForm.proposalCc.trim() || undefined,
        template: selectedTpl?._id || handoverForm.proposalTemplateId || undefined,
        templateName: selectedTpl?.name || handoverForm.proposalType,
        proposalType: selectedTpl?.name || handoverForm.proposalType,
        title: `${selectedTpl?.name || handoverForm.proposalType || 'Quotation'} - ${leadName || handoverTask.title || 'Client'}`,
        task: handoverTask._id,
        lead: leadId,
        customer: custId,
        customerEmail: recipientEmail,
        customerName: leadName || undefined,
        proposalNo: handoverForm.proposalNo.trim() || undefined,
        quoteDate: handoverForm.quoteDate || undefined,
      };

      const res = await api.post('/proposals/send-direct', payload);
      const createdProposal = res.data?.data;

      setHandoverForm((prev) => ({
        ...prev,
        isProposalSentLocally: true,
        existingProposalId: createdProposal?._id ? String(createdProposal._id) : prev.existingProposalId,
        proposalNo: createdProposal?.proposalNo || prev.proposalNo,
        sentProposalInfo: {
          proposalNo: createdProposal?.proposalNo || handoverForm.proposalNo,
          sentAt: new Date().toISOString(),
          to: recipientEmail,
          cc: handoverForm.proposalCc.trim(),
        },
        proposalNotes: prev.proposalNotes || `Proposal (${selectedTpl?.name || handoverForm.proposalType}) sent to ${recipientEmail}${handoverForm.proposalCc ? ` (CC: ${handoverForm.proposalCc.trim()})` : ''}. Follow up on client review.`,
      }));

      queryClient.invalidateQueries({ queryKey: ['proposals'] });
      queryClient.invalidateQueries({ queryKey: ['task-proposals-status'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['next-proposal-number'] });
      queryClient.invalidateQueries({ queryKey: ['proposals-next-number'] });

      toast.success(`Proposal sent successfully to ${recipientEmail}!`);
    } catch (err: any) {
      console.error('Failed to send proposal:', err);
      const errMsg = err?.response?.data?.message || 'Failed to send proposal email';
      toast.error(errMsg);
    } finally {
      setIsSendingProposal(false);
    }
  };

  const handoverMut = useMutation({
    mutationFn: async () => {
      if (!handoverTask) return null;
      if (handoverForm.actionType === 'complete' && !handoverForm.description.trim()) {
        toast.error('Completion Remarks are mandatory to mark a task as completed.');
        return null;
      }
      if (handoverForm.actionType === 'lost' && (!handoverForm.reason || !handoverForm.additionalNotes.trim())) {
        toast.error('Both Reason and Additional Notes are mandatory to mark as not interested.');
        return null;
      }

      const targetStatus =
        handoverForm.actionType === 'lost'
          ? 'done'
          : (handoverForm.actionType === 'forward' || handoverForm.actionType === 'proposal')
          ? 'todo'
          : 'done';

      const lostRemarks = handoverForm.additionalNotes.trim()
        ? `${handoverForm.reason}: ${handoverForm.additionalNotes.trim()}`
        : handoverForm.reason;

      let completedAt: string | undefined = undefined;
      if (handoverForm.completionDate) {
        const timePart = handoverForm.completionTime || '00:00';
        completedAt = new Date(`${handoverForm.completionDate}T${timePart}:00`).toISOString();
      }

      const payload: Record<string, unknown> = {
        status: targetStatus,
        actionType: handoverForm.actionType,
        completedAt: (handoverForm.actionType === 'complete' || handoverForm.actionType === 'lost') ? completedAt : undefined,
        forwardedFrom: selectedEmployeeId || entityId(handoverTask.assignedTo) || user?._id,
        taskType: handoverForm.actionType === 'proposal' ? 'proposal' : undefined,
        leadOutcome: handoverForm.actionType === 'lost' ? 'lost' : undefined,
        description: (
          handoverForm.actionType === 'proposal' ? (handoverForm.proposalNotes || 'Generate Proposal')
          : handoverForm.actionType === 'lost' ? lostRemarks
          : handoverForm.description.trim()
        ) || undefined,
        comment: (
          handoverForm.actionType === 'lost' ? lostRemarks
          : handoverForm.actionType === 'complete' ? handoverForm.description.trim()
          : undefined
        ),
      };

      if ((handoverForm.actionType === 'forward' || handoverForm.actionType === 'proposal') && handoverForm.assignedTo) {
        payload.assignedTo = handoverForm.assignedTo;
        if (handoverForm.dueDate) {
          payload.dueDate = handoverForm.dueDate;
        }
      } else if (handoverForm.actionType === 'proposal' && handoverForm.dueDate) {
        payload.dueDate = handoverForm.dueDate;
      }

      if (handoverForm.actionType === 'complete' && handoverForm.scheduleFollowUp) {
        payload.scheduleFollowUp = true;
        if (handoverForm.nextAssignee) payload.nextAssignee = handoverForm.nextAssignee;
        if (handoverForm.nextDueDate) payload.nextDueDate = handoverForm.nextDueDate;
        if (handoverForm.nextType) payload.nextType = handoverForm.nextType;
        if (handoverForm.nextDescription) payload.nextDescription = handoverForm.nextDescription;
      }

      const res = await api.patch(`/tasks/${handoverTask._id}`, payload);
      return res.data.data as Task;
    },
    meta: { invalidateQueryKeys: TASK_INVALIDATION_KEYS },
    onSuccess: async () => {
      await invalidateAll();
      const nextStaffName = (staff || []).find((s) => s._id === (handoverForm.actionType === 'forward' ? handoverForm.assignedTo : handoverForm.nextAssignee))?.name;
      if (handoverForm.actionType === 'lost') {
        toast.success('Task completed and lead marked as Not Interested');
      } else if (handoverForm.actionType === 'forward' && nextStaffName) {
        toast.success(`Task forwarded to ${nextStaffName}!`);
      } else if (handoverForm.actionType === 'proposal') {
        const targetStaff = (staff || []).find((s) => s._id === handoverForm.assignedTo)?.name;
        if (targetStaff) {
          toast.success(`Follow-up assigned to ${targetStaff}!`);
        } else {
          toast.success('Follow-up schedule saved successfully!');
        }
        setHandoverTask(null);
        return;
      } else {
        if (handoverForm.scheduleFollowUp && handoverForm.nextDueDate) {
          toast.success(`Task completed & next follow-up scheduled!`);
        } else {
          toast.success(`Task marked as Completed!`);
        }
      }
      setHandoverTask(null);
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Failed to update task'),
  });

  const openCreate = () => {
    setModalMode('create');
    setActiveTask(null);
    setForm(createInitialForm(selectedEmployeeId || user?._id || ''));
    setModalOpen(true);
  };

  const openView = (task: Task) => {
    setActiveTask(task);
    setModalMode('view');
    setModalOpen(true);
  };

  const openEdit = (task: Task) => {
    setActiveTask(task);
    setForm(toForm(task));
    setModalMode('edit');
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalMode('create');
    setActiveTask(null);
    setForm(createInitialForm());
  };

  const saveTask = () => {
    if (!form.assignedTo) {
      toast.error('Please select an employee');
      return;
    }
    if (!form.priority) {
      toast.error('Please select a priority');
      return;
    }
    if (modalMode === 'create') createMut.mutate();
    if (modalMode === 'edit') updateMut.mutate();
  };

  const saving = createMut.isPending || updateMut.isPending;

  const kpis = [
    { label: 'Total Tasks', value: dashboard.total, icon: <ClipboardList size={20} />, bg: 'var(--brand-light)', color: 'var(--brand)', hint: 'All active tasks' },
    { label: 'Open Tasks', value: dashboard.open, icon: <CalendarClock size={20} />, bg: 'var(--amber-bg)', color: 'var(--amber)', hint: 'To do / progress' },
    { label: 'Overdue', value: dashboard.overdue, icon: <AlertTriangle size={20} />, bg: 'var(--red-bg)', color: 'var(--red)', hint: 'Needs attention' },
    { label: 'Due Today', value: dashboard.dueToday, icon: <UserCheck size={20} />, bg: 'var(--teal-bg)', color: 'var(--teal)', hint: 'Scheduled today' },
    { label: 'Completed', value: dashboard.completed, icon: <CheckCircle2 size={20} />, bg: 'var(--green-bg)', color: 'var(--green)', hint: 'Completed tasks' },
  ];

  const selectedEmployee =
    staff?.find((emp) => emp._id === selectedEmployeeId) || (staff && staff[0]) || (user as User | undefined);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Task Management</div>
          <div className="page-subtitle">{data?.total || 0} tasks in this view {hasActiveDateFilter && <span style={{ marginLeft: 6, fontWeight: 700, color: 'var(--brand)' }}>• {headerDateLabel}</span>}</div>
        </div>
      </div>

      <div className="kpi-grid">
        {kpis.map((kpi, i) => (
          <div key={kpi.label} className="kpi-card fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="kpi-icon-wrap" style={{ background: kpi.bg }}><span style={{ color: kpi.color }}>{kpi.icon}</span></div>
            <div className="kpi-label">{kpi.label}</div>
            <div className="kpi-value">{kpi.value}</div>
            <div className="kpi-change" style={{ background: 'var(--surface-3)', color: 'var(--tx-3)' }}>{kpi.hint}</div>
          </div>
        ))}
      </div>

      <div className="card card-table-sep">
        <div className="card-header table-toolbar-row">
          <div className="search-wrap">
            <Search size={13} className="search-icon" />
            <input
              className="search-input"
              placeholder="Search tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <Select 
              className="filter-select date-filter-select" 
              value={dateFilter} 
              onChange={(v) => { setDateFilter(v); setPage(1); }} 
              options={taskDateOptions} 
            />
            {isAdmin && (
              <Select 
                className="filter-select employee-filter-select" 
                value={employeeFilter} 
                onChange={(v) => { setEmployeeFilter(v); setPage(1); }} 
                options={employeeFilterOptions} 
              />
            )}
            <Select className="filter-select page-size-select" value={pageSize} onChange={(v) => { setPageSize(v); setPage(1); }} options={PAGE_SIZE_OPTIONS} />
            <Select className="filter-select" value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} options={[{ value: 'all', label: 'All Status' }, ...TASK_STATUSES]} />
          </div>
          <div className="toolbar-actions">
            <div className="task-view-switcher" role="tablist" aria-label="Task view">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'list'}
                className={`task-view-option ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title={isAdmin ? "All Tasks (Table)" : "Task Table"}
                aria-label={isAdmin ? "All Tasks (Table)" : "Task Table"}
              >
                <ClipboardList size={16} />
                <strong>{data?.total || tasks.length}</strong>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'employee'}
                className={`task-view-option ${viewMode === 'employee' ? 'active' : ''}`}
                onClick={() => setViewMode('employee')}
                title={isAdmin ? "Employee View (Kanban)" : "Kanban Board"}
                aria-label={isAdmin ? "Employee View (Kanban)" : "Kanban Board"}
              >
                {isAdmin ? <Users size={16} /> : <Columns size={16} />}
                <strong>{isAdmin ? (staff?.length || 0) : employeeTasks.length}</strong>
              </button>
            </div>
            <button className="btn btn-primary btn-sm" onClick={openCreate}>
              <Plus size={14} /> Create Task
            </button>
          </div>
        </div>

        {viewMode === 'list' ? (
          <>
            <div className="tbl-wrap">
              <table className="table-pro table-center">
                <thead>
                  <tr>
                    <th className="sno-col">S NO</th>
                    <th>Task ID</th>
                    <th>Task</th>
                    <th>Lead ID</th>
                    <th>Customer</th>
                    <th>Assigned To</th>
                    <th>Due Date</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} cols={10} />) :
                    tasks.length === 0 ? (
                      <tr>
                        <td colSpan={10}>
                          <EmptyState
                            icon={<ClipboardList size={22} />}
                            title="No tasks found"
                            action={<button className="btn btn-primary btn-sm" onClick={openCreate}><Plus size={13} /> Create Task</button>}
                          />
                        </td>
                      </tr>
                    ) : (
                      tasks.map((task, idx) => {
                        const customer = task.customer && typeof task.customer === 'object' ? task.customer : null;
                        const lead = taskLead(task);
                        const overdue = isOverdue(task);
                        return (
                          <tr key={task._id}>
                            <td className="sno-col">{(page - 1) * Number(pageSize) + idx + 1}</td>
                            <td>
                              <button
                                type="button"
                                className="record-id-link"
                                onClick={() => openView(task)}
                                title="View task details"
                              >
                                {task.taskNo}
                              </button>
                            </td>
                            <td>
                              <div style={{ minWidth: 220, textAlign: 'center' }}>
                                <div style={{ fontWeight: 800, color: 'var(--tx-1)', fontSize: 12.5 }}>{task.title}</div>
                                <div style={{ fontSize: 11, color: 'var(--tx-4)', marginTop: 2 }}>{task.tags?.length ? task.tags.join(', ') : getTaskDisplayDescription(task) || '—'}</div>
                              </div>
                            </td>
                            <td>
                              {lead ? (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                                  <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 850, color: 'var(--brand)', fontSize: 12 }}>{lead.leadId}</span>
                                  <span style={{ fontSize: 10.5, color: 'var(--tx-4)' }}>{lead.name}</span>
                                </div>
                              ) : '—'}
                            </td>
                            <td style={{ fontSize: 12.5 }}>{customer?.name || '—'}</td>
                            <td>
                              <Select
                                value={entityId(task.assignedTo)}
                                onChange={(value) => assignMut.mutate({ id: task._id, assignedTo: value })}
                                options={staffOptions}
                                style={{ height: 30, minWidth: 150, fontSize: 11.5 }}
                                disabled={assignMut.isPending}
                              />
                            </td>
                            <td>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, fontWeight: 700 }}>{fmt.date(task.dueDate)}</span>
                                {task.dueDate && extractTime(task.dueDate) && extractTime(task.dueDate) !== '00:00' && (
                                  <span style={{ fontSize: 10.5, color: 'var(--tx-3)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                    <Clock size={10} /> {fmt.time(task.dueDate)}
                                  </span>
                                )}
                                {overdue ? <Badge status="overdue" label="Overdue" /> : null}
                              </div>
                            </td>
                            <td><Badge status={task.priority} /></td>
                            <td>
                              {(() => {
                                const isForwardedOut =
                                  entityId(task.forwardedBy || undefined) === (selectedEmployeeId || user?._id) &&
                                  entityId(task.assignedTo || undefined) !== (selectedEmployeeId || user?._id) &&
                                  task.status !== 'done';
                                const isLost = isTaskLost(task);
                                const displayStatus = isForwardedOut ? 'forwarded' : isLost ? 'lost' : task.status;
                                const canUpdate = canUpdateTaskStatus(task, isForwardedOut);
                                if (!canUpdate) {
                                  return (
                                    <span
                                      className={`badge status-pill-${displayStatus}`}
                                      style={{
                                        fontSize: 11,
                                        fontWeight: 750,
                                        textTransform: 'capitalize',
                                        padding: '4px 10px',
                                        borderRadius: 6,
                                        display: 'inline-block'
                                      }}
                                    >
                                      {displayStatus === 'todo' ? 'To Do'
                                        : displayStatus === 'in_progress' ? 'In Progress'
                                        : displayStatus === 'review' ? 'Review'
                                        : displayStatus === 'forwarded' ? 'Forwarded'
                                        : displayStatus === 'lost' ? 'Not Interested'
                                        : 'Completed'}
                                    </span>
                                  );
                                }
                                return (
                                  <Select
                                    value={displayStatus}
                                    onChange={(value) => {
                                      const nextStatus = value as TaskStatus | 'proposal' | 'lost';
                                      if (nextStatus === 'done') {
                                        openHandover(task, 'done', 'complete');
                                      } else if (nextStatus === 'lost') {
                                        openHandover(task, 'done', 'lost');
                                      } else if (nextStatus === 'forwarded') {
                                        openHandover(task, 'forwarded', 'forward');
                                      } else if (nextStatus === 'proposal') {
                                        openHandover(task, 'todo', 'proposal');
                                      } else if (nextStatus === 'in_progress' || nextStatus === 'review') {
                                        const { date: defaultDate, time: defaultTime } = getNowDateTimeStrings();
                                        setStatusPromptTask({ task, targetStatus: nextStatus, comment: '', statusDate: defaultDate, statusTime: defaultTime });
                                      } else {
                                        statusMut.mutate({ id: task._id, status: nextStatus as TaskStatus });
                                      }
                                    }}
                                    options={getTaskStatusOptions(task)}
                                    style={{ height: 30, minWidth: 130, fontSize: 11.5 }}
                                    disabled={statusMut.isPending}
                                  />
                                );
                              })()}
                            </td>
                            <td>
                              <div className="table-actions">
                                <button
                                  className="btn-action btn-action-blue"
                                  title="Task History & Timeline"
                                  onClick={() => setHistoryTask(task)}
                                >
                                  <History size={13} />
                                </button>
                                <button className="btn-action btn-action-amber" title="Edit" onClick={() => openEdit(task)}><Edit size={13} /></button>
                                {canDeleteTask(task) && (
                                  <button className="btn-action btn-action-red" title="Delete" onClick={() => setDeleteId(task._id)}><Trash2 size={13} /></button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                </tbody>
              </table>
            </div>
            <Pagination currentPage={page} totalPages={(data as any)?.pages || 1} onPageChange={setPage} total={(data as any)?.total} pageSize={pageSize} />
          </>
        ) : (
          <div className="employee-view-split">
            {isAdmin && (
              <div className="employee-sidebar">
                <div className="employee-sidebar-title">Employees</div>
                <div className="employee-sidebar-list">
                  {isLoadingStaff ? (
                    Array.from({ length: 5 }).map((_, idx) => (
                      <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12 }}>
                        <div className="skeleton" style={{ width: 34, height: 34, borderRadius: '50%' }} />
                        <div style={{ flex: 1 }}>
                          <div className="skeleton" style={{ width: '80%', height: 12, marginBottom: 6 }} />
                          <div className="skeleton" style={{ width: '50%', height: 9 }} />
                        </div>
                      </div>
                    ))
                  ) : !staff || staff.length === 0 ? (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--tx-4)', fontSize: 13, fontWeight: 700 }}>
                      No employees
                    </div>
                  ) : (
                    staff.map((emp) => {
                      const isActive = emp._id === selectedEmployeeId;
                      const rawRole = (emp.role as any)?.name || (typeof emp.role === 'string' ? emp.role : '');
                      const roleDisplay = /^[0-9a-fA-F]{24}$/.test(String(rawRole).trim()) ? 'Employee' : (rawRole || 'Employee');
                      return (
                        <button
                          key={emp._id}
                          type="button"
                          className={`employee-sidebar-item ${isActive ? 'active' : ''}`}
                          onClick={() => setSelectedEmployeeId(emp._id)}
                        >
                          <Avatar src={emp.avatar} name={emp.name} size="sm" />
                          <div className="employee-info">
                            <div className="employee-name">{emp.name}</div>
                            <div className="employee-role">{roleDisplay}</div>
                          </div>
                          <span className="employee-task-badge">{emp.openTaskCount ?? 0}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            <div className="employee-board-content">
              {isAdmin && selectedEmployee && (
                <div className="employee-board-header">
                  <div className="employee-board-header-user">
                    <Avatar src={selectedEmployee.avatar} name={selectedEmployee.name} size="sm" />
                    <div className="employee-board-header-info">
                      <h3>{selectedEmployee.name}</h3>
                      <p>{(/^[0-9a-fA-F]{24}$/.test(String((selectedEmployee.role as any)?.name || selectedEmployee.role).trim()) ? 'Employee' : ((selectedEmployee.role as any)?.name || selectedEmployee.role || 'Employee'))} • {employeeTasks.length} tasks in this view</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="employee-board-canvas">
                {isLoadingEmployeeTasks ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <Spinner size={24} />
                    <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 700, color: 'var(--tx-3)' }}>Loading tasks...</span>
                  </div>
                ) : !selectedEmployeeId ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--tx-4)', fontWeight: 700 }}>
                    Select an employee to view tasks
                  </div>
                ) : (
                  <div className="task-pipeline-board">
                    {PIPELINE_COLUMNS.map((column) => {
                      const columnTasks = employeeTasks.filter((task) => {
                        const isForwardedByThisEmp =
                          entityId(task.forwardedBy || undefined) === selectedEmployeeId &&
                          entityId(task.assignedTo || undefined) !== selectedEmployeeId &&
                          task.status !== 'done';

                        if (column.status === 'forwarded') {
                          // The FORWARDED column shows active tasks that THIS employee forwarded OUT to other teammates
                          return isForwardedByThisEmp;
                        }

                        // If currently forwarded out by this employee, it's displayed in their FORWARDED column
                        if (isForwardedByThisEmp) {
                          return false;
                        }

                        // For the active assignee, the task is in their matching column (e.g. 'todo' -> TO DO)
                        return task.status === column.status;
                      });

                      return (
                        <section className={`task-pipeline-column task-pipeline-${column.tone}`} key={column.status}>
                          <header className="task-pipeline-column-head">
                            <span>{column.label}</span>
                            <strong>{columnTasks.length}</strong>
                          </header>
                          <div className="task-pipeline-column-body">
                            {columnTasks.length === 0 ? (
                              <div className="task-pipeline-empty">No tasks</div>
                            ) : (
                              columnTasks.map((task) => {
                                const customer = typeof task.customer === 'object' ? task.customer : null;
                                const lead = taskLead(task);
                                const overdue = isOverdue(task);
                                const typeLabel = TASK_TYPES.find((type) => type.value === task.taskType)?.label || 'General';
                                const isForwardedOut =
                                  entityId(task.forwardedBy || undefined) === selectedEmployeeId &&
                                  entityId(task.assignedTo || undefined) !== selectedEmployeeId;

                                return (
                                  <article className="task-pipeline-card" key={task._id}>
                                    <div className="task-pipeline-card-top">
                                      <button
                                        type="button"
                                        className="record-id-link"
                                        onClick={() => openView(task)}
                                        style={{ padding: 0 }}
                                      >
                                        {task.taskNo}
                                      </button>
                                      <div className="task-pipeline-actions">
                                        <button
                                          className="btn-action-minimal btn-action-blue"
                                          title="Task History & Timeline"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setHistoryTask(task);
                                          }}
                                        >
                                          <History size={13} />
                                        </button>
                                        <button
                                          className="btn-action-minimal btn-action-amber"
                                          title="Edit Task"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            openEdit(task);
                                          }}
                                        >
                                          <Edit size={13} />
                                        </button>
                                        {canDeleteTask(task) && (
                                          <button
                                            className="btn-action-minimal btn-action-red"
                                            title="Delete Task"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setDeleteId(task._id);
                                            }}
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    <h3 onClick={() => openView(task)} style={{ cursor: 'pointer' }}>{task.title}</h3>
                                    {(() => {
                                      const displayDesc = getTaskDisplayDescription(task);
                                      return displayDesc ? (
                                        <p className="task-pipeline-desc">{displayDesc}</p>
                                      ) : null;
                                    })()}
                                    <div className="task-pipeline-meta">
                                      {customer?.name && (
                                        <span><MapPin size={12} /> {customer.name}</span>
                                      )}
                                      <span><Tag size={12} /> {lead?.leadId || typeLabel}</span>
                                    </div>
                                    <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 4, color: overdue ? 'var(--red)' : 'var(--tx-3)' }}>
                                      <CalendarClock size={12} />
                                      {task.dueDate ? (
                                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                                          {fmt.date(task.dueDate)}
                                          {extractTime(task.dueDate) && extractTime(task.dueDate) !== '00:00' ? ` • ${fmt.time(task.dueDate)}` : ''}
                                        </span>
                                      ) : (
                                        <span style={{ fontSize: 11, color: 'var(--tx-4)', fontStyle: 'italic', fontWeight: 600 }}>
                                          No due date
                                        </span>
                                      )}
                                    </div>
                                    {isForwardedOut ? (
                                      <div style={{ marginTop: 8 }}>
                                        <span className="badge badge-blue" style={{ fontSize: 10.5, fontWeight: 750, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, width: '100%', justifyContent: 'center' }}>
                                          <ArrowRight size={11} />
                                          Forwarded to {task.assignedTo && typeof task.assignedTo === 'object' ? (task.assignedTo as any).name : 'colleague'}
                                        </span>
                                      </div>
                                    ) : task.forwardedBy ? (
                                      <div style={{ marginTop: 8 }}>
                                        <span className="badge badge-blue" style={{ fontSize: 10.5, fontWeight: 750, display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', borderRadius: 6, width: '100%', justifyContent: 'center' }}>
                                          <ArrowRight size={11} />
                                          Forwarded from {task.forwardedBy && typeof task.forwardedBy === 'object' ? (task.forwardedBy as any).name : 'colleague'}
                                        </span>
                                      </div>
                                    ) : null}
                                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                                        <Badge status={task.priority || 'low'} />
                                        {overdue ? <Badge status="overdue" label="Overdue" /> : null}
                                        {isTaskLost(task) ? (
                                          <span className="badge badge-red" style={{ fontSize: 10, fontWeight: 750, whiteSpace: 'nowrap' }}>
                                            Not Interested
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="kanban-status-select" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                                        {(() => {
                                          const isForwardedOut =
                                            entityId(task.forwardedBy || undefined) === (selectedEmployeeId || user?._id) &&
                                            entityId(task.assignedTo || undefined) !== (selectedEmployeeId || user?._id) &&
                                            task.status !== 'done';
                                          const isLost = isTaskLost(task);
                                          const displayStatus = isForwardedOut ? 'forwarded' : isLost ? 'lost' : task.status;
                                          const canUpdate = canUpdateTaskStatus(task, isForwardedOut);
                                          if (!canUpdate) {
                                            return (
                                              <span
                                                className={`badge status-pill-${displayStatus}`}
                                                style={{
                                                  fontSize: 11,
                                                  fontWeight: 750,
                                                  textTransform: 'capitalize',
                                                  padding: '4px 10px',
                                                  borderRadius: 6,
                                                  display: 'inline-block'
                                                }}
                                              >
                                                {displayStatus === 'todo' ? 'To Do'
                                                  : displayStatus === 'in_progress' ? 'In Progress'
                                                  : displayStatus === 'review' ? 'Review'
                                                  : displayStatus === 'forwarded' ? 'Forwarded'
                                                  : displayStatus === 'lost' ? 'Not Interested'
                                                  : 'Completed'}
                                              </span>
                                            );
                                          }
                                          return (
                                            <Select
                                              value={displayStatus}
                                              onChange={(value) => {
                                                const nextStatus = value as TaskStatus | 'proposal' | 'lost';
                                                if (nextStatus === 'done') {
                                                  openHandover(task, 'done', 'complete');
                                                } else if (nextStatus === 'lost') {
                                                  openHandover(task, 'done', 'lost');
                                                } else if (nextStatus === 'forwarded') {
                                                  openHandover(task, 'forwarded', 'forward');
                                                } else if (nextStatus === 'proposal') {
                                                  openHandover(task, 'todo', 'proposal');
                                                } else if (nextStatus === 'in_progress' || nextStatus === 'review') {
                                                  const { date: defaultDate, time: defaultTime } = getNowDateTimeStrings();
                                                  setStatusPromptTask({ task, targetStatus: nextStatus, comment: '', statusDate: defaultDate, statusTime: defaultTime });
                                                } else {
                                                  statusMut.mutate({ id: task._id, status: nextStatus as TaskStatus });
                                                }
                                              }}
                                              options={getTaskStatusOptions(task)}
                                              className={`status-pill-${displayStatus}`}
                                              style={{ height: 26, minWidth: 105, maxWidth: 130, fontSize: 11 }}
                                              disabled={statusMut.isPending}
                                            />
                                          );
                                        })()}
                                      </div>
                                    </div>
                                    <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontSize: 10.5, color: 'var(--tx-4)', fontFamily: 'var(--font-mono)' }}>
                                      <span>Status updated: {fmt.dateTime(task.updatedAt || task.taskDate || task.createdAt)}</span>
                                    </div>
                                  </article>
                                );
                              })
                            )}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        title={modalMode === 'create' ? 'Create Task' : modalMode === 'edit' ? 'Edit Task' : 'Task Details'}
        size="lg"
        footer={modalMode === 'view' ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            {activeTask && (activeTask.taskType === 'proposal' || activeTask.tags?.includes('proposal') || activeTask.title?.toLowerCase().includes('proposal')) && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  closeModal();
                  const leadId = typeof activeTask.lead === 'object' && activeTask.lead ? (activeTask.lead as any)._id : activeTask.lead;
                  const custId = typeof activeTask.customer === 'object' && activeTask.customer ? (activeTask.customer as any)._id : activeTask.customer;
                  const qp = new URLSearchParams();
                  if (activeTask._id) qp.set('taskId', activeTask._id);
                  if (leadId) qp.set('leadId', leadId);
                  if (custId) qp.set('customerId', custId);
                  navigate(`/proposals/new?${qp.toString()}`);
                }}
              >
                <FileText size={14} /> Create Proposal
              </button>
            )}
            {activeTask && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setModalMode('edit');
                  setForm(toForm(activeTask));
                }}
              >
                <Edit size={14} /> Edit Task
              </button>
            )}
            <button className="btn btn-cancel" onClick={closeModal}>Close</button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <button className="btn btn-cancel" onClick={closeModal} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={saveTask} disabled={saving}>
              {saving ? <Spinner size={14} /> : <CheckCircle2 size={14} />}
              {modalMode === 'create' ? 'Create Task' : 'Save Changes'}
            </button>
          </div>
        )}
      >
        {activeTask && modalMode === 'view' ? (
          <div className="task-detail-grid">
            <div className="detail-hero" style={{ gridColumn: 'span 2' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="mono" style={{ fontSize: 13, color: 'var(--brand)', fontWeight: 800 }}>{activeTask.taskNo}</span>
                <Badge status={activeTask.status} />
              </div>
              <div style={{ fontWeight: 850, fontSize: 16, marginTop: 4 }}>{TASK_TYPES.find((type) => type.value === activeTask.taskType)?.label || activeTask.title}</div>
            </div>
            <DetailItem label="Date" value={fmt.dateTime(activeTask.taskDate || activeTask.createdAt)} />
            <DetailItem label="Due Date" value={activeTask.dueDate ? fmt.dateTime(activeTask.dueDate) : '—'} />
            <DetailItem label="Priority" value={<Badge status={activeTask.priority} />} />
            <DetailItem label="Assigned To" value={typeof activeTask.assignedTo === 'object' && activeTask.assignedTo ? (activeTask.assignedTo as any)?.name : '—'} />
            <DetailItem label="Task Type (Module)" value={TASK_TYPES.find((type) => type.value === activeTask.taskType)?.label || 'General'} />
            <DetailItem label="Created By" value={typeof activeTask.createdBy === 'object' && activeTask.createdBy ? (activeTask.createdBy as any)?.name : '—'} />
            <div style={{ gridColumn: 'span 2', marginTop: 10 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Description</label>
              <div style={{ marginTop: 6, padding: 12, background: 'var(--bg-2)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {getTaskDisplayDescription(activeTask) || <span style={{ color: 'var(--tx-4)', fontStyle: 'italic' }}>No detailed description provided.</span>}
              </div>
            </div>
          </div>
        ) : (
          <div className="form-stack">
            <div className="form-grid-2">
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 8 }}>
                <InputField
                  label="Task Date"
                  value={form.taskDate}
                  onChange={(value) => setForm((p) => ({ ...p, taskDate: value }))}
                  type="date"
                  required
                  disabled={saving}
                />
                <InputField
                  label="Time"
                  value={form.taskTime || ''}
                  onChange={(value) => setForm((p) => ({ ...p, taskTime: value }))}
                  type="time"
                  disabled={saving}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 8 }}>
                <InputField
                  label="Due Date"
                  value={form.dueDate}
                  onChange={(value) => setForm((p) => ({ ...p, dueDate: value }))}
                  type="date"
                  disabled={saving}
                />
                <InputField
                  label="Due Time"
                  value={form.dueTime || ''}
                  onChange={(value) => setForm((p) => ({ ...p, dueTime: value }))}
                  type="time"
                  disabled={saving}
                />
              </div>
              <SelectField
                label="Assign To (Employee)"
                value={form.assignedTo}
                onChange={(value) => setForm((p) => ({ ...p, assignedTo: value }))}
                options={[{ value: '', label: '— Select Assignee —' }, ...staffOptions]}
                required
                disabled={saving}
              />
              <SelectField
                label="Priority"
                value={form.priority}
                onChange={(value) => setForm((p) => ({ ...p, priority: value as TaskPriority }))}
                options={TASK_PRIORITIES}
                required
                disabled={saving}
              />
            </div>
            {/* Professional ON/OFF Toggle Switch for Client Linking */}
            <div
              className="task-client-toggle-card"
              onClick={() =>
                setForm((p) => {
                  const isNowClient = p.targetScope !== 'client';
                  return {
                    ...p,
                    targetScope: isNowClient ? 'client' : 'office',
                    taskType: isNowClient ? 'customer' : 'general',
                    customerId: isNowClient ? p.customerId : '',
                  };
                })
              }
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '11px 14px',
                marginTop: 14,
                borderRadius: 10,
                border: `1px solid ${form.targetScope === 'client' ? 'var(--brand)' : 'var(--border)'}`,
                background: form.targetScope === 'client' ? 'var(--brand-light, rgba(99, 102, 241, 0.08))' : 'var(--surface-2)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: form.targetScope === 'client' ? 'var(--brand)' : 'var(--surface-3)',
                    color: form.targetScope === 'client' ? '#fff' : 'var(--tx-3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {form.targetScope === 'client' ? <Users size={16} /> : <Briefcase size={16} />}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-1)' }}>
                    {form.targetScope === 'client' ? 'Client / Customer Task' : 'Office / Internal Task'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--tx-3)' }}>
                    {form.targetScope === 'client'
                      ? 'Toggle ON: Linked to an existing client/customer in CRM'
                      : 'Toggle OFF: Internal office work (no client linked)'}
                  </div>
                </div>
              </div>

              {/* ON/OFF Switch Toggle */}
              <div
                style={{
                  width: 42,
                  height: 24,
                  borderRadius: 12,
                  background: form.targetScope === 'client' ? 'var(--brand)' : 'var(--border-strong, #d1d5db)',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: form.targetScope === 'client' ? 'flex-end' : 'flex-start',
                  transition: 'all 0.2s ease',
                  boxSizing: 'border-box',
                }}
              >
                <div
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                  }}
                />
              </div>
            </div>

            {form.targetScope === 'client' && (
              <div className="form-group" style={{ marginTop: 12 }}>
                <SelectField
                  label="Select Customer (Client) *"
                  value={form.customerId}
                  onChange={(value) => setForm((p) => ({ ...p, customerId: value, leadId: '' }))}
                  placeholder="— Type or select customer name, phone, company... —"
                  options={customerOptions}
                  loading={customersLoading}
                  required
                  disabled={saving}
                />
              </div>
            )}
            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label" style={{ fontWeight: 700 }}>
                Instructions / Description for Employee
              </label>
              <textarea
                className="form-control form-textarea"
                rows={3}
                placeholder="Enter detailed task instructions, customer requests, or follow-up notes..."
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                disabled={saving}
                style={{ width: '100%', resize: 'vertical', minHeight: 85 }}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Handover / Complete Modal ── */}
      <Modal
        open={!!handoverTask}
        onClose={() => setHandoverTask(null)}
        title={
          handoverForm.actionType === 'forward'
            ? 'Forward Task to Colleague'
            : handoverForm.actionType === 'proposal'
            ? 'Create Proposal & Schedule Client Follow-Up'
            : handoverForm.actionType === 'lost'
            ? 'Mark Lead as Not Interested'
            : 'Complete Task'
        }
        headerActions={handoverTask ? <span className="handover-taskno-pill">{handoverTask.taskNo}</span> : undefined}
        size="lg"
        className={handoverForm.actionType === 'proposal' ? 'handover-modal-proposal' : undefined}
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <button className="btn btn-cancel" onClick={() => setHandoverTask(null)} disabled={handoverMut.isPending}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => handoverMut.mutate()}
              disabled={
                handoverMut.isPending ||
                (handoverForm.actionType === 'forward' && !handoverForm.assignedTo) ||
                (handoverForm.actionType === 'complete' && !handoverForm.description.trim()) ||
                (handoverForm.actionType === 'complete' && handoverForm.scheduleFollowUp && !handoverForm.nextDueDate) ||
                (handoverForm.actionType === 'lost' && (!handoverForm.reason || !handoverForm.additionalNotes.trim()))
              }
            >
              {handoverMut.isPending ? (
                <Spinner size={14} />
              ) : handoverForm.actionType === 'lost' ? (
                <XCircle size={14} />
              ) : handoverForm.actionType === 'proposal' ? (
                <FileText size={14} />
              ) : handoverForm.actionType === 'forward' ? (
                <Send size={14} />
              ) : (
                <Check size={14} />
              )}
              {handoverForm.actionType === 'lost'
                ? 'Mark as Not Interested'
                : handoverForm.actionType === 'proposal'
                ? 'Save Follow-Up Schedule'
                : handoverForm.actionType === 'forward'
                ? 'Forward Task'
                : handoverForm.scheduleFollowUp
                ? 'Complete & Schedule Follow-Up'
                : 'Complete Task'}
            </button>
          </div>
        }
      >
        {handoverTask && (
          <div className="handover-modal-body">

            {/* Task Info Bar */}
            <div className="handover-info-bar">
              <span className="handover-info-title">{handoverTask.title || 'Task'}</span>
              <div className="handover-info-flow">
                <span className="handover-flow-dot" style={{ background: '#f59e0b' }} />
                <span className="handover-flow-label">
                  {handoverTask.status ? handoverTask.status.charAt(0).toUpperCase() + handoverTask.status.slice(1).replace(/_/g, ' ') : 'In Progress'}
                </span>
                <ArrowRight size={12} style={{ color: 'var(--tx-4)' }} />
                <span
                  className="handover-flow-dot"
                  style={{
                    background:
                      handoverForm.actionType === 'forward' ? '#0891b2'
                      : handoverForm.actionType === 'proposal' ? '#7c3aed'
                      : handoverForm.actionType === 'lost' ? '#ef4444'
                      : '#22c55e'
                  }}
                />
                  <span className="handover-flow-label">
                    {handoverForm.actionType === 'forward' ? 'Forwarded'
                    : handoverForm.actionType === 'proposal' ? 'Proposal'
                    : handoverForm.actionType === 'lost' ? 'Not Interested'
                    : 'Completed'}
                  </span>
                </div>
              </div>
              {(handoverForm.actionType === 'complete' || handoverForm.actionType === 'lost') ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10, marginBottom: 12 }}>
                  <InputField
                    label={handoverForm.actionType === 'complete' ? 'COMPLETION DATE *' : 'STATUS UPDATE DATE *'}
                    value={handoverForm.completionDate}
                    onChange={(v) => setHandoverForm((p) => ({ ...p, completionDate: v }))}
                    type="date"
                    required
                  />
                  <InputField
                    label={handoverForm.actionType === 'complete' ? 'COMPLETION TIME *' : 'STATUS UPDATE TIME *'}
                    value={handoverForm.completionTime}
                    onChange={(v) => setHandoverForm((p) => ({ ...p, completionTime: v }))}
                    type="time"
                    required
                  />
                </div>
              ) : (
                <div style={{ padding: '0 4px', marginBottom: 10, fontSize: 11.5, color: 'var(--tx-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CalendarClock size={13} style={{ color: 'var(--brand)' }} />
                  <span>Status Update Time: <strong style={{ color: 'var(--tx-1)', fontFamily: 'var(--font-mono)' }}>{fmt.dateTime(new Date())}</strong></span>
                </div>
              )}

            {/* ── 1. Forward ── */}
            {handoverForm.actionType === 'forward' && (
              <div className="handover-tab-content">
                <SelectField
                  label="FORWARD TO *"
                  value={handoverForm.assignedTo}
                  onChange={(v) => setHandoverForm((p) => ({ ...p, assignedTo: v }))}
                  options={[{ value: '', label: '— Select Colleague —' }, ...forwardStaffOptions]}
                  required
                />
                <InputField
                  label="FOLLOW-UP DATE (Optional)"
                  value={handoverForm.dueDate}
                  onChange={(v) => setHandoverForm((p) => ({ ...p, dueDate: v }))}
                  type="date"
                />
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">HANDOVER NOTES *</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={handoverForm.description}
                    onChange={(e) => setHandoverForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="What should your colleague do next?"
                    disabled={handoverMut.isPending}
                    style={{ resize: 'vertical' }}
                  />
                </div>
              </div>
            )}

            {/* Outcome Switcher for Complete / Not Interested */}
            {(handoverForm.actionType === 'complete' || handoverForm.actionType === 'lost') && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                <button
                  type="button"
                  onClick={() => setHandoverForm((p) => ({ ...p, actionType: 'complete' }))}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 750,
                    border: `1.5px solid ${handoverForm.actionType === 'complete' ? 'var(--brand)' : 'var(--border)'}`,
                    background: handoverForm.actionType === 'complete' ? 'var(--brand-light)' : 'var(--surface-2)',
                    color: handoverForm.actionType === 'complete' ? 'var(--brand)' : 'var(--tx-3)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <Check size={14} /> Completed Successfully
                </button>
                <button
                  type="button"
                  onClick={() => setHandoverForm((p) => ({ ...p, actionType: 'lost' }))}
                  style={{
                    padding: '9px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 750,
                    border: `1.5px solid ${handoverForm.actionType === 'lost' ? '#ef4444' : 'var(--border)'}`,
                    background: handoverForm.actionType === 'lost' ? 'rgba(239, 68, 68, 0.1)' : 'var(--surface-2)',
                    color: handoverForm.actionType === 'lost' ? '#ef4444' : 'var(--tx-3)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                >
                  <XCircle size={14} /> Client Not Interested
                </button>
              </div>
            )}

            {/* ── 3. Complete ── */}
            {handoverForm.actionType === 'complete' && (
              <div className="handover-tab-content">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 750 }}>
                    COMPLETION REMARKS <span style={{ color: 'var(--red)', fontWeight: 800 }}>* (Required)</span>
                  </label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={handoverForm.description}
                    onChange={(e) => setHandoverForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Enter mandatory completion remarks: what was done, resolution details, or task outcome..."
                    disabled={handoverMut.isPending}
                    style={{ resize: 'vertical' }}
                    required
                  />
                  {!handoverForm.description.trim() && (
                    <span style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4, display: 'block' }}>
                      * Please enter completion remarks to complete and close this task.
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── 4. Proposal & Follow-up ── */}
            {handoverForm.actionType === 'proposal' && (
              <div className="handover-tab-content" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Step 1: Proposal Configuration & Dispatch */}
                <div
                  style={{
                    padding: '16px 18px',
                    borderRadius: 12,
                    background: isProposalSent
                      ? 'var(--green-bg, rgba(34, 197, 94, 0.06))'
                      : 'var(--brand-light, rgba(99, 102, 241, 0.05))',
                    border: `1.5px solid ${isProposalSent ? 'var(--green, #22c55e)' : 'var(--brand)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Step Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span
                        style={{
                          background: isProposalSent ? 'var(--green, #22c55e)' : 'var(--brand)',
                          color: '#fff',
                          borderRadius: '50%',
                          width: 24,
                          height: 24,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 800,
                          flexShrink: 0,
                        }}
                      >
                        {isProposalSent ? <Check size={14} strokeWidth={3} /> : '1'}
                      </span>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 800, fontSize: 14, color: isProposalSent ? 'var(--green, #22c55e)' : 'var(--tx-1)' }}>
                            {isProposalSent ? 'Quotation Sent to Client' : 'Configure & Send Proposal Quotation'}
                          </span>
                          {isProposalSent && (
                            <span
                              style={{
                                fontSize: 11,
                                fontWeight: 750,
                                padding: '2px 8px',
                                borderRadius: 12,
                                background: 'rgba(34, 197, 94, 0.15)',
                                color: 'var(--green, #22c55e)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <Check size={11} strokeWidth={3} />
                              {handoverForm.sentProposalInfo?.proposalNo || latestProposal?.proposalNo || 'Dispatched'}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 2 }}>
                          {isProposalSent
                            ? `Quotation has been dispatched to ${handoverForm.proposalEmail || 'client'}. You can resend with updated details or schedule follow-up below.`
                            : 'Select proposal template type, recipient email, and optional CC email to send official quotation.'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11.5, color: 'var(--brand)', display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px' }}
                      title="Open full quote generator with prefilled customer details"
                      onClick={() => {
                        const leadId = typeof handoverTask?.lead === 'object' && handoverTask?.lead ? (handoverTask.lead as any)._id : handoverTask?.lead;
                        const custId = typeof handoverTask?.customer === 'object' && handoverTask?.customer ? (handoverTask.customer as any)._id : handoverTask?.customer;
                        const qp = new URLSearchParams();
                        if (handoverTask?._id) qp.set('taskId', handoverTask._id);
                        if (leadId) qp.set('leadId', leadId);
                        if (custId) qp.set('customerId', custId);
                        if (handoverForm.proposalTemplateId) qp.set('templateId', handoverForm.proposalTemplateId);
                        if (handoverForm.proposalEmail) qp.set('email', handoverForm.proposalEmail);
                        if (handoverForm.proposalCc) qp.set('cc', handoverForm.proposalCc);
                        if (handoverForm.proposalNo) qp.set('proposalNo', handoverForm.proposalNo);
                        if (handoverForm.quoteDate) qp.set('quoteDate', handoverForm.quoteDate);
                        setHandoverTask(null);
                        navigate(`/proposals/new?${qp.toString()}`);
                      }}
                    >
                      <ExternalLink size={12} />
                      <span>Full Proposal Editor</span>
                    </button>
                  </div>

                  {/* Form Grid: Proposal Type, Invoice No, Quote Date, Email, CC Email */}
                  <div
                    className="proposal-form-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                      gap: 12,
                      background: 'var(--surface-1, #fff)',
                      padding: 14,
                      borderRadius: 10,
                      border: '1px solid var(--border)',
                    }}
                  >
                    {/* Proposal Type */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Layers size={13} style={{ color: 'var(--brand)' }} />
                        <span>PROPOSAL TYPE / TEMPLATE <span style={{ color: 'var(--red, #ef4444)' }}>*</span></span>
                      </label>
                      <Select
                        value={selectedProposalOptionValue}
                        onChange={handleProposalTemplateChange}
                        options={proposalTemplateOptions}
                        placeholder="Select proposal template..."
                        menuMaxHeight={280}
                      />
                    </div>

                    {/* Invoice / Proposal No */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <Hash size={13} style={{ color: 'var(--brand)' }} />
                          <span>INVOICE / PROPOSAL NO</span>
                        </span>
                        {handoverForm.existingProposalId ? (
                          <span style={{ fontSize: 10, color: 'var(--brand)', background: 'var(--brand-50, #eff6ff)', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                            Existing Draft
                          </span>
                        ) : (
                          <span style={{ fontSize: 10, color: 'var(--emerald-600, #059669)', background: 'var(--emerald-50, #ecfdf5)', padding: '1px 6px', borderRadius: 4, fontWeight: 600 }}>
                            Continuous Auto-Seq
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. WT-Q1001/23-10-2026"
                        value={handoverForm.proposalNo}
                        onChange={(e) => handleProposalNoChange(e.target.value)}
                        style={{ fontSize: 12.5, fontWeight: 600, letterSpacing: '0.02em' }}
                      />
                    </div>

                    {/* Quotation Date */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Calendar size={13} style={{ color: 'var(--brand)' }} />
                        <span>QUOTATION DATE</span>
                      </label>
                      <input
                        type="date"
                        className="form-control"
                        value={handoverForm.quoteDate}
                        onChange={(e) => handleQuoteDateChange(e.target.value)}
                        style={{ fontSize: 12.5 }}
                      />
                    </div>

                    {/* Client Email */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Mail size={13} style={{ color: 'var(--brand)' }} />
                        <span>CLIENT EMAIL (TO) <span style={{ color: 'var(--red, #ef4444)' }}>*</span></span>
                      </label>
                      <input
                        type="email"
                        className="form-control"
                        placeholder="client@company.com"
                        value={handoverForm.proposalEmail}
                        onChange={(e) => setHandoverForm((p) => ({ ...p, proposalEmail: e.target.value }))}
                        style={{ fontSize: 12.5 }}
                        required
                      />
                    </div>

                    {/* CC Email */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <Mail size={13} style={{ color: 'var(--tx-3)' }} />
                        <span>CC EMAIL <span style={{ color: 'var(--tx-4)', fontWeight: 500 }}>(Optional)</span></span>
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. sales@welcometech.qa, cc@company.com"
                        value={handoverForm.proposalCc}
                        onChange={(e) => setHandoverForm((p) => ({ ...p, proposalCc: e.target.value }))}
                        style={{ fontSize: 12.5 }}
                      />
                    </div>
                  </div>

                  {/* Action Bar for Step 1 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 11.5, color: 'var(--tx-3)' }}>
                      {handoverForm.proposalEmail ? (
                        <span>Sending to: <strong style={{ color: 'var(--tx-1)' }}>{handoverForm.proposalEmail}</strong>{handoverForm.proposalCc ? <> (CC: <strong style={{ color: 'var(--tx-2)' }}>{handoverForm.proposalCc}</strong>)</> : null}</span>
                      ) : (
                        <span style={{ color: 'var(--amber, #f59e0b)' }}>* Please enter client email address to send quotation</span>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        className={`btn btn-sm ${isProposalSent ? 'btn-secondary' : 'btn-primary'}`}
                        disabled={isSendingProposal || !handoverForm.proposalEmail.trim()}
                        onClick={handleSendProposal}
                        style={{
                          fontWeight: 750,
                          padding: '8px 16px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          minWidth: 150,
                          justifyContent: 'center',
                          background: isProposalSent ? undefined : 'var(--brand)',
                        }}
                      >
                        {isSendingProposal ? (
                          <>
                            <Spinner size={14} />
                            <span>Sending...</span>
                          </>
                        ) : isProposalSent ? (
                          <>
                            <Send size={13} />
                            <span>Resend Quotation</span>
                          </>
                        ) : (
                          <>
                            <Send size={13} />
                            <span>Send Proposal Now</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Step 2: Next Client Follow-Up Schedule */}
                <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                    <span
                      style={{
                        background: 'var(--tx-3)',
                        color: '#fff',
                        borderRadius: '50%',
                        width: 22,
                        height: 22,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      2
                    </span>
                    <span style={{ fontWeight: 800, fontSize: 13.5, color: 'var(--tx-1)' }}>
                      Schedule Client Follow-Up (After Sending Quote)
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                    <SelectField
                      label="ASSIGN FOLLOW-UP TO"
                      value={handoverForm.assignedTo}
                      onChange={(v) => setHandoverForm((p) => ({ ...p, assignedTo: v }))}
                      options={[{ value: '', label: '— Current Assignee (Self) —' }, ...staffOptions]}
                    />
                    <InputField
                      label="NEXT FOLLOW-UP DATE"
                      value={handoverForm.dueDate}
                      onChange={(v) => setHandoverForm((p) => ({ ...p, dueDate: v }))}
                      type="date"
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0, marginTop: 12 }}>
                    <label className="form-label">FOLLOW-UP INSTRUCTIONS & SCOPE NOTES <span style={{ color: 'var(--tx-4)', fontWeight: 500 }}>(Optional)</span></label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={handoverForm.proposalNotes}
                      onChange={(e) => setHandoverForm((p) => ({ ...p, proposalNotes: e.target.value }))}
                      placeholder="e.g., Quotation sent to customer. Follow up on approval and pricing confirmation..."
                      disabled={handoverMut.isPending}
                      style={{ resize: 'vertical' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ── 5. Not Interested ── */}
            {handoverForm.actionType === 'lost' && (
              <div className="handover-tab-content">
                <SelectField
                  label="REASON *"
                  value={handoverForm.reason}
                  onChange={(v) => setHandoverForm((p) => ({ ...p, reason: v }))}
                  options={[
                    { value: '', label: '— Select Reason —' },
                    { value: 'Budget constraints', label: 'Budget constraints' },
                    { value: 'Went with competitor', label: 'Went with competitor' },
                    { value: 'No response', label: 'No response' },
                    { value: 'Requirements changed', label: 'Requirements changed' },
                    { value: 'Project cancelled', label: 'Project cancelled' },
                    { value: 'Other', label: 'Other' },
                  ]}
                  required
                />
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontWeight: 750 }}>
                    ADDITIONAL NOTES <span style={{ color: 'var(--red)', fontWeight: 800 }}>* (Required)</span>
                  </label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={handoverForm.additionalNotes}
                    onChange={(e) => setHandoverForm((p) => ({ ...p, additionalNotes: e.target.value }))}
                    placeholder="Enter mandatory reason notes, client feedback, or lost justification..."
                    disabled={handoverMut.isPending}
                    style={{ resize: 'vertical' }}
                    required
                  />
                  {!handoverForm.additionalNotes.trim() && (
                    <span style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4, display: 'block' }}>
                      * Please enter additional notes / remarks to mark this lead as not interested.
                    </span>
                  )}
                </div>
              </div>
            )}

          </div>
        )}
      </Modal>

      {/* ── Status Comment / Remarks Modal ── */}
      <Modal
        open={!!statusPromptTask}
        onClose={() => setStatusPromptTask(null)}
        title={
          statusPromptTask?.targetStatus === 'in_progress'
            ? 'Move Task to In Progress'
            : statusPromptTask?.targetStatus === 'review'
            ? 'Submit Task for Review'
            : 'Update Task Status'
        }
        headerActions={statusPromptTask?.task ? <span className="handover-taskno-pill">{statusPromptTask.task.taskNo}</span> : undefined}
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, width: '100%' }}>
            <button className="btn btn-cancel" onClick={() => setStatusPromptTask(null)} disabled={statusMut.isPending}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                if (statusPromptTask) {
                  statusMut.mutate({
                    id: statusPromptTask.task._id,
                    status: statusPromptTask.targetStatus,
                    comment: statusPromptTask.comment.trim(),
                    statusDate: statusPromptTask.statusDate,
                    statusTime: statusPromptTask.statusTime,
                  });
                }
              }}
              disabled={statusMut.isPending}
            >
              {statusMut.isPending ? (
                <Spinner size={14} />
              ) : statusPromptTask?.targetStatus === 'in_progress' ? (
                <Play size={14} />
              ) : (
                <Clock size={14} />
              )}
              {statusPromptTask?.targetStatus === 'in_progress'
                ? 'Start / In Progress'
                : statusPromptTask?.targetStatus === 'review'
                ? 'Submit for Review'
                : 'Confirm Update'}
            </button>
          </div>
        }
      >
        {statusPromptTask && (
          <div className="handover-modal-body">
            {/* Task Info Bar */}
            <div className="handover-info-bar">
              <span className="handover-info-title">{statusPromptTask.task.title || 'Task'}</span>
              <div className="handover-info-flow">
                <span className="handover-flow-dot" style={{ background: '#f59e0b' }} />
                <span className="handover-flow-label">
                  {statusPromptTask.task.status ? statusPromptTask.task.status.charAt(0).toUpperCase() + statusPromptTask.task.status.slice(1).replace(/_/g, ' ') : 'To Do'}
                </span>
                <ArrowRight size={12} style={{ color: 'var(--tx-4)' }} />
                <span
                  className="handover-flow-dot"
                  style={{ background: statusPromptTask.targetStatus === 'in_progress' ? '#3b82f6' : '#8b5cf6' }}
                />
                <span className="handover-flow-label">
                  {statusPromptTask.targetStatus.charAt(0).toUpperCase() + statusPromptTask.targetStatus.slice(1).replace(/_/g, ' ')}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 10, marginTop: 12 }}>
                <InputField
                  label="STATUS UPDATE DATE *"
                  value={statusPromptTask.statusDate || ''}
                  onChange={(v) => setStatusPromptTask((p) => p ? ({ ...p, statusDate: v }) : null)}
                  type="date"
                  required
                />
                <InputField
                  label="STATUS UPDATE TIME *"
                  value={statusPromptTask.statusTime || ''}
                  onChange={(v) => setStatusPromptTask((p) => p ? ({ ...p, statusTime: v }) : null)}
                  type="time"
                  required
                />
              </div>
            </div>

            <div className="form-group" style={{ marginTop: 14, marginBottom: 0 }}>
              <label className="form-label" style={{ fontWeight: 700 }}>
                {statusPromptTask.targetStatus === 'in_progress'
                  ? 'WORK NOTES / COMMENTS (OPTIONAL)'
                  : 'REVIEW SUBMISSION NOTES / COMMENTS (OPTIONAL)'}
              </label>
              <textarea
                className="form-control"
                rows={4}
                value={statusPromptTask.comment}
                onChange={(e) => setStatusPromptTask((p) => p ? ({ ...p, comment: e.target.value }) : null)}
                placeholder={
                  statusPromptTask.targetStatus === 'in_progress'
                    ? 'Enter current work progress, preliminary findings, or execution plan...'
                    : 'Enter summary of completed work submitted for manager / peer review...'
                }
                disabled={statusMut.isPending}
                style={{ resize: 'vertical', width: '100%', minHeight: 90 }}
                autoFocus
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Task History & Audit Lifecycle Modal ── */}
      <Modal
        open={!!historyTask}
        onClose={() => setHistoryTask(null)}
        title="Task Audit & Lifecycle History"
        headerActions={
          historyTask ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="handover-taskno-pill">{historyTask.taskNo}</span>
              <Badge status={historyTask.status} />
            </div>
          ) : undefined
        }
        size="xl"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <button className="btn btn-secondary" onClick={() => setHistoryTask(null)}>
              Close
            </button>
          </div>
        }
      >
        {historyTask && (() => {
          const timeline = getTaskTimeline(historyTask);
          const customerName = typeof historyTask.customer === 'object' && historyTask.customer ? (historyTask.customer as any).name : undefined;
          const leadId = typeof historyTask.lead === 'object' && historyTask.lead ? (historyTask.lead as any).leadId : undefined;

          return (
            <div className="task-history-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%' }}>
              {/* Task Header Summary Card */}
              <div
                style={{
                  padding: '12px 18px',
                  borderRadius: 10,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--tx-1)' }}>
                    {historyTask.title || 'Task'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4, fontSize: 12, color: 'var(--tx-3)', flexWrap: 'wrap' }}>
                    {customerName && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                        <MapPin size={13} style={{ color: 'var(--brand)' }} />
                        <strong>Client:</strong> {customerName}
                      </span>
                    )}
                    {leadId && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                        <Tag size={13} style={{ color: 'var(--brand)' }} />
                        <strong>Lead:</strong> {leadId}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--tx-3)', whiteSpace: 'nowrap' }}>Priority:</span>
                  <Badge status={historyTask.priority} />
                </div>
              </div>

              {/* Recent Activities Section Header */}
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--tx-1)', marginBottom: 4 }}>
                  Recent Activities
                </div>
                <div style={{ width: 48, height: 3, background: 'var(--brand)', borderRadius: 2, marginBottom: 12 }} />

                {/* Table Layout with single line headers and cells */}
                <div className="table-responsive" style={{ border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
                  <table className="data-table" style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: 'var(--brand)', borderBottom: 'none' }}>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Date / Time</th>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Assigned By / To</th>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Follow-Up Type</th>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Next Follow-Up</th>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Description</th>
                         <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', textAlign: 'center' }}>Status</th>
                        <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 800, color: '#ffffff', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap', textAlign: 'center' }}>Updated At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {timeline.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--tx-4)' }}>
                            No activity records found
                          </td>
                        </tr>
                      ) : (
                        timeline.map((item, index) => {
                          return (
                            <tr
                              key={item.id || index}
                              style={{
                                borderBottom: index === timeline.length - 1 ? 'none' : '1px solid var(--border)',
                                background: index % 2 === 0 ? 'var(--surface-1)' : 'var(--surface-2)',
                              }}
                            >
                              <td style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--tx-1)' }}>
                                <div style={{ fontWeight: 800 }}>{fmt.date(item.date)}</div>
                                <div style={{ fontSize: 11, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', fontWeight: 650, marginTop: 2 }}>
                                  {fmt.time(item.date)}
                                </div>
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 750, whiteSpace: 'nowrap', color: 'var(--tx-1)' }}>
                                {item.actorName || '—'}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--tx-2)' }}>
                                {item.followUpType || '—'}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: 12.5, fontWeight: 650, whiteSpace: 'nowrap', color: item.nextDueDate ? 'var(--brand)' : 'var(--tx-4)' }}>
                                {item.nextDueDate ? fmt.date(item.nextDueDate) : '—'}
                              </td>
                              <td style={{ padding: '12px 16px', fontSize: 12.5, color: 'var(--tx-2)', minWidth: 160 }}>
                                {item.description && item.description !== '—' ? item.description : '—'}
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <span
                                  className={`badge ${item.badgeStatus || 'badge-purple'}`}
                                  style={{
                                    fontSize: 10.5,
                                    fontWeight: 800,
                                    letterSpacing: 0.5,
                                    padding: '4px 10px',
                                    borderRadius: 6,
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  {item.actionLabel}
                                </span>
                              </td>
                              <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <div style={{ fontWeight: 800, fontSize: 12 }}>{fmt.date(item.statusUpdatedAt || item.date)}</div>
                                <div style={{ fontSize: 10.5, color: 'var(--tx-4)', fontFamily: 'var(--font-mono)', fontWeight: 650, marginTop: 2 }}>
                                  {fmt.time(item.statusUpdatedAt || item.date)}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        title="Delete Task"
        message="This task will be removed from active task lists. Continue?"
        onConfirm={() => deleteId && deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        loading={deleteMut.isPending}
      />
    </div>
  );
};

export default TasksPage;
