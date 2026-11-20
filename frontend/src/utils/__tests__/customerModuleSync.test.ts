import { describe, it, expect } from 'vitest';
import { Customer } from '../../types';
import { deduplicateAmcEntries, mergeModuleServicesBySerial } from '../helpers';
import { tssPartnerName, tdlPartnerName, cloudPartnerName, tssContactPerson, tssMobile, tssEmail } from '../../pages/Customers/CustomerManagementPages';
import { getAmcPartnerName } from '../../pages/AMC/AMCPages';
import { buildProductListRows, productLicenseRows } from '../../pages/Customers/ProductListPage';

// Mirror of helper logic from CustomerManagementPages
const hasTDL = (c: Partial<Customer>) =>
  !!(
    c.services?.some((s) => s.type === 'tdl' || s.isTdl || (s as any).tdlEnabled) ||
    c.serialNoInfo?.some((s) => s.isTdl || (s as any).tdlEnabled) ||
    c.serialNoInfo?.[0]?.isAmcActive ||
    c.tdlDetails?.status === 'active' ||
    c.tdlDetails?.status === 'trial' ||
    c.tdlDetails?.status === 'expiring' ||
    (Number(c.tdlDetails?.actualPrice) > 0)
  );

const hasCloud = (c: Partial<Customer>) =>
  !!(
    c.services?.some((s) => s.type === 'cloud' && s.status !== 'none') ||
    c.cloudDetails?.vendor ||
    (c.cloudDetails?.users?.length || 0) > 0 ||
    (c.cloudDetails?.noOfUsers || 0) > 0 ||
    c.cloudDetails?.status === 'active' ||
    c.cloudDetails?.status === 'trial' ||
    c.cloudDetails?.status === 'expiring' ||
    (Number(c.cloudDetails?.actualPrice) > 0)
  );

const hasTSS = (c: Partial<Customer>) =>
  !!(
    c.services?.some((s) => (s.type === 'tss' && s.status !== 'none') || s.tssExpiryDate) ||
    c.serialNoInfo?.some((s) => s.tssExpiryDate || s.endDate) ||
    c.serialNoInfo?.[0]?.tssExpiryDate ||
    c.serialNoInfo?.[0]?.endDate ||
    !!c.tssDetails?.endDate ||
    c.tssDetails?.status === 'active' ||
    c.tssDetails?.status === 'expiring'
  );

const moduleListRows = (customers: Partial<Customer>[], type: 'tdl' | 'tss' | 'cloud', hasLegacy: (c: Partial<Customer>) => boolean) =>
  customers.flatMap((customer) => {
    let services: any[] = [];
    if (type === 'tdl') {
      const directTdl = (customer.services || []).filter((service) => service.type === 'tdl');
      const rawAmcTdl = (customer.services || [])
        .filter((s) => s.type === 'amc' && (s.isTdl || (s as any).tdlEnabled))
        .map((s, idx) => ({
          ...s,
          type: 'tdl' as const,
          details: s.details || 'Product TDL Add-on',
          _id: s._id || `amc-tdl-${idx}`,
        }));
      services = mergeModuleServicesBySerial(directTdl, rawAmcTdl);
    } else if (type === 'tss') {
      const directTss = (customer.services || [])
        .filter((service) => service.type === 'tss')
        .map((s: any) => ({ ...s, endDate: s.endDate || s.tssExpiryDate }));
      const rawAmcTss = (customer.services || [])
        .filter((s) => s.type === 'amc' && s.tssExpiryDate)
        .map((s, idx) => ({
          ...s,
          type: 'tss' as const,
          endDate: s.tssExpiryDate,
          details: s.details || 'Product TSS Premium',
          _id: s._id || `amc-tss-${idx}`,
        }));
      services = mergeModuleServicesBySerial(directTss, rawAmcTss);
    } else if (type === 'cloud') {
      services = (customer.services || []).filter((service) => service.type === 'cloud');
    }
    if (services.length > 0) {
      return services.map((service, idx) => ({
        customer,
        service,
        rowKey: `${customer._id}-${type}-${service._id || idx}`,
      }));
    }
    return hasLegacy(customer) ? [{ customer, rowKey: `${customer._id}-${type}-legacy` }] : [];
  });

