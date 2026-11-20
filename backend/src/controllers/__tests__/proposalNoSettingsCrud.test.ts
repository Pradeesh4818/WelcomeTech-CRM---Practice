import mongoose from 'mongoose';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseProposalNo,
  formatProposalNo,
  incrementProposalNo,
  stripDateSuffix,
  formatProposalSendingDate,
  buildProposalNumber,
  peekNextProposalNo,
  getAndIncrementNextProposalNo,
  syncProposalNoSequence,
  computeNextProposalSerial,
  getHighestProposalNumberFromDb,
} from '../../utils/proposalSequence';
import {
  getProposalNoSetting,
  updateProposalNoSetting,
  resetProposalNoSetting,
} from '../settingsController';
import { getNextProposalNumberHandler } from '../crmController';
import { Settings } from '../../models/Settings';
import { buildProposalFullHtml } from '../../utils/htmlPdfGenerator';

vi.mock('../../models/Settings', () => ({
  Settings: {
    findOne: vi.fn(),
    create: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn(),
  },
}));

describe('Proposal Number Sequence, Date Suffix & Admin Settings CRUD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Number Parsing, Date Suffix & Increment Logic', () => {
    it('parses and increments pure numeric strings while preserving digit padding', () => {
      const parsed = parseProposalNo('1001');
      expect(parsed).toEqual({ prefix: '', num: 1001, padLength: 4 });
      expect(formatProposalNo(parsed)).toBe('1001');
      expect(incrementProposalNo('1001')).toBe('1002');
      expect(incrementProposalNo('0099')).toBe('0100');
      expect(incrementProposalNo('500')).toBe('501');
    });

    it('parses and increments prefixed proposal numbers correctly (e.g. IT/QT/8101 -> IT/QT/8102)', () => {
      expect(incrementProposalNo('IT/QT/8101')).toBe('IT/QT/8102');
      expect(incrementProposalNo('WT-Q1001')).toBe('WT-Q1002');
      expect(incrementProposalNo('PROP-0001')).toBe('PROP-0002');
      expect(incrementProposalNo('WT-Q202610-001')).toBe('WT-Q202610-002');
      expect(incrementProposalNo('Q-9')).toBe('Q-10');
    });

    it('strips date suffixes cleanly before parsing and incrementing', () => {
      expect(stripDateSuffix('IT/QT/8101/15-10-2026')).toBe('IT/QT/8101');
      expect(stripDateSuffix('IT/QT/8101/15/10/2026')).toBe('IT/QT/8101');
      expect(stripDateSuffix('IT/QT/8101/2026-10-15')).toBe('IT/QT/8101');
      expect(stripDateSuffix('IT/QT/8101')).toBe('IT/QT/8101');
      expect(incrementProposalNo('IT/QT/8101/15-10-2026')).toBe('IT/QT/8102');
    });

    it('formats proposal sending date as DD-MM-YYYY', () => {
      const testDate = new Date(2026, 9, 15); // Month 9 is October (0-indexed)
      expect(formatProposalSendingDate(testDate)).toBe('15-10-2026');
    });

    it('builds full proposal number with or without sending date', () => {
      const testDate = new Date(2026, 9, 15);
      expect(buildProposalNumber('IT/QT/8101', false, testDate)).toBe('IT/QT/8101');
      expect(buildProposalNumber('IT/QT/8101', true, testDate)).toBe('IT/QT/8101/15-10-2026');
      // Strips existing date suffix before appending current date
      expect(buildProposalNumber('IT/QT/8101/01-01-2025', true, testDate)).toBe('IT/QT/8101/15-10-2026');
    });

    it('falls back to default starting sequence for empty or undefined input', () => {
      const parsed = parseProposalNo('');
      expect(parsed).toEqual({ prefix: 'WT-Q', num: 1001, padLength: 4 });
      expect(incrementProposalNo('')).toBe('WT-Q1002');
    });

    it('handles alphanumeric prefix without digits by appending 1001', () => {
      const parsed = parseProposalNo('QUOTATION-');
      expect(parsed).toEqual({ prefix: 'QUOTATION-', num: 1001, padLength: 4 });
      expect(formatProposalNo(parsed)).toBe('QUOTATION-1001');
    });
  });

  describe('2. Admin Settings Proposal No CRUD Endpoints', () => {
    it('TC-CRUD-READ: getProposalNoSetting returns starting proposal number and includeDate setting', async () => {
      (Settings.findOne as any).mockResolvedValue({
        proposalNo: 'IT/QT/8101',
        proposalIncludeDate: true,
      });

      const req: any = {};
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await getProposalNoSetting(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            proposalNo: 'IT/QT/8101',
            startingProposalNo: 'IT/QT/8101',
            proposalIncludeDate: true,
          }),
        })
      );
    });

    it('TC-CRUD-UPDATE: updateProposalNoSetting updates starting proposal number and date option in DB', async () => {
      (Settings.findOneAndUpdate as any).mockResolvedValue({
        proposalNo: 'IT/QT/8101',
        proposalCurrentSeq: 'IT/QT/8101',
        proposalIncludeDate: true,
      });

      const req: any = {
        body: {
          proposalNo: 'IT/QT/8101',
          proposalIncludeDate: true,
        },
      };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await updateProposalNoSetting(req, res);
      expect(Settings.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        {
          $set: {
            proposalNo: 'IT/QT/8101',
            proposalCurrentSeq: 'IT/QT/8101',
            proposalIncludeDate: true,
          },
        },
        { new: true, upsert: true }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          proposalNo: 'IT/QT/8101',
          startingProposalNo: 'IT/QT/8101',
          proposalIncludeDate: true,
        },
      });
    });

    it('TC-CRUD-RESET: resetProposalNoSetting restores default sequence WT-Q1001 and turns off date option', async () => {
      (Settings.findOneAndUpdate as any).mockResolvedValue({
        proposalNo: 'WT-Q1001',
        proposalIncludeDate: false,
      });

      const req: any = {};
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await resetProposalNoSetting(req, res);
      expect(Settings.findOneAndUpdate).toHaveBeenCalledWith(
        {},
        {
          $set: {
            proposalNo: 'WT-Q1001',
            proposalCurrentSeq: 'WT-Q1001',
            proposalIncludeDate: false,
          },
        },
        { new: true, upsert: true }
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: 'Proposal number reset to default successfully',
          data: {
            proposalNo: 'WT-Q1001',
            startingProposalNo: 'WT-Q1001',
            proposalIncludeDate: false,
          },
        })
      );
    });

    it('TC-HANDLER-PEEK: getNextProposalNumberHandler returns next proposal number and keeps startingProposalNo intact', async () => {
      (Settings.findOne as any).mockResolvedValue({
        proposalNo: 'IT/QT/8101',
        proposalCurrentSeq: 'IT/QT/8105',
        proposalIncludeDate: true,
      });

      const req: any = { query: { date: '2026-10-15' } };
      const res: any = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      };

      await getNextProposalNumberHandler(req, res);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          nextProposalNo: 'IT/QT/8105/15-10-2026',
          startingProposalNo: 'IT/QT/8101',
          proposalIncludeDate: true,
        },
      });
    });
  });

  describe('3. Dynamic Sequence Engine: Preserving Starting No & Appending Date Option', () => {
    it('TC-SEQ-PRESERVE-STARTING: increments proposalCurrentSeq while leaving proposalNo untouched', async () => {
      (Settings.findOne as any).mockResolvedValue({
        proposalNo: 'IT/QT/8101',
        proposalCurrentSeq: 'IT/QT/8101',
        proposalIncludeDate: false,
      });

      const assignedNo = await getAndIncrementNextProposalNo();
      expect(assignedNo).toBe('IT/QT/8101');
      // Must NOT overwrite proposalNo; only advance proposalCurrentSeq!
      expect(Settings.updateOne).toHaveBeenCalledWith(
        {},
        { $set: { proposalCurrentSeq: 'IT/QT/8102' } },
        { upsert: true }
      );
    });

    it('TC-SEQ-DATE-OPTION: appends sending date when proposalIncludeDate is enabled', async () => {
      (Settings.findOne as any).mockResolvedValue({
        proposalNo: 'IT/QT/8101',
        proposalCurrentSeq: 'IT/QT/8101',
        proposalIncludeDate: true,
      });

      const sendingDate = new Date(2026, 9, 15);
      const assignedNo = await getAndIncrementNextProposalNo(sendingDate);
      expect(assignedNo).toBe('IT/QT/8101/15-10-2026');
      expect(Settings.updateOne).toHaveBeenCalledWith(
        {},
        { $set: { proposalCurrentSeq: 'IT/QT/8102' } },
        { upsert: true }
      );
    });

    it('TC-SEQ-SYNC: syncProposalNoSequence advances sequence counter without mutating starting proposalNo', async () => {
      (Settings.findOne as any).mockResolvedValue({
        proposalNo: 'IT/QT/8101',
        proposalCurrentSeq: 'IT/QT/8105',
      });

      await syncProposalNoSequence('IT/QT/8110/15-10-2026');
      expect(Settings.updateOne).toHaveBeenCalledWith(
        {},
        { $set: { proposalCurrentSeq: 'IT/QT/8111' } },
        { upsert: true }
      );
    });

    it('TC-SEQ-SYNC-GUARD: syncProposalNoSequence does not roll back sequence when older number is used', async () => {
      (Settings.findOne as any).mockResolvedValue({
        proposalNo: 'IT/QT/8101',
        proposalCurrentSeq: 'IT/QT/8120',
      });

      await syncProposalNoSequence('IT/QT/8105');
      expect(Settings.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('4. Backend HTML PDF Generator Dynamic Number & Date Suffix Verification', () => {
    const dummyEntity = {
      name: 'Client Company LLC',
      phone: '+974 55551234',
      email: 'client@company.qa',
    };

    it('TC-PDF-DYNAMIC-01: buildProposalFullHtml renders dynamic settings.proposalNo when proposal has no proposalNo (no static fallback)', () => {
      const proposal: any = {
        title: 'Network Setup Proposal',
        blocks: [],
      };
      const settings: any = {
        proposalNo: 'IT/QT/8100',
        proposalIncludeDate: false,
      };

      const html = buildProposalFullHtml({ proposal, entity: dummyEntity, settings });
      expect(html).toContain('IT/QT/8100');
      expect(html).not.toContain('WT-Q20261001');
    });

    it('TC-PDF-DATE-01: buildProposalFullHtml appends /DD-MM-YYYY when proposalIncludeDate is true', () => {
      const proposal: any = {
        proposalNo: 'IT/QT/8100',
        quoteDate: '2026-10-15',
        blocks: [],
      };
      const settings: any = {
        proposalNo: 'IT/QT/8100',
        proposalIncludeDate: true,
      };

      const html = buildProposalFullHtml({ proposal, entity: dummyEntity, settings });
      expect(html).toContain('IT/QT/8100/15-10-2026');
    });

    it('TC-PDF-DATE-02: buildProposalFullHtml omits date suffix when proposalIncludeDate is false', () => {
      const proposal: any = {
        proposalNo: 'IT/QT/8100',
        quoteDate: '2026-10-15',
        blocks: [],
      };
      const settings: any = {
        proposalNo: 'IT/QT/8100',
        proposalIncludeDate: false,
      };

      const html = buildProposalFullHtml({ proposal, entity: dummyEntity, settings });
      expect(html).toContain('IT/QT/8100');
      expect(html).not.toContain('IT/QT/8100/15-10-2026');
    });
  });

  describe('5. Database State Dynamic Synchronization (User Example: Delete 4th invoice -> Next is 4th, NOT 5th)', () => {
    it('TC-SEQ-DELETE-REUSE: when 4 proposals exist in DB and 4th is deleted, next proposal is 4th, NOT 5th', async () => {
      // Set connection readyState to 1 to simulate live database connection
      const originalReadyState = mongoose.connection.readyState;
      Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

      const mockProposals = [
        { proposalNo: 'IT/QT/8101/20-10-2026' },
        { proposalNo: 'IT/QT/8102/20-10-2026' },
        { proposalNo: 'IT/QT/8103/20-10-2026' },
        { proposalNo: 'IT/QT/8104/20-10-2026' },
      ];

      const mockModel = {
        find: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockReturnValue({
            lean: vi.fn().mockImplementation(() => Promise.resolve([...mockProposals])),
          }),
        })),
        exists: vi.fn().mockResolvedValue(false),
      };

      const spyModel = vi.spyOn(mongoose, 'model').mockReturnValue(mockModel as any);

      (Settings.findOne as any).mockResolvedValue({
        proposalNo: 'IT/QT/8100',
        proposalIncludeDate: true,
      });

      // 1. With 4 proposals in DB (8101, 8102, 8103, 8104), next proposal is 8105
      const nextWhen4 = await peekNextProposalNo('2026-10-20');
      expect(nextWhen4).toBe('IT/QT/8105/20-10-2026');

      // 2. User deletes the 4th invoice (DB now only has 8101, 8102, 8103)
      mockProposals.pop(); // removes IT/QT/8104

      // Now with 8104 deleted, next proposal must be 8104, NOT 8105!
      const nextAfterDelete4 = await peekNextProposalNo('2026-10-20');
      expect(nextAfterDelete4).toBe('IT/QT/8104/20-10-2026');

      // 3. User deletes the 3rd invoice as well (DB now only has 8101, 8102)
      mockProposals.pop(); // removes IT/QT/8103

      // Now with 8103 deleted, next proposal must be 8103!
      const nextAfterDelete3 = await peekNextProposalNo('2026-10-20');
      expect(nextAfterDelete3).toBe('IT/QT/8103/20-10-2026');

      // Restore
      spyModel.mockRestore();
      Object.defineProperty(mongoose.connection, 'readyState', { value: originalReadyState, configurable: true });
    });

    it('TC-SEQ-DELETE-ALL: when all proposals are deleted from DB, next proposal resets to starting proposalNo', async () => {
      const originalReadyState = mongoose.connection.readyState;
      Object.defineProperty(mongoose.connection, 'readyState', { value: 1, configurable: true });

      const mockModel = {
        find: vi.fn().mockImplementation(() => ({
          select: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue([]),
          }),
        })),
        exists: vi.fn().mockResolvedValue(false),
      };

      const spyModel = vi.spyOn(mongoose, 'model').mockReturnValue(mockModel as any);

      (Settings.findOne as any).mockResolvedValue({
        proposalNo: 'IT/QT/8100',
        proposalIncludeDate: false,
      });

      const nextWhenEmpty = await peekNextProposalNo();
      expect(nextWhenEmpty).toBe('IT/QT/8100');

      spyModel.mockRestore();
      Object.defineProperty(mongoose.connection, 'readyState', { value: originalReadyState, configurable: true });
    });
  });
});
