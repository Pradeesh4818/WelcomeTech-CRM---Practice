import { Router } from 'express';
import { login, getMe, updateProfile, updateThemePreference, changePassword, registerFCMToken, removeFCMToken } from '../controllers/authController';
import {
  getCustomers, getCustomer, createCustomer, updateCustomer, deleteCustomer, getCustomerStats, getCustomerManagementInsights,
  sendCustomerWhatsapp, previewCustomerTemplatePdf, getCustomerLookup,
} from '../controllers/customerController';
import {
  getCalls, createCall, updateCall, deleteCall,
  getAMCs, getAMC, createAMC, renewAMC, updateAMC, deleteAMC, getAMCStats,
  renewTDL, renewCloud, renewTSS,
  updateAMCLocation,
  getTickets, getTicket, createTicket, updateTicket, addTicketReply, deleteTicket,
  assignTicket, scheduleTicketFollowUp, deleteTicketFollowUp, deleteTicketActivity,
  getPayments, createPayment, updatePayment, sendPaymentWhatsapp,
  getProposals, getProposal, createProposal, updateProposal, deleteProposal, getProposalPdf, sendDirectProposalEmail,
  getProposalTemplates, getProposalTemplate, createProposalTemplate, updateProposalTemplate, deleteProposalTemplate,
  getDashboard, getEngineers, getCalendarEvents, getAMCInsights, getRenewalPrefill, sendReminder, sendBulkReminders,
  getNextProposalNumberHandler,
} from '../controllers/crmController';
import { protect, checkPermission } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { leadUpload } from '../middleware/leadUpload';
import { uploadExcel } from '../middleware/excelUpload';
import { previewAMCExcelImport, importAMCs } from '../controllers/amcImportController';
import { getProducts, createProduct, updateProduct, deleteProduct, importHSNCodes } from '../controllers/productController';
import { getLicenceTypes, createLicenceType, updateLicenceType, deleteLicenceType } from '../controllers/licenceTypeController';
import { getCustomerTypes, createCustomerType, updateCustomerType, deleteCustomerType } from '../controllers/customerTypeController';
import { getLeadSources, createLeadSource, updateLeadSource, deleteLeadSource } from '../controllers/leadSourceController';
import { getLeadStatuses, createLeadStatus, updateLeadStatusMaster, deleteLeadStatusMaster } from '../controllers/leadStatusController';
import { getVendorCategories, createVendorCategory, updateVendorCategory, deleteVendorCategory } from '../controllers/vendorCategoryController';
import { getTicketCategories, createTicketCategory, updateTicketCategory, deleteTicketCategory } from '../controllers/ticketCategoryController';
import { getIndustries, createIndustry, updateIndustry, deleteIndustry } from '../controllers/industryController';
import { getBusinessSegments, createBusinessSegment, updateBusinessSegment, deleteBusinessSegment } from '../controllers/businessSegmentController';
import { getIndustryTypes, createIndustryType, updateIndustryType, deleteIndustryType } from '../controllers/industryTypeController';
import {
  getSettings,
  getPublicBranding,
  getFirebasePublicConfig,
  updateSettings,
  getProposalNoSetting,
  updateProposalNoSetting,
  resetProposalNoSetting,
  testSmtp,
  testSmtpEmail,
  testWhatsapp,
  verifyWhatsappWebhook,
  receiveWhatsappWebhook,
} from '../controllers/settingsController';
import backupRoutes from './backup';
import {
  getEmployees, getEmployee, createEmployee, updateEmployee,
  changeEmployeePassword, removeEmployeeDocument, deleteEmployee,
} from '../controllers/employeeController';
import { employeeUpload } from '../middleware/employeeUpload';
import { syncUploadedFilesToVps } from '../middleware/syncUploads';
import { getRoles, getActiveRoles, createRole, updateRole, deleteRole } from '../controllers/roleController';
import {
  addLeadNote,
  assignLead,
  convertLeadToCustomer,
  createLead,
  createStaffUser,
  getLead,
  getLeadActivities,
  getLeadDashboard,
  getLeadNotifications,
  getLeadReports,
  getLeads,
  getStaffUsers,
  markNotificationRead,
  markAllNotificationsRead,
  scheduleLeadFollowUp,
  updateLead,
  deleteLead,
  deleteLeadActivity,
  deleteLeadFollowUp,
  updateLeadFollowUp,
  updateLeadStatus,
  updateStaffUser,
} from '../controllers/leadController';
import {
  assignTask,
  createTask,
  deleteTask,
  getTaskById,
  getTaskDashboard,
  getTasks,
  updateTask,
} from '../controllers/taskController';
import {
  getEmailTemplates,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  sendTemplateEmail,
  downloadTemplateEmailPdf,
} from '../controllers/emailTemplateController';
import {
  sendBulkTemplateEmails,
  sendBulkWhatsApp,
} from '../controllers/broadcastController';
import {
  getMedia,
  uploadMedia,
  updateMedia,
  deleteMedia,
} from '../controllers/mediaController';
import { testFirebaseNotification } from '../controllers/notificationController';
import { mediaUpload } from '../middleware/mediaUpload';