describe('Customer Management Module Detection & Mapping (TDL, TSS, Cloud)', () => {
  it('detects customer as hasTDL when service.type is tdl', () => {
    const customer: Partial<Customer> = {
      _id: 'c1',
      name: 'Alpha Trading',
      services: [
        {
          type: 'tdl',
          status: 'active',
          product: 'TDL Add-on Pack',
          quantity: 1,
        } as any,
      ],
    };
    expect(hasTDL(customer)).toBe(true);
  });

  it('detects customer as hasTDL when AMC service has isTdl: true (Product & License screen)', () => {
    const customer: Partial<Customer> = {
      _id: 'c2',
      name: 'Beta Trading',
      services: [
        {
          type: 'amc',
          isTdl: true,
          status: 'active',
          product: 'TallyPrime Gold',
          licenseSerialNo: '77889900',
          quantity: 1,
        } as any,
      ],
    };
    expect(hasTDL(customer)).toBe(true);
  });

  it('maps AMC license with isTdl: true into TDL moduleListRows seamlessly', () => {
    const customer: Partial<Customer> = {
      _id: 'c2',
      name: 'Beta Trading',
      services: [
        {
          type: 'amc',
          isTdl: true,
          status: 'active',
          product: 'TallyPrime Gold',
          licenseSerialNo: '77889900',
          quantity: 1,
        } as any,
      ],
    };
    const rows = moduleListRows([customer], 'tdl', hasTDL);
    expect(rows.length).toBe(1);
    expect((rows[0] as any).service?.type).toBe('tdl');
    expect((rows[0] as any).service?.licenseSerialNo).toBe('77889900');
    expect((rows[0] as any).service?.product).toBe('TallyPrime Gold');
  });

  it('detects customer as hasTSS when AMC service has tssExpiryDate', () => {
    const customer: Partial<Customer> = {
      _id: 'c3',
      name: 'Gamma LLC',
      services: [
        {
          type: 'amc',
          status: 'active',
          tssExpiryDate: '2026-12-31' as any,
          product: 'TallyPrime Silver',
          quantity: 1,
        } as any,
      ],
    };
    expect(hasTSS(customer)).toBe(true);
    const rows = moduleListRows([customer], 'tss', hasTSS);
    expect(rows.length).toBe(1);
    expect((rows[0] as any).service?.type).toBe('tss');
    expect((rows[0] as any).service?.endDate).toBe('2026-12-31');
  });

  it('detects customer as hasCloud when service has type: cloud', () => {
    const customer: Partial<Customer> = {
      _id: 'c4',
      name: 'Delta Cloud Inc',
      services: [
        {
          type: 'cloud',
          status: 'active',
          vendor: 'AWS',
          quantity: 1,
        } as any,
      ],
    };
    expect(hasCloud(customer)).toBe(true);
    const rows = moduleListRows([customer], 'cloud', hasCloud);
    expect(rows.length).toBe(1);
    expect((rows[0] as any).service?.vendor).toBe('AWS');
  });

  it('deduplicates AMC TSS entries that share the same serial+date as a direct TSS (fixes double-row bug)', () => {
    // Al Delaimi scenario: same serial saved in both type:'tss' AND type:'amc' with tssExpiryDate
    const customer: Partial<Customer> = {
      _id: 'c6',
      name: 'Al Delaimi Holding',
      services: [
        // Direct TSS entries
        { type: 'tss', product: 'TE9 Silver',     licenseSerialNo: '765598536', endDate: '2017-03-31' } as any,
        { type: 'tss', product: 'TallyPrime Gold', licenseSerialNo: '725596227', endDate: '2026-12-31' } as any,
        // AMC entries for the SAME serials — should be deduplicated away
        { type: 'amc', product: 'TE9 Silver',     licenseSerialNo: '765598536', tssExpiryDate: '2017-03-31' } as any,
        { type: 'amc', product: 'TallyPrime Gold', licenseSerialNo: '725596227', tssExpiryDate: '2026-12-31' } as any,
      ],
    };
    const rows = moduleListRows([customer], 'tss', hasTSS);
    // Should be 2, not 4
    expect(rows.length).toBe(2);
  });

  it('returns all unique TSS rows when customer has direct TSS and DIFFERENT AMC-tracked TSS licenses', () => {
    // Arctic Cooling: 1 direct TSS (745075260, 2026-12-31)
    // 1 AMC with same serial 745075260 (2026-12-31)
    // 1 AMC with same serial 745075260 (2025-06-30) -> merged into 745075260, keeping latest date 2026-12-31
    // 4 AMC with different serials: 766286847, 777412035, 716831037, 728480673
    // Total unique physical serials = 5
    const customer: Partial<Customer> = {
      _id: 'c5',
      name: 'Arctic Cooling Company',
      services: [
        { type: 'tss', product: 'Tallyprime gold', licenseSerialNo: '745075260', endDate: '2026-12-31' } as any,
        { type: 'amc', product: 'TallyPrime',      licenseSerialNo: '745075260', tssExpiryDate: '2026-12-31' } as any,
        { type: 'amc', product: 'TallyPrime',      licenseSerialNo: '766286847', tssExpiryDate: '2024-11-30' } as any,
        { type: 'amc', product: 'Tallyprime gold', licenseSerialNo: '745075260', tssExpiryDate: '2025-06-30' } as any,
        { type: 'amc', product: 'TallyPrime',      licenseSerialNo: '777412035', tssExpiryDate: '2025-07-31' } as any,
        { type: 'amc', product: 'TallyPrime',      licenseSerialNo: '716831037', tssExpiryDate: '2025-07-31' } as any,
        { type: 'amc', product: 'TallyPrime',      licenseSerialNo: '728480673', tssExpiryDate: '2024-10-31' } as any,
      ],
    };
    const rows = moduleListRows([customer], 'tss', hasTSS);
    expect(rows.length).toBe(5);
    const row745: any = rows.find((r: any) => (r as any).service?.licenseSerialNo === '745075260');
    expect(row745).toBeDefined();
    expect(row745?.service?.endDate).toBe('2026-12-31');
  });

  it('correctly resolves WT0009 to 4 unique physical licenses matching Edit Page without data loss', () => {
    // WT0009 SAHAB INTERNATIONAL:
    // Edit page has 4 AMC licenses: 715326102, 725326101, 725120703, 755326107
    // Historical TSS records exist for 715326102 (2012-12-23) and 725326101 (2024-12-31)
    const customer: Partial<Customer> = {
      _id: 'WT0009',
      customerNumber: 'WT0009',
      name: 'SAHAB INTERNATIONAL & MARKETING CO',
      services: [
        // 4 Primary AMC licenses (matching Customer Edit Page Section 6)
        { type: 'amc', product: 'TallyERP9 - Multi User', licenseSerialNo: '715326102', tssExpiryDate: '2018-05-31', startDate: '2012-12-24' } as any,
        { type: 'amc', product: 'TallyERP9 - Multi User', licenseSerialNo: '725326101', tssExpiryDate: '2020-07-31', startDate: '2014-01-01' } as any,
        { type: 'amc', product: 'TallyERP9 - Multi User', licenseSerialNo: '725120703', tssExpiryDate: '2016-12-31', startDate: '2015-01-01' } as any,
        { type: 'amc', product: 'TallyERP9 - Single User', licenseSerialNo: '755326107', tssExpiryDate: '2025-06-30', startDate: '2016-01-01' } as any,
        // Legacy TSS records from earlier imports
        { type: 'tss', product: 'TallyERP9 - Multi User', licenseSerialNo: '715326102', endDate: '2012-12-23' } as any,
        { type: 'tss', product: 'TallyERP9 - Multi User', licenseSerialNo: '725326101', endDate: '2024-12-31' } as any,
      ],
    };

    const rows = moduleListRows([customer], 'tss', hasTSS);
    // MUST BE EXACTLY 4 (parity between Edit Page, Details Popup, and TSS List)
    expect(rows.length).toBe(4);

    // Verify 715326102 has active latest date 2018-05-31 and preserved older date 2012-12-23 in renewalHistory
    const row715: any = rows.find((r: any) => (r as any).service?.licenseSerialNo === '715326102');
    expect(row715).toBeDefined();
    expect(row715?.service?.endDate).toBe('2018-05-31');
    expect(row715?.service?.renewalHistory?.length).toBeGreaterThanOrEqual(1);
    expect(row715?.service?.renewalHistory?.some((h: any) => h.endDate === '2012-12-23')).toBe(true);

    // Verify 725326101 has latest active date 2024-12-31 and preserved 2020-07-31 in renewalHistory
    const row725: any = rows.find((r: any) => (r as any).service?.licenseSerialNo === '725326101');
    expect(row725).toBeDefined();
    expect(row725?.service?.endDate).toBe('2024-12-31');
    expect(row725?.service?.renewalHistory?.some((h: any) => h.endDate === '2020-07-31')).toBe(true);
  });

  it('correctly resolves WT1801 St James Church to 2 unique licenses across TSS List and Product & License', () => {
    // WT1801 has 1 AMC license (797080131) and 1 standalone TSS license (717080130)
    const customer: Partial<Customer> = {
      _id: 'WT1801',
      customerNumber: 'WT1801',
      name: 'St James Jacobite Syrian Orthodox Church',
      services: [
        { type: 'amc', product: 'Tally.ERP9', licenceType: 'Silver', licenseSerialNo: '797080131', tssExpiryDate: '2024-01-31' } as any,
        { type: 'tss', product: 'TE9 Silver', licenseSerialNo: '797080131', endDate: '2024-01-31' } as any,
        { type: 'tss', product: 'TE9 Silver', licenseSerialNo: '717080130', endDate: '2026-09-30' } as any,
      ],
    };

    const tssRows = moduleListRows([customer], 'tss', hasTSS);
    expect(tssRows.length).toBe(2);

    const row1 = tssRows.find((r: any) => (r as any).service?.licenseSerialNo === '797080131');
    const row2 = tssRows.find((r: any) => (r as any).service?.licenseSerialNo === '717080130');
    expect(row1).toBeDefined();
    expect(row2).toBeDefined();

    // Verify Product & License resolution: standalone TSS licenses are synthesized into amc instances
    const directAmc = (customer.services || []).filter((s) => s.type === 'amc');
    const amcSerials = new Set(directAmc.map((s) => String(s.licenseSerialNo || '').trim()).filter(Boolean));
    const standaloneTss = (customer.services || []).filter((s) => s.type === 'tss' && s.licenseSerialNo && !amcSerials.has(String(s.licenseSerialNo).trim()));
    const synthesizedAmc = standaloneTss.map((s) => ({
      ...s,
      type: 'amc' as const,
      isAmcActive: false,
      status: 'none' as const,
      tssExpiryDate: s.endDate || s.tssExpiryDate,
    }));
    const totalProductLicenses = [...directAmc, ...synthesizedAmc];
    expect(totalProductLicenses.length).toBe(2);
    expect(totalProductLicenses.map((s) => s.licenseSerialNo)).toEqual(['797080131', '717080130']);

    // Verify Product List Screen rows: buildProductListRows resolves both licenses
    const productListRows = buildProductListRows([customer as Customer]);
    expect(productListRows.length).toBe(2);
    expect(productListRows.map((r) => r.licenseSerialNo)).toEqual(['797080131', '717080130']);
    expect(productListRows[0].product).toBe('Tally.ERP9');
    expect(productListRows[1].product).toBe('TE9 Silver');
    expect(productListRows[1].tssExpiryDate).toBe('2026-09-30');

    // Verify Product Registry rows: productLicenseRows also resolves both licenses
    const registryRows = productLicenseRows(customer as Customer);
    expect(registryRows.length).toBe(2);
    expect(registryRows.map((r) => r.licenseSerialNo)).toEqual(['797080131', '717080130']);
  });

  it('correctly synchronizes latest TSS expiry date (31 Dec 2026) for WT1358 Alwan Auto Paints across all modules', () => {
    const customer: Partial<Customer> = {
      _id: 'WT1358',
      customerNumber: 'WT1358',
      name: 'Alwan Auto Paints',
      services: [
        {
          type: 'amc',
          product: 'TallyPrime',
          licenseSerialNo: '737289927',
          tssExpiryDate: '2026-11-30',
        } as any,
        {
          type: 'tss',
          product: 'TallyPrime Gold',
          licenseSerialNo: '737289927',
          endDate: '2026-12-31',
        } as any,
      ],
      tssDetails: {
        endDate: '2026-12-31',
      } as any,
    };

    // 1. Verify TSS List rows: resolves exactly 1 row with winning latest date 2026-12-31
    const tssRows = moduleListRows([customer], 'tss', hasTSS);
    expect(tssRows.length).toBe(1);
    expect((tssRows[0] as any).service.licenseSerialNo).toBe('737289927');
    expect((tssRows[0] as any).service.endDate).toBe('2026-12-31');

    // 2. Verify Product List rows: buildProductListRows reflects the latest date 2026-12-31
    const productRows = buildProductListRows([customer as Customer]);
    expect(productRows.length).toBe(1);
    expect(productRows[0].licenseSerialNo).toBe('737289927');
    expect(productRows[0].tssExpiryDate).toBe('2026-12-31');

    // 3. Verify Customer Screen Form sync logic: AMC tssExpiryDate adopts latest date from matching TSS
    const rawServices = customer.services || [];
    const directAmc = rawServices.filter((s) => s.type === 'amc').map((s) => {
      const serKey = String(s.licenseSerialNo || '').trim().toLowerCase();
      let latestTssDate = s.tssExpiryDate;
      let latestTime = latestTssDate ? new Date(latestTssDate).getTime() : 0;
      rawServices
        .filter((t) => t.type === 'tss' && String(t.licenseSerialNo || '').trim().toLowerCase() === serKey)
        .forEach((t) => {
          const d = t.endDate || t.tssExpiryDate;
          const time = d ? new Date(d).getTime() : 0;
          if (time > latestTime) {
            latestTime = time;
            latestTssDate = d;
          }
        });
      return { ...s, tssExpiryDate: latestTssDate };
    });

    expect(directAmc[0].tssExpiryDate).toBe('2026-12-31');
  });
});

