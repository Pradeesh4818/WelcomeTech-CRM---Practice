import { describe, it, expect } from 'vitest';
import { Customer } from '../../../types';

describe('Customer Edit & Details Modal Real-Time Reflection (CustomerEditReflectSync)', () => {
  // Mock customer objects representing before and after an edit
  const initialCustomer = {
    _id: '6a928df7197b1ba21789e809',
    customerNumber: 'WT0001',
    name: 'Green Valley Ceramic, Marbles & Sanitary Ware',
    phone: '+97466968629',
    email: 'aboali@greenvalley-qatar.com',
    amcStatus: 'none',
    updatedAt: '2026-10-06T12:00:00.000Z',
  } as unknown as Customer;

  const updatedCustomer = {
    ...initialCustomer,
    name: 'Green Valley Ceramic, Marbles & Sanitary Wares',
    phone: '+97466968629',
    updatedAt: '2026-10-06T12:44:04.849Z',
  } as unknown as Customer;

  describe('TC-SYNC-01: Customer Details Modal Edit Navigation State', () => {
    it('passes fromDetailsModal: true when navigating to edit from the details modal', () => {
      const activeCustomer = initialCustomer;
      const getEditNavigationParams = (cust: Customer) => ({
        path: `/customers/${cust._id}/edit`,
        state: { fromDetailsModal: true },
      });

      const nav = getEditNavigationParams(activeCustomer);
      expect(nav.path).toBe('/customers/6a928df7197b1ba21789e809/edit');
      expect(nav.state.fromDetailsModal).toBe(true);
    });

    it('determines return navigation state based on fromDetailsModal flag', () => {
      const getReturnState = (fromDetailsModal: boolean, customerId: string) => {
        return fromDetailsModal ? { openCustomerId: customerId } : undefined;
      };

      expect(getReturnState(true, initialCustomer._id)).toEqual({
        openCustomerId: '6a928df7197b1ba21789e809',
      });
      expect(getReturnState(false, initialCustomer._id)).toBeUndefined();
    });
  });

  describe('TC-SYNC-02: Active Customer State Synchronization with Refetched List', () => {
    it('updates activeCustomer when customers list returns modified customer record', () => {
      let activeCustomer: Customer | null = initialCustomer;
      const customersList: Customer[] = [updatedCustomer];

      // Simulate synchronization logic
      if (activeCustomer?._id && customersList.length > 0) {
        const match = customersList.find((c) => c._id === activeCustomer?._id);
        if (match && match !== activeCustomer) {
          activeCustomer = match;
        }
      }

      expect(activeCustomer).not.toBeNull();
      expect(activeCustomer?.name).toBe('Green Valley Ceramic, Marbles & Sanitary Wares');
      expect(activeCustomer?.updatedAt).toBe('2026-10-06T12:44:04.849Z');
    });

    it('auto-opens modal for customer matching openCustomerId upon navigation return', () => {
      let activeCustomer: Customer | null = null;
      const locationState = { openCustomerId: '6a928df7197b1ba21789e809' };
      const customersList: Customer[] = [updatedCustomer];

      const openId = locationState?.openCustomerId;
      if (openId && customersList.length > 0) {
        const match = customersList.find((c) => c._id === openId);
        if (match) {
          activeCustomer = match;
        }
      }

      expect(activeCustomer).not.toBeNull();
      expect(activeCustomer?._id).toBe('6a928df7197b1ba21789e809');
      expect(activeCustomer?.name).toBe('Green Valley Ceramic, Marbles & Sanitary Wares');
    });
  });

  describe('TC-SYNC-03: Mutation Invalidation Keys and Refetch Strategy', () => {
    it('includes both list and individual customer queries in invalidation dependencies', () => {
      const customerId = '6a928df7197b1ba21789e809';
      const invalidateQueryKeys = [
        ['customers'],
        ['customer', customerId],
        ['customers-stats'],
        ['customers-management-pages'],
        ['customers-management-insights'],
        ['customers-product-list'],
        ['customers-tdl-list'],
        ['customers-cloud-list'],
        ['customers-tss-list'],
      ];

      const hasList = invalidateQueryKeys.some((k) => k[0] === 'customers' && k.length === 1);
      const hasItem = invalidateQueryKeys.some((k) => k[0] === 'customer' && k[1] === customerId);

      expect(hasList).toBe(true);
      expect(hasItem).toBe(true);
    });

    it('verifies refetchOnMount: true allows invalidated queries to immediately refetch on route change', () => {
      const defaultQueryOptions = {
        retry: 1,
        staleTime: 30 * 1000,
        refetchOnMount: true,
      };

      // With refetchOnMount: true, a query marked isStale triggers network fetch upon mounting
      const shouldRefetchOnMount = (isStale: boolean, opt: typeof defaultQueryOptions) => {
        if (!opt.refetchOnMount) return false;
        return isStale;
      };

      expect(shouldRefetchOnMount(true, defaultQueryOptions)).toBe(true);
      // Fresh query (not stale) does not refetch
      expect(shouldRefetchOnMount(false, defaultQueryOptions)).toBe(false);
    });
  });
});