const router = Router();

// ─── PUBLIC ──────────────────────────────────────
router.post('/auth/login', login);
router.get('/public/branding', getPublicBranding);
router.get('/proposals/:id/pdf', getProposalPdf);
router.get('/public/proposals/:id/pdf', getProposalPdf);
router.get('/public/email-template-pdfs/:filename', downloadTemplateEmailPdf);
router.get('/webhooks/whatsapp', verifyWhatsappWebhook);
router.post('/webhooks/whatsapp', receiveWhatsappWebhook);

// ─── PROTECTED ───────────────────────────────────
router.use(protect);

// Auth
router.get('/auth/me', getMe);
router.patch('/auth/profile', updateProfile);
router.patch('/auth/theme', updateThemePreference);
router.patch('/auth/password', changePassword);
router.post('/auth/fcm-token', registerFCMToken);
router.post('/auth/fcm-token/remove', removeFCMToken);
router.get('/settings/firebase-public-config', getFirebasePublicConfig);

// Dashboard
router.get('/dashboard', checkPermission('dashboard'), getDashboard);

// Calendar
router.get('/calendar', checkPermission('tasks'), getCalendarEvents);

// Customers
router.get('/customers/stats', checkPermission('customers'), getCustomerStats);
router.get('/customers/management-insights', checkPermission('customers'), getCustomerManagementInsights);
router.get('/customers/lookup', getCustomerLookup);
router.get('/customers', checkPermission('customers'), getCustomers);
router.get('/customers/:id', getCustomer);
router.post('/customers/:id/whatsapp', checkPermission('customers'), sendCustomerWhatsapp);
router.post('/customers/:id/template-pdf', checkPermission('customers'), previewCustomerTemplatePdf);
const customerUploadFields = upload.fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'agreementCopy', maxCount: 1 },
]);
router.post('/customers', checkPermission('customers'), customerUploadFields, syncUploadedFilesToVps, createCustomer);
router.patch('/customers/:id', checkPermission('customers'), customerUploadFields, syncUploadedFilesToVps, updateCustomer);
router.delete('/customers/:id', checkPermission('customers'), deleteCustomer);

// Calls
router.get('/calls', checkPermission('calls'), getCalls);
router.post('/calls', checkPermission('calls'), createCall);
router.patch('/calls/:id', checkPermission('calls'), updateCall);
router.delete('/calls/:id', checkPermission('calls'), deleteCall);

// AMC
router.get('/amc', checkPermission('amc'), getAMCs);
router.get('/amc/stats', checkPermission('amc'), getAMCStats);
router.get('/amc/insights', checkPermission('amc'), getAMCInsights);
router.get('/amc/:id', checkPermission('amc'), getAMC);
router.post('/amc', checkPermission('amc'), createAMC);
router.patch('/amc/:id/renew', checkPermission('amc'), renewAMC);
router.get('/renewals/:module/:customerId/prefill', checkPermission('amc'), getRenewalPrefill);
router.patch('/tdl/:id/renew', checkPermission('amc'), renewTDL);
router.patch('/cloud/:id/renew', checkPermission('amc'), renewCloud);
router.patch('/tss/:id/renew', checkPermission('amc'), renewTSS);
router.post('/notifications/reminder', checkPermission('amc'), sendReminder);
router.post('/notifications/reminder/bulk', checkPermission('amc'), sendBulkReminders);
router.patch('/amc/:id/location', checkPermission('amc'), updateAMCLocation);
router.patch('/amc/:id', checkPermission('amc'), updateAMC);
router.delete('/amc/:id', checkPermission('amc'), deleteAMC);
router.post('/amc/import/preview', checkPermission('amc'), uploadExcel.single('file'), syncUploadedFilesToVps, previewAMCExcelImport);
router.post('/amc/import', checkPermission('amc'), importAMCs);

