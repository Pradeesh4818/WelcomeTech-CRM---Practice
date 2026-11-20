import { describe, it, expect } from 'vitest';
import { flattenRecord } from '../excelExport';
import { getActiveCurrency } from '../helpers';
import { productListExportRows } from '../../pages/Customers/ProductListPage';
import { amcListExportRows } from '../../pages/AMC/AMCPages';
import {
  tdlListExportRows,
  tssListExportRows,
  cloudListExportRows,
  customerManagementExportRows,
} from '../../pages/Customers/CustomerManagementPages';
import {
  proposalsListExportRows,
  proposalTemplatesListExportRows,
} from '../../pages/Misc/MiscPages';
import { AMC, Customer, Proposal, ProposalTemplate } from '../../types';

describe('Table Export Functions & Status Preservation', () => {
  describe('Product List Export Rows', () => {
    it('maps serial rows to the exact 25 tabular columns in the Product List table including all status columns', () => {
      const mockSerialRows: any[] = [
        {
          licenseSerialNo: '7654321',
          product: 'TallyPrime Gold',
          releaseVersion: 'Release 4.0',
          companyName: 'Al Rayyan Trading LLC',
          primaryContactPerson: 'Ahmed Ali',
          secondaryContactName: 'Omar Khan',
          primaryMobile: '+97455123456',
          secondaryMobile: '+97455654321',
          landline: '+97444112233',
          tssExpiryDate: '2026-12-31',
          sourceStatus: 'active',
          partnerDetailsText: 'Partner Alpha',
          salesman: 'John Sales',
          locationArea: 'West Bay, Doha',
          fullAddress: 'Building 12, West Bay, Doha, Qatar',
          emailId: 'info@alrayyan.qa',
          tssPassword: 'Password123',
          website: 'https://alrayyan.qa',
          websiteStatus: 'Active',
          amcStatusText: 'Active',
          tdlStatusText: 'Yes',
          cloudStatusText: 'Yes',
          tallyLedger: 'Ledger-01',
          group: 'Al Rayyan Group',
        },
      ];

      const exported = productListExportRows(mockSerialRows);
      expect(exported).toHaveLength(1);
      expect(exported[0]).toEqual({
        'S NO': 1,
        'Serial No': '7654321',
        Product: 'TallyPrime Gold',
        Release: 'Release 4.0',
        'Org Name': 'Al Rayyan Trading LLC',
        'Primary Contact Person': 'Ahmed Ali',
        'Secondary Contact Name': 'Omar Khan',
        'Primary Mobile': '+97455123456',
        'Secondary Mobile': '+97455654321',
        Landline: '+97444112233',
        'TSS Expiry Date': '31 Dec 2026',
        Status: 'Active',
        'Partner details': 'Partner Alpha',
        Salesman: 'John Sales',
        'Location/Area': 'West Bay, Doha',
        'Full Address': 'Building 12, West Bay, Doha, Qatar',
        'Email ID': 'info@alrayyan.qa',
        'TSS Password': 'Password123',
        Website: 'https://alrayyan.qa',
        'Website Status': 'Active',
        'AMC Status': 'Active',
        'TDL Status': 'Yes',
        'Cloud Status': 'Yes',
        'Tally Ledger': 'Ledger-01',
        Group: 'Al Rayyan Group',
      });
      expect(exported[0]).toHaveProperty('Status', 'Active');
      expect(exported[0]).toHaveProperty('Website Status', 'Active');
      expect(exported[0]).toHaveProperty('AMC Status', 'Active');
      expect(exported[0]).toHaveProperty('TDL Status', 'Yes');
      expect(exported[0]).toHaveProperty('Cloud Status', 'Yes');
    });
  });

  describe('AMC List Export Rows', () => {
    it('maps AMC records to the exact 10 tabular columns in the AMC List table including Status', () => {
      const mockAMCs = [
        {
          _id: 'amc-1',
          customer: {
            _id: 'cust-1',
            name: 'Qatar Logistics WLL',
            phone: '+97466778899',
            contact: 'Rashid Mahmoud',
            address: 'Industrial Area, Doha',
            companyInfo: { locationArea: 'Industrial Area' },
            serialNoInfo: [
              {
                product: 'TallyPrime Silver',
                licenseSerialNo: '99887766',
                startDate: '2026-01-01',
                endDate: '2026-12-31',
              },
            ],
          } as unknown as Customer,
          product: 'TallyPrime Silver',
          status: 'active',
          startDate: '2026-01-01',
          expiryDate: '2026-12-31',
          amount: 2500,
          daysLeft: 120,
        },
      ] as unknown as AMC[];

      const exported = amcListExportRows(mockAMCs);
      expect(exported).toHaveLength(1);
      expect(exported[0]).toEqual({
        'S NO': 1,
        'Customer Name': 'Qatar Logistics WLL',
        'Partner Name': '—',
        'Contact Person': 'Rashid Mahmoud',
        'Contact Mobile': '+97466778899',
        Location: 'Industrial Area',
        Product: 'TallyPrime Silver',
        Status: 'Active',
        'Expiry Date': '31 Dec 2026',
        'Days Left': '120d left',
        [`Value (${getActiveCurrency()})`]: 2500,
      });
      expect(exported[0]).toHaveProperty('Status', 'Active');
      expect(exported[0]).toHaveProperty('Partner Name', '—');
    });
  });

  describe('TDL List Export Rows', () => {
    it('maps TDL rows to the exact 14 tabular columns in the TDL List table including Partner Name and Status', () => {
      const mockRows: any[] = [
        {
          customer: {
            _id: 'cust-2',
            name: 'Doha Retailers',
            phone: '+97433221100',
            address: 'Al Sadd',
            partnerDetails: [{ companyName: 'Doha Partner Tech' }],
            companyInfo: { locationArea: 'Al Sadd' },
            tdlDetails: {
              companyName: 'Doha Retailers Main',
              salesman1: 'Saleh',
              salesman2: 'Tariq',
              status: 'active',
              noOfDays: 365,
              startDate: '2026-01-01',
              endDate: '2026-12-31',
              licenseSerialNo: 'TDL-778899',
            },
          },
          service: {
            product: 'Invoice Customization TDL',
            release: 'Rel 4.1',
            licenseSerialNo: 'TDL-778899',
            status: 'active',
            startDate: '2026-01-01',
            endDate: '2026-12-31',
            vendorCategory: 'Doha Partner Tech',
          },
          rowKey: 'cust-2-tdl-0',
        },
      ];

      const exported = tdlListExportRows(mockRows);
      expect(exported).toHaveLength(1);
      expect(exported[0]).toEqual({
        'S NO': 1,
        'Company Name': 'Doha Retailers',
        'Partner Name': 'Doha Partner Tech',
        Mobile: '+97433221100',
        Location: 'Al Sadd',
        'Sales 1': 'Saleh',
        'Sales 2': 'Tariq',
        Product: 'Invoice Customization TDL',
        Release: 'Rel 4.1',
        'Serial No': 'TDL-778899',
        Status: 'Active',
        Days: '365',
        'Start Date': '01 Jan 2026',
        'End Date': '31 Dec 2026',
      });
      expect(exported[0]).toHaveProperty('Status', 'Active');
      expect(exported[0]).toHaveProperty('Partner Name', 'Doha Partner Tech');
    });
  });

  describe('TSS List Export Rows', () => {
    it('maps TSS rows to the exact 11 tabular columns in the TSS List table including Partner Name and Status', () => {
      const mockRows: any[] = [
        {
          customer: {
            _id: 'cust-3',
            name: 'Lusail Contracting',
            email: 'contact@lusail.qa',
            phone: '+97477889900',
            contact: 'Nasser Al-Khelaifi',
            partnerDetails: [{ companyName: 'Welcome Partner' }],
            tssDetails: {
              companyName: 'Lusail Contracting HO',
              contactPerson: 'Nasser Al-Khelaifi',
              mobile: '+97477889900',
              email: 'tss@lusail.qa',
              status: 'active',
              licenseSerialNo: 'TSS-909090',
            },
          },
          service: {
            product: 'TSS Silver Subscription',
            release: '4.0',
            licenseSerialNo: 'TSS-909090',
            endDate: '2027-11-30',
            status: 'active',
            vendorCategory: 'Welcome Partner',
          },
          rowKey: 'cust-3-tss-0',
        },
      ];

      const exported = tssListExportRows(mockRows);
      expect(exported).toHaveLength(1);
      expect(exported[0]).toEqual({
        'S NO': 1,
        'Company Name': 'Lusail Contracting',
        'Partner Name': 'Welcome Partner',
        Product: 'TSS Silver Subscription',
        Release: '4.0',
        'License Serial': 'TSS-909090',
        'Expiry Date': '30 Nov 2027',
        Contact: 'Nasser Al-Khelaifi',
        Mobile: '+97477889900',
        Email: 'contact@lusail.qa',
        Status: 'Active',
      });
      expect(exported[0]).toHaveProperty('Status', 'Active');
      expect(exported[0]).toHaveProperty('Partner Name', 'Welcome Partner');
    });
  });

  describe('Cloud List Export Rows', () => {
    it('maps Cloud rows to the exact 11 tabular columns in the Cloud List table including Partner Name and Status', () => {
      const mockRows: any[] = [
        {
          customer: {
            _id: 'cust-4',
            name: 'Pearl Enterprises',
            partnerDetails: [{ companyName: 'Cloud Solutions Inc' }],
            cloudDetails: {
              companyName: 'Pearl Cloud Portal',
              vendor: 'AWS Cloud',
              release: 'v3.2',
              domainLinkSubId: 'pearl.welcometech.cloud',
              noOfUsers: 5,
              startDate: '2026-02-01',
              cloudExpiryDate: '2027-01-31',
              status: 'active',
              users: [
                { username: 'admin_pearl' },
                { username: 'user1_pearl' },
              ],
            },
          },
          service: {
            product: 'AWS Cloud',
            release: 'v3.2',
            domainLinkSubId: 'pearl.welcometech.cloud',
            noOfUsers: 5,
            startDate: '2026-02-01',
            endDate: '2027-01-31',
            status: 'active',
            vendorCategory: 'Cloud Solutions Inc',
            users: [
              { username: 'admin_pearl' },
              { username: 'user1_pearl' },
            ],
          },
          rowKey: 'cust-4-cloud-0',
        },
      ];

      const exported = cloudListExportRows(mockRows);
      expect(exported).toHaveLength(1);
      expect(exported[0]).toEqual({
        'S NO': 1,
        'Company Name': 'Pearl Enterprises',
        'Partner Name': 'Cloud Solutions Inc',
        Product: 'AWS Cloud',
        Release: 'v3.2',
        'Domain / Sub ID': 'pearl.welcometech.cloud',
        Users: '5',
        'Start Date': '01 Feb 2026',
        'End Date': '31 Jan 2027',
        'User Details': 'admin_pearl, user1_pearl',
        Status: 'Active',
      });
      expect(exported[0]).toHaveProperty('Status', 'Active');
      expect(exported[0]).toHaveProperty('Partner Name', 'Cloud Solutions Inc');
    });
  });

  describe('Proposals & Templates Export Rows', () => {
    it('maps proposals to tabular columns with Status', () => {
      const mockProposals = [
        {
          _id: 'prop-1',
          proposalNo: 'WT-P20260101',
          customerName: 'Gulf Trading',
          title: 'TallyPrime Subscription',
          total: 4500,
          validUntil: '2026-06-30',
          status: 'sent',
          items: [],
          subtotal: 4500,
          discount: 0,
          createdBy: 'user-1',
          createdAt: '2026-01-01',
        },
      ] as unknown as Proposal[];

      const exported = proposalsListExportRows(mockProposals);
      expect(exported).toHaveLength(1);
      expect(exported[0]).toHaveProperty('Proposal #', 'WT-P20260101');
      expect(exported[0]).toHaveProperty('Status', 'Sent');
    });

    it('resolves Customer from customerName, customer object, or customerEmail fallback', () => {
      const proposals = [
        {
          _id: 'p-1',
          proposalNo: 'PROP-001',
          customerName: 'Direct Client Ltd',
          total: 1000,
        },
        {
          _id: 'p-2',
          proposalNo: 'PROP-002',
          customer: { name: 'Populated Corp' },
          total: 2000,
        },
        {
          _id: 'p-3',
          proposalNo: 'PROP-003',
          customerEmail: 'lead@example.com',
          total: 3000,
        },
        {
          _id: 'p-4',
          proposalNo: 'PROP-004',
          total: 4000,
        },
      ] as unknown as Proposal[];

      const rows = proposalsListExportRows(proposals);
      expect(rows[0].Customer).toBe('Direct Client Ltd');
      expect(rows[1].Customer).toBe('Populated Corp');
      expect(rows[2].Customer).toBe('lead@example.com');
      expect(rows[3].Customer).toBe('—');
    });

    it('maps proposal templates to tabular columns with Status', () => {
      const mockTemplates = [
        {
          _id: 'tmpl-1',
          name: 'Standard ERP Package',
          title: 'ERP Solution Template',
          validForDays: 14,
          discount: 10,
          status: 'active',
          isActive: true,
          items: [{ description: 'License', qty: 1, unitPrice: 2000, total: 2000 }],
        },
      ] as unknown as ProposalTemplate[];

      const exported = proposalTemplatesListExportRows(mockTemplates);
      expect(exported).toHaveLength(1);
      expect(exported[0]).toHaveProperty('Template Name', 'Standard ERP Package');
      expect(exported[0]).toHaveProperty('Status', 'Active');
    });
  });

  describe('Customer Management Export Rows', () => {
    it('maps general customer management list to tabular columns with Status', () => {
      const mockCustomers = [
        {
          _id: 'cust-10',
          name: 'Apex Solutions',
          contact: 'Fahad Al-Nuaimi',
          phone: '+97455998877',
          products: ['TallyPrime Gold'],
          status: 'active',
          amcStatus: 'active',
          updatedAt: '2026-08-01',
        },
      ] as unknown as Customer[];

      const exported = customerManagementExportRows(mockCustomers);
      expect(exported).toHaveLength(1);
      expect(exported[0]).toEqual({
        'S NO': 1,
        Customer: 'Apex Solutions',
        Contact: 'Fahad Al-Nuaimi',
        Phone: '+97455998877',
        Products: 'TallyPrime Gold',
        Status: 'Active',
        AMC: 'Active',
        Updated: '01 Aug 2026',
      });
      expect(exported[0]).toHaveProperty('Status', 'Active');
    });
  });

  describe('FlattenRecord Utility Header Preservation', () => {
    it('preserves exact top-level header casing for already flat export rows', () => {
      const flatRow = {
        'S NO': 1,
        'Serial No': '12345',
        'Email ID': 'test@example.com',
        'AMC Status': 'Active',
        'TDL Status': 'Yes',
        Status: 'Active',
        'Value (QAR)': 1500,
      };

      const result = flattenRecord(flatRow);
      expect(result).toEqual({
        'S NO': 1,
        'Serial No': '12345',
        'Email ID': 'test@example.com',
        'AMC Status': 'Active',
        'TDL Status': 'Yes',
        Status: 'Active',
        'Value (QAR)': 1500,
      });
    });
  });
});
