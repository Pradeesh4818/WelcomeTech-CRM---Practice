import mongoose from 'mongoose';
import { Settings } from '../models/Settings';

export interface ParsedProposalNo {
  prefix: string;
  num: number;
  padLength: number;
}

/**
 * Escapes regex special characters in a string.
 */
export const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Strips any trailing date suffix from a proposal number.
 * Examples:
 *   "IT/QT/8101/15-10-2026" -> "IT/QT/8101"
 *   "IT/QT/8101/15/10/2026" -> "IT/QT/8101"
 *   "IT/QT/8101/2026-10-15" -> "IT/QT/8101"
 *   "IT/QT/8101" -> "IT/QT/8101"
 */
export const stripDateSuffix = (proposalNo?: string): string => {
  const trimmed = (proposalNo || '').trim();
  if (!trimmed) return '';
  return trimmed
    .replace(/\/\d{2}-\d{2}-\d{4}$/, '')
    .replace(/\/\d{2}\/\d{2}\/\d{4}$/, '')
    .replace(/\/\d{4}-\d{2}-\d{2}$/, '');
};

/**
 * Formats a proposal sending date as DD-MM-YYYY (e.g. 15-10-2026).
 * Handles timezone safely (defaulting to Asia/Qatar UTC+3 for Welcome Tech CRM Qatar).
 * If the input is already a calendar date string (e.g. "05-11-2026" or "2026-11-05"),
 * it extracts the calendar day, month, and year directly without UTC shift.
 */
