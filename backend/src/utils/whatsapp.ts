const WHATSAPP_GRAPH_BASE_URL = 'https://graph.facebook.com';

export const IS_WHATSAPP_STATICALLY_DISABLED = true;
export const isWhatsAppEnabled = (): boolean => !IS_WHATSAPP_STATICALLY_DISABLED;

export type WhatsappMessagePayload = Record<string, unknown>;

// Dial code + local (national) number length per supported country.
// Kept in sync with the frontend COUNTRY_PHONE_RULES.
export const COUNTRY_DIAL_RULES: Record<string, { dialCode: string; nationalDigits: number }> = {
  QA: { dialCode: '974', nationalDigits: 8 },
  IN: { dialCode: '91', nationalDigits: 10 },
  AE: { dialCode: '971', nationalDigits: 9 },
  SA: { dialCode: '966', nationalDigits: 9 },
  OM: { dialCode: '968', nationalDigits: 8 },
  KW: { dialCode: '965', nationalDigits: 8 },
  BH: { dialCode: '973', nationalDigits: 8 },
  US: { dialCode: '1', nationalDigits: 10 },
  GB: { dialCode: '44', nationalDigits: 10 },
};

export const normalizeWhatsAppPhone = (value: unknown, defaultCountry?: string): string => {
  let cleaned = String(value || '').replace(/[^\d]/g, '');
  if (!cleaned) return '';

  // Collapse an accidentally duplicated country code (e.g. "919191234567").
  // Only multi-digit dial codes are considered — a single-digit code like "1"
  // would false-match ordinary numbers that merely begin with that digit.
  const dialCodes = ['974', '971', '966', '968', '965', '973', '91', '44'];
  for (const code of dialCodes) {
    if (code.length >= 2 && cleaned.startsWith(code + code)) {
      cleaned = cleaned.substring(code.length);
      break;
    }
  }

  // If the number carries no country code, prepend the CRM's configured
  // country dial code. Only applied when the length matches that country's
  // local number length, so numbers that already include a code are left as-is.
  const rule = defaultCountry ? COUNTRY_DIAL_RULES[defaultCountry] : undefined;
  if (rule && cleaned.length === rule.nationalDigits) {
    cleaned = `${rule.dialCode}${cleaned}`;
  } else if (cleaned.length === 10 && /^[6-9]\d{9}$/.test(cleaned)) {
    // Standard 10-digit Indian mobile number without country prefix
    cleaned = `91${cleaned}`;
  }

  return cleaned;
};

export const normalizeGraphApiVersion = (value: unknown): string => {
  const cleaned = String(value || 'v23.0').trim();
  return /^v\d+\.\d+$/.test(cleaned) ? cleaned : 'v23.0';
};

export const getWhatsAppMessageUrl = (apiVersion: string, phoneNumberId: string): string => (
  `${WHATSAPP_GRAPH_BASE_URL}/${normalizeGraphApiVersion(apiVersion)}/${phoneNumberId}/messages`
);

export const buildWhatsAppTextPayload = (to: string, body: string, previewUrl = false): WhatsappMessagePayload => ({
  messaging_product: 'whatsapp',
  to,
  type: 'text',
  text: {
    preview_url: previewUrl,
    body,
  },
});

export const buildWhatsAppTemplatePayload = (
  to: string,
  templateName: string,
  languageCode = 'en_US',
  parameters?: string[],
  options?: {
    headerDocument?: {
      link?: string;
      id?: string;
      filename?: string;
    };
  },
): WhatsappMessagePayload => {
  const templateObj: Record<string, unknown> = {
    name: templateName,
    language: { code: languageCode || 'en_US' },
  };

  const nameLower = (templateName || '').toLowerCase();
  if (nameLower && nameLower !== 'hello_world') {
    let params = parameters;
    if (!params || params.length === 0) {
      if (nameLower === 'sendenquiry') {
        params = ['Valued Customer', '+91 99444 00587', '26-Aug-2026', 'Immediate', 'Welcome Tech CRM Verification'];
      } else {
        params = ['Valued Customer'];
      }
    }
    const components: Record<string, unknown>[] = [];

    if (options?.headerDocument?.link || options?.headerDocument?.id) {
      const document: Record<string, string> = {};
      if (options.headerDocument.id) document.id = options.headerDocument.id;
      if (options.headerDocument.link) document.link = options.headerDocument.link;
      if (options.headerDocument.filename) document.filename = options.headerDocument.filename;
      components.push({
        type: 'header',
        parameters: [{ type: 'document', document }],
      });
    }

    components.push({
      type: 'body',
      parameters: params.map((p) => ({ type: 'text', text: String(p || '—') })),
    });
    templateObj.components = components;
  }

  return {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: templateObj,
  };
};

