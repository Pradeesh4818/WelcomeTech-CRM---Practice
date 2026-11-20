import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MutationCache, QueryClient, QueryClientProvider, QueryKey } from '@tanstack/react-query';
import App from './App';
import './index.css';

let queryClient: QueryClient;

type AppMutationMeta = {
  invalidateQueryKeys?: QueryKey[];
  skipAutoInvalidate?: boolean;
};

const queryKeyDependencies: Record<string, QueryKey[]> = {
  products: [
    ['products'],
    ['products-list'],
    ['products-active-for-leads'],
    ['customers'],
    ['customers-stats'],
    ['customers-product-list'],
    ['customers-management-pages'],
    ['customers-management-insights'],
    ['customers-all'],
    ['lead-existing-customers'],
    ['leads'],
  ],
  'licence-types': [
    ['licence-types'],
    ['customers'],
    ['customers-stats'],
    ['customers-product-list'],
    ['customers-management-pages'],
    ['customers-management-insights'],
    ['customers-all'],
    ['amcs'],
    ['amc-insights'],
    ['amc-insights-kpis'],
  ],
  'customer-types': [
    ['customer-types'],
    ['customers'],
    ['customers-stats'],
    ['customers-product-list'],
    ['customers-management-pages'],
    ['customers-management-insights'],
    ['customers-all'],
  ],
  'lead-sources': [
    ['lead-sources'],
    ['lead-sources-active'],
    ['leads'],
    ['lead-dashboard'],
    ['lead-detail'],
  ],
  'lead-statuses': [
    ['lead-statuses'],
    ['lead-statuses-active'],
    ['leads'],
    ['lead-dashboard'],
    ['lead-detail'],
    ['tasks'],
  ],
  'vendor-categories': [
    ['vendor-categories'],
    ['vendor-categories-all'],
    ['customer-form-vendor-categories'],
    ['customers'],
    ['customers-stats'],
    ['customers-product-list'],
    ['customers-management-pages'],
    ['customers-management-insights'],
    ['customers-cloud-list'],
    ['customers-tdl-list'],
    ['customers-tss-list'],
    ['customers-all'],
  ],
  'ticket-categories': [
    ['ticket-categories'],
    ['tickets'],
    ['tasks'],
    ['tasks-dashboard'],
  ],
  employees: [
    ['employees'],
    ['admin-users'],
    ['engineers'],
    ['task-staff'],
    ['employees-active-for-leads'],
    ['tasks'],
    ['tasks-dashboard'],
    ['tickets'],
    ['calls'],
    ['amcs'],
  ],
  'admin-users': [
    ['admin-users'],
    ['employees'],
    ['roles'],
  ],
  customers: [
    ['customers'],
    ['customers-stats'],
    ['customers-list'],
    ['customers-all'],
    ['customers-all-names'],
    ['customers-management-pages'],
    ['customers-management-insights'],
    ['customers-product-list'],
    ['customers-tdl-list'],
    ['customers-cloud-list'],
    ['customers-tss-list'],
    ['lead-existing-customers'],
    ['calls'],
    ['tickets'],
    ['tasks'],
    ['payments'],
    ['payments-outstanding'],
    ['invoices'],
    ['proposals'],
    ['amcs'],
    ['amc-insights'],
  ],
  roles: [
    ['roles'],
    ['roles-active'],
    ['employees'],
    ['admin-users'],
  ],
};

const keyId = (key: QueryKey) => JSON.stringify(key);

const expandedInvalidateKeys = (keys: QueryKey[]): QueryKey[] => {
  const out = new Map<string, QueryKey>();
  const add = (key: QueryKey) => out.set(keyId(key), key);

  keys.forEach((key) => {
    add(key);
    const root = typeof key[0] === 'string' ? key[0] : '';
    (queryKeyDependencies[root] || []).forEach(add);
  });

  return Array.from(out.values());
};

const mutationCache = new MutationCache({
  onSuccess: async (_data, _variables, _context, mutation) => {
    const meta = mutation.options.meta as AppMutationMeta | undefined;

    if (meta?.skipAutoInvalidate) return;

    if (meta?.invalidateQueryKeys?.length) {
      const keys = expandedInvalidateKeys(meta.invalidateQueryKeys);
      await Promise.all(
        keys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey, refetchType: 'all' })
        )
      );
      return;
    }

    // Fallback: refresh all relevant queries instead of invalidating the whole app.
    await queryClient.invalidateQueries({ refetchType: 'all' });
  },
});

queryClient = new QueryClient({
  mutationCache,
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30 * 1000,
      gcTime: 15 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      refetchOnMount: true,
    },
    mutations: { retry: 0 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
