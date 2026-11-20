import mongoose from 'mongoose';
import { nextSequence, highestExistingNumber } from './Counter';

/**
 * Normalizes legacy proposals stored with older schemas:
 * - Backfills missing `proposalNo` from `proposalId` or sequence generator.
 * - Backfills missing `total` and `subtotal` from legacy `amount` field.
 * - Links string `customer` fields to actual Customer ObjectIds and customerName.
 * - Ensures `createdBy` is populated so Mongoose validation never fails.
 * - Ensures `items` and `blocks` exist so Quotation Generator live view & A4 preview render correctly.
 */
export const normalizeLegacyProposals = async (): Promise<void> => {
  try {
    const ProposalModel = mongoose.connection.collection('proposals');
    const CustomerModel = mongoose.connection.collection('customers');
    const UserModel = mongoose.connection.collection('users');

    const proposals = await ProposalModel.find({}).toArray();
    if (!proposals || proposals.length === 0) return;

    let defaultAdminId: any = null;
    const adminUser = await UserModel.findOne({ role: 'admin' }) || await UserModel.findOne({});
    if (adminUser) {
      defaultAdminId = adminUser._id;
    }

    let updatedCount = 0;

    for (const p of proposals) {
      const updates: Record<string, any> = {};
      let needsUpdate = false;

      // 1. Backfill proposalNo from proposalId or next sequence
      if (!p.proposalNo) {
        if (p.proposalId && typeof p.proposalId === 'string' && p.proposalId.trim()) {
          updates.proposalNo = p.proposalId.trim();
          needsUpdate = true;
        } else {
          const seq = await nextSequence('proposal', () =>
            highestExistingNumber(mongoose.model('Proposal'), 'proposalNo')
          );
          updates.proposalNo = `PROP-${String(seq).padStart(4, '0')}`;
          needsUpdate = true;
        }
      }

      // 2. Backfill total and subtotal from amount
      if ((p.total === undefined || p.total === null) && p.amount !== undefined) {
        const amt = Number(p.amount) || 0;
        updates.total = amt;
        updates.subtotal = amt;
        if (p.discount === undefined) updates.discount = 0;
        needsUpdate = true;
      }

      // 3. Normalize string customer to ObjectId and customerName
      if (p.customer && typeof p.customer === 'string' && !mongoose.Types.ObjectId.isValid(p.customer)) {
        const custName = p.customer.trim();
        const matchedCustomer = await CustomerModel.findOne({
          $or: [
            { name: new RegExp(`^${custName}$`, 'i') },
            { 'companyInfo.customerName': new RegExp(`^${custName}$`, 'i') },
          ],
        });

        if (matchedCustomer) {
          updates.customer = matchedCustomer._id;
          updates.customerName = matchedCustomer.name || matchedCustomer.companyInfo?.customerName || custName;
          if (!p.customerPhone) updates.customerPhone = matchedCustomer.phone || matchedCustomer.primaryContactInfo?.mobile;
          if (!p.customerEmail) updates.customerEmail = matchedCustomer.email || matchedCustomer.primaryContactInfo?.email;
          if (!p.customerAddress) updates.customerAddress = matchedCustomer.address || matchedCustomer.companyInfo?.fullAddress;
        } else {
          updates.customerName = custName;
          // Unset invalid string ObjectId so Mongoose schema doesn't throw CastError
          updates.customer = null;
        }
        needsUpdate = true;
      } else if (p.customer && typeof p.customer === 'object' && p.customer._id) {
        if (!p.customerName && p.customer.name) {
          updates.customerName = p.customer.name;
          needsUpdate = true;
        }
      }

      // 4. Ensure createdBy is set
      if (!p.createdBy && defaultAdminId) {
        updates.createdBy = defaultAdminId;
        needsUpdate = true;
      }

      // 5. Ensure valid quoteDate and validUntil
      if (!p.quoteDate) {
        updates.quoteDate = p.createdAtDate || p.createdAt || new Date();
        needsUpdate = true;
      }
      if (!p.validUntil) {
        const baseDate = new Date(p.quoteDate || p.createdAtDate || p.createdAt || Date.now());
        updates.validUntil = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);
        needsUpdate = true;
      }

      // 6. Ensure items array exists with at least 1 item
      const hasItems = Array.isArray(p.items) && p.items.length > 0;
      const hasBlocks = Array.isArray(p.blocks) && p.blocks.length > 0;

      if (!hasItems) {
        let defaultItem: any = null;
        if (hasBlocks) {
          const tableBlock = p.blocks.find((b: any) => b && b.type === 'table' && Array.isArray(b.items) && b.items.length > 0);
          if (tableBlock) {
            updates.items = tableBlock.items.map((it: any, idx: number) => ({
              description: it.description || 'Service Deliverable',
              qty: Number(it.qty) || 1,
              unitPrice: Number(it.unitPrice) || 0,
              total: (Number(it.qty) || 1) * (Number(it.unitPrice) || 0),
            }));
            needsUpdate = true;
          }
        }

        if (!updates.items) {
          const itemAmount = updates.total !== undefined ? updates.total : (Number(p.total) || Number(p.amount) || 0);
          defaultItem = {
            description: p.title || 'Professional Services & Deliverables',
            qty: 1,
            unitPrice: itemAmount,
            total: itemAmount,
          };
          updates.items = [defaultItem];
          needsUpdate = true;
        }
      }

      // 7. Ensure blocks array exists for live Quotation Generator & A4 page preview
      if (!hasBlocks) {
        const sourceItems = updates.items || p.items || [];
        updates.blocks = [
          {
            id: 'proposal_items_block',
            type: 'table',
            title: 'Scope of Work & Pricing',
            discountPercent: 0,
            items: sourceItems.map((it: any, idx: number) => ({
              id: Date.now() + idx,
              type: 'item',
              no: idx + 1,
              description: it.description || 'Service Deliverable',
              qty: Number(it.qty) || 1,
              unitPrice: Number(it.unitPrice) || 0,
            })),
          },
        ];
        needsUpdate = true;
      }

      if (needsUpdate) {
        await ProposalModel.updateOne({ _id: p._id }, { $set: updates });
        updatedCount++;
      }
    }

    if (updatedCount > 0) {
      console.log(`[migration] Normalized ${updatedCount} legacy proposal(s) with full schema compliance.`);
    }
  } catch (err: any) {
    console.error('[migration] Failed to normalize legacy proposals:', err?.message || err);
  }
};
