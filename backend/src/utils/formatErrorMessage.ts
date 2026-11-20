const FIELD_LABELS: Record<string, string> = {
  name: 'Name / Company Name',
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

export const formatErrorMessage = (
  err: unknown,
  defaultMessage = 'An unexpected error occurred. Please check your inputs.'
): { statusCode: number; message: string } => {
  if (!err) return { statusCode: 500, message: defaultMessage };

  const anyErr = err as any;
  let statusCode =
    anyErr.statusCode ||
    (anyErr.name === 'ValidationError' || anyErr.code === 11000 || anyErr.name === 'CastError' ? 400 : 500);

  // 1. Mongoose ValidationError
  if (anyErr.name === 'ValidationError' && anyErr.errors) {
    statusCode = 400;
    const missingFields: string[] = [];
    const invalidFields: string[] = [];

    for (const key of Object.keys(anyErr.errors)) {
      const fieldErr = anyErr.errors[key];
      const friendlyName =
        FIELD_LABELS[key] ||
        key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase()).trim();

      if (fieldErr.kind === 'required' || String(fieldErr.message || '').includes('is required')) {
        missingFields.push(friendlyName);
      } else {
        invalidFields.push(`${friendlyName}: ${fieldErr.message || 'Invalid format'}`);
      }
    }

    if (missingFields.length > 0 && invalidFields.length === 0) {
      return {
        statusCode,
        message: `Please fill in the required field${missingFields.length > 1 ? 's' : ''}: ${missingFields.join(', ')}.`,
      };
    }
    if (invalidFields.length > 0) {
      return {
        statusCode,
        message: invalidFields.join('. '),
      };
    }
  }

  // 2. Duplicate Key Error (E11000)
  if (anyErr.code === 11000 || (typeof anyErr.message === 'string' && anyErr.message.includes('E11000'))) {
    statusCode = 400;
    const match = anyErr.message.match(/index:\s+([a-zA-Z0-9_]+)_1/);
    const rawField = match ? match[1] : '';
    const fieldName = FIELD_LABELS[rawField] || (rawField ? rawField.replace(/([A-Z])/g, ' $1').trim() : 'Record');
    return {
      statusCode,
      message: `A record with this ${fieldName} already exists. Please use a unique ${fieldName}.`,
    };
  }

  // 3. CastError / Invalid ID
  if (anyErr.name === 'CastError') {
    statusCode = 400;
    const fieldName = FIELD_LABELS[anyErr.path] || anyErr.path || 'record';
    return {
      statusCode,
      message: `Invalid ${fieldName} specified. The requested record could not be found.`,
    };
  }

  // 4. Raw string pattern matching (e.g. "Customer validation failed: ...")
  const rawMsg = String(anyErr.message || '');
  if (rawMsg.includes('validation failed') || rawMsg.includes('Path `')) {
    statusCode = 400;
    const matches: string[] = [];
    const pathRegex = /Path `([^`]+)` is required/gi;
    let m;
    while ((m = pathRegex.exec(rawMsg)) !== null) {
      const field = m[1];
      matches.push(FIELD_LABELS[field] || field);
    }
    if (matches.length > 0) {
      return {
        statusCode,
        message: `Please fill in the required field${matches.length > 1 ? 's' : ''}: ${matches.join(', ')}.`,
      };
    }
    const cleaned = rawMsg
      .replace(/^[a-zA-Z0-9_]+ validation failed:\s*/i, '')
      .replace(/Path `([^`]+)`/gi, (_m, p) => `"${FIELD_LABELS[p] || p}"`)
      .replace(/,\s*/g, ', ');
    return {
      statusCode,
      message: `Validation error: ${cleaned}`,
    };
  }

  // Clean technical stack terms from leaking to user
  if (
    rawMsg.includes('Cannot read properties of') ||
    rawMsg.includes('is not a function') ||
    rawMsg.includes('MongoError')
  ) {
    return {
      statusCode: 500,
      message: 'A system processing error occurred. Please refresh the page and try again.',
    };
  }

  return {
    statusCode,
    message: rawMsg || defaultMessage,
  };
};