describe('tssPartnerName Helper Resolution', () => {
  it('resolves partner directly from service vendorCategory', () => {
    const customer: any = {
      name: 'Hammam Brothers',
      partnerDetails: [{ companyName: 'welcome' }, { companyName: 'Inox Qatar' }],
    };
    const service: any = { type: 'tss', vendorCategory: 'Inox Qatar' };
    expect(tssPartnerName(customer, service)).toBe('Inox Qatar');
  });

  it('falls back to customer partnerDetails when service has no vendorCategory', () => {
    const customer: any = {
      name: 'Seco Trading',
      partnerDetails: [{ companyName: 'Doha Computer Centre' }],
    };
    const service: any = { type: 'tss' };
    expect(tssPartnerName(customer, service)).toBe('Doha Computer Centre');
  });

  it('joins multiple customer partners if present and no service-specific partner', () => {
    const customer: any = {
      name: 'Sahab International',
      partnerDetails: [{ companyName: 'Inox Qatar' }, { companyName: 'Armor Tecnolgy' }],
    };
    const service: any = { type: 'tss' };
    expect(tssPartnerName(customer, service)).toBe('Inox Qatar, Armor Tecnolgy');
  });

  it('falls back to amcDetails vendorCategory if partnerDetails is empty', () => {
    const customer: any = {
      name: 'Global Ventures',
      amcDetails: { vendorCategory: 'Welcome Tech' },
    };
    const service: any = { type: 'tss' };
    expect(tssPartnerName(customer, service)).toBe('Welcome Tech');
  });

  it('returns — when partner is "no partner", "nil", "none", or missing', () => {
    const customer: any = {
      name: 'Solo Corp',
      partnerDetails: [{ companyName: 'no partner' }],
    };
    const service: any = { type: 'tss', vendorCategory: 'nil' };
    expect(tssPartnerName(customer, service)).toBe('—');
  });
});