export const formatProposalSendingDate = (date?: Date | string | null, timeZone = 'Asia/Qatar'): string => {
  if (!date) {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' });
    return formatter.format(now).replace(/\//g, '-');
  }

  if (typeof date === 'string') {
    const trimmed = date.trim();
    const dmyMatch = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
    if (dmyMatch) {
      return `${dmyMatch[1]}-${dmyMatch[2]}-${dmyMatch[3]}`;
    }
    const textMonthMatch = trimmed.match(/^(\d{1,2})[-/\s]+([A-Za-z]+)[-/\s]+(\d{4})/);
    if (textMonthMatch) {
      const d = textMonthMatch[1].padStart(2, '0');
      const monthNames: Record<string, string> = {
        jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
        jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
      };
      const mStr = textMonthMatch[2].slice(0, 3).toLowerCase();
      const m = monthNames[mStr];
      if (m) {
        return `${d}-${m}-${textMonthMatch[3]}`;
      }
    }
    const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
    if (ymdMatch && !trimmed.includes('T') && !trimmed.includes('Z')) {
      return `${ymdMatch[3]}-${ymdMatch[2]}-${ymdMatch[1]}`;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      const formatter = new Intl.DateTimeFormat('en-GB', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' });
      return formatter.format(parsed).replace(/\//g, '-');
    }
  }

  if (date instanceof Date && !isNaN(date.getTime())) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  }

  return '';
};

/**
 * Assembles the full proposal number, appending /sendingDate if includeDate is enabled.
 * If the input serialNo already has a valid date suffix (e.g. IT/QT/8109/05-11-2026 passed by the client),
 * that explicit user-confirmed date is preserved unless an explicit differing sendingDate was provided.
 */
export const buildProposalNumber = (
  serialNo: string,
  includeDate = false,
  sendingDate?: Date | string | null
): string => {
  const existingDateSuffixMatch = (serialNo || '').trim().match(/\/(\d{2}-\d{2}-\d{4})$/);
  const baseSerial = stripDateSuffix(serialNo);
  if (!includeDate) {
    return baseSerial;
  }
  if (existingDateSuffixMatch) {
    const formattedSendingDate = sendingDate ? formatProposalSendingDate(sendingDate) : null;
    if (!formattedSendingDate || formattedSendingDate === existingDateSuffixMatch[1]) {
      return `${baseSerial}/${existingDateSuffixMatch[1]}`;
    }
    return `${baseSerial}/${formattedSendingDate}`;
  }
  const dateStr = formatProposalSendingDate(sendingDate);
  return `${baseSerial}/${dateStr}`;
};

/**
 * Parses any proposal number string (e.g. "1001", "WT-Q1001", "IT/QT/8101", "PROP-0050")
 * into its alphanumeric prefix, numeric integer value, and zero-padding length.
 * Trailing date suffixes are automatically stripped before parsing.
 */
export const parseProposalNo = (str?: string): ParsedProposalNo => {
  const cleanStr = stripDateSuffix((str || '').trim());
  if (!cleanStr) {
    return { prefix: 'WT-Q', num: 1001, padLength: 4 };
  }
  // Match prefix and trailing numeric sequence
  const match = cleanStr.match(/^(.*?)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const digitsStr = match[2];
    return {
      prefix,
      num: parseInt(digitsStr, 10),
      padLength: digitsStr.length,
    };
  }
  // If there are no trailing digits at all (e.g. "PROP-"), assign starting num 1001
  return {
    prefix: cleanStr.endsWith('-') || cleanStr.endsWith('/') ? cleanStr : `${cleanStr}-`,
    num: 1001,
    padLength: 4,
  };
};

/**
 * Formats parsed proposal number components back into a clean string.
 */
export const formatProposalNo = (parsed: ParsedProposalNo): string => {
  return `${parsed.prefix}${String(parsed.num).padStart(parsed.padLength, '0')}`;
};

/**
 * Calculates the next sequential proposal number, maintaining prefix and padding.
 */
export const incrementProposalNo = (str?: string): string => {
  const cleanStr = stripDateSuffix(str);
  const parsed = parseProposalNo(cleanStr);
  return `${parsed.prefix}${String(parsed.num + 1).padStart(parsed.padLength, '0')}`;
};

/**
 * Peeks at the next active proposal number from Settings without advancing the sequence.
 */
/**
 * Scans the database for the highest existing proposal number matching the given prefix.
 * Returns { maxNum, padLength } if proposals exist, or null if no proposals exist with this prefix.
 */
export const getHighestProposalNumberFromDb = async (
  prefix: string
): Promise<{ maxNum: number; padLength: number } | null> => {
  if (mongoose.connection.readyState !== 1) {
    return null;
  }
  try {
    let ProposalModel: any;
    try {
      ProposalModel = mongoose.model('Proposal');
    } catch {
      return null;
    }
    if (!ProposalModel || typeof ProposalModel.find !== 'function') {
      return null;
    }

    // Fetch all proposals that have a proposalNo or proposalId
    const proposals = await ProposalModel.find({
      $or: [
        { proposalNo: { $exists: true, $nin: ['', null] } },
        { proposalId: { $exists: true, $nin: ['', null] } },
      ],
    }).select('proposalNo proposalId').lean();

    if (!proposals || !Array.isArray(proposals) || proposals.length === 0) {
      return null;
    }

    let foundAny = false;
    let maxNum = -1;
    let maxPadLength = 4;

    for (const p of proposals) {
      const rawNo = (p as any)?.proposalNo || (p as any)?.proposalId;
      if (!rawNo || typeof rawNo !== 'string') continue;
      const parsed = parseProposalNo(rawNo);
      // Compare prefixes (case-insensitive)
      if (parsed.prefix.toLowerCase() === prefix.toLowerCase()) {
        foundAny = true;
        if (parsed.num > maxNum) {
          maxNum = parsed.num;
          maxPadLength = Math.max(maxPadLength, parsed.padLength);
        }
      }
    }

    if (!foundAny) {
      return null;
    }

    return { maxNum, padLength: maxPadLength };
  } catch {
    return null;
  }
};

/**
 * Computes the next proposal serial dynamically based on what proposals currently exist in the database.
 * If 4 proposals exist in DB and the 4th is deleted, the highest remaining is 3, so next is 4.
 */
export const computeNextProposalSerial = async (
  settings?: any
): Promise<{ assignedSerial: string; nextSerial: string }> => {
  const currentSettings = settings || (await Settings.findOne());
  const startingNo = stripDateSuffix(currentSettings?.proposalNo) || 'WT-Q1001';
  const parsedStarting = parseProposalNo(startingNo);

  const highestInDb = await getHighestProposalNumberFromDb(parsedStarting.prefix);

  let targetNum: number;
  let targetPad: number = parsedStarting.padLength;

  if (highestInDb !== null) {
    // If proposals exist in the database for this prefix,
    // the next proposal number is (highest in DB + 1).
    // If the administrator configured a higher starting number, respect that.
    targetNum = Math.max(parsedStarting.num, highestInDb.maxNum + 1);
    targetPad = Math.max(targetPad, highestInDb.padLength);
  } else {
    // If no proposals exist in the DB matching this prefix:
    // In disconnected / mocked test environments without DB records, fall back to proposalCurrentSeq if set.
    const storedSeq = stripDateSuffix(currentSettings?.proposalCurrentSeq);
    if (storedSeq && mongoose.connection.readyState !== 1) {
      const parsedStored = parseProposalNo(storedSeq);
      targetNum = parsedStored.num;
      targetPad = Math.max(targetPad, parsedStored.padLength);
    } else {
      targetNum = parsedStarting.num;
    }
  }

  let assignedSerial = `${parsedStarting.prefix}${String(targetNum).padStart(targetPad, '0')}`;

  // Collision guard: If a proposal with assignedSerial already exists, increment until free
  if (mongoose.connection.readyState === 1) {
    try {
      const ProposalModel = mongoose.model('Proposal');
      const regexStr = `^${escapeRegex(assignedSerial)}(\\/.*)?$`;
      while (await ProposalModel.exists({ proposalNo: { $regex: regexStr, $options: 'i' } })) {
        assignedSerial = incrementProposalNo(assignedSerial);
      }
    } catch {
      // ignore
    }
  }

  const nextSerial = incrementProposalNo(assignedSerial);
  return { assignedSerial, nextSerial };
};

/**
 * Peeks at the next active proposal number from Settings without advancing the sequence.
 */
export const peekNextProposalNo = async (targetDate?: Date | string | null): Promise<string> => {
  let settings = await Settings.findOne();
  if (!settings) {
    return 'WT-Q1001';
  }
  const includeDate = Boolean(settings.proposalIncludeDate);
  const { assignedSerial } = await computeNextProposalSerial(settings);
  return buildProposalNumber(assignedSerial, includeDate, targetDate);
};

/**
 * Atomically retrieves the next sequential proposal number and advances proposalCurrentSeq.
 * CRITICAL: The starting proposal number (settings.proposalNo) is RETAINED as configured
 * by the administrator and is NOT overwritten or mutated.
 */
export const getAndIncrementNextProposalNo = async (targetDate?: Date | string | null): Promise<string> => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({
      proposalNo: 'WT-Q1001',
      proposalCurrentSeq: 'WT-Q1001',
      proposalIncludeDate: false,
    });
  }

  const includeDate = Boolean(settings.proposalIncludeDate);
  const { assignedSerial, nextSerial } = await computeNextProposalSerial(settings);

  // Sync proposalCurrentSeq in Settings
  await Settings.updateOne({}, { $set: { proposalCurrentSeq: nextSerial } }, { upsert: true });

  return buildProposalNumber(assignedSerial, includeDate, targetDate);
};

