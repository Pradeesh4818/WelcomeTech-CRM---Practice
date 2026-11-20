import mongoose, { Document, Schema } from 'mongoose';

export interface ISettings extends Document {
  // General
  companyName: string;
  companyEmail: string;
  companyPhone: string;
  companyAddress?: string;
  companyAddressLine1?: string;
  companyAddressLine2?: string;
  country: 'QA' | 'IN' | 'AE' | 'SA' | 'OM' | 'KW' | 'BH';
  website: string;
  dateFormat: string;
  timeFormat: string;
  currency: string;
  logo?: string;
  proposalWatermark?: string;
  proposalNo?: string;
  proposalIncludeDate?: boolean;
  proposalCurrentSeq?: string;
  theme: 'light' | 'dark';
  brandColor: string;
  secondaryColor?: string;
  sidebarColor: string;
  topbarColor: string;
  navbarColor: string;
  appFont: 'outfit' | 'jakarta' | 'manrope' | 'dmsans' | 'sora';
  headingFont: 'outfit' | 'jakarta' | 'manrope' | 'dmsans' | 'sora' | 'custom';
  contentFont: 'outfit' | 'jakarta' | 'manrope' | 'dmsans' | 'sora' | 'custom';
  headingFontName?: string;
  headingFontUrl?: string;
  contentFontName?: string;
  contentFontUrl?: string;

  // Social
  instagram?: string;
  facebook?: string;
  linkedin?: string;
  twitter?: string;
  whatsapp?: string;
  youtube?: string;

  // SMTP
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPassword?: string;
  senderEmail?: string;
  mailFromName?: string;
  mailEncryption?: 'ssl' | 'tls';

  // Firebase
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
  firebaseProjectId?: string;
  firebaseStorageBucket?: string;
  firebaseMessagingSenderId?: string;
  firebaseAppId?: string;
  firebaseMeasurementId?: string;
  firebaseServerKey?: string;
  firebaseVapidKey?: string;
  firebaseServiceStatus: 'active' | 'inactive';


  // Storage
  storageProvider: 'vps' | 'cloudinary';
  vpsHost?: string;
  vpsPort?: number;
  vpsUser?: string;
  vpsPassword?: string;
  vpsPath?: string;
  cloudinaryCloudName?: string;
  cloudinaryApiKey?: string;
  cloudinaryApiSecret?: string;

  // Payments
  razorpayKeyId?: string;
  razorpayKeySecret?: string;
  razorpayStatus: 'active' | 'inactive';

  // SMS
  smsProvider?: string;
  smsApiKey?: string;
  smsApiSecret?: string;
  smsSenderId?: string;
  smsStatus: 'active' | 'inactive';

  // WhatsApp Business Cloud API
  whatsappBusinessStatus: 'active' | 'inactive';
  whatsappApiVersion?: string;
  whatsappBusinessAccountId?: string;
  whatsappPhoneNumberId?: string;
  whatsappAccessToken?: string;
  whatsappAppSecret?: string;
  whatsappWebhookVerifyToken?: string;
  whatsappDefaultTemplateName?: string;
  whatsappDefaultLanguageCode?: string;
  whatsappPdfTemplateName?: string;
  whatsappPdfTemplateLanguageCode?: string;

  // Google Maps
  googleMapsApiKey?: string;
  googleMapsMapId?: string;
  googleMapsDefaultCenterLat?: number;
  googleMapsDefaultCenterLng?: number;
  googleMapsDefaultZoom?: number;
  googleMapsStatus: 'active' | 'inactive';
}