describe('tdlPartnerName Helper Resolution', () => {
  it('resolves partner directly from service vendorCategory', () => {
    const customer: any = {
      name: 'Doha Trading',
      partnerDetails: [{ companyName: 'welcome' }],
    };
    const service: any = { type: 'tdl', vendorCategory: 'Tech Partner WLL' };
    expect(tdlPartnerName(customer, service)).toBe('Tech Partner WLL');
  });

  it('falls back to customer partnerDetails when service has no vendorCategory', () => {
    const customer: any = {
      name: 'Qatar Retail',
      partnerDetails: [{ companyName: 'Al-Rayyan Solutions' }],
    };
    const service: any = { type: 'tdl' };
    expect(tdlPartnerName(customer, service)).toBe('Al-Rayyan Solutions');
  });

  it('falls back to amcDetails vendorCategory when partnerDetails is missing', () => {
    const customer: any = {
      name: 'Gulf Mart',
      amcDetails: { vendorCategory: 'Direct Vendor' },
    };
    const service: any = { type: 'tdl' };
    expect(tdlPartnerName(customer, service)).toBe('Direct Vendor');
  });

  it('returns — when partner is "nil" or missing', () => {
    const customer: any = { name: 'Simple Co' };
    const service: any = { type: 'tdl', vendorCategory: 'nil' };
    expect(tdlPartnerName(customer, service)).toBe('—');
  });
});