// Tickets
router.get('/tickets', checkPermission('tickets'), getTickets);
router.post('/tickets', checkPermission('tickets'), createTicket);
router.get('/tickets/:id', checkPermission('tickets'), getTicket);
router.patch('/tickets/:id/assign', checkPermission('tickets'), assignTicket);
router.post('/tickets/:id/followups', checkPermission('tickets'), scheduleTicketFollowUp);
router.delete('/tickets/followups/:followUpId', checkPermission('tickets'), deleteTicketFollowUp);
router.delete('/tickets/activities/:activityId', checkPermission('tickets'), deleteTicketActivity);
router.patch('/tickets/:id', checkPermission('tickets'), updateTicket);
router.post('/tickets/:id/reply', checkPermission('tickets'), addTicketReply);
router.delete('/tickets/:id', checkPermission('tickets'), deleteTicket);

// Tasks
router.get('/tasks/dashboard', checkPermission('tasks'), getTaskDashboard);
router.get('/tasks', checkPermission('tasks'), getTasks);
router.get('/tasks/:id', checkPermission('tasks'), getTaskById);
router.post('/tasks', checkPermission('tasks'), createTask);
router.patch('/tasks/:id', checkPermission('tasks'), updateTask);
router.patch('/tasks/:id/assign', checkPermission('tasks'), assignTask);
router.delete('/tasks/:id', checkPermission('tasks'), deleteTask);

// Payments
router.get('/payments', checkPermission('payments'), getPayments);
router.post('/payments', checkPermission('payments'), createPayment);
router.post('/payments/:id/whatsapp', checkPermission('payments'), sendPaymentWhatsapp);
router.patch('/payments/:id', checkPermission('payments'), updatePayment);

// Proposals
router.get('/proposal-templates', checkPermission('proposals'), getProposalTemplates);
router.get('/proposal-templates/:id', checkPermission('proposals'), getProposalTemplate);
router.post('/proposal-templates', checkPermission('proposals'), createProposalTemplate);
router.patch('/proposal-templates/:id', checkPermission('proposals'), updateProposalTemplate);
router.delete('/proposal-templates/:id', checkPermission('proposals'), deleteProposalTemplate);
router.get('/proposals', checkPermission('proposals'), getProposals);
router.get('/proposals/next-number', checkPermission('proposals'), getNextProposalNumberHandler);
router.get('/proposals/:id', checkPermission('proposals'), getProposal);
router.post('/proposals', checkPermission('proposals'), createProposal);
router.post('/proposals/send-direct', checkPermission('proposals'), sendDirectProposalEmail);
router.patch('/proposals/:id', checkPermission('proposals'), updateProposal);
router.delete('/proposals/:id', checkPermission('proposals'), deleteProposal);

// Engineers / Staff
router.get('/engineers', getEngineers);

// Employees (full CRUD)
const empFields = employeeUpload.fields([
  { name: 'avatar', maxCount: 1 },
  { name: 'passport', maxCount: 1 },
  { name: 'qidDocument', maxCount: 1 },
  { name: 'documents', maxCount: 10 },
]);
router.get('/employees', checkPermission('employees'), getEmployees);
router.get('/employees/:id', checkPermission('employees'), getEmployee);
router.post('/employees', checkPermission('employees'), empFields, syncUploadedFilesToVps, createEmployee);
router.patch('/employees/:id', checkPermission('employees'), empFields, syncUploadedFilesToVps, updateEmployee);
router.patch('/employees/:id/password', checkPermission('employees'), changeEmployeePassword);
router.patch('/employees/:id/remove-doc', checkPermission('employees'), removeEmployeeDocument);
router.delete('/employees/:id', checkPermission('employees'), deleteEmployee);