export const buildWhatsAppDocumentPayload = (
  to: string,
  mediaId: string,
  filename: string,
  caption?: string,
): Record<string, unknown> => ({
  messaging_product: 'whatsapp',
  recipient_type: 'individual',
  to,
  type: 'document',
  document: {
    id: mediaId,
    filename,
    caption: caption ? caption.slice(0, 1024) : undefined,
  },
});

export const uploadWhatsAppMedia = async ({
  apiVersion = 'v23.0',
  phoneNumberId,
  accessToken,
  fileBuffer,
  filename,
  mimeType = 'application/pdf',
}: {
  apiVersion?: string;
  phoneNumberId: string;
  accessToken: string;
  fileBuffer: Buffer;
  filename: string;
  mimeType?: string;
}): Promise<string> => {
  if (IS_WHATSAPP_STATICALLY_DISABLED) {
    const error = new Error('WhatsApp service is statically disabled in the backend.') as Error & { status?: number };
    error.status = 403;
    throw error;
  }

  const blob = new Blob([fileBuffer], { type: mimeType });
  const formData = new globalThis.FormData();
  formData.append('file', blob, filename);
  formData.append('type', mimeType);
  formData.append('messaging_product', 'whatsapp');

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok || !data?.id) {
    const msg = data?.error?.message || data?.message || `WhatsApp Media upload failed with status ${response.status}`;
    const error = new Error(msg) as Error & { status?: number; meta?: unknown };
    error.status = response.status;
    error.meta = data?.error;
    throw error;
  }

  return data.id;
};

export const sendWhatsAppMessage = async ({
  apiVersion,
  phoneNumberId,
  accessToken,
  payload,
}: {
  apiVersion: string;
  phoneNumberId: string;
  accessToken: string;
  payload: WhatsappMessagePayload;
}) => {
  if (IS_WHATSAPP_STATICALLY_DISABLED) {
    const error = new Error('WhatsApp service is statically disabled in the backend.') as Error & { status?: number };
    error.status = 403;
    throw error;
  }

  const response = await fetch(getWhatsAppMessageUrl(apiVersion, phoneNumberId), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    const message = data?.error?.message || data?.message || `WhatsApp API request failed with status ${response.status}`;
    const error = new Error(message) as Error & { status?: number; meta?: unknown };
    error.status = response.status;
    error.meta = data?.error;
    throw error;
  }
  return data;
};

export const firstText = (...values: unknown[]): string => {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text && text !== '—') return text;
  }
  return '';
};

export const resolveCustomerWhatsappNumber = (customer: any): string => {
  const candidates = [
    customer?.primaryContactInfo?.whatsapp,
    customer?.keyContacts?.find((contact: any) => String(contact?.whatsapp || '').trim())?.whatsapp,
    customer?.secondaryContactInfo?.whatsapp,
    customer?.primaryContactInfo?.mobile,
    customer?.keyContacts?.find((contact: any) => String(contact?.mobile || '').trim())?.mobile,
    customer?.secondaryContactInfo?.mobile,
    customer?.phone,
  ].map((v) => String(v || '').trim()).filter((v) => v && v !== '—');

  if (candidates.length === 0) return '';

  const primary = candidates[0];
  if (primary.startsWith('+')) return primary;

  // If the primary candidate does not start with '+', check if another contact candidate has the same number with '+' country code
  const cleanedPrimary = primary.replace(/[^\d]/g, '');
  const withCountryCode = candidates.find((c) => {
    if (!c.startsWith('+')) return false;
    const cleaned = c.replace(/[^\d]/g, '');
    return cleaned.endsWith(cleanedPrimary) || cleanedPrimary.endsWith(cleaned);
  });

  return withCountryCode || primary;
};