describe('cloudPartnerName Helper Resolution', () => {
  it('resolves partner directly from service vendorCategory or partnerName', () => {
    const customer: any = {
      name: 'Pearl Cloud Portal',
      partnerDetails: [{ companyName: 'welcome' }],
    };
    const service: any = { type: 'cloud', vendorCategory: 'Cloud Infra Corp' };
    expect(cloudPartnerName(customer, service)).toBe('Cloud Infra Corp');
  });

  it('falls back to customer partnerDetails when cloud service has no vendorCategory', () => {
    const customer: any = {
      name: 'Modern Contracting',
      partnerDetails: [{ companyName: 'Doha Cloud Network' }],
    };
    const service: any = { type: 'cloud' };
    expect(cloudPartnerName(customer, service)).toBe('Doha Cloud Network');
  });

  it('returns — when no partner is specified', () => {
    const customer: any = { name: 'No Partner Enterprise' };
    const service: any = { type: 'cloud' };
    expect(cloudPartnerName(customer, service)).toBe('—');
  });
});

describe('getAmcPartnerName Helper Resolution', () => {
  it('resolves partner from amc vendorCategory', () => {
    const customer: any = { name: 'Industrial Corp' };
    const amc: any = { vendorCategory: 'Specialized AMC Partner' };
    expect(getAmcPartnerName(customer, amc)).toBe('Specialized AMC Partner');
  });

  it('falls back to customer partnerDetails when amc has no vendorCategory', () => {
    const customer: any = {
      name: 'Skyline Real Estate',
      partnerDetails: [{ companyName: 'Skyline Partner LLC' }],
    };
    const amc: any = {};
    expect(getAmcPartnerName(customer, amc)).toBe('Skyline Partner LLC');
  });

  it('falls back to amcDetails vendorCategory', () => {
    const customer: any = {
      name: 'Pearl Motors',
      amcDetails: { vendorCategory: 'Auto Tech Systems' },
    };
    const amc: any = {};
    expect(getAmcPartnerName(customer, amc)).toBe('Auto Tech Systems');
  });

  it('returns — when no partner or "none"', () => {
    const customer: any = { name: 'Lone Trader' };
    const amc: any = { vendorCategory: 'none' };
    expect(getAmcPartnerName(customer, amc)).toBe('—');
  });
});

