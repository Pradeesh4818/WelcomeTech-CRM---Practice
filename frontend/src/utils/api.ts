import axios from 'axios';
import { clearStoredAuth, getStoredToken } from './authStorage';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api/v1',
  timeout: 45000,
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  const headers: any = config.headers || {};
  if (!config.headers) {
    config.headers = headers as any;
  }

  // Let browser set multipart boundaries automatically.
  // A forced JSON/multipart content-type without boundary breaks uploads.
  const isFormData =
    typeof FormData !== 'undefined' && config.data instanceof FormData;

  if (isFormData) {
    delete headers['Content-Type'];
    delete headers['content-type'];
  } else if (config.data && typeof config.data === 'object') {
    const hasExplicitContentType =
      headers['Content-Type'] || headers['content-type'];
    if (!hasExplicitContentType) {
      headers['Content-Type'] = 'application/json';
    }
  }

  return config;
});

const FIELD_MAP: Record<string, string> = {
  name: 'Company / Customer Name',
  contact: 'Contact Person Name',
  phone: 'Phone Number',
  mobile: 'Mobile Number',
  email: 'Email Address',
  address: 'Address',
  title: 'Title',
  amount: 'Amount',
  price: 'Price',
  pricing: 'Pricing',
  status: 'Status',
  priority: 'Priority',
  assignedTo: 'Assigned Person',
  dueDate: 'Due Date',
  taskDate: 'Task Date',
  startDate: 'Start Date',
  endDate: 'Expiry / End Date',
  licenceType: 'License Type',
  products: 'Product',
  product: 'Product',
  category: 'Category',
  customer: 'Customer',
  lead: 'Lead',
  ticket: 'Ticket',
  qidNumber: 'Qatar ID (QID)',
  qidExpiry: 'QID Expiry Date',
  password: 'Password',
  role: 'Role',
  department: 'Department',
  source: 'Lead Source',
  leadType: 'Lead Type',
  requirementDescription: 'Requirement Description',
  expectedClosingDate: 'Expected Closing Date',
  nextFollowupDate: 'Next Followup Date',
  companyName: 'Company Name',
  contactName1: 'Primary Contact Person',
};

export const cleanErrorMessage = (raw: unknown, fallback = 'An unexpected error occurred. Please try again.'): string => {
  if (!raw) return fallback;
  const msg = String(raw).trim();
  if (!msg) return fallback;

  // 1. Mongoose "Path `x` is required" or "Validation failed: ..."
  if (msg.includes('validation failed') || msg.includes('is required') || msg.includes('Path `')) {
    const missing: string[] = [];
    const pathRegex = /Path `([^`]+)` is required/gi;
    let match;
    while ((match = pathRegex.exec(msg)) !== null) {
      const field = match[1];
      missing.push(FIELD_MAP[field] || field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim());
    }
    if (missing.length > 0) {
      return `Please fill in the required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}.`;
    }
    const clean = msg
      .replace(/^[a-zA-Z0-9_]+ validation failed:\s*/i, '')
      .replace(/Path `([^`]+)`/gi, (_m, p) => `"${FIELD_MAP[p] || p}"`)
      .replace(/,\s*/g, ', ');
    return `Validation error: ${clean}`;
  }

  // 2. Duplicate key (E11000)
  if (msg.includes('E11000') || msg.includes('duplicate key')) {
    const match = msg.match(/index:\s+([a-zA-Z0-9_]+)_1/);
    const rawField = match ? match[1] : '';
    const fieldName = FIELD_MAP[rawField] || (rawField ? rawField.replace(/([A-Z])/g, ' $1').trim() : 'Record');
    return `A record with this ${fieldName} already exists. Please use a unique value.`;
  }

  // 3. Cast to ObjectId failed
  if (msg.includes('Cast to ObjectId failed')) {
    return 'The requested record was not found or has an invalid reference.';
  }

  // 4. Tech stack/code errors
  if (
    msg.includes('Cannot read properties of') ||
    msg.includes('is not a function') ||
    msg.includes('MongoError') ||
    msg.includes('SyntaxError')
  ) {
    return 'A server processing error occurred. Please refresh the page and try again.';
  }

  // 5. Network errors
  if (msg === 'Network Error') {
    return 'Unable to connect to the server. Please check your internet connection.';
  }
  if (msg.includes('timeout of') && msg.includes('exceeded')) {
    return 'The server took too long to respond. Please try again.';
  }

  // 6. SMTP Errors
  if (msg.includes('525') || msg.includes('Unauthorized IP')) {
    return 'SMTP Error (525 Unauthorized IP): Your current IP is not authorized on Brevo/SMTP relay. Please whitelist your IP in Brevo (Authorized IPs) or update Settings > SMTP.';
  }

  return msg;
};

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const { response, config } = error;
    
    // Sanitize response error message into clean human-friendly format
    if (response?.data?.message) {
      response.data.message = cleanErrorMessage(response.data.message);
    }
    if (error.message) {
      error.message = cleanErrorMessage(error.message);
    }

    // Detailed error logging for debugging
    console.error(`[API Error] ${config?.method?.toUpperCase()} ${config?.url}:`, {
      status: response?.status,
      data: response?.data,
      message: error.message
    });

    if (response?.status === 401) {
      clearStoredAuth();

      // Prevent redirect loops
      if (!window.location.pathname.endsWith('/login')) {
        window.location.href = `${import.meta.env.BASE_URL}login`;
      }
    }
    return Promise.reject(error);
  }
);

export default api;