// Products
router.get('/products', checkPermission('products'), getProducts);
router.post('/products', checkPermission('products'), createProduct);
router.patch('/products/:id', checkPermission('products'), updateProduct);
router.delete('/products/:id', checkPermission('products'), deleteProduct);
router.post('/products/hsn/import', checkPermission('products'), uploadExcel.single('file'), syncUploadedFilesToVps, importHSNCodes);

// Licence Types
router.get('/licence-types', checkPermission('products'), getLicenceTypes);
router.post('/licence-types', checkPermission('products'), createLicenceType);
router.patch('/licence-types/:id', checkPermission('products'), updateLicenceType);
router.delete('/licence-types/:id', checkPermission('products'), deleteLicenceType);

// Customer Types
router.get('/customer-types', checkPermission('customers'), getCustomerTypes);
router.post('/customer-types', checkPermission('customers'), createCustomerType);
router.patch('/customer-types/:id', checkPermission('customers'), updateCustomerType);
router.delete('/customer-types/:id', checkPermission('customers'), deleteCustomerType);

// Lead Sources
router.get('/lead-sources', checkPermission('leads'), getLeadSources);
router.post('/lead-sources', checkPermission('leads'), createLeadSource);
router.patch('/lead-sources/:id', checkPermission('leads'), updateLeadSource);
router.delete('/lead-sources/:id', checkPermission('leads'), deleteLeadSource);

// Lead Statuses
router.get('/lead-statuses', checkPermission('leads'), getLeadStatuses);
router.post('/lead-statuses', checkPermission('leads'), createLeadStatus);
router.patch('/lead-statuses/:id', checkPermission('leads'), updateLeadStatusMaster);
router.delete('/lead-statuses/:id', checkPermission('leads'), deleteLeadStatusMaster);

// Vendor Categories
router.get('/vendor-categories', checkPermission('products'), getVendorCategories);
router.post('/vendor-categories', checkPermission('products'), createVendorCategory);
router.patch('/vendor-categories/:id', checkPermission('products'), updateVendorCategory);
router.delete('/vendor-categories/:id', checkPermission('products'), deleteVendorCategory);

// Ticket Categories
router.get('/ticket-categories', checkPermission('tickets'), getTicketCategories);
router.post('/ticket-categories', checkPermission('tickets'), createTicketCategory);
router.patch('/ticket-categories/:id', checkPermission('tickets'), updateTicketCategory);
router.delete('/ticket-categories/:id', checkPermission('tickets'), deleteTicketCategory);

// Industries
router.get('/industries', checkPermission('customers'), getIndustries);
router.post('/industries', checkPermission('customers'), createIndustry);
router.patch('/industries/:id', checkPermission('customers'), updateIndustry);
router.delete('/industries/:id', checkPermission('customers'), deleteIndustry);

// Business Segments
router.get('/business-segments', checkPermission('customers'), getBusinessSegments);
router.post('/business-segments', checkPermission('customers'), createBusinessSegment);
router.patch('/business-segments/:id', checkPermission('customers'), updateBusinessSegment);
router.delete('/business-segments/:id', checkPermission('customers'), deleteBusinessSegment);

// Industry Types
router.get('/industry-types', checkPermission('customers'), getIndustryTypes);
router.post('/industry-types', checkPermission('customers'), createIndustryType);
router.patch('/industry-types/:id', checkPermission('customers'), updateIndustryType);
router.delete('/industry-types/:id', checkPermission('customers'), deleteIndustryType);