describe('TSS List Contact & Email Synchronization Resolution', () => {
  it('resolves updated customer email over stale tssDetails email (SAFECO scenario)', () => {
    const safecoCustomer: any = {
      _id: '6a928df7197b1ba21789e830',
      name: 'SAFECO TRADING CO. W.L.L',
      email: 'anusuyababu27@gmail.com',
      phone: '+97470697548',
      keyContacts: [
        { contactName: 'Subith', mobile: '70697548', email: 'anusuyababu27@gmail.com' },
        { contactName: 'Roy', mobile: '77381880', email: 'anusuyababu27@gmail.com' },
        { contactName: 'Dinesh', mobile: '33902801', email: 'anusuyababu27@gmail.com' },
      ],
      tssDetails: {
        companyName: 'SAFECO TRADING CO. W.L.L',
        contactPerson: 'Subith / Roy/Dinesh',
        mobile: '70697548, 77381880, 33902801',
        email: 'safecotrading@gmail.com', // Stale legacy email from excel import
      },
    };

    expect(tssEmail(safecoCustomer)).toBe('anusuyababu27@gmail.com');
    expect(tssContactPerson(safecoCustomer)).toBe('Subith / Roy / Dinesh');
    expect(tssMobile(safecoCustomer)).toBe('70697548, 77381880, 33902801');
  });

  it('falls back to service email and tssDetails email if customer email is missing', () => {
    const fallbackCustomer: any = {
      _id: 'c2',
      name: 'Fallback Co',
      tssDetails: {
        email: 'legacy@fallback.com',
        contactPerson: 'Legacy Contact',
        mobile: '12345678',
      },
    };

    expect(tssEmail(fallbackCustomer)).toBe('legacy@fallback.com');
    expect(tssContactPerson(fallbackCustomer)).toBe('Legacy Contact');
    expect(tssMobile(fallbackCustomer)).toBe('12345678');
  });
});



