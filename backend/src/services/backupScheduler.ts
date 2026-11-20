import BackupSetting, { IBackupSetting, BackupFrequency } from '../models/BackupSetting';
import { generateDatabaseBackup } from './backupService';

let schedulerInterval: NodeJS.Timeout | null = null;
let lastTriggeredKey: string | null = null;
let isJobRunning = false;

/**
 * Normalizes any valid time string (24h or 12h AM/PM) into standard 24-hour HH:mm.
 * Accepts: "02:00", "14:30", "02:00 AM", "2:00 PM", "11:45 PM", etc.
 */
export const normalizeExecutionTime = (raw?: string): string => {
  if (!raw) return '02:00';
  const trimmed = String(raw).trim();
  const match12 = trimmed.match(/^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i);
  if (match12) {
    let hour = parseInt(match12[1], 10);
    const minute = match12[2];
    const period = match12[3].toUpperCase();
    if (period === 'AM') {
      if (hour === 12) hour = 0;
    } else {
      if (hour !== 12) hour += 12;
    }
    return `${hour.toString().padStart(2, '0')}:${minute}`;
  }

  const match24 = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (match24) {
    const hour = parseInt(match24[1], 10).toString().padStart(2, '0');
    const minute = match24[2];
    return `${hour}:${minute}`;
  }

  return '02:00';
};

/**
 * Formats a 24-hour HH:mm string into a clean 12-hour AM/PM string (e.g. "02:00 AM", "02:00 PM").
 */
