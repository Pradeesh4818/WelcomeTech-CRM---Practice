import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProposalTemplate, updateProposalTemplate } from '../crmController';
import { ProposalTemplate } from '../../models/index';

vi.mock('../../models/index', async () => {
  const actual: any = await vi.importActual('../../models/index');
  const mockTemplateModel: any = {
    create: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    countDocuments: vi.fn().mockResolvedValue(0),
    collection: {
      indexes: vi.fn().mockResolvedValue([
        {
          name: 'createdBy_1_name_1_active_unique',
          key: { createdBy: 1, name: 1 },
          unique: true,
          partialFilterExpression: { isActive: true },
        },
      ]),
      dropIndex: vi.fn().mockResolvedValue(true),
      createIndex: vi.fn().mockResolvedValue(true),
    },
  };
  return {
    ...actual,
    ProposalTemplate: mockTemplateModel,
  };
});

describe('Proposal Template Title Edit & Persistence (Backend Specifications)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockRes = () => {
    const res: any = {};
    res.status = vi.fn().mockReturnValue(res);
    res.json = vi.fn().mockReturnValue(res);
    return res;
  };

  describe('TC-PROP-TITLE-01: Create Template with Custom Proposal Title', () => {
    it('creates template with custom title when provided in request body', async () => {
      const mockCreated = {
        _id: '672000000000000000000001',
        name: 'TallyPrime Single User',
        title: 'TallyPrime Single User Edition Quotation',
        items: [],
        validForDays: 10,
        discount: 0,
        isActive: true,
      };

      vi.mocked(ProposalTemplate.create).mockResolvedValue(mockCreated as any);

      const req: any = {
        body: {
          name: 'TallyPrime Single User',
          title: 'TallyPrime Single User Edition Quotation',
          items: [],
          validForDays: 10,
        },
        user: { _id: 'user_123', role: 'admin' },
      };
      const res = mockRes();

      await createProposalTemplate(req, res);

      expect(ProposalTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'TallyPrime Single User',
          title: 'TallyPrime Single User Edition Quotation',
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockCreated });
    });

    it('creates template with undefined title if not passed, without crashing', async () => {
      const mockCreated = {
        _id: '672000000000000000000002',
        name: 'AMC Multi User',
        items: [],
        validForDays: 10,
        isActive: true,
      };

      vi.mocked(ProposalTemplate.create).mockResolvedValue(mockCreated as any);

      const req: any = {
        body: {
          name: 'AMC Multi User',
          items: [],
        },
        user: { _id: 'user_123', role: 'admin' },
      };
      const res = mockRes();

      await createProposalTemplate(req, res);

      expect(ProposalTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'AMC Multi User',
          title: undefined,
        })
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('TC-PROP-TITLE-02: Update Proposal Title via PATCH /proposal-templates/:id', () => {
    it('updates title field while preserving other fields', async () => {
      const mockUpdated = {
        _id: '672000000000000000000001',
        name: 'TallyPrime Single User',
        title: 'Updated Custom Quotation Title 2026',
        items: [],
        validForDays: 10,
        discount: 0,
        isActive: true,
      };

      vi.mocked(ProposalTemplate.findOneAndUpdate).mockResolvedValue(mockUpdated as any);

      const req: any = {
        params: { id: '672000000000000000000001' },
        body: {
          title: 'Updated Custom Quotation Title 2026',
        },
        user: { _id: 'user_123', role: 'admin' },
      };
      const res = mockRes();

      await updateProposalTemplate(req, res);

      expect(ProposalTemplate.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: '672000000000000000000001' }),
        expect.objectContaining({
          title: 'Updated Custom Quotation Title 2026',
        }),
        expect.anything()
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockUpdated });
    });

    it('returns 404 when template to update does not exist', async () => {
      vi.mocked(ProposalTemplate.findOneAndUpdate).mockResolvedValue(null);

      const req: any = {
        params: { id: 'non_existent_id' },
        body: {
          title: 'New Title',
        },
        user: { _id: 'user_123', role: 'admin' },
      };
      const res = mockRes();

      await updateProposalTemplate(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Proposal template not found' });
    });
  });
});
