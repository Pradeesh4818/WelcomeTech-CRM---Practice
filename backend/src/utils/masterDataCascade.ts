import Customer from '../models/Customer';
import { Lead, LeadStatusHistory } from '../models/Lead';
import { AMC, Ticket } from '../models';

const changedName = (oldName?: unknown, newName?: unknown): { oldName: string; newName: string } | null => {
  const oldValue = String(oldName || '').trim();
  const newValue = String(newName || '').trim();
  if (!oldValue || !newValue || oldValue === newValue) return null;
  return { oldName: oldValue, newName: newValue };
};

const escapeRe = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Case-insensitive exact match, so leads stored with inconsistent casing are still cascaded.
const ciExact = (value: string) => ({ $regex: new RegExp(`^${escapeRe(value)}$`, 'i') });

export const cascadeProductName = async (oldName?: unknown, newName?: unknown) => {
  const names = changedName(oldName, newName);
  if (!names) return;

  const { oldName: oldValue, newName: newValue } = names;
  await Promise.all([
    Customer.updateMany(
      { products: oldValue },
      { $set: { 'products.$[product]': newValue } },
      { arrayFilters: [{ product: oldValue }] }
    ),
    Customer.updateMany(
      { 'serialNoInfo.product': oldValue },
      { $set: { 'serialNoInfo.$[serial].product': newValue } },
      { arrayFilters: [{ 'serial.product': oldValue }] }
    ),
    Customer.updateMany(
      { 'services.product': oldValue },
      { $set: { 'services.$[service].product': newValue } },
      { arrayFilters: [{ 'service.product': oldValue }] }
    ),
    Lead.updateMany({ interestedProduct: oldValue }, { $set: { interestedProduct: newValue } }),
    Lead.updateMany(
      { existingProducts: oldValue },
      { $set: { 'existingProducts.$[product]': newValue } },
      { arrayFilters: [{ product: oldValue }] }
    ),
    AMC.updateMany({ product: oldValue }, { $set: { product: newValue } }),
  ]);
};

export const cascadeLicenceTypeName = async (oldName?: unknown, newName?: unknown) => {
  const names = changedName(oldName, newName);
  if (!names) return;

  const { oldName: oldValue, newName: newValue } = names;
  await Promise.all([
    Customer.updateMany({ licenceType: oldValue }, { $set: { licenceType: newValue } }),
    Customer.updateMany(
      { 'serialNoInfo.licenceType': oldValue },
      { $set: { 'serialNoInfo.$[serial].licenceType': newValue } },
      { arrayFilters: [{ 'serial.licenceType': oldValue }] }
    ),
    Customer.updateMany(
      { 'services.licenceType': oldValue },
      { $set: { 'services.$[service].licenceType': newValue } },
      { arrayFilters: [{ 'service.licenceType': oldValue }] }
    ),
    AMC.updateMany({ licenceType: oldValue }, { $set: { licenceType: newValue } }),
  ]);
};

export const cascadeCustomerTypeName = async (oldName?: unknown, newName?: unknown) => {
  const names = changedName(oldName, newName);
  if (!names) return;
  await Customer.updateMany({ customerType: names.oldName }, { $set: { customerType: names.newName } });
};

export const cascadeLeadSourceName = async (oldName?: unknown, newName?: unknown) => {
  const names = changedName(oldName, newName);
  if (!names) return;
  await Lead.updateMany({ source: names.oldName }, { $set: { source: names.newName } });
};

export const cascadeLeadStatusName = async (oldName?: unknown, newName?: unknown) => {
  const names = changedName(oldName, newName);
  if (!names) return;

  await Promise.all([
    Lead.updateMany({ status: ciExact(names.oldName) }, { $set: { status: names.newName } }),
    LeadStatusHistory.updateMany({ fromStatus: ciExact(names.oldName) }, { $set: { fromStatus: names.newName } }),
    LeadStatusHistory.updateMany({ toStatus: ciExact(names.oldName) }, { $set: { toStatus: names.newName } }),
  ]);
};