export const formatTo12h = (timeStr?: string): string => {
  const norm = normalizeExecutionTime(timeStr);
  const [hStr, mStr] = norm.split(':');
  let h = parseInt(hStr, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h.toString().padStart(2, '0')}:${mStr} ${period}`;
};

/**
 * Extracts wall-clock date/time components for a given timezone using Intl.DateTimeFormat.
 */
export const getTimeInTimezone = (
  date: Date,
  timeZone: string
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday, 1 = Monday, etc.
  timeString: string; // HH:mm (24h)
  dateString: string; // YYYY-MM-DD
} => {
  const safeTimezone = timeZone || 'Asia/Qatar';
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTimezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hour12: false,
  });

  const parts = dtf.formatToParts(date);
  const findPart = (type: string) => parts.find((p) => p.type === type)?.value || '';

  const weekdayStr = findPart('weekday');
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const hour = parseInt(findPart('hour'), 10) % 24;
  const minute = parseInt(findPart('minute'), 10);
  const year = parseInt(findPart('year'), 10);
  const month = parseInt(findPart('month'), 10);
  const day = parseInt(findPart('day'), 10);

  const pad = (n: number) => n.toString().padStart(2, '0');
  const timeString = `${pad(hour)}:${pad(minute)}`;
  const dateString = `${year}-${pad(month)}-${pad(day)}`;

  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday: weekdayMap[weekdayStr] ?? 0,
    timeString,
    dateString,
  };
};

/**
 * Checks whether the scheduled job should execute at the current wall-clock time
 * according to the configured frequency and executionTime.
 */
export const shouldRunBackupNow = (
  setting: IBackupSetting,
  currentDate = new Date()
): boolean => {
  if (!setting.automatedBackups) return false;

  const tz = setting.timezone || 'Asia/Qatar';
  const current = getTimeInTimezone(currentDate, tz);

  const targetTime = normalizeExecutionTime(setting.executionTime);
  if (current.timeString !== targetTime) {
    return false;
  }

  // Prevent multiple executions in the same minute
  const minuteKey = `${current.dateString}T${current.timeString}`;
  if (lastTriggeredKey === minuteKey) {
    return false;
  }

  switch (setting.frequency) {
    case 'Every day':
      return true;

    case 'Every week':
      // Runs on Sunday (weekday === 0)
      return current.weekday === 0;

    case 'Every 2 weeks':
      // Runs every alternate Sunday (e.g. week of year % 2 === 0 on Sunday)
      if (current.weekday !== 0) return false;
      const startOfYear = new Date(currentDate.getFullYear(), 0, 1);
      const weekNumber = Math.ceil(
        ((currentDate.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
      );
      return weekNumber % 2 === 0;

    case 'Every month':
      // Runs on the 1st of each month
      return current.day === 1;

    default:
      return false;
  }
};

/**
 * Calculates the next scheduled execution timestamp in readable format.
 */
export const calculateNextScheduledRun = (
  setting: IBackupSetting,
  referenceDate = new Date()
): { nextRunDate: Date; formattedNextRun: string } | null => {
  if (!setting.automatedBackups) return null;

  const tz = setting.timezone || 'Asia/Qatar';
  const [targetHour, targetMinute] = normalizeExecutionTime(setting.executionTime)
    .split(':')
    .map((v) => parseInt(v, 10));

  // Search forward minute by minute or day by day to find the next matching slot
  const testDate = new Date(referenceDate);
  testDate.setSeconds(0, 0);

  // Advance by 1 minute to avoid matching current minute if already executed
  testDate.setMinutes(testDate.getMinutes() + 1);

  // Maximum search window: 35 days
  for (let i = 0; i < 35 * 24 * 60; i++) {
    const current = getTimeInTimezone(testDate, tz);
    if (current.hour === targetHour && current.minute === targetMinute) {
      let matchesFrequency = false;
      switch (setting.frequency) {
        case 'Every day':
          matchesFrequency = true;
          break;
        case 'Every week':
          matchesFrequency = current.weekday === 0;
          break;
        case 'Every 2 weeks':
          if (current.weekday === 0) {
            const startOfYear = new Date(testDate.getFullYear(), 0, 1);
            const weekNumber = Math.ceil(
              ((testDate.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getDay() + 1) / 7
            );
            matchesFrequency = weekNumber % 2 === 0;
          }
          break;
        case 'Every month':
          matchesFrequency = current.day === 1;
          break;
      }

      if (matchesFrequency) {
        const formattedNextRun = testDate.toLocaleString('en-US', {
          timeZone: tz,
          dateStyle: 'medium',
          timeStyle: 'short',
        });
        return { nextRunDate: testDate, formattedNextRun: `${formattedNextRun} (${tz})` };
      }
    }
    // Fast jump by 30 minutes when far, or 1 minute when near
    testDate.setMinutes(testDate.getMinutes() + 1);
  }

  return null;
};

/**
 * Interval tick handler called every 30 seconds to evaluate schedule triggers.
 */
export const checkScheduleTick = async (): Promise<void> => {
  if (isJobRunning) return;

  try {
    const setting = await BackupSetting.findOne();
    if (!setting || !setting.automatedBackups) return;

    const now = new Date();
    if (shouldRunBackupNow(setting, now)) {
      const tz = setting.timezone || 'Asia/Qatar';
      const current = getTimeInTimezone(now, tz);
      lastTriggeredKey = `${current.dateString}T${current.timeString}`;

      isJobRunning = true;
      console.log(`[Backup Scheduler] Triggering automated backup at ${lastTriggeredKey} (${tz})`);

      try {
        await generateDatabaseBackup({
          triggerType: 'Scheduled',
          recipientEmail: setting.recipientEmail,
        });
        console.log(`[Backup Scheduler] Automated backup completed successfully.`);
      } catch (err: any) {
        console.error(`[Backup Scheduler] Error executing scheduled backup:`, err);
      } finally {
        isJobRunning = false;
      }
    }
  } catch (err) {
    console.error(`[Backup Scheduler] Error checking schedule tick:`, err);
  }
};

/**
 * Starts or restarts the in-memory scheduler interval.
 */
export const initBackupScheduler = async (): Promise<void> => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }

  // Check every 30 seconds for clock accuracy
  schedulerInterval = setInterval(checkScheduleTick, 30 * 1000);
  console.log('⏰ [Backup Scheduler] Initialized background backup scheduler daemon.');
};

/**
 * Hot-reloads the scheduler in memory without requiring a server reboot.
 */
export const reloadScheduler = async (): Promise<void> => {
  lastTriggeredKey = null;
  await initBackupScheduler();
};

/**
 * Stops the scheduler (useful for graceful shutdown or tests).
 */
export const stopScheduler = (): void => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
};

/**
 * Returns diagnostic metadata and current runtime status of the scheduler.
 */
export const getSchedulerStatus = async (): Promise<{
  active: boolean;
  frequency: BackupFrequency;
  executionTime: string;
  executionTime12h: string;
  timezone: string;
  nextScheduledRun: string | null;
  lastRunAt: Date | null;
  lastRunStatus: string | null;
}> => {
  const setting = await BackupSetting.findOne();
  if (!setting) {
    return {
      active: false,
      frequency: 'Every day',
      executionTime: '02:00',
      executionTime12h: '02:00 AM',
      timezone: 'Asia/Qatar',
      nextScheduledRun: null,
      lastRunAt: null,
      lastRunStatus: null,
    };
  }

  const nextRunInfo = calculateNextScheduledRun(setting);

  return {
    active: !!setting.automatedBackups,
    frequency: setting.frequency,
    executionTime: setting.executionTime,
    executionTime12h: formatTo12h(setting.executionTime),
    timezone: setting.timezone,
    nextScheduledRun: nextRunInfo?.formattedNextRun || null,
    lastRunAt: setting.lastRunAt || null,
    lastRunStatus: setting.lastRunStatus || null,
  };
};
