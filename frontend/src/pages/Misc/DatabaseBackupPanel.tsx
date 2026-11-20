import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  HardDrive,
  Save,
  RefreshCw,
  Download,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Clock,
  ShieldAlert,
  ChevronDown,
  ShieldCheck,
  FileArchive,
  Mail,
  Sliders,
  Database,
  Check,
} from 'lucide-react';
import api from '../../utils/api';
import {
  InputField,
  SelectField,
  Spinner,
  Modal,
  Badge,
  EmptyState,
  SkeletonRow,
  Pagination,
} from '../../components/ui';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { isSuperOrFullAdmin } from '../../utils/rbac';

export interface BackupHistoryItem {
  _id: string;
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  triggerType: 'Scheduled' | 'Manual';
  status: 'Success' | 'Failed';
  recipientEmail: string;
  errorMessage?: string;
  timestamp: string;
}

export interface BackupSettingsData {
  automatedBackups: boolean;
  recipientEmail: string;
  frequency: 'Every day' | 'Every week' | 'Every 2 weeks' | 'Every month';
  executionTime: string;
  timezone: string;
  retentionCount: number;
  lastRunAt?: string;
  lastRunStatus?: 'Success' | 'Failed';
  lastRunFileName?: string;
  lastRunFileSize?: string;
}

export interface SchedulerStatusData {
  active: boolean;
  frequency: string;
  executionTime: string;
  executionTime12h?: string;
  timezone: string;
  nextScheduledRun: string | null;
  lastRunAt: string | null;
  lastRunStatus: string | null;
}

const FREQUENCY_OPTIONS = [
  { value: 'Every day', label: 'Every day (Daily off-peak run)' },
  { value: 'Every week', label: 'Every week (Weekly on Sundays)' },
  { value: 'Every 2 weeks', label: 'Every 2 weeks (Fortnightly on alternate Sundays)' },
  { value: 'Every month', label: 'Every month (Monthly on the 1st)' },
];

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Qatar', label: 'Asia/Qatar (UTC+03:00) — Doha, Qatar' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (UTC+04:00) — United Arab Emirates' },
  { value: 'Asia/Riyadh', label: 'Asia/Riyadh (UTC+03:00) — Saudi Arabia' },
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (UTC+05:30) — India Standard Time' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
];

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const val = String(i + 1).padStart(2, '0');
  return { value: val, label: val };
});

const BASE_MINUTES = [
  '00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'
];
const MINUTE_OPTIONS = BASE_MINUTES.map((m) => ({ value: m, label: m }));

/**
 * Parses any 24h or 12h time string into 12-hour components: hour (01-12), minute (00-59), and period (AM/PM).
 */
export const parseTimeTo12h = (
  timeStr?: string
): { hour: string; minute: string; period: 'AM' | 'PM' } => {
  if (!timeStr) return { hour: '02', minute: '00', period: 'AM' };
  const trimmed = timeStr.trim().toUpperCase();

  const match12 = trimmed.match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/);
  if (match12) {
    return {
      hour: match12[1].padStart(2, '0'),
      minute: match12[2],
      period: match12[3] as 'AM' | 'PM',
    };
  }

  const match24 = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (match24) {
    let h = parseInt(match24[1], 10);
    const m = match24[2];
    const period = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return {
      hour: h.toString().padStart(2, '0'),
      minute: m,
      period,
    };
  }

  return { hour: '02', minute: '00', period: 'AM' };
};

/**
 * Converts 12-hour components back into 24-hour HH:mm string.
 */
export const formatTo24h = (hour: string, minute: string, period: 'AM' | 'PM'): string => {
  let h = parseInt(hour, 10);
  if (period === 'AM') {
    if (h === 12) h = 0;
  } else {
    if (h !== 12) h += 12;
  }
  return `${h.toString().padStart(2, '0')}:${minute.padStart(2, '0')}`;
};