export const cascadeVendorCategoryName = async (oldName?: unknown, newName?: unknown) => {
  const names = changedName(oldName, newName);
  if (!names) return;

  const { oldName: oldValue, newName: newValue } = names;
  await Promise.all([
    Customer.updateMany({ 'amcDetails.vendorCategory': oldValue }, { $set: { 'amcDetails.vendorCategory': newValue } }),
    Customer.updateMany({ 'tdlDetails.vendorCategory': oldValue }, { $set: { 'tdlDetails.vendorCategory': newValue } }),
    Customer.updateMany({ 'cloudDetails.vendorCategory': oldValue }, { $set: { 'cloudDetails.vendorCategory': newValue } }),
    Customer.updateMany({ 'cloudDetails.vendor': oldValue }, { $set: { 'cloudDetails.vendor': newValue } }),
    Customer.updateMany({ 'tssDetails.vendorCategory': oldValue }, { $set: { 'tssDetails.vendorCategory': newValue } }),
    Customer.updateMany(
      { 'services.vendorCategory': oldValue },
      { $set: { 'services.$[service].vendorCategory': newValue } },
      { arrayFilters: [{ 'service.vendorCategory': oldValue }] }
    ),
    Customer.updateMany(
      { 'services.vendor': oldValue },
      { $set: { 'services.$[service].vendor': newValue } },
      { arrayFilters: [{ 'service.vendor': oldValue }] }
    ),
    Customer.updateMany(
      { 'serialNoInfo.contactDetails.vendorCategory': oldValue },
      { $set: { 'serialNoInfo.$[serial].contactDetails.vendorCategory': newValue } },
      { arrayFilters: [{ 'serial.contactDetails.vendorCategory': oldValue }] }
    ),
  ]);
};

export const cascadeTicketCategoryName = async (oldName?: unknown, newName?: unknown) => {
  const names = changedName(oldName, newName);
  if (!names) return;
  await Ticket.updateMany({ category: names.oldName }, { $set: { category: names.newName } });
};

export const cascadeTicketSubCategoryNames = async (
  categoryName: unknown,
  oldSubCategories?: unknown,
  newSubCategories?: unknown
) => {
  const category = String(categoryName || '').trim();
  if (!category || !Array.isArray(oldSubCategories) || !Array.isArray(newSubCategories)) return;

  const updates = oldSubCategories
    .map((oldValue, idx) => changedName(oldValue, newSubCategories[idx]))
    .filter((item): item is { oldName: string; newName: string } => !!item);

  await Promise.all(
    updates.map(({ oldName, newName }) =>
      Ticket.updateMany({ category, subCategory: oldName }, { $set: { subCategory: newName } })
    )
  );
};

export const cascadeIndustryName = async (oldName?: unknown, newName?: unknown) => {
  const names = changedName(oldName, newName);
  if (!names) return;
  await Promise.all([
    Customer.updateMany({ industry: names.oldName }, { $set: { industry: names.newName } }),
    Customer.updateMany({ 'companyInfo.industry': names.oldName }, { $set: { 'companyInfo.industry': names.newName } }),
  ]);
};

export const cascadeIndustryGroupNames = async (
  industryName: unknown,
  oldGroups?: unknown,
  newGroups?: unknown
) => {
  const industry = String(industryName || '').trim();
  if (!industry || !Array.isArray(oldGroups) || !Array.isArray(newGroups)) return;

  const updates = oldGroups
    .map((oldValue, idx) => changedName(oldValue, newGroups[idx]))
    .filter((item): item is { oldName: string; newName: string } => !!item);

  await Promise.all(
    updates.map(({ oldName, newName }) =>
      Customer.updateMany(
        {
          $or: [{ industry }, { 'companyInfo.industry': industry }],
          'companyInfo.industryGroup': oldName,
        },
        { $set: { 'companyInfo.industryGroup': newName } }
      )
    )
  );
};

export const cascadeBusinessSegmentName = async (oldName?: unknown, newName?: unknown) => {
  const names = changedName(oldName, newName);
  if (!names) return;
  await Customer.updateMany(
    { 'companyInfo.businessSegment': names.oldName },
    { $set: { 'companyInfo.businessSegment': names.newName } }
  );
};

export const cascadeIndustryTypeName = async (oldName?: unknown, newName?: unknown) => {
  const names = changedName(oldName, newName);
  if (!names) return;
  await Customer.updateMany(
    { 'companyInfo.industryType': names.oldName },
    { $set: { 'companyInfo.industryType': names.newName } }
  );
};