const SettingsSchema = new Schema<ISettings>(
  {
    companyName: { type: String, default: 'WelcomeTech CRM' },
    companyEmail: { type: String, default: 'admin@welcometech.com' },
    companyPhone: { type: String, default: '33334444' },
    companyAddress: { type: String, default: '' },
    companyAddressLine1: { type: String, default: '' },
    companyAddressLine2: { type: String, default: '' },
    country: { type: String, enum: ['QA', 'IN', 'AE', 'SA', 'OM', 'KW', 'BH'], default: 'QA' },
    website: { type: String, default: 'https://welcometech.com' },
    dateFormat: { type: String, default: 'DD/MM/YYYY' },
    timeFormat: { type: String, default: '12h' },
    currency: { type: String, default: 'INR' },
    logo: { type: String },
    proposalWatermark: { type: String },
    proposalNo: { type: String, default: 'WT-Q1001', trim: true },
    proposalIncludeDate: { type: Boolean, default: false },
    proposalCurrentSeq: { type: String, trim: true },
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    brandColor: { type: String, default: '#6d28d9' },
    secondaryColor: { type: String, default: '#a855f7' },
    sidebarColor: { type: String, default: '#ffffff' },
    topbarColor: { type: String, default: '#ffffff' },
    navbarColor: { type: String, default: '#ffffff' },
    appFont: {
      type: String,
      enum: ['outfit', 'jakarta', 'manrope', 'dmsans', 'sora'],
      default: 'outfit',
    },
    headingFont: {
      type: String,
      enum: ['outfit', 'jakarta', 'manrope', 'dmsans', 'sora', 'custom'],
      default: 'outfit',
    },
    contentFont: {
      type: String,
      enum: ['outfit', 'jakarta', 'manrope', 'dmsans', 'sora', 'custom'],
      default: 'outfit',
    },
    headingFontName: { type: String },
    headingFontUrl: { type: String },
    contentFontName: { type: String },
    contentFontUrl: { type: String },

    instagram: { type: String },
    facebook: { type: String },
    linkedin: { type: String },
    twitter: { type: String },
    whatsapp: { type: String },
    youtube: { type: String },

    smtpHost: { type: String },
    smtpPort: { type: Number },
    smtpUser: { type: String },
    smtpPassword: { type: String },
    senderEmail: { type: String },
    mailFromName: { type: String },
    mailEncryption: { type: String, enum: ['ssl', 'tls'], default: 'tls' },

    firebaseApiKey: { type: String },
    firebaseAuthDomain: { type: String },
    firebaseProjectId: { type: String },
    firebaseStorageBucket: { type: String },
    firebaseMessagingSenderId: { type: String },
    firebaseAppId: { type: String },
    firebaseMeasurementId: { type: String },
    firebaseServerKey: { type: String },
    firebaseVapidKey: { type: String },
    firebaseServiceStatus: { type: String, enum: ['active', 'inactive'], default: 'inactive' },


    storageProvider: { type: String, enum: ['vps', 'cloudinary'], default: 'vps' },
    vpsHost: { type: String },
    vpsPort: { type: Number, default: 22 },
    vpsUser: { type: String },
    vpsPassword: { type: String },
    vpsPath: { type: String },
    cloudinaryCloudName: { type: String },
    cloudinaryApiKey: { type: String },
    cloudinaryApiSecret: { type: String },

    razorpayKeyId: { type: String },
    razorpayKeySecret: { type: String },
    razorpayStatus: { type: String, enum: ['active', 'inactive'], default: 'inactive' },

    smsProvider: { type: String },
    smsApiKey: { type: String },
    smsApiSecret: { type: String },
    smsSenderId: { type: String },
    smsStatus: { type: String, enum: ['active', 'inactive'], default: 'inactive' },

    whatsappBusinessStatus: { type: String, enum: ['active', 'inactive'], default: 'inactive' },
    whatsappApiVersion: { type: String, default: 'v23.0' },
    whatsappBusinessAccountId: { type: String, trim: true },
    whatsappPhoneNumberId: { type: String, trim: true },
    whatsappAccessToken: { type: String },
    whatsappAppSecret: { type: String },
    whatsappWebhookVerifyToken: { type: String },
    whatsappDefaultTemplateName: { type: String, trim: true },
    whatsappDefaultLanguageCode: { type: String, trim: true, default: 'en_US' },
    whatsappPdfTemplateName: { type: String, trim: true },
    whatsappPdfTemplateLanguageCode: { type: String, trim: true, default: 'en_US' },

    googleMapsApiKey: { type: String },
    googleMapsMapId: { type: String },
    googleMapsDefaultCenterLat: { type: Number, default: 25.2854 },
    googleMapsDefaultCenterLng: { type: Number, default: 51.531 },
    googleMapsDefaultZoom: { type: Number, default: 11 },
    googleMapsStatus: { type: String, enum: ['active', 'inactive'], default: 'inactive' },
  },
  { timestamps: true }
);

export const Settings = mongoose.model<ISettings>('Settings', SettingsSchema);