// Settings
router.get('/settings', getSettings);
router.patch(
  '/settings',
  checkPermission('settings'),
  upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'proposalWatermark', maxCount: 1 },
    { name: 'headingFontFile', maxCount: 1 },
    { name: 'contentFontFile', maxCount: 1 },
  ]),
  syncUploadedFilesToVps,
  updateSettings
);
router.post('/settings/test-smtp', checkPermission('settings'), testSmtp);
router.post('/settings/test-smtp-email', checkPermission('settings'), testSmtpEmail);
router.post('/settings/test-whatsapp', checkPermission('settings'), testWhatsapp);
router.post('/settings/test-notification', checkPermission('settings'), testFirebaseNotification);
router.get('/settings/proposal-no', getProposalNoSetting);
router.patch('/settings/proposal-no', checkPermission('settings'), updateProposalNoSetting);
router.delete('/settings/proposal-no', checkPermission('settings'), resetProposalNoSetting);

// Database Backup & Scheduling
router.use('/backup', backupRoutes);

// Roles
router.get('/roles/active', checkPermission('employees'), getActiveRoles);
router.get('/roles', checkPermission('roles'), getRoles);
router.post('/roles', checkPermission('roles'), createRole);
router.patch('/roles/:id', checkPermission('roles'), updateRole);
router.delete('/roles/:id', checkPermission('roles'), deleteRole);

// Email Templates
router.get('/email-templates', checkPermission('settings'), getEmailTemplates);
router.post('/email-templates', checkPermission('settings'), createEmailTemplate);
router.patch('/email-templates/:id', checkPermission('settings'), updateEmailTemplate);
router.delete('/email-templates/:id', checkPermission('settings'), deleteEmailTemplate);
router.post('/email-templates/send', checkPermission('settings'), sendTemplateEmail);

// Bulk Broadcasts
router.post('/broadcast/bulk-email', checkPermission('amc'), sendBulkTemplateEmails);
router.post('/broadcast/bulk-whatsapp', checkPermission('amc'), sendBulkWhatsApp);

// Media Library
router.get('/media', checkPermission('settings'), getMedia);
router.post('/media', checkPermission('settings'), mediaUpload.array('files', 10), syncUploadedFilesToVps, uploadMedia);
router.patch('/media/:id', checkPermission('settings'), updateMedia);
router.delete('/media/:id', checkPermission('settings'), deleteMedia);

// Leads CRM Module
router.get('/leads/dashboard', checkPermission('leads'), getLeadDashboard);
router.get('/leads/reports', checkPermission('leads'), getLeadReports);
router.get('/leads/activities', checkPermission('leads'), getLeadActivities);
router.get('/leads/notifications', getLeadNotifications);
router.patch('/leads/notifications/read-all', markAllNotificationsRead);
router.patch('/leads/notifications/:notificationId/read', markNotificationRead);
router.get('/leads/staff', checkPermission('leads'), getStaffUsers);
router.post('/leads/staff', checkPermission('leads'), createStaffUser);
router.patch('/leads/staff/:id', checkPermission('leads'), updateStaffUser);

router.get('/leads', checkPermission('leads'), getLeads);
router.get('/leads/:id', checkPermission('leads'), getLead);
router.post('/leads', checkPermission('leads'), createLead);
router.patch('/leads/:id', checkPermission('leads'), updateLead);
router.delete('/leads/:id', checkPermission('leads'), deleteLead);
router.delete('/leads/activities/:activityId', checkPermission('leads'), deleteLeadActivity);
router.patch('/leads/:id/status', checkPermission('leads'), updateLeadStatus);
router.patch('/leads/:id/assign', checkPermission('leads'), assignLead);
router.post('/leads/:id/assign', checkPermission('leads'), assignLead);
router.post('/leads/:id/convert', checkPermission('leads'), convertLeadToCustomer);
router.post('/leads/:id/notes', checkPermission('leads'), leadUpload.single('attachment'), syncUploadedFilesToVps, addLeadNote);
router.post('/leads/:id/followups', checkPermission('leads'), scheduleLeadFollowUp);
router.post('/leads/:id/follow-ups', checkPermission('leads'), scheduleLeadFollowUp);
router.patch('/leads/followups/:followUpId', checkPermission('leads'), updateLeadFollowUp);
router.patch('/leads/follow-ups/:followUpId', checkPermission('leads'), updateLeadFollowUp);
router.delete('/leads/followups/:followUpId', checkPermission('leads'), deleteLeadFollowUp);
router.delete('/leads/follow-ups/:followUpId', checkPermission('leads'), deleteLeadFollowUp);

export default router;