export const DatabaseBackupPanel: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const isAuthorized = isSuperOrFullAdmin(user);

  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [lastSuccessNotice, setLastSuccessNotice] = useState<{
    fileName: string;
    fileSizeFormatted: string;
    timestamp: string;
  } | null>(null);

  // Form State
  const [formData, setFormData] = useState<BackupSettingsData>({
    automatedBackups: false,
    recipientEmail: '',
    frequency: 'Every day',
    executionTime: '02:00',
    timezone: 'Asia/Qatar',
    retentionCount: 14,
  });

  // 12-Hour AM/PM State
  const [time12, setTime12] = useState<{ hour: string; minute: string; period: 'AM' | 'PM' }>({
    hour: '02',
    minute: '00',
    period: 'AM',
  });

  const minuteOptions = React.useMemo(() => {
    if (time12.minute && !BASE_MINUTES.includes(time12.minute)) {
      return [...BASE_MINUTES, time12.minute].sort().map((m) => ({ value: m, label: m }));
    }
    return MINUTE_OPTIONS;
  }, [time12.minute]);

  // Query settings and scheduler metadata
  const { data: settingsData } = useQuery({
    queryKey: ['backup-settings'],
    queryFn: async () => {
      const res = await api.get('/backup/settings');
      return res.data.data as {
        settings: BackupSettingsData;
        scheduler: SchedulerStatusData;
      };
    },
    enabled: isAuthorized,
  });

  // Sync loaded settings into local form state
  React.useEffect(() => {
    if (settingsData?.settings) {
      const parsedTime = parseTimeTo12h(settingsData.settings.executionTime);
      setTime12(parsedTime);

      setFormData({
        automatedBackups: Boolean(settingsData.settings.automatedBackups),
        recipientEmail: settingsData.settings.recipientEmail || '',
        frequency: settingsData.settings.frequency || 'Every day',
        executionTime: settingsData.settings.executionTime || '02:00',
        timezone: settingsData.settings.timezone || 'Asia/Qatar',
        retentionCount: settingsData.settings.retentionCount || 14,
        lastRunAt: settingsData.settings.lastRunAt,
        lastRunStatus: settingsData.settings.lastRunStatus,
        lastRunFileName: settingsData.settings.lastRunFileName,
        lastRunFileSize: settingsData.settings.lastRunFileSize,
      });
    }
  }, [settingsData]);

  // Query paginated backup history
  const { data: historyData, isLoading: isLoadingHistory, refetch: refetchHistory } = useQuery({
    queryKey: ['backup-history', page],
    queryFn: async () => {
      const res = await api.get(`/backup/history?page=${page}&limit=10`);
      return res.data as {
        success: boolean;
        data: BackupHistoryItem[];
        pagination: { total: number; page: number; pages: number; limit: number };
      };
    },
    enabled: isAuthorized,
  });

  // Save Settings Mutation
  const saveSettingsMut = useMutation({
    mutationFn: async (payload: BackupSettingsData) => {
      const res = await api.post('/backup/settings', payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Backup settings saved and scheduler reloaded');
      queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to update backup settings');
    },
  });

  // Manual Trigger Mutation ("Generate & Email Full Backup Now")
  const manualBackupMut = useMutation({
    mutationFn: async () => {
      const res = await api.post('/backup/test', {
        recipientEmail: formData.recipientEmail,
      });
      return res.data;
    },
    onSuccess: (data) => {
      const record = data?.data;
      if (record) {
        setLastSuccessNotice({
          fileName: record.fileName,
          fileSizeFormatted: record.fileSizeFormatted,
          timestamp: new Date().toLocaleTimeString(),
        });
      }
      toast.success(data?.message || 'Full backup generated and dispatched successfully');
      queryClient.invalidateQueries({ queryKey: ['backup-settings'] });
      queryClient.invalidateQueries({ queryKey: ['backup-history'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to generate manual backup');
    },
  });

  // Delete Backup Record Mutation
  const deleteBackupMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/backup/history/${id}`);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Backup record and archive file deleted successfully');
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ['backup-history'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to delete backup record');
    },
  });

  // Download Backup Archive with token authorization
  const handleDownload = async (item: BackupHistoryItem) => {
    try {
      toast.loading(`Preparing download: ${item.fileName}...`, { id: 'backup-download' });
      const res = await api.get(`/backup/download/${item._id}`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/gzip' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = item.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);
      toast.success('Download started', { id: 'backup-download' });
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Failed to download backup archive', {
        id: 'backup-download',
      });
    }
  };

  if (!isAuthorized) {
    return (
      <div className="settings-card">
        <div className="p-8 text-center">
          <div className="inline-flex p-3 rounded-full bg-red-50 text-red-600 mb-3">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Access Restricted</h2>
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Database Backup & Scheduling is restricted to <strong>Super Admin</strong> and{' '}
            <strong>Full Admin</strong> roles. Please contact system management for disaster recovery
            privileges.
          </p>
        </div>
      </div>
    );
  }

  const scheduler = settingsData?.scheduler;
  const isSchedulerActive = Boolean(formData.automatedBackups);
  const latestSuccessItem = historyData?.data?.find((i) => i.status === 'Success');

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* ── KPI METRICS STRIP ── */}
      <div className="kpi-grid" style={{ marginBottom: 4 }}>
        <div className="kpi-card fade-in-up" style={{ animationDelay: '0ms' }}>
          <div className="kpi-icon-wrap" style={{ background: 'var(--brand-light)' }}>
            <span style={{ color: 'var(--brand)' }}>
              <HardDrive size={20} />
            </span>
          </div>
          <div className="kpi-label">TOTAL ARCHIVES</div>
          <div className="kpi-value">{historyData?.pagination?.total ?? 0}</div>
          <div className="kpi-change" style={{ background: 'var(--surface-3)', color: 'var(--tx-3)' }}>
            VPS disk storage
          </div>
        </div>

        <div className="kpi-card fade-in-up" style={{ animationDelay: '60ms' }}>
          <div
            className="kpi-icon-wrap"
            style={{ background: isSchedulerActive ? 'var(--green-bg)' : 'var(--surface-3)' }}
          >
            <span style={{ color: isSchedulerActive ? 'var(--green)' : 'var(--tx-4)' }}>
              <Clock size={20} />
            </span>
          </div>
          <div className="kpi-label">DAEMON STATUS</div>
          <div
            className="kpi-value"
            style={{
              fontSize: 22,
              color: isSchedulerActive ? 'var(--green)' : 'var(--tx-3)',
            }}
          >
            {isSchedulerActive ? 'Active' : 'Disabled'}
          </div>
          <div
            className="kpi-change"
            style={{
              background: isSchedulerActive ? 'var(--green-bg)' : 'var(--surface-3)',
              color: isSchedulerActive ? 'var(--green)' : 'var(--tx-4)',
            }}
          >
            {isSchedulerActive
              ? `${time12.hour}:${time12.minute} ${time12.period} Qatar`
              : 'Manual on-demand'}
          </div>
        </div>

        <div className="kpi-card fade-in-up" style={{ animationDelay: '120ms' }}>
          <div className="kpi-icon-wrap" style={{ background: 'var(--teal-bg)' }}>
            <span style={{ color: 'var(--teal)' }}>
              <ShieldCheck size={20} />
            </span>
          </div>
          <div className="kpi-label">AUTO-RETENTION</div>
          <div className="kpi-value">14 Copies</div>
          <div className="kpi-change" style={{ background: 'var(--surface-3)', color: 'var(--tx-3)' }}>
            Auto-pruned retention
          </div>
        </div>

        <div className="kpi-card fade-in-up" style={{ animationDelay: '180ms' }}>
          <div
            className="kpi-icon-wrap"
            style={{ background: 'color-mix(in srgb, var(--brand) 12%, transparent)' }}
          >
            <span style={{ color: 'var(--brand)' }}>
              <CheckCircle2 size={20} />
            </span>
          </div>
          <div className="kpi-label">LATEST ARCHIVE</div>
          <div className="kpi-value" style={{ fontSize: 20 }}>
            {latestSuccessItem?.fileSizeFormatted ||
              settingsData?.settings?.lastRunFileSize ||
              'Ready'}
          </div>
          <div className="kpi-change" style={{ background: 'var(--surface-3)', color: 'var(--tx-3)' }}>
            Native gzip BSON
          </div>
        </div>
      </div>

      {/* ── CARD 1: BACKUP SCHEDULE & DELIVERY CONFIGURATION ── */}
      <div className="settings-card">
        {/* Header Banner */}
        <div className="settings-card-header-banner">
          <div className="banner-left">
            <div className="banner-tag">
              <Database size={13} /> DISASTER RECOVERY & ARCHIVAL
            </div>
            <div className="banner-title">Database Backup & Scheduling</div>
          </div>
          <div className="banner-chips">
            <div
              className={`banner-chip ${
                isSchedulerActive ? 'banner-chip-active' : 'banner-chip-inactive'
              }`}
            >
              <span
                className={`status-dot ${
                  isSchedulerActive ? 'status-dot-active' : 'status-dot-inactive'
                }`}
              />
              <span className="chip-label">DAEMON:</span>
              <span className="chip-value">
                {isSchedulerActive ? 'ACTIVE (SCHEDULED)' : 'DISABLED'}
              </span>
            </div>
            <div className="banner-chip">
              <span className="chip-label">RETENTION:</span>
              <span className="chip-value">LAST 14 COPIES</span>
            </div>
            <div className="banner-chip">
              <span className="chip-label">TIMEZONE:</span>
              <span className="chip-value">{formData.timezone}</span>
            </div>
          </div>
        </div>

        {/* Card Body */}
        <div className="settings-card-body space-y-6">
          {/* Real-time Confirmation / Status Banner */}
          {lastSuccessNotice && (
            <div
              style={{
                padding: '14px 18px',
                borderRadius: 12,
                background: 'color-mix(in srgb, var(--green, #10b981) 10%, var(--surface))',
                border: '1px solid color-mix(in srgb, var(--green, #10b981) 25%, transparent)',
                color: 'var(--tx-1)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                fontSize: 12,
                lineHeight: 1.5,
              }}
            >
              <CheckCircle2
                size={18}
                style={{ color: 'var(--green, #10b981)', flexShrink: 0, marginTop: 2 }}
              />
              <div>
                <strong style={{ color: 'var(--green, #10b981)', fontWeight: 800 }}>
                  Full Database Backup Dispatched Successfully!
                </strong>
                <div style={{ marginTop: 4, color: 'var(--tx-2)' }}>
                  File:{' '}
                  <code
                    style={{
                      fontFamily: 'var(--font-mono)',
                      background: 'color-mix(in srgb, var(--green, #10b981) 14%, var(--surface))',
                      color: 'var(--green, #047857)',
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontSize: 11,
                    }}
                  >
                    {lastSuccessNotice.fileName}
                  </code>{' '}
                  &bull; Size: <strong>{lastSuccessNotice.fileSizeFormatted}</strong> &bull;
                  Completed at: {lastSuccessNotice.timestamp}
                </div>
              </div>
            </div>
          )}

          {/* Scheduler Next Run Info */}
          {scheduler?.nextScheduledRun && formData.automatedBackups && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '12px',
                background: 'color-mix(in srgb, var(--brand) 7%, var(--surface))',
                border: '1px solid color-mix(in srgb, var(--brand) 22%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: 'color-mix(in srgb, var(--brand) 16%, transparent)',
                    color: 'var(--brand)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Clock size={15} />
                </div>
                <div>
                  <span style={{ color: 'var(--tx-3)', fontWeight: 600 }}>
                    Next Scheduled Automated Run:{' '}
                  </span>
                  <strong style={{ color: 'var(--brand)', fontFamily: 'var(--font-mono)' }}>
                    {scheduler.nextScheduledRun}
                  </strong>
                </div>
              </div>
              <span
                className="badge badge-blue"
                style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase' }}
              >
                Off-Peak Execution Window
              </span>
            </div>
          )}

          {/* Toggle Switch Hero Card: Automated Database Backups */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderRadius: 14,
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              gap: 16,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: isSchedulerActive
                    ? 'color-mix(in srgb, var(--brand) 14%, transparent)'
                    : 'var(--surface-3)',
                  color: isSchedulerActive ? 'var(--brand)' : 'var(--tx-4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'all 0.2s ease',
                }}
              >
                <Calendar size={20} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--tx-1)' }}>
                    Automated Database Backups
                  </span>
                  <span
                    className={`badge ${isSchedulerActive ? 'badge-green' : 'badge-neutral'}`}
                    style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}
                  >
                    {isSchedulerActive ? 'DAEMON ACTIVE' : 'PAUSED'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx-3)', marginTop: 2 }}>
                  Automatically execute native mongodump binary streams on the configured schedule.
                </div>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                aria-label="Automated Database Backups"
                className="sr-only peer"
                checked={formData.automatedBackups}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, automatedBackups: e.target.checked }))
                }
              />
              <div
                className="w-12 h-6.5 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2.5px] after:left-[3px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all after:shadow-sm peer-checked:bg-[var(--brand)] transition-colors"
                style={formData.automatedBackups ? { backgroundColor: 'var(--brand)' } : undefined}
              />
            </label>
          </div>

          {/* Configuration Form Grid */}
          <div className="form-section-title">
            <Sliders size={14} className="text-brand" />
            Backup Schedule & Delivery Configuration
          </div>

          <div className="form-grid-2">
            <div>
              <InputField
                label="RECIPIENT EMAIL ADDRESS"
                placeholder="e.g. backup@welcometech.qa"
                value={formData.recipientEmail}
                onChange={(v) => setFormData((prev) => ({ ...prev, recipientEmail: v }))}
              />
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  color: 'var(--tx-4)',
                  marginTop: 4,
                }}
              >
                <Mail size={12} className="text-brand shrink-0" />
                Target email where backup archives (&le; 14 MB) or audit reports are delivered.
              </span>
            </div>

            <SelectField
              label="BACKUP FREQUENCY"
              value={formData.frequency}
              onChange={(v) =>
                setFormData((prev) => ({
                  ...prev,
                  frequency: v as BackupSettingsData['frequency'],
                }))
              }
              options={FREQUENCY_OPTIONS}
            />

            {/* 12-Hour AM/PM Time Selector */}
            <div className="form-group">
              <div className="flex items-center justify-between mb-1">
                <label className="form-label" style={{ margin: 0 }}>
                  BACKUP EXECUTION TIME
                </label>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-2 py-0.5 rounded-full border border-purple-200/60 dark:border-purple-800/60">
                  Off-Peak Qatar
                </span>
              </div>

              <div className="grid grid-cols-12 gap-2 items-center">
                {/* Time Selectors Container: 7 cols */}
                <div className="col-span-7 flex items-center h-[38px] px-3 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-xs focus-within:border-purple-600 focus-within:ring-2 focus-within:ring-purple-500/15 transition-all">
                  <Clock size={15} className="text-purple-600 dark:text-purple-400 shrink-0 mr-2" />

                  {/* Hour Selector */}
                  <div className="relative flex items-center flex-1">
                    <select
                      aria-label="Backup Hour"
                      value={time12.hour}
                      onChange={(e) => {
                        const next = { ...time12, hour: e.target.value };
                        setTime12(next);
                        setFormData((prev) => ({
                          ...prev,
                          executionTime: formatTo24h(next.hour, next.minute, next.period),
                        }));
                      }}
                      className="w-full bg-transparent border-0 outline-none text-xs font-bold font-mono text-slate-800 dark:text-slate-100 cursor-pointer appearance-none pr-3 py-1"
                    >
                      {HOUR_OPTIONS.map((h) => (
                        <option
                          key={h.value}
                          value={h.value}
                          className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold font-mono"
                        >
                          {h.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={11} className="absolute right-0 pointer-events-none text-slate-400" />
                  </div>

                  <span className="font-extrabold text-slate-400 dark:text-slate-500 text-xs mx-1.5 select-none">:</span>

                  {/* Minute Selector */}
                  <div className="relative flex items-center flex-1">
                    <select
                      aria-label="Backup Minute"
                      value={time12.minute}
                      onChange={(e) => {
                        const next = { ...time12, minute: e.target.value };
                        setTime12(next);
                        setFormData((prev) => ({
                          ...prev,
                          executionTime: formatTo24h(next.hour, next.minute, next.period),
                        }));
                      }}
                      className="w-full bg-transparent border-0 outline-none text-xs font-bold font-mono text-slate-800 dark:text-slate-100 cursor-pointer appearance-none pr-3 py-1"
                    >
                      {minuteOptions.map((m) => (
                        <option
                          key={m.value}
                          value={m.value}
                          className="bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-semibold font-mono"
                        >
                          {m.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={11} className="absolute right-0 pointer-events-none text-slate-400" />
                  </div>
                </div>

                {/* AM / PM Segmented Toggle: 5 cols */}
                <div className="col-span-5 flex items-center h-[38px] p-1 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-100 dark:bg-slate-800/80">
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...time12, period: 'AM' as const };
                      setTime12(next);
                      setFormData((prev) => ({
                        ...prev,
                        executionTime: formatTo24h(next.hour, next.minute, next.period),
                      }));
                    }}
                    className={`flex-1 h-full rounded-lg text-xs font-bold tracking-wider transition-all duration-150 flex items-center justify-center ${
                      time12.period === 'AM'
                        ? 'bg-purple-600 text-white shadow-xs font-extrabold'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                    style={time12.period === 'AM' ? { backgroundColor: 'var(--brand, #7c3aed)' } : undefined}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = { ...time12, period: 'PM' as const };
                      setTime12(next);
                      setFormData((prev) => ({
                        ...prev,
                        executionTime: formatTo24h(next.hour, next.minute, next.period),
                      }));
                    }}
                    className={`flex-1 h-full rounded-lg text-xs font-bold tracking-wider transition-all duration-150 flex items-center justify-center ${
                      time12.period === 'PM'
                        ? 'bg-purple-600 text-white shadow-xs font-extrabold'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                    style={time12.period === 'PM' ? { backgroundColor: 'var(--brand, #7c3aed)' } : undefined}
                  >
                    PM
                  </button>
                </div>
              </div>

              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  fontSize: 11,
                  color: 'var(--tx-4)',
                  marginTop: 4,
                }}
              >
                <Clock size={11} className="text-brand shrink-0" />
                Off-peak scheduled execution:{' '}
                <strong style={{ color: 'var(--tx-1)', fontFamily: 'var(--font-mono)' }}>
                  {time12.hour}:{time12.minute} {time12.period}
                </strong>{' '}
                ({formData.timezone})
              </span>
            </div>

            <SelectField
              label="EXECUTION TIMEZONE"
              value={formData.timezone}
              onChange={(v) => setFormData((prev) => ({ ...prev, timezone: v }))}
              options={TIMEZONE_OPTIONS}
            />
          </div>
        </div>

        {/* Card Footer Actions */}
        <div className="settings-card-footer flex items-center justify-between flex-wrap gap-3">
          <button
            type="button"
            className="btn btn-secondary flex items-center gap-2"
            disabled={manualBackupMut.isPending}
            onClick={() => manualBackupMut.mutate()}
          >
            {manualBackupMut.isPending ? (
              <RefreshCw size={14} className="animate-spin text-brand" />
            ) : (
              <RefreshCw size={14} />
            )}
            <span>
              {manualBackupMut.isPending
                ? 'Generating & Verifying Backup...'
                : 'Generate & Email Full Backup Now'}
            </span>
          </button>

          <button
            type="button"
            className="btn btn-primary flex items-center gap-2"
            disabled={saveSettingsMut.isPending}
            onClick={() => saveSettingsMut.mutate(formData)}
          >
            {saveSettingsMut.isPending ? (
              <Spinner size={14} />
            ) : (
              <Save size={14} />
            )}
            <span>Save Backup Settings</span>
          </button>
        </div>
      </div>

      {/* ── CARD 2: BACKUP EXECUTION HISTORY ── */}
      <div className="settings-card">
        <div className="settings-card-header-banner">
          <div className="banner-left">
            <div className="banner-tag">
              <Clock size={13} /> AUDIT LOG & ARCHIVE STORAGE
            </div>
            <div className="banner-title">Backup Execution History</div>
          </div>
          <div className="banner-chips">
            <div className="banner-chip">
              <span className="chip-label">TOTAL RECORDS:</span>
              <span className="chip-value">{historyData?.pagination?.total || 0}</span>
            </div>
            <button
              type="button"
              onClick={() => refetchHistory()}
              className="btn btn-secondary btn-xs flex items-center gap-1.5"
            >
              <RefreshCw size={12} className={isLoadingHistory ? 'animate-spin' : ''} />
              Refresh Logs
            </button>
          </div>
        </div>

        <div className="tbl-wrap" style={{ overflowX: 'auto' }}>
          <table className="table-pro table-center">
            <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
              <tr>
                <th className="sno-col">S NO</th>
                <th>STATUS</th>
                <th>EXECUTION DATE</th>
                <th>TRIGGER</th>
                <th>FILE ARCHIVE</th>
                <th>FILE SIZE</th>
                <th>RECIPIENT</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {isLoadingHistory ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={8} />)
              ) : !historyData?.data || historyData.data.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <EmptyState
                      icon={<HardDrive size={24} />}
                      title="No backup records found"
                      description='Click "Generate & Email Full Backup Now" above to create an archive.'
                    />
                  </td>
                </tr>
              ) : (
                historyData.data.map((item, idx) => {
                  const isSuccess = item.status === 'Success';
                  const formattedDate = new Date(item.timestamp).toLocaleString('en-US', {
                    timeZone: formData.timezone || 'Asia/Qatar',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  });

                  return (
                    <tr key={item._id}>
                      <td className="sno-col">{(page - 1) * 10 + idx + 1}</td>
                      <td>
                        <Badge
                          status={isSuccess ? 'active' : 'expired'}
                          label={item.status}
                          dot={true}
                        />
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--tx-2)' }}>
                        {formattedDate}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            item.triggerType === 'Scheduled' ? 'badge-blue' : 'badge-neutral'
                          }`}
                          style={{
                            fontSize: 10.5,
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            ...(item.triggerType === 'Manual'
                              ? {
                                  background: 'color-mix(in srgb, var(--brand) 12%, transparent)',
                                  color: 'var(--brand)',
                                  borderColor: 'color-mix(in srgb, var(--brand) 25%, transparent)',
                                }
                              : {}),
                          }}
                        >
                          {item.triggerType}
                        </span>
                      </td>
                      <td
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11.5,
                          color: 'var(--brand)',
                          fontWeight: 700,
                          maxWidth: 240,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.fileName}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <FileArchive size={13} style={{ color: 'var(--brand)', flexShrink: 0 }} />
                          {item.fileName}
                        </span>
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 12 }}>
                        {item.fileSizeFormatted}
                      </td>
                      <td
                        style={{
                          fontSize: 11.5,
                          color: 'var(--tx-3)',
                          maxWidth: 180,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.recipientEmail}
                      >
                        {item.recipientEmail || '—'}
                      </td>
                      <td>
                        <div className="table-actions">
                          {isSuccess && (
                            <button
                              type="button"
                              onClick={() => handleDownload(item)}
                              className="btn-action btn-action-brand"
                              title="Download .archive.gz"
                            >
                              <Download size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteId(item._id)}
                            className="btn-action btn-action-red"
                            title="Delete Backup Record & Physical Archive"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Global Pagination Bar */}
        {historyData?.pagination && historyData.pagination.total > 0 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 18px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <div style={{ fontSize: 12, color: 'var(--tx-4)' }}>
              Showing {(page - 1) * 10 + 1}–{Math.min(page * 10, historyData.pagination.total)} of{' '}
              {historyData.pagination.total} records
            </div>
            {historyData.pagination.pages > 1 && (
              <Pagination
                currentPage={page}
                totalPages={historyData.pagination.pages}
                onPageChange={(p) => setPage(p)}
              />
            )}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        open={Boolean(deleteId)}
        onClose={() => setDeleteId(null)}
        title="Confirm Backup Deletion"
        size="md"
      >
        <div className="p-4 space-y-4 text-xs text-slate-600 dark:text-slate-300">
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 10,
              background: 'color-mix(in srgb, var(--red, #ef4444) 10%, var(--surface))',
              border: '1px solid color-mix(in srgb, var(--red, #ef4444) 25%, transparent)',
              color: 'var(--tx-1)',
            }}
          >
            <AlertCircle size={18} style={{ color: 'var(--red, #ef4444)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong style={{ color: 'var(--red, #ef4444)', fontWeight: 700 }}>
                Permanent Removal from VPS Storage
              </strong>
              <div style={{ marginTop: 2, color: 'var(--tx-2)' }}>
                This operation will unalterably unlink and delete the binary{' '}
                <code className="font-mono text-purple-700 dark:text-purple-300 font-bold">.archive.gz</code> file from the server disk.
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setDeleteId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={deleteBackupMut.isPending}
              onClick={() => deleteId && deleteBackupMut.mutate(deleteId)}
            >
              {deleteBackupMut.isPending ? 'Deleting...' : 'Delete Permanently'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DatabaseBackupPanel;