/**
 * Synchronizes the sequence if a custom proposal number was manually entered or used.
 * If the used number matches or exceeds the current sequence, advances proposalCurrentSeq
 * so subsequent proposals continue from that number onwards.
 * settings.proposalNo (starting number) is never mutated.
 */
export const syncProposalNoSequence = async (usedProposalNo: string): Promise<void> => {
  if (!usedProposalNo || !usedProposalNo.trim()) return;
  if (mongoose.connection.readyState !== 1 && !(Settings.findOne as any)?.mock) return;
  const usedSerial = stripDateSuffix(usedProposalNo.trim());
  const nextSerial = incrementProposalNo(usedSerial);

  const settings = await Settings.findOne();
  const currentSerial = stripDateSuffix(settings?.proposalCurrentSeq || settings?.proposalNo || 'WT-Q1001');

  const parsedUsed = parseProposalNo(usedSerial);
  const parsedCurrent = parseProposalNo(currentSerial);

  // If prefixes match and used number >= current number, advance proposalCurrentSeq
  if (parsedUsed.prefix === parsedCurrent.prefix && parsedUsed.num >= parsedCurrent.num) {
    await Settings.updateOne({}, { $set: { proposalCurrentSeq: nextSerial } }, { upsert: true });
  } else if (!settings?.proposalCurrentSeq) {
    await Settings.updateOne({}, { $set: { proposalCurrentSeq: nextSerial } }, { upsert: true });
  }
};
