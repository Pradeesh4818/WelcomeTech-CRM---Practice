import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Globe, Mail, Bell, Database, CreditCard, Shield, Palette,
  Smartphone as SmsIcon, Save, Cloud, Send, MessageCircle,
  Settings as GeneralIcon, Image as ImageIcon, Link as LinkIcon, MapPin,
  RefreshCw, CheckCircle2, AlertCircle, Upload, HardDrive, Download, Type, FileText,
  Compass, Eye, EyeOff, Copy, Search, ChevronRight, ChevronDown, ChevronUp, Calendar, Clock, Check,
  ShieldCheck, Lock, Sun, Moon
} from 'lucide-react';
import api from '../../utils/api';
import { InputField, SelectField, Spinner, Modal, Badge } from '../../components/ui';
import { toAssetUrl, COUNTRY_CURRENCIES } from '../../utils/helpers';
import toast from 'react-hot-toast';
import { HexColorPicker } from 'react-colorful';
import { getGoogleMapsRuntimeConfig, loadGoogleMaps, resetGoogleMapsRuntimeCache } from '../../utils/googleMaps';
import { MediaLibraryPage, MediaFile } from './MediaLibrary';
import { initFCMAndRegisterToken, getNotificationPermission, isNotificationSupported } from '../../utils/fcmClient';


import { useSearchParams } from 'react-router-dom';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import { APP_FONT_OPTIONS, AppFontKey, DEFAULT_APP_FONT, FontChoice, isAppFontKey, isFontChoice } from '../../utils/fonts';
import { CountryCode, COUNTRY_OPTIONS, COUNTRY_PHONE_RULES, DEFAULT_COUNTRY, getPhoneDigitsOnly, isCountryCode, parsePhoneNumber, validatePhoneNumber } from '../../utils/phoneRules';
import { buildProposalNumber } from '../../utils/quotationHelpers';
import { DatabaseBackupPanel } from './DatabaseBackupPanel';

export type SettingsTab = 'general' | 'smtp' | 'notification' | 'payments' | 'sms' | 'whatsapp' | 'maps' | 'appearance' | 'backup';

export const VALID_SETTINGS_TABS: SettingsTab[] = [
  'general',
  'smtp',
  'notification',
  'payments',
  'sms',
  'whatsapp',
  'maps',
  'appearance',
  'backup',
];

export const getInitialSettingsTab = (queryParamTab?: string | null): SettingsTab => {
  if (queryParamTab && (VALID_SETTINGS_TABS as string[]).includes(queryParamTab)) {
    return queryParamTab as SettingsTab;
  }
  try {
    const storage = typeof window !== 'undefined' ? window.localStorage : (typeof localStorage !== 'undefined' ? localStorage : null);
    const stored = storage?.getItem('active_settings_tab');
    if (stored && (VALID_SETTINGS_TABS as string[]).includes(stored)) {
      return stored as SettingsTab;
    }
  } catch {
    // ignore
  }
  return 'general';
};

export const SettingsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTabState] = useState<SettingsTab>(() =>
    getInitialSettingsTab(searchParams.get('tab'))
  );

  const setActiveTab = (tab: SettingsTab) => {
    setActiveTabState(tab);
    try {
      localStorage.setItem('active_settings_tab', tab);
    } catch {
      // ignore
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', tab);
        return next;
      },
      { replace: true }
    );
  };

  useEffect(() => {
    const queryTab = searchParams.get('tab');
    if (queryTab && (VALID_SETTINGS_TABS as string[]).includes(queryTab) && queryTab !== activeTab) {
      setActiveTabState(queryTab as SettingsTab);
      try {
        localStorage.setItem('active_settings_tab', queryTab);
      } catch {
        // ignore
      }
    } else if (!queryTab && activeTab !== 'general') {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', activeTab);
          return next;
        },
        { replace: true }
      );
    }
  }, [searchParams, activeTab]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [watermarkPreview, setWatermarkPreview] = useState<string | null>(null);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [navQuery, setNavQuery] = useState('');

  const { setAppFont, setTypography, setCountry, setCompanyName, setLogo, setProposalWatermark } = useThemeStore();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get('/settings');
      return res.data.data;
    },
  });

  const updateMut = useMutation({
    mutationFn: async (payload: any) => {
      let data = payload;

      // If it's a general section save and we have a logo file, use FormData
      if (payload instanceof FormData) {
        data = payload;
      } else if (payload.logoFile || payload.proposalWatermarkFile || payload.headingFontFile || payload.contentFontFile) {
        const formData = new FormData();
        Object.keys(payload).forEach(key => {
          if (key === 'logoFile' || key === 'proposalWatermarkFile' || key === 'headingFontFile' || key === 'contentFontFile' || key === 'logo') return;
          const value = payload[key];
          if (value === undefined || value === null) return;
          // Only append scalar values into multipart payload.
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            formData.append(key, String(value));
          }
        });
        if (payload.logoFile) formData.append('logo', payload.logoFile);
        if (payload.proposalWatermarkFile) formData.append('proposalWatermark', payload.proposalWatermarkFile);
        if (payload.headingFontFile) formData.append('headingFontFile', payload.headingFontFile);
        if (payload.contentFontFile) formData.append('contentFontFile', payload.contentFontFile);
        data = formData;
      }

      const res = await api.patch('/settings', data);
      return res.data.data;
    },
    meta: { invalidateQueryKeys: [['settings']] },
    onSuccess: (updatedSettings) => {
      toast.success('Settings updated successfully');
      resetGoogleMapsRuntimeCache();
      setLogoFile(null);
      setLogoPreview(null);
      setWatermarkFile(null);
      setWatermarkPreview(null);
      if (updatedSettings?.companyName) setCompanyName(updatedSettings.companyName);
      setLogo(updatedSettings?.logo || '');
      setProposalWatermark(updatedSettings?.proposalWatermark || '');
      if (isCountryCode(updatedSettings?.country)) setCountry(updatedSettings.country);
      if (updatedSettings?.proposalNo !== undefined || updatedSettings?.proposalIncludeDate !== undefined) {
        useThemeStore.getState().setProposalSettings({
          proposalNo: updatedSettings.proposalNo,
          proposalIncludeDate: updatedSettings.proposalIncludeDate,
        });
      }
      if (updatedSettings?.headingFont || updatedSettings?.contentFont) {
        setTypography({
          headingFont: isFontChoice(updatedSettings.headingFont) ? updatedSettings.headingFont : updatedSettings.appFont,
          contentFont: isFontChoice(updatedSettings.contentFont) ? updatedSettings.contentFont : updatedSettings.appFont,
          headingFontName: updatedSettings.headingFontName || '',
          headingFontUrl: updatedSettings.headingFontUrl || '',
          contentFontName: updatedSettings.contentFontName || '',
          contentFontUrl: updatedSettings.contentFontUrl || '',
        });
      }

      // Update global theme if appearance was changed
      if (activeTab === 'appearance') {
        // No action needed here as we applied it in handleSave
      }
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || 'Failed to update settings';
      toast.error(msg);
    },
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Only image files are allowed');
        e.target.value = '';
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        toast.error('Logo must be 2MB or smaller');
        e.target.value = '';
        return;
      }
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleWatermarkChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error('Only image files are allowed');
        e.target.value = '';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Watermark image must be 5MB or smaller');
        e.target.value = '';
        return;
      }
      setWatermarkFile(file);
      setWatermarkPreview(URL.createObjectURL(file));
    }
  };

  const testNotificationMut = useMutation({
    mutationFn: async (data: { token: string, title?: string, body?: string }) => {
      const res = await api.post('/settings/test-notification', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Test notification sent successfully');
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || 'Failed to send test notification';
      toast.error(msg);
    },
  });

  const testSmtpMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/settings/test-smtp', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('SMTP connection successful');
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || 'SMTP connection failed';
      toast.error(msg);
    },
  });

  const testSmtpEmailMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/settings/test-smtp-email', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('Test email sent successfully');
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || 'Failed to send test email';
      toast.error(msg);
    },
  });

  const testWhatsappMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/settings/test-whatsapp', data);
      return res.data;
    },
    onSuccess: () => {
      toast.success('WhatsApp test message sent successfully');
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || 'Failed to send WhatsApp test message';
      toast.error(msg);
    },
  });

  if (isLoading) return <div className="flex items-center justify-center h-64"><Spinner size={24} /></div>;

  const saveSettings = (sectionData: any) => {
    if (activeTab === 'general' && (logoFile || watermarkFile)) {
      updateMut.mutate({ ...sectionData, logoFile, proposalWatermarkFile: watermarkFile });
    } else {
      updateMut.mutate(sectionData);
    }
  };

  type NavItem = {
    id: SettingsTab;
    label: string;
    title?: string;
    desc: string;
    keywords: string;
    icon: React.ReactNode;
  };

  const navGroups: { title: string; items: NavItem[] }[] = [
    {
      title: 'Workspace',
      items: [
        { id: 'general', label: 'General', title: 'General', desc: 'Company details, regional formats, logo and proposal watermark.', keywords: 'company business profile logo watermark currency date time country phone proposal', icon: <Globe size={16} /> },
        { id: 'appearance', label: 'Appearance', desc: 'Brand colours, fonts and interface theme.', keywords: 'theme color colour font typography dark light brand', icon: <Palette size={16} /> },
      ]
    },
    {
      title: 'Channels',
      items: [
        { id: 'smtp', label: 'Email', title: 'Email (SMTP)', desc: 'Outgoing mail server used for system and customer emails.', keywords: 'smtp email mail host port sender outbound', icon: <Mail size={16} /> },
        { id: 'notification', label: 'Notifications', desc: 'Push notification credentials and test alerts.', keywords: 'notification push firebase fcm alerts', icon: <Bell size={16} /> },
        { id: 'whatsapp', label: 'WhatsApp', desc: 'WhatsApp API connection for customer messaging.', keywords: 'whatsapp api message template', icon: <MessageCircle size={16} /> },
        { id: 'sms', label: 'SMS', desc: 'SMS gateway credentials.', keywords: 'sms gateway text message', icon: <SmsIcon size={16} /> },
      ]
    },
    {
      title: 'Integrations',
      items: [
        { id: 'payments', label: 'Payments', desc: 'Payment gateway keys for checkout and cards.', keywords: 'payments gateway checkout card keys', icon: <CreditCard size={16} /> },
        { id: 'maps', label: 'Maps', title: 'Google Maps', desc: 'Google Maps key for address and location features.', keywords: 'maps google location address api key', icon: <MapPin size={16} /> },
      ]
    },
    {
      title: 'Data',
      items: [
        { id: 'backup', label: 'Backup', title: 'Database Backup & Scheduling', desc: 'Manual and scheduled database backups.', keywords: 'backup database restore schedule recovery export', icon: <HardDrive size={16} /> },
      ]
    }
  ];

  const allTabs = navGroups.flatMap(g => g.items);
  const activeTabMeta = allTabs.find(t => t.id === activeTab) || allTabs[0];

  const navNeedle = navQuery.trim().toLowerCase();
  const visibleGroups = navNeedle
    ? navGroups
        .map(g => ({
          ...g,
          items: g.items.filter(i => `${i.label} ${i.title || ''} ${i.keywords}`.toLowerCase().includes(navNeedle)),
        }))
        .filter(g => g.items.length > 0)
    : navGroups;

  return (
    <div className="stg-page">
      {/* Left menu */}
      <aside className="stg-menu" aria-label="Settings sections">
        <label className="stg-search">
          <Search size={14} />
          <input
            type="text"
            value={navQuery}
            onChange={(e) => setNavQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && visibleGroups[0]?.items[0]) {
                setActiveTab(visibleGroups[0].items[0].id);
                setNavQuery('');
              }
              if (e.key === 'Escape') setNavQuery('');
            }}
            placeholder="Search settings"
            aria-label="Search settings"
          />
        </label>

        <nav className="stg-menu-list">
          {visibleGroups.map((group) => (
            <div key={group.title} className="stg-menu-group">
              <div className="stg-menu-title">{group.title}</div>
              {group.items.map(item => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`stg-menu-item ${isActive ? 'active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
          {visibleGroups.length === 0 && (
            <div className="stg-menu-empty">No section matches “{navQuery.trim()}”.</div>
          )}
        </nav>
      </aside>

      <main key={activeTab} className="stg-workspace">

          {activeTab === 'general' && (
            <GeneralSettings
              settings={settings}
              onSave={saveSettings}
              handleLogoChange={handleLogoChange}
              handleWatermarkChange={handleWatermarkChange}
              logoPreview={logoPreview}
              watermarkPreview={watermarkPreview}
              onApplyFont={setAppFont}
              onApplyCountry={setCountry}
              onOpenPicker={() => setIsMediaModalOpen(true)}
            />
          )}
          {activeTab === 'appearance' && (
            <AppearanceSettings settings={settings} onSave={saveSettings} />
          )}
          {activeTab === 'notification' && (
            <FirebaseSettings
              settings={settings}
              onSave={saveSettings}
              onTest={(data: any) => testNotificationMut.mutate(data)}
              isTesting={testNotificationMut.isPending}
            />
          )}
          {activeTab === 'whatsapp' && (
            <WhatsAppSettings
              settings={settings}
              onSave={saveSettings}
              onTest={(data: any) => testWhatsappMut.mutate(data)}
              isTesting={testWhatsappMut.isPending}
            />
          )}
          {activeTab === 'smtp' && (
            <SMTPSettings 
              settings={settings} 
              onSave={saveSettings} 
              onTest={(data: any) => testSmtpMut.mutate(data)}
              onTestEmail={(data: any) => testSmtpEmailMut.mutate(data)}
              isTesting={testSmtpMut.isPending}
              isTestingEmail={testSmtpEmailMut.isPending}
            />
          )}
          {activeTab === 'sms' && (
            <SMSSettings settings={settings} onSave={saveSettings} />
          )}
          {activeTab === 'payments' && (
            <PaymentSettings settings={settings} onSave={saveSettings} />
          )}
          {activeTab === 'maps' && (
            <GoogleMapsSettings settings={settings} onSave={saveSettings} />
          )}
          {activeTab === 'backup' && (
            <DatabaseBackupPanel />
          )}
      </main>

      <Modal 
        open={isMediaModalOpen} 
        onClose={() => setIsMediaModalOpen(false)}
        title="Select Logo from Media Library"
        size="xxl"
      >
        <div style={{ height: '70vh', overflow: 'hidden' }}>
          <MediaLibraryPage 
            isPicker 
            onSelect={(file: MediaFile) => {
              setLogoPreview(toAssetUrl(file.url));
              setLogoFile(null);
              updateMut.mutate({ logo: file.url });
              setIsMediaModalOpen(false);
            }} 
          />
        </div>
      </Modal>

      <style>{`
        .stg-page {
          display: grid;
          grid-template-columns: 228px minmax(0, 1fr);
          gap: 20px;
          align-items: start;
          width: 100%;
          box-sizing: border-box;
        }

        /* Left menu */
        .stg-menu {
          position: sticky;
          top: 0;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 12px 10px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          box-sizing: border-box;
        }
        .stg-search {
          display: flex;
          align-items: center;
          gap: 8px;
          height: 34px;
          padding: 0 10px;
          border: 1px solid var(--border-2);
          border-radius: 8px;
          background: var(--surface);
          color: var(--tx-4);
          transition: border-color 0.15s ease;
        }
        .stg-search:focus-within {
          border-color: var(--brand);
        }
        .stg-search input {
          flex: 1;
          min-width: 0;
          height: 100% !important;
          padding: 0 !important;
          border: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
          background: transparent !important;
          font-size: 13px;
          color: var(--tx-1);
        }
        .stg-menu-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .stg-menu-group {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .stg-menu-title {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--tx-4);
          padding: 0 10px 5px;
        }
        .stg-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          height: 36px;
          padding: 0 10px;
          border: 0;
          border-left: 3px solid transparent;
          border-radius: 6px;
          background: transparent;
          color: var(--tx-2);
          font-size: 13.5px;
          font-weight: 500;
          text-align: left;
          white-space: nowrap;
          cursor: pointer;
          transition: background 0.12s ease, color 0.12s ease;
        }
        .stg-menu-item svg {
          color: var(--tx-4);
          flex-shrink: 0;
        }
        .stg-menu-item:hover {
          background: var(--surface-hover);
          color: var(--tx-1);
        }
        .stg-menu-item:focus-visible {
          outline: 2px solid var(--brand);
          outline-offset: 1px;
        }
        .stg-menu-item.active {
          background: color-mix(in srgb, var(--brand) 8%, var(--surface));
          border-left-color: var(--brand);
          color: var(--brand);
          font-weight: 600;
        }
        .stg-menu-item.active svg {
          color: var(--brand);
        }
        .stg-menu-empty {
          font-size: 13px;
          color: var(--tx-3);
          padding: 4px 10px;
        }

        .stg-workspace {
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-width: 0;
          width: 100%;
        }

        /* Classic Settings Card Structure */
        .settings-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          overflow: hidden;
          width: 100%;
          box-sizing: border-box;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
        }
        .settings-card-header {
          padding: 16px 22px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          background: var(--surface);
        }
        .settings-card-header-banner {
          padding: 18px 24px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 14px;
          background: var(--surface);
        }
        .banner-left {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .banner-tag {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 10.5px;
          font-weight: 750;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--brand);
        }
        .banner-title {
          font-size: 19px;
          font-weight: 800;
          color: var(--tx-1);
          letter-spacing: -0.01em;
        }
        .banner-chips {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .banner-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          background: var(--surface-2);
          border: 1px solid var(--border);
          border-radius: 8px;
          font-size: 11px;
          line-height: 1.2;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
          transition: all 0.15s ease;
        }
        .banner-chip-active {
          background: color-mix(in srgb, var(--green, #10b981) 8%, var(--surface));
          border-color: color-mix(in srgb, var(--green, #10b981) 26%, transparent);
          color: color-mix(in srgb, var(--green, #10b981) 88%, #047857);
        }
        .banner-chip-inactive {
          background: var(--surface-2);
          border-color: var(--border);
          color: var(--tx-3);
        }
        .banner-chip-success {
          background: color-mix(in srgb, var(--green, #10b981) 9%, var(--surface));
          border-color: color-mix(in srgb, var(--green, #10b981) 25%, transparent);
          color: color-mix(in srgb, var(--green, #10b981) 90%, #047857);
        }
        .chip-label {
          font-size: 9.5px;
          font-weight: 750;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          color: var(--tx-4);
        }
        .chip-value {
          font-size: 11.5px;
          font-weight: 700;
          color: var(--tx-1);
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .status-dot {
          width: 6.5px;
          height: 6.5px;
          border-radius: 50%;
          display: inline-block;
          flex-shrink: 0;
        }
        .status-dot-active {
          background: #10b981;
          box-shadow: 0 0 6px #10b981;
        }
        .status-dot-inactive {
          background: var(--tx-4);
        }
        .settings-card-title {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 700;
          font-size: 14.5px;
          color: var(--tx-1);
          letter-spacing: -0.01em;
        }
        .settings-icon-bg {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          background: var(--surface-2);
          color: var(--tx-2);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--border);
          flex-shrink: 0;
        }
        .settings-card-body {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
          background: var(--surface);
        }
        .settings-card-footer {
          padding: 14px 24px;
          background: var(--surface);
          border-top: 1px solid var(--border);
          display: flex;
          justify-content: flex-end;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .stg-page .btn,
        .settings-card-footer .btn {
          box-shadow: none !important;
        }
        .settings-card-footer .btn-primary {
          background: var(--brand);
          border-radius: 9px;
          font-size: 13px;
          font-weight: 700;
          padding: 9px 20px;
          letter-spacing: -0.01em;
          transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .settings-card-footer .btn-primary:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 14px color-mix(in srgb, var(--brand) 30%, transparent) !important;
        }
        .settings-card-footer .btn-secondary {
          background: var(--surface-2);
          border-radius: 9px;
          font-size: 13px;
          font-weight: 600;
          padding: 9px 16px;
          color: var(--tx-2);
          border-color: var(--border);
        }

        /* General Settings 2-Column Grid (Flat, Professional Canvas) */
        .general-settings-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.45fr) minmax(280px, 0.95fr);
          gap: 24px;
          padding: 24px;
          align-items: start;
        }
        .general-form-column {
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: transparent;
          border: none;
          border-radius: 0;
          padding: 0;
        }
        .general-logo-column {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .brand-logo-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 14px;
          padding: 22px 18px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
          transition: all 0.2s ease;
        }
        .brand-logo-card:hover {
          border-color: color-mix(in srgb, var(--brand) 30%, var(--border));
          box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05);
        }
        .brand-logo-icon-wrap {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          background: color-mix(in srgb, var(--brand) 10%, transparent);
          border: 1px solid color-mix(in srgb, var(--brand) 20%, transparent);
          color: var(--brand);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 8px;
        }
        .brand-logo-title {
          font-size: 14.5px;
          font-weight: 750;
          color: var(--tx-1);
          margin-bottom: 3px;
        }
        .brand-logo-desc {
          font-size: 11.5px;
          color: var(--tx-3);
          max-width: 240px;
          line-height: 1.4;
          margin-bottom: 14px;
        }
        .brand-logo-preview {
          width: 120px;
          height: 120px;
          border-radius: 50%;
          background: var(--surface);
          border: 2px solid var(--border);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
          margin-bottom: 14px;
          position: relative;
          transition: transform 0.2s ease;
        }
        .brand-logo-preview:hover {
          transform: scale(1.03);
        }
        .brand-logo-preview.watermark-box {
          border-radius: 12px;
          background-image: 
            linear-gradient(45deg, rgba(0,0,0,0.04) 25%, transparent 25%),
            linear-gradient(-45deg, rgba(0,0,0,0.04) 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.04) 75%),
            linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.04) 75%);
          background-size: 12px 12px;
        }
        .brand-logo-preview img {
          width: 100%;
          height: 100%;
          object-fit: contain;
          padding: 8px;
        }
        .brand-logo-placeholder {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          color: var(--tx-4);
          font-size: 11px;
          font-weight: 600;
        }
        .brand-logo-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          justify-content: center;
          width: 100%;
          margin-bottom: 10px;
        }
        .brand-logo-footer-hint {
          font-size: 9.5px;
          font-weight: 750;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--tx-4);
        }

        /* Modernized Form Inputs */
        .pro-form-group {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .pro-form-label {
          font-size: 11.5px;
          font-weight: 700;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          color: var(--tx-3);
        }
        .pro-form-input {
          height: 42px;
          border-radius: 10px;
          border: 1px solid var(--border);
          background: var(--surface);
          padding: 0 13px;
          font-size: 13.5px;
          color: var(--tx-1);
          outline: none;
          transition: all 0.18s ease;
          width: 100%;
          box-sizing: border-box;
        }
        .pro-form-input:focus {
          border-color: var(--brand);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 12%, transparent);
        }
        .pro-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
        }
        .pro-input-icon {
          position: absolute;
          left: 13px;
          color: var(--tx-4);
          pointer-events: none;
        }
        .pro-form-input.with-icon {
          padding-left: 38px;
        }
        .phone-protocol-hint {
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 10.5px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--tx-4);
          margin-top: 2px;
        }

        /* Modern Phone Input */
        .pro-phone-wrap {
          display: flex;
          align-items: center;
          height: 42px;
          border: 1px solid var(--border);
          border-radius: 10px;
          background: var(--surface);
          position: relative;
          transition: all 0.18s ease;
        }
        .pro-phone-wrap.focused {
          border-color: var(--brand);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand) 12%, transparent);
        }
        .pro-phone-wrap.valid {
          border-color: var(--green, #10b981);
        }
        .pro-phone-flag-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 0 12px;
          height: 100%;
          border: none;
          border-right: 1px solid var(--border);
          background: transparent;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          color: var(--tx-1);
        }
        .pro-phone-input {
          flex: 1;
          height: 100%;
          border: none;
          outline: none;
          background: transparent;
          padding: 0 12px;
          font-size: 13.5px;
          font-weight: 500;
          color: var(--tx-1);
        }
        .pro-phone-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          width: 280px;
          max-height: 300px;
          display: flex;
          flex-direction: column;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: 0 12px 32px rgba(0,0,0,0.15);
          z-index: 99999;
          padding: 8px;
        }
        .pro-phone-search-box {
          padding-bottom: 6px;
          border-bottom: 1px solid var(--border);
          margin-bottom: 4px;
        }
        .pro-phone-list {
          flex: 1;
          overflow-y: auto;
          max-height: 220px;
        }
        .pro-phone-empty {
          padding: 12px;
          text-align: center;
          font-size: 12px;
          color: var(--tx-4);
        }
        .pro-phone-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12.5px;
          color: var(--tx-1);
          transition: background 0.12s ease;
        }
        .pro-phone-item:hover {
          background: var(--surface-2);
        }
        .pro-phone-item.active {
          background: color-mix(in srgb, var(--brand) 12%, transparent);
          color: var(--brand);
          font-weight: 700;
        }
        .pro-phone-item-dial {
          opacity: 0.7;
          font-weight: 600;
          margin-left: auto;
        }

        /* Section Title Header */
        .form-section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 11px;
          font-weight: 750;
          color: var(--tx-3);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding-bottom: 8px;
          border-bottom: 1px solid var(--border);
          margin-top: 6px;
        }
        .form-section-title svg {
          color: var(--brand);
        }

        /* Form Grids */
        .form-grid-2 {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 14px;
        }
        .form-grid-3 {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
        }

        /* ── Card system: same look as the customer form sections ── */
        .stg-page .settings-card {
          border-left: 4px solid var(--brand) !important;
          border-radius: 14px;
          overflow: visible;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
        }
        .stg-page .settings-card > :first-child {
          border-top-left-radius: 10px;
          border-top-right-radius: 13px;
        }
        .stg-page .settings-card > :last-child {
          border-bottom-left-radius: 10px;
          border-bottom-right-radius: 13px;
        }
        .stg-page .settings-card-header-banner,
        .stg-page .settings-card-header {
          margin: 0 26px;
          padding: 20px 0 14px;
          background: transparent;
          border-bottom: 1px solid var(--border);
        }
        .stg-page .banner-tag {
          display: none;
        }
        .stg-page .banner-title,
        .stg-page .settings-card-title {
          font-size: 17px;
          font-weight: 700;
        }
        .stg-page .banner-chip {
          border-radius: 6px;
          box-shadow: none;
          background: var(--surface-2);
        }
        .stg-page .settings-card-body {
          padding: 20px 26px 24px;
        }
        .stg-page .settings-card-body > .form-section-title:first-child {
          margin-top: 0;
        }
        /* Save bar stays reachable while scrolling a long form */
        .stg-page .settings-card-footer {
          position: sticky;
          bottom: 0;
          z-index: 5;
          padding: 12px 26px;
          background: var(--surface);
        }
        .stg-page .settings-card-footer .btn-primary {
          border-radius: 8px;
        }
        .stg-page .settings-card-footer .btn-primary:hover {
          transform: none;
          box-shadow: none !important;
          filter: brightness(0.95);
        }
        .stg-page label,
        .stg-page .pro-form-label {
          text-transform: none !important;
          letter-spacing: 0 !important;
          font-size: 12.5px !important;
          font-weight: 600 !important;
          color: var(--tx-2);
        }
        .stg-page .phone-protocol-hint,
        .stg-page .brand-logo-footer-hint {
          text-transform: none;
          letter-spacing: 0;
          font-size: 11.5px;
          font-weight: 500;
        }
        .stg-page .pro-form-input,
        .stg-page .pro-phone-wrap {
          height: 40px;
          border-radius: 8px;
          border-color: var(--border-2);
        }
        .stg-page .brand-logo-card {
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 10px;
          box-shadow: none;
        }
        .stg-page .brand-logo-card:hover {
          box-shadow: none;
          border-color: var(--border-2);
        }
        .stg-page .brand-logo-icon-wrap {
          display: none;
        }

        @media (max-width: 1024px) {
          .stg-page {
            grid-template-columns: minmax(0, 1fr);
            min-width: 0;
            max-width: 100%;
          }
          .general-settings-grid {
            grid-template-columns: minmax(0, 1fr);
            min-width: 0;
          }
          .general-settings-grid > * {
            min-width: 0;
            max-width: 100%;
          }
          .general-settings-grid input,
          .general-settings-grid textarea,
          .general-settings-grid select {
            max-width: 100%;
          }
          .stg-menu {
            position: static;
            width: 100%;
            max-width: 100%;
            min-width: 0;
          }
          .stg-menu > * {
            width: 100%;
            max-width: 100%;
            min-width: 0;
          }
          .stg-menu-list {
            flex-direction: row;
            gap: 4px;
            overflow-x: auto;
            scrollbar-width: none;
            -webkit-overflow-scrolling: touch;
            min-width: 0;
          }
          .stg-menu-list::-webkit-scrollbar {
            display: none;
          }
          .stg-menu-group {
            flex-direction: row;
            gap: 4px;
            flex-shrink: 0;
          }
          .stg-menu-title {
            display: none;
          }
          .stg-menu-item {
            width: auto;
            border-left: 0;
            border-bottom: 2px solid transparent;
            border-radius: 6px 6px 0 0;
          }
          .stg-menu-item.active {
            border-bottom-color: var(--brand);
          }

          /* ── Fit the settings menu strip + page content into the viewport ── */
          .stg-workspace {
            min-width: 0;
            max-width: 100%;
          }
          .settings-card {
            min-width: 0;
            max-width: 100%;
          }
          .general-settings-grid .settings-card,
          .general-settings-grid .settings-card * {
            min-width: 0;
          }
        }

        @media (max-width: 640px) {
          .stg-page {
            gap: 12px;
          }
          .general-settings-grid {
            padding: 16px;
            gap: 16px;
          }
          .stg-menu-list {
            gap: 2px;
          }
          .stg-menu-item {
            height: 34px;
            padding: 0 8px;
            font-size: 12.5px;
            gap: 6px;
          }
        }
      `}</style>
    </div>
  );
};

// ─── SUB-COMPONENTS ──────────────────────────────

const ThemePhoneInput: React.FC<{
  label?: string;
  value: string;
  onChange: (fullNumber: string) => void;
}> = ({ label, value, onChange }) => {
  const parsed = parsePhoneNumber(value?.startsWith('+') ? value : (value ? `+${value}` : ''));
  const [activeCountry, setActiveCountry] = useState<CountryCode>(parsed.countryCode || 'QA');
  const [phoneDigits, setPhoneDigits] = useState(parsed.digits || '');
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const phoneInputRef = React.useRef<HTMLInputElement>(null);

  const currentMeta = COUNTRY_PHONE_RULES[activeCountry] || COUNTRY_PHONE_RULES.QA;

  useEffect(() => {
    const p = parsePhoneNumber(value?.startsWith('+') ? value : (value ? `+${value}` : ''));
    if (p.countryCode) setActiveCountry(p.countryCode);
    setPhoneDigits(p.digits || '');
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleCountrySelect = (code: CountryCode) => {
    setActiveCountry(code);
    setIsOpen(false);
    setSearchQuery('');
    const newMeta = COUNTRY_PHONE_RULES[code];
    const truncatedDigits = phoneDigits.slice(0, newMeta.digits);
    setPhoneDigits(truncatedDigits);
    onChange(truncatedDigits ? `${newMeta.dialCode}${truncatedDigits}` : '');
    setTimeout(() => phoneInputRef.current?.focus(), 50);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let digits = getPhoneDigitsOnly(e.target.value);
    const dialDigits = currentMeta.dialCode.replace('+', '');
    if (digits.startsWith(dialDigits)) {
      digits = digits.substring(dialDigits.length);
    }
    digits = digits.slice(0, currentMeta.digits);
    setPhoneDigits(digits);
    onChange(digits ? `${currentMeta.dialCode}${digits}` : '');
  };

  const filteredCountries = Object.entries(COUNTRY_PHONE_RULES).filter(([code, meta]) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      meta.label.toLowerCase().includes(q) ||
      meta.dialCode.includes(q) ||
      code.toLowerCase().includes(q)
    );
  });

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && filteredCountries.length > 0) {
      e.preventDefault();
      handleCountrySelect(filteredCountries[0][0] as CountryCode);
    }
  };

  const isValidDigitCount = phoneDigits.length === currentMeta.digits;

  return (
    <div className="pro-form-group" style={{ position: 'relative', zIndex: isOpen ? 9999 : 'auto' }}>
      {label && (
        <div className="flex items-center justify-between mb-1.5">
          <label className="pro-form-label mb-0">{label}</label>
          <span className={`text-[11px] font-medium transition-colors ${isValidDigitCount ? 'text-emerald-500 font-semibold' : 'text-tx-3'}`}>
            {currentMeta.label}: {phoneDigits.length}/{currentMeta.digits} digits {isValidDigitCount && '✓'}
          </span>
        </div>
      )}
      
      <div 
        ref={dropdownRef}
        className={`pro-phone-wrap ${isOpen ? 'focused' : ''} ${isValidDigitCount ? 'valid' : ''}`}
      >
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="pro-phone-flag-btn"
        >
          <span style={{ fontSize: 17, lineHeight: 1 }}>{currentMeta.flag}</span>
          <span>{currentMeta.dialCode}</span>
          <svg 
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', opacity: 0.6 }}
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>

        <input
          ref={phoneInputRef}
          type="tel"
          value={phoneDigits}
          onChange={handleInputChange}
          maxLength={currentMeta.digits}
          placeholder={`${currentMeta.digits} digits`}
          className="pro-phone-input"
        />

        {isOpen && (
          <div className="pro-phone-dropdown">
            <div className="pro-phone-search-box">
              <div className="search-wrap search-sm" style={{ maxWidth: '100%' }}>
                <Search size={13} className="search-icon" />
                <input
                  ref={searchInputRef}
                  className="search-input"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search country or code..."
                />
              </div>
            </div>

            <div className="pro-phone-list">
              {filteredCountries.length === 0 ? (
                <div className="pro-phone-empty">
                  No matching country found
                </div>
              ) : (
                filteredCountries.map(([code, meta]) => (
                  <div
                    key={code}
                    onClick={() => handleCountrySelect(code as CountryCode)}
                    className={`pro-phone-item ${activeCountry === code ? 'active' : ''}`}
                  >
                    <span>{meta.flag}</span>
                    <span style={{ flex: 1 }}>{meta.label}</span>
                    <span className="pro-phone-item-dial">{meta.dialCode}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const GeneralSettings = ({
  settings,
  onSave,
  handleLogoChange,
  handleWatermarkChange,
  logoPreview,
  watermarkPreview,
  onApplyFont,
  onApplyCountry,
  onOpenPicker,
}: {
  settings: any;
  onSave: (data: any) => void;
  handleLogoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleWatermarkChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  logoPreview: string | null;
  watermarkPreview: string | null;
  onApplyFont: (font: AppFontKey) => void;
  onApplyCountry: (country: CountryCode) => void;
  onOpenPicker: () => void;
}) => {
  const savedFont = isAppFontKey(settings?.appFont) ? settings.appFont : DEFAULT_APP_FONT;
  const savedCountry: CountryCode = isCountryCode(settings?.country) ? (settings.country as CountryCode) : DEFAULT_COUNTRY;
  const savedPhone = settings?.companyPhone || '';
  const [formData, setFormData] = useState({
    companyName: settings?.companyName || '',
    website: settings?.website || '',
    companyEmail: settings?.companyEmail || '',
    companyPhone: savedPhone,
    dateFormat: settings?.dateFormat || 'DD/MM/YYYY',
    timeFormat: settings?.timeFormat || '12h',
    currency: settings?.currency || 'INR',
    proposalNo: settings?.proposalNo || 'WT-Q1001',
    proposalIncludeDate: Boolean(settings?.proposalIncludeDate),
    instagram: settings?.instagram || '',
    facebook: settings?.facebook || '',
    linkedin: settings?.linkedin || '',
    twitter: settings?.twitter || '',
    whatsapp: settings?.whatsapp || '',
    youtube: settings?.youtube || '',
    appFont: savedFont,
    country: savedCountry,
  });

  useEffect(() => {
    if (settings) {
      setFormData((p) => ({
        ...p,
        companyName: settings.companyName ?? p.companyName,
        website: settings.website ?? p.website,
        companyEmail: settings.companyEmail ?? p.companyEmail,
        companyPhone: settings.companyPhone ?? p.companyPhone,
        dateFormat: settings.dateFormat ?? p.dateFormat,
        timeFormat: settings.timeFormat ?? p.timeFormat,
        currency: settings.currency ?? p.currency,
        proposalNo: settings.proposalNo ?? p.proposalNo,
        proposalIncludeDate: settings.proposalIncludeDate !== undefined ? Boolean(settings.proposalIncludeDate) : p.proposalIncludeDate,
        instagram: settings.instagram ?? p.instagram,
        facebook: settings.facebook ?? p.facebook,
        linkedin: settings.linkedin ?? p.linkedin,
        twitter: settings.twitter ?? p.twitter,
        whatsapp: settings.whatsapp ?? p.whatsapp,
        youtube: settings.youtube ?? p.youtube,
        appFont: isAppFontKey(settings.appFont) ? settings.appFont : p.appFont,
        country: isCountryCode(settings.country) ? settings.country : p.country,
      }));
    }
  }, [settings]);

  useEffect(() => {
    const COUNTRY_CURRENCIES: Record<string, string> = {
      QA: 'QAR',
      IN: 'INR',
      AE: 'AED',
      SA: 'SAR',
      OM: 'OMR',
      KW: 'KWD',
      BH: 'BHD',
      US: 'USD',
      GB: 'GBP',
    };
    const nextCurrency = COUNTRY_CURRENCIES[formData.country] || 'QAR';
    if (formData.currency !== nextCurrency) {
      setFormData(p => ({ ...p, currency: nextCurrency }));
    }
  }, [formData.country]);

  const currentCountryRule = COUNTRY_PHONE_RULES[formData.country] || COUNTRY_PHONE_RULES.QA;

  return (
    <div className="settings-card">
      {/* Banner Header inside Card */}
      <div className="settings-card-header-banner">
        <div className="banner-left">
          <div className="banner-tag">
            <Globe size={13} /> PUBLIC IDENTITY
          </div>
          <div className="banner-title">Business Profile</div>
        </div>
        <div className="banner-chips">
          <div className="banner-chip">
            <span className="chip-label">REGION</span>
            <span className="chip-value">{currentCountryRule.label || formData.country}</span>
          </div>
          <div className="banner-chip">
            <span className="chip-label">CURRENCY</span>
            <span className="chip-value">{formData.currency || 'QAR'}</span>
          </div>
        </div>
      </div>

      {/* 2-Column Body */}
      <div className="general-settings-grid">
        {/* Left Column: Form Fields */}
        <div className="general-form-column">
          <div className="form-section-title">
            <Globe size={14} />
            <span>Company & Legal Identity</span>
          </div>

          <div className="pro-form-group">
            <label className="pro-form-label">Business name</label>
            <input
              type="text"
              className="pro-form-input"
              value={formData.companyName}
              onChange={(e) => setFormData(p => ({ ...p, companyName: e.target.value }))}
              placeholder="e.g. Welcome Tech Trading & Services"
            />
          </div>

          <div className="form-grid-2">
            <div className="pro-form-group">
              <label className="pro-form-label">Official email</label>
              <div className="pro-input-wrap">
                <Mail size={15} className="pro-input-icon" />
                <input
                  type="email"
                  className="pro-form-input with-icon"
                  value={formData.companyEmail}
                  onChange={(e) => setFormData(p => ({ ...p, companyEmail: e.target.value }))}
                  placeholder="admin@welcometech.qa"
                />
              </div>
            </div>

            <div className="pro-form-group">
              <label className="pro-form-label">Contact number</label>
              <ThemePhoneInput
                value={formData.companyPhone}
                onChange={(fullNum) => setFormData(p => ({ ...p, companyPhone: fullNum }))}
              />
              <div className="phone-protocol-hint">
                <AlertCircle size={11} />
                Must be exactly {currentCountryRule.digits} digits
              </div>
            </div>
          </div>

          <div className="pro-form-group">
            <label className="pro-form-label">Business address & website</label>
            <input
              type="text"
              className="pro-form-input"
              value={formData.website}
              onChange={(e) => setFormData(p => ({ ...p, website: e.target.value }))}
              placeholder="https://welcometech.qa"
            />
          </div>

          <div className="form-section-title" style={{ marginTop: 10 }}>
            <Compass size={14} />
            <span>Regional Standards & Localization</span>
          </div>

          <div className="form-grid-2">
            <div className="pro-form-group">
              <label className="pro-form-label">Currency</label>
              <input
                type="text"
                className="pro-form-input"
                value={COUNTRY_CURRENCIES[formData.country]?.name || 'Qatari Riyal'}
                readOnly
                style={{ opacity: 0.9, cursor: 'default' }}
              />
            </div>
            <div className="pro-form-group">
              <label className="pro-form-label">Currency symbol</label>
              <input
                type="text"
                className="pro-form-input"
                value={formData.currency}
                onChange={(e) => setFormData(p => ({ ...p, currency: e.target.value }))}
                placeholder="QAR / QR"
              />
            </div>
          </div>

          <div className="form-grid-2">
            <SelectField
              label="Date format"
              value={formData.dateFormat}
              onChange={(v: string) => setFormData(p => ({ ...p, dateFormat: v }))}
              options={[
                { value: 'DD/MM/YYYY', label: '31/12/2026 (DD/MM/YYYY)' },
                { value: 'MM/DD/YYYY', label: '12/31/2026 (MM/DD/YYYY)' },
                { value: 'YYYY-MM-DD', label: '2026-12-31 (YYYY-MM-DD)' },
              ]}
            />
            <SelectField
              label="Time format"
              value={formData.timeFormat}
              onChange={(v: string) => setFormData(p => ({ ...p, timeFormat: v }))}
              options={[
                { value: '12h', label: '02:30 PM (12-hour)' },
                { value: '24h', label: '14:30 (24-hour)' },
              ]}
            />
          </div>

          <div className="pro-form-group">
            <SelectField
              label="Country"
              value={formData.country}
              onChange={(v: string) => {
                const next = isCountryCode(v) ? v : DEFAULT_COUNTRY;
                const { digits } = parsePhoneNumber(formData.companyPhone);
                const nextDialCode = COUNTRY_PHONE_RULES[next]?.dialCode || '+974';
                const nextDigits = digits.slice(0, COUNTRY_PHONE_RULES[next]?.digits || 8);
                const nextPhone = `${nextDialCode}${nextDigits}`;
                const nextCur = COUNTRY_CURRENCIES[next]?.code || 'QAR';
                setFormData((p) => ({ ...p, country: next, companyPhone: nextPhone, currency: nextCur }));
                onApplyCountry(next);
              }}
              options={COUNTRY_OPTIONS}
            />
          </div>

          <div className="form-section-title" style={{ marginTop: 10 }}>
            <FileText size={14} />
            <span>Proposal Numbering & Sequence Control</span>
          </div>

          {/* Proposal No Dynamic Starting Sequence */}
          <div className="pro-form-group" style={{ marginTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <label className="pro-form-label" style={{ margin: 0 }}>PROPOSAL NO</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => {
                    setFormData(p => ({ ...p, proposalNo: 'WT-Q1001' }));
                    toast('Proposal No reset to default WT-Q1001. Click Save to apply.');
                  }}
                  style={{ padding: '2px 8px', fontSize: 11, height: 22 }}
                  title="Reset to default sequence"
                >
                  Reset Default
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => {
                    setFormData(p => ({ ...p, proposalNo: '' }));
                  }}
                  style={{ padding: '2px 8px', fontSize: 11, height: 22 }}
                  title="Clear Proposal No"
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="pro-input-wrap">
              <FileText size={15} className="pro-input-icon" />
              <input
                type="text"
                className="pro-form-input with-icon"
                value={formData.proposalNo}
                onChange={(e) => setFormData(p => ({ ...p, proposalNo: e.target.value }))}
                placeholder="e.g. 1001, WT-Q1001, or PROP-1001"
              />
            </div>
            <div className="phone-protocol-hint" style={{ marginTop: 4 }}>
              <AlertCircle size={11} />
              DYNAMIC PROPOSAL NUMBER: New proposals sent to clients will generate sequentially starting from this value onwards.
            </div>

            {/* Option to append /proposal sending date */}
            <div
              style={{
                marginTop: 10,
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--surface-2, rgba(255, 255, 255, 0.03))',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--tx-1)',
                  userSelect: 'none',
                  margin: 0,
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(formData.proposalIncludeDate)}
                  onChange={(e) => setFormData(p => ({ ...p, proposalIncludeDate: e.target.checked }))}
                  style={{
                    width: 17,
                    height: 17,
                    accentColor: 'var(--brand)',
                    cursor: 'pointer',
                  }}
                />
                <span>Append Proposal Sending Date (/DD-MM-YYYY)</span>
              </label>
              <div
                style={{
                  fontSize: 11.5,
                  color: 'var(--tx-3)',
                  paddingLeft: 27,
                  lineHeight: 1.4,
                }}
              >
                When enabled, newly generated proposals will mention the proposal sending date after the serial number.
              </div>
              <div
                style={{
                  marginTop: 4,
                  marginLeft: 27,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 11,
                  fontFamily: 'monospace',
                  background: 'var(--surface-3, rgba(255,255,255,0.06))',
                  padding: '4px 10px',
                  borderRadius: 6,
                  color: 'var(--brand)',
                  fontWeight: 600,
                  width: 'fit-content',
                }}
              >
                <Calendar size={12} />
                Format Preview: {buildProposalNumber(formData.proposalNo || 'WT-Q1001', Boolean(formData.proposalIncludeDate), new Date())}
              </div>
            </div>
          </div>

          {/* Social Profiles */}
          <div className="form-section-title" style={{ marginTop: 10 }}>
            <LinkIcon size={14} />
            <span>Social Profiles & Online Handles</span>
          </div>
          <div className="pro-form-group">
            <div className="form-grid-2" style={{ marginTop: 4 }}>
              <input
                type="text"
                className="pro-form-input"
                value={formData.instagram}
                onChange={(e) => setFormData(p => ({ ...p, instagram: e.target.value }))}
                placeholder="Instagram URL"
              />
              <input
                type="text"
                className="pro-form-input"
                value={formData.facebook}
                onChange={(e) => setFormData(p => ({ ...p, facebook: e.target.value }))}
                placeholder="Facebook URL"
              />
              <input
                type="text"
                className="pro-form-input"
                value={formData.linkedin}
                onChange={(e) => setFormData(p => ({ ...p, linkedin: e.target.value }))}
                placeholder="LinkedIn URL"
              />
              <input
                type="text"
                className="pro-form-input"
                value={formData.whatsapp}
                onChange={(e) => setFormData(p => ({ ...p, whatsapp: e.target.value }))}
                placeholder="WhatsApp Link"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Brand Logo Card */}
        <div className="general-logo-column">
          <div className="brand-logo-card">
            <div className="brand-logo-icon-wrap">
              <ImageIcon size={20} />
            </div>
            <div className="brand-logo-title">Brand Logo</div>
            <div className="brand-logo-desc">
              Upload a square PNG for crisp display in navigation, documents, and printed receipts.
            </div>
            
            <div className="brand-logo-preview">
              {(logoPreview || settings?.logo) ? (
                <img src={logoPreview || toAssetUrl(settings?.logo)} alt="Brand Logo" />
              ) : (
                <div className="brand-logo-placeholder">
                  <ImageIcon size={32} />
                  <span>No Logo</span>
                </div>
              )}
            </div>

            <div className="brand-logo-actions">
              <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
                <Upload size={13} />
                Choose Logo
                <input type="file" hidden accept="image/*" onChange={handleLogoChange} />
              </label>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenPicker}>
                <HardDrive size={13} /> Library
              </button>
            </div>

            <div className="brand-logo-footer-hint">
              Recommended: 512 × 512 PNG
            </div>
          </div>

          {/* Proposal Watermark Card */}
          <div className="brand-logo-card">
            <div className="brand-logo-icon-wrap" style={{ background: 'var(--surface-3)', color: 'var(--tx-3)' }}>
              <FileText size={18} />
            </div>
            <div className="brand-logo-title">Proposal Watermark</div>
            <div className="brand-logo-desc">
              Light centered watermark rendered across PDF proposal pages.
            </div>
            
            <div className="brand-logo-preview watermark-box">
              {(watermarkPreview || settings?.proposalWatermark) ? (
                <img src={watermarkPreview || toAssetUrl(settings?.proposalWatermark)} alt="Proposal Watermark" />
              ) : (
                <div className="brand-logo-placeholder">
                  <FileText size={28} />
                  <span>No Watermark</span>
                </div>
              )}
            </div>

            <div className="brand-logo-actions">
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
                <Upload size={13} />
                Upload Watermark
                <input type="file" hidden accept="image/*" onChange={handleWatermarkChange} />
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-card-footer">
        <button
          className="btn btn-primary"
          onClick={() => {
            if (formData.companyPhone && formData.companyPhone.trim()) {
              if (!validatePhoneNumber(formData.companyPhone)) {
                const rule = COUNTRY_PHONE_RULES[formData.country] || COUNTRY_PHONE_RULES.QA;
                toast.error(`Invalid contact number. ${rule.label} requires exactly ${rule.digits} digits.`);
                return;
              }
            }
            onSave(formData);
          }}
        >
          <Save size={14} /> 
          Save Business Profile
        </button>
      </div>
    </div>
  );
};

const SMTPSettings = ({ settings, onSave, onTest, onTestEmail, isTesting, isTestingEmail }: any) => {
  const [formData, setFormData] = useState({
    smtpHost: settings?.smtpHost || '',
    smtpPort: settings?.smtpPort || 587,
    smtpUser: settings?.smtpUser || '',
    smtpPassword: settings?.smtpPassword || '',
    senderEmail: settings?.senderEmail || '',
    mailFromName: settings?.mailFromName || '',
    mailEncryption: settings?.mailEncryption || 'tls',
  });

  const [showEmailModal, setShowEmailModal] = useState(false);
  const [testEmail, setTestEmail] = useState('');

  const handleSendTestEmail = () => {
    if (!testEmail.trim()) {
      toast.error('Please enter a recipient email');
      return;
    }
    onTestEmail({ ...formData, testEmail });
    setShowEmailModal(false);
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header-banner">
        <div className="banner-left">
          <div className="banner-tag">
            <Mail size={13} /> OUTBOUND EMAIL RELAY
          </div>
          <div className="banner-title">SMTP Mail Server</div>
        </div>
        <div className="banner-chips">
          <div className="flex items-center gap-2">
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => onTest(formData)}
              disabled={isTesting}
            >
              <RefreshCw size={13} className={isTesting ? 'animate-spin' : ''} /> 
              {isTesting ? 'Verifying...' : 'Verify Connection'}
            </button>
            <button 
              className="btn btn-primary btn-sm" 
              onClick={() => setShowEmailModal(true)}
              disabled={isTestingEmail}
            >
              <Send size={13} /> {isTestingEmail ? 'Sending...' : 'Send Test Email'}
            </button>
          </div>
        </div>
      </div>
      <div className="settings-card-body">
        <div className="form-grid-2">
          <InputField label="SMTP Host" value={formData.smtpHost} onChange={(v) => setFormData(p => ({ ...p, smtpHost: v }))} placeholder="smtp-relay.brevo.com" />
          <InputField
            label="SMTP Port"
            value={formData.smtpPort}
            onChange={(v) => {
              const portNum = Number(v);
              setFormData(p => ({
                ...p,
                smtpPort: portNum,
                mailEncryption: portNum === 465 ? 'ssl' : (portNum === 587 ? 'tls' : p.mailEncryption)
              }));
            }}
            type="number"
            placeholder="587"
          />
          <InputField label="SMTP User" value={formData.smtpUser} onChange={(v) => setFormData(p => ({ ...p, smtpUser: v }))} />
          <InputField label="SMTP Password" value={formData.smtpPassword} onChange={(v) => setFormData(p => ({ ...p, smtpPassword: v }))} type="password" />
          <InputField label="Sender Email (From)" value={formData.senderEmail} onChange={(v) => setFormData(p => ({ ...p, senderEmail: v }))} />
          <InputField label="Mail From Name" value={formData.mailFromName} onChange={(v) => setFormData(p => ({ ...p, mailFromName: v }))} />
        </div>
        <div className="form-group mt-5">
          <label className="form-label" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Lock size={15} style={{ color: 'var(--brand)' }} />
            <span>Mail Encryption Protocol</span>
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {[
              {
                id: 'ssl',
                label: 'SSL (Implicit)',
                port: 465,
                desc: 'Direct SSL/TLS encryption from the start of connection.',
                hint: 'Recommended for standard secure mail servers.'
              },
              {
                id: 'tls',
                label: 'TLS (STARTTLS)',
                port: 587,
                desc: 'Upgrades plaintext connection to secure TLS via STARTTLS command.',
                hint: 'Recommended for modern SMTP relays (SendGrid, Postmark, SES).'
              }
            ].map(type => {
              const isSelected = formData.mailEncryption === type.id;
              return (
                <div
                  key={type.id}
                  onClick={() => setFormData(p => ({
                    ...p,
                    mailEncryption: type.id as 'ssl' | 'tls',
                    smtpPort: type.port
                  }))}
                  style={{
                    cursor: 'pointer',
                    padding: '14px 16px',
                    borderRadius: 12,
                    border: isSelected ? '2px solid var(--brand)' : '1px solid var(--border)',
                    background: isSelected ? 'color-mix(in srgb, var(--brand) 6%, #ffffff)' : 'var(--surface-2)',
                    boxShadow: isSelected ? '0 2px 10px color-mix(in srgb, var(--brand) 12%, transparent)' : 'none',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          border: isSelected ? '5px solid var(--brand)' : '2px solid var(--tx-4)',
                          background: isSelected ? '#ffffff' : 'transparent',
                          transition: 'all 0.15s ease',
                          flexShrink: 0
                        }}
                      />
                      <span style={{ fontSize: 13.5, fontWeight: 750, color: isSelected ? 'var(--brand)' : 'var(--tx-1)' }}>
                        {type.label}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: 6,
                        background: isSelected ? 'color-mix(in srgb, var(--brand) 16%, transparent)' : 'var(--surface)',
                        color: isSelected ? 'var(--brand)' : 'var(--tx-3)',
                        border: '1px solid var(--border)',
                        fontFamily: 'monospace',
                        letterSpacing: '0.02em'
                      }}
                    >
                      Port {type.port}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 11.5, color: 'var(--tx-3)', lineHeight: 1.4, paddingLeft: 28 }}>
                    {type.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="settings-card-footer">
        <button className="btn btn-primary" onClick={() => onSave(formData)}>
          <Save size={14} /> 
          Save SMTP Settings
        </button>
      </div>

      <Modal
        open={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        title="Send Test Email"
        size="sm"
        footer={(
          <div className="flex justify-end gap-3 w-full">
            <button className="btn btn-ghost" onClick={() => setShowEmailModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSendTestEmail} disabled={!testEmail.trim() || isTestingEmail}>
              {isTestingEmail ? <Spinner size={14} /> : <Send size={14} />} 
              {isTestingEmail ? 'Sending...' : 'Send Email'}
            </button>
          </div>
        )}
      >
        <div className="space-y-4 pt-2">
          <div className="p-4 bg-brand-light/20 rounded-xl flex items-start gap-3 mb-2">
            <div className="mt-1 text-brand">
              <AlertCircle size={18} />
            </div>
            <p className="text-sm text-tx-2 leading-relaxed">
              Verify your SMTP configuration by sending a real email. We recommend using an address you can access immediately.
            </p>
          </div>
          
          <InputField 
            label="Recipient Email" 
            value={testEmail} 
            onChange={setTestEmail} 
            placeholder="name@example.com"
            autoFocus
            required
          />
          
          <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-lg text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
            <strong>Note:</strong> Ensure you have saved your latest settings or they might not be used for this test.
          </div>
        </div>
      </Modal>
    </div>
  );
};

const FirebaseSettings = ({ settings, onSave, onTest, isTesting }: any) => {
  const [formData, setFormData] = useState({
    firebaseVapidKey: settings?.firebaseVapidKey || 'B0Qp-1q2GLdLIXiXLumWbYId-0FpSu7E0CuqwpKZ9hc1oYkn_PuNKIEQ6J4c6jMn196lK5r2ANrQ0Ihkjai6PNY',
    firebaseApiKey: settings?.firebaseApiKey || '',
    firebaseAuthDomain: settings?.firebaseAuthDomain || 'bbgurukulam-55076.firebaseapp.com',
    firebaseProjectId: settings?.firebaseProjectId || 'bbgurukulam-55076',
    firebaseStorageBucket: settings?.firebaseStorageBucket || 'bbgurukulam-55076.firebasestorage.app',
    firebaseMessagingSenderId: settings?.firebaseMessagingSenderId || '174641638121',
    firebaseAppId: settings?.firebaseAppId || '1:174641638121:web:eac274f266e3b924d71e78',
    firebaseMeasurementId: settings?.firebaseMeasurementId || '',
    firebaseServerKey: settings?.firebaseServerKey || '',
    firebaseServiceStatus: settings?.firebaseServiceStatus || 'active',
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [currentToken, setCurrentToken] = useState<string>(() => localStorage.getItem('wt_fcm_token') || '');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isGettingToken, setIsGettingToken] = useState(false);
  const [testToken, setTestToken] = useState('');
  const [showTestModal, setShowTestModal] = useState(false);

  const isActive = formData.firebaseServiceStatus === 'active';
  const permissionStatus = getNotificationPermission();

  const handleGetMyToken = async () => {
    setIsGettingToken(true);
    try {
      let token = currentToken || localStorage.getItem('wt_fcm_token');
      if (!token) {
        token = await initFCMAndRegisterToken({ promptUser: true }) || '';
      }
      if (token) {
        setCurrentToken(token);
        await navigator.clipboard.writeText(token);
        toast.success('FCM Device Token copied to clipboard!');
      } else {
        toast.error('Could not retrieve FCM token. Ensure notifications are allowed.');
      }
    } catch (err: any) {
      toast.error('Failed to get token: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsGettingToken(false);
    }
  };

  const handleRegisterBrowser = async () => {
    setIsRegistering(true);
    try {
      const token = await initFCMAndRegisterToken({ promptUser: true });
      if (token) {
        setCurrentToken(token);
        toast.success('Browser successfully registered with FCM!');
      } else {
        toast.error('Could not register browser. Please allow notification permissions.');
      }
    } catch (err: any) {
      toast.error('Registration failed: ' + (err?.message || 'Unknown error'));
    } finally {
      setIsRegistering(false);
    }
  };

  const handleTestConnection = async () => {
    let token = currentToken || localStorage.getItem('wt_fcm_token');
    if (!token) {
      token = await initFCMAndRegisterToken({ promptUser: true }) || '';
      if (token) setCurrentToken(token);
    }

    if (token) {
      onTest({ token, title: 'CRM Push Test', body: 'Firebase Cloud Messaging is working perfectly!' });
    } else {
      setShowTestModal(true);
    }
  };

  const handleManualTest = () => {
    if (!testToken.trim()) {
      toast.error('Please enter a device token');
      return;
    }
    onTest({ token: testToken.trim() });
    setShowTestModal(false);
  };

  return (
    <div className="space-y-6">
      {/* ─── Card 1: Firebase Client SDK Configuration ────────────────── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between pb-5 border-b border-slate-100 dark:border-slate-800 mb-6">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Firebase Client SDK Configuration
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status:</span>
            <button
              type="button"
              onClick={() => setFormData(p => ({ ...p, firebaseServiceStatus: p.firebaseServiceStatus === 'active' ? 'inactive' : 'active' }))}
              className={`px-3 py-1 text-xs font-bold rounded-full transition-all ${
                isActive
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                  : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-300 dark:border-rose-800'
              }`}
            >
              {isActive ? '● ACTIVE' : '○ INACTIVE'}
            </button>
          </div>
        </div>

        <div className="space-y-5">
          {/* Public VAPID Key (Full Width) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              PUBLIC VAPID KEY (WEB PUSH)
            </label>
            <input
              type="text"
              value={formData.firebaseVapidKey}
              onChange={(e) => setFormData(p => ({ ...p, firebaseVapidKey: e.target.value }))}
              placeholder="Paste public VAPID Key from Firebase Console"
              className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
          </div>

          {/* Row 1: API Key, Auth Domain, Project ID, Storage Bucket */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                API KEY
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={formData.firebaseApiKey}
                  onChange={(e) => setFormData(p => ({ ...p, firebaseApiKey: e.target.value }))}
                  placeholder="AIzaSy..."
                  className="w-full px-3.5 py-2.5 pr-10 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                AUTH DOMAIN
              </label>
              <input
                type="text"
                value={formData.firebaseAuthDomain}
                onChange={(e) => setFormData(p => ({ ...p, firebaseAuthDomain: e.target.value }))}
                placeholder="project.firebaseapp.com"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                PROJECT ID
              </label>
              <input
                type="text"
                value={formData.firebaseProjectId}
                onChange={(e) => setFormData(p => ({ ...p, firebaseProjectId: e.target.value }))}
                placeholder="e.g. bbgurukulam-55076"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                STORAGE BUCKET
              </label>
              <input
                type="text"
                value={formData.firebaseStorageBucket}
                onChange={(e) => setFormData(p => ({ ...p, firebaseStorageBucket: e.target.value }))}
                placeholder="project.appspot.com"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Row 2: Message Sender ID, App ID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                MESSAGE SENDER ID
              </label>
              <input
                type="text"
                value={formData.firebaseMessagingSenderId}
                onChange={(e) => setFormData(p => ({ ...p, firebaseMessagingSenderId: e.target.value }))}
                placeholder="e.g. 174641638121"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
                APP ID
              </label>
              <input
                type="text"
                value={formData.firebaseAppId}
                onChange={(e) => setFormData(p => ({ ...p, firebaseAppId: e.target.value }))}
                placeholder="1:174641638121:web:abcdef"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            type="button"
            className="btn btn-primary flex items-center gap-2"
            onClick={() => onSave(formData)}
          >
            <Save size={15} /> Save Firebase Configuration
          </button>
        </div>
      </div>

      {/* ─── Card 2: Connectivity Diagnostics ─────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
            Connectivity Diagnostics
          </h3>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleGetMyToken}
              disabled={isGettingToken}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <Copy size={13} className="text-slate-500" />
              {isGettingToken ? 'Fetching...' : 'Get My Token'}
            </button>

            <button
              type="button"
              onClick={handleRegisterBrowser}
              disabled={isRegistering}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <RefreshCw size={13} className={isRegistering ? 'animate-spin' : 'text-slate-500'} />
              {isRegistering ? 'Registering...' : 'Register Browser'}
            </button>

            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#033b35] hover:bg-[#022c27] text-white transition-colors shadow-sm"
            >
              <Send size={13} />
              {isTesting ? 'Testing...' : 'Test Connection'}
            </button>
          </div>
        </div>

        {/* Expandable Diagnostic Details */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
          >
            {showDiagnostics ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showDiagnostics ? 'Hide Diagnostics Details' : 'Show Diagnostics Details'}
          </button>

          {showDiagnostics && (
            <div className="mt-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-2 text-xs border border-slate-200/60 dark:border-slate-700/60">
              <div className="flex items-center justify-between py-1 border-b border-slate-200/50 dark:border-slate-700/50">
                <span className="text-slate-500">Browser Web Push Support:</span>
                <span className={`font-semibold ${isNotificationSupported() ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'}`}>
                  {isNotificationSupported() ? 'Supported' : 'Not Supported'}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-200/50 dark:border-slate-700/50">
                <span className="text-slate-500">Notification Permission:</span>
                <span className={`font-semibold uppercase ${
                  permissionStatus === 'granted' ? 'text-emerald-600 dark:text-emerald-400' : permissionStatus === 'denied' ? 'text-rose-500' : 'text-amber-500'
                }`}>
                  {permissionStatus}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-200/50 dark:border-slate-700/50">
                <span className="text-slate-500">Active Service Worker:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300">/firebase-messaging-sw.js</span>
              </div>
              <div className="flex items-center justify-between py-1">
                <span className="text-slate-500">Local FCM Token:</span>
                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-400 max-w-[280px] sm:max-w-md truncate">
                  {currentToken || 'No token stored on this browser yet (Click Register Browser)'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Manual Test Modal */}
      <Modal
        open={showTestModal}
        onClose={() => setShowTestModal(false)}
        title="Send Test Push Notification"
        size="sm"
        footer={(
          <div className="flex justify-end gap-3 w-full">
            <button className="btn btn-ghost" onClick={() => setShowTestModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleManualTest} disabled={!testToken.trim() || isTesting}>
              {isTesting ? <Spinner size={14} /> : <Send size={14} />}
              {isTesting ? 'Sending...' : 'Send Notification'}
            </button>
          </div>
        )}
      >
        <div className="space-y-4 pt-2">
          <div className="p-4 bg-brand-light/20 rounded-xl flex items-start gap-3 mb-2">
            <div className="mt-1 text-brand">
              <Bell size={18} />
            </div>
            <p className="text-sm text-tx-2 leading-relaxed">
              Send a test push message to a target device using its active FCM registration token.
            </p>
          </div>

          <InputField
            label="Target Device FCM Token"
            value={testToken}
            onChange={setTestToken}
            placeholder="Paste registration token here..."
            autoFocus
            required
          />

          <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-lg text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
            <strong>Note:</strong> Make sure you have clicked "Save Firebase Configuration" before verifying the live dispatch.
          </div>
        </div>
      </Modal>
    </div>
  );
};

const PaymentSettings = ({ settings, onSave }: any) => {
  const [formData, setFormData] = useState({
    razorpayKeyId: settings?.razorpayKeyId || '',
    razorpayKeySecret: settings?.razorpayKeySecret || '',
    razorpayStatus: settings?.razorpayStatus || 'inactive',
  });

  return (
    <div className="settings-card">
      <div className="settings-card-header-banner">
        <div className="banner-left">
          <div className="banner-tag">
            <CreditCard size={13} /> CHECKOUT & GATEWAY
          </div>
          <div className="banner-title">Razorpay Payment Integration</div>
        </div>
        <div className="banner-chips">
          <div className="banner-chip">
            <span className="chip-label">STATUS</span>
            <span className={`chip-value font-bold ${formData.razorpayStatus === 'active' ? 'text-emerald-500' : 'text-rose-500'}`}>
              {formData.razorpayStatus === 'active' ? '● ACTIVE' : '○ INACTIVE'}
            </span>
          </div>
          <button className="btn btn-secondary btn-sm"><RefreshCw size={13} /> Test Gateway</button>
        </div>
      </div>
      <div className="settings-card-body">
        <div className="form-section-title">
          <CreditCard size={14} className="text-brand" />
          Gateway Status & API Keys
        </div>
        <div className="form-grid-3">
          <SelectField
            label="Gateway Status"
            value={formData.razorpayStatus}
            onChange={(v) => setFormData(p => ({ ...p, razorpayStatus: v as 'active' | 'inactive' }))}
            options={[{ value: 'active', label: 'Active (Enabled)' }, { value: 'inactive', label: 'Inactive (Disabled)' }]}
          />
          <InputField label="Key ID" value={formData.razorpayKeyId} onChange={(v) => setFormData(p => ({ ...p, razorpayKeyId: v }))} placeholder="rzp_live_... / rzp_test_..." />
          <InputField label="Key Secret" value={formData.razorpayKeySecret} onChange={(v) => setFormData(p => ({ ...p, razorpayKeySecret: v }))} type="password" placeholder="••••••••••••••••" />
        </div>
      </div>
      <div className="settings-card-footer">
        <button className="btn btn-primary" onClick={() => onSave(formData)}>
          <Save size={14} /> 
          Save Gateway Details
        </button>
      </div>
    </div>
  );
};

const SMSSettings = ({ settings, onSave }: any) => {
  const [formData, setFormData] = useState({
    smsProvider: settings?.smsProvider || '',
    smsApiKey: settings?.smsApiKey || '',
    smsApiSecret: settings?.smsApiSecret || '',
    smsSenderId: settings?.smsSenderId || '',
    smsStatus: settings?.smsStatus || 'inactive',
  });

  return (
    <div className="settings-card">
      <div className="settings-card-header-banner">
        <div className="banner-left">
          <div className="banner-tag">
            <SmsIcon size={13} /> GATEWAY INTEGRATION
          </div>
          <div className="banner-title">SMS Gateway Dispatcher</div>
        </div>
        <div className="banner-chips">
          <div className={`banner-chip ${formData.smsStatus === 'active' ? 'banner-chip-active' : 'banner-chip-inactive'}`}>
            <span className={`status-dot ${formData.smsStatus === 'active' ? 'status-dot-active' : 'status-dot-inactive'}`} />
            <span className="chip-label">STATUS</span>
            <span className="chip-value">
              {formData.smsStatus === 'active' ? 'Active' : 'Inactive'}
            </span>
          </div>
        </div>
      </div>
      <div className="settings-card-body">
        <div className="form-section-title">
          <SmsIcon size={14} className="text-brand" />
          Provider Configuration & Credentials
        </div>
        <div className="form-grid-3">
          <SelectField
            label="SMS Gateway Status"
            value={formData.smsStatus}
            onChange={(v) => setFormData(p => ({ ...p, smsStatus: v as 'active' | 'inactive' }))}
            options={[{ value: 'active', label: 'Active (Enabled)' }, { value: 'inactive', label: 'Inactive (Disabled)' }]}
          />
          <InputField label="SMS Provider" value={formData.smsProvider} onChange={(v) => setFormData(p => ({ ...p, smsProvider: v }))} placeholder="e.g. Twilio, MSG91" />
          <InputField label="Sender ID" value={formData.smsSenderId} onChange={(v) => setFormData(p => ({ ...p, smsSenderId: v }))} placeholder="e.g. WELCOME" />
        </div>
        <div className="form-grid-2 mt-2">
          <InputField label="API Key / Account SID" value={formData.smsApiKey} onChange={(v) => setFormData(p => ({ ...p, smsApiKey: v }))} placeholder="API Key or SID" />
          <InputField label="API Secret / Auth Token" value={formData.smsApiSecret} onChange={(v) => setFormData(p => ({ ...p, smsApiSecret: v }))} type="password" placeholder="••••••••••••••••" />
        </div>
      </div>
      <div className="settings-card-footer">
        <button className="btn btn-primary" onClick={() => onSave(formData)}>
          <Save size={14} /> 
          Save SMS Settings
        </button>
      </div>
    </div>
  );
};

const WhatsAppSettings = ({ settings, onSave, onTest, isTesting }: any) => {
  const [formData, setFormData] = useState({
    whatsappBusinessStatus: settings?.whatsappBusinessStatus || 'inactive',
    whatsappApiVersion: settings?.whatsappApiVersion || 'v23.0',
    whatsappBusinessAccountId: settings?.whatsappBusinessAccountId || '',
    whatsappPhoneNumberId: settings?.whatsappPhoneNumberId || '',
    whatsappAccessToken: '',
    whatsappAppSecret: '',
    whatsappWebhookVerifyToken: '',
    whatsappDefaultTemplateName: settings?.whatsappDefaultTemplateName || '',
    whatsappDefaultLanguageCode: settings?.whatsappDefaultLanguageCode || 'en_US',
    whatsappPdfTemplateName: settings?.whatsappPdfTemplateName || '',
    whatsappPdfTemplateLanguageCode: settings?.whatsappPdfTemplateLanguageCode || 'en_US',
  });

  useEffect(() => {
    if (settings) {
      setFormData(prev => ({
        ...prev,
        whatsappBusinessStatus: settings?.whatsappBusinessStatus || 'inactive',
        whatsappApiVersion: settings?.whatsappApiVersion || 'v23.0',
        whatsappBusinessAccountId: settings?.whatsappBusinessAccountId || '',
        whatsappPhoneNumberId: settings?.whatsappPhoneNumberId || '',
        whatsappDefaultTemplateName: settings?.whatsappDefaultTemplateName || '',
        whatsappDefaultLanguageCode: settings?.whatsappDefaultLanguageCode || 'en_US',
        whatsappPdfTemplateName: settings?.whatsappPdfTemplateName || '',
        whatsappPdfTemplateLanguageCode: settings?.whatsappPdfTemplateLanguageCode || 'en_US',
      }));
    }
  }, [settings]);

  const [testData, setTestData] = useState({
    to: '974',
    messageType: 'template',
    message: '',
    templateName: '',
    languageCode: '',
  });

  const handleTest = () => {
    if (!testData.to.trim()) {
      toast.error('Please enter a valid recipient phone number');
      return;
    }
    onTest({
      ...testData,
      whatsappApiVersion: formData.whatsappApiVersion,
      whatsappPhoneNumberId: formData.whatsappPhoneNumberId,
      whatsappAccessToken: formData.whatsappAccessToken || undefined,
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="settings-card">
        <div className="settings-card-header-banner">
          <div className="banner-left">
            <div className="banner-tag">
              <MessageCircle size={13} /> CLOUD API INTEGRATION
            </div>
            <div className="banner-title">WhatsApp Business Platform</div>
          </div>
          <div className="banner-chips">
            <div className={`banner-chip ${formData.whatsappBusinessStatus === 'active' ? 'banner-chip-active' : 'banner-chip-inactive'}`}>
              <span className={`status-dot ${formData.whatsappBusinessStatus === 'active' ? 'status-dot-active' : 'status-dot-inactive'}`} />
              <span className="chip-label">STATUS</span>
              <span className="chip-value">
                {formData.whatsappBusinessStatus === 'active' ? 'Active' : 'Inactive'}
              </span>
            </div>
            {settings?.whatsappAccessTokenSet && (
              <div className="banner-chip banner-chip-success">
                <ShieldCheck size={13} strokeWidth={2.5} style={{ color: '#10b981', flexShrink: 0 }} />
                <span className="chip-value" style={{ color: 'inherit' }}>
                  Token Configured &amp; Saved
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="settings-card-body">
          <div className="form-section-title">
            <MessageCircle size={14} className="text-brand" />
            Integration Status & Meta Account Identifiers
          </div>
          <div className="form-grid-3">
            <SelectField
              label="Integration Status"
              value={formData.whatsappBusinessStatus}
              onChange={(v) => setFormData(p => ({ ...p, whatsappBusinessStatus: v as 'active' | 'inactive' }))}
              options={[{ value: 'active', label: 'Active (Enabled)' }, { value: 'inactive', label: 'Inactive (Disabled)' }]}
            />
            <InputField 
              label="API Version" 
              value={formData.whatsappApiVersion} 
              onChange={(v) => setFormData(p => ({ ...p, whatsappApiVersion: v }))} 
              placeholder="e.g. v23.0" 
            />
            <InputField 
              label="Business Account ID" 
              value={formData.whatsappBusinessAccountId} 
              onChange={(v) => setFormData(p => ({ ...p, whatsappBusinessAccountId: v }))} 
              placeholder="Meta Business Account ID" 
            />
          </div>

          <div className="form-grid-3 mt-2">
            <InputField 
              label="Phone Number ID" 
              value={formData.whatsappPhoneNumberId} 
              onChange={(v) => setFormData(p => ({ ...p, whatsappPhoneNumberId: v }))} 
              placeholder="Meta Phone Number ID" 
            />
            <InputField 
              label="Default Template Name" 
              value={formData.whatsappDefaultTemplateName} 
              onChange={(v) => setFormData(p => ({ ...p, whatsappDefaultTemplateName: v }))} 
              placeholder="e.g. hello_world" 
            />
            <InputField 
              label="Default Language Code" 
              value={formData.whatsappDefaultLanguageCode} 
              onChange={(v) => setFormData(p => ({ ...p, whatsappDefaultLanguageCode: v }))} 
              placeholder="e.g. en_US" 
            />
          </div>
          <div className="form-grid-2 mt-2">
            <InputField
              label="PDF Template Name"
              value={formData.whatsappPdfTemplateName}
              onChange={(v) => setFormData(p => ({ ...p, whatsappPdfTemplateName: v }))}
              placeholder="Document header template"
            />
            <InputField
              label="PDF Template Language"
              value={formData.whatsappPdfTemplateLanguageCode}
              onChange={(v) => setFormData(p => ({ ...p, whatsappPdfTemplateLanguageCode: v }))}
              placeholder="e.g. en_US"
            />
          </div>

          <div className="form-section-title mt-4">
            <Shield size={14} className="text-brand" />
            Security Tokens & Webhook Verification
          </div>
          <div className="form-grid-3">
            <div>
              <InputField
                label="Permanent Access Token"
                value={formData.whatsappAccessToken}
                onChange={(v) => setFormData(p => ({ ...p, whatsappAccessToken: v }))}
                type="password"
                placeholder={settings?.whatsappAccessTokenSet ? '•••••••••••••••• (Saved in DB)' : 'Meta Permanent Access Token'}
              />
              {settings?.whatsappAccessTokenSet && (
                <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>✓ Token is securely encrypted & active in database</span>
                </div>
              )}
            </div>
            <InputField
              label="App Secret"
              value={formData.whatsappAppSecret}
              onChange={(v) => setFormData(p => ({ ...p, whatsappAppSecret: v }))}
              type="password"
              placeholder={settings?.whatsappAppSecretSet ? '•••••••• (Saved in DB)' : 'Meta App Secret'}
            />
            <InputField
              label="Webhook Verification Token"
              value={formData.whatsappWebhookVerifyToken}
              onChange={(v) => setFormData(p => ({ ...p, whatsappWebhookVerifyToken: v }))}
              type="password"
              placeholder={settings?.whatsappWebhookVerifyTokenSet ? '•••••••• (Saved in DB)' : 'Define webhook token'}
            />
          </div>
        </div>
        <div className="settings-card-footer">
          <button className="btn btn-primary" onClick={() => onSave(formData)}>
            <Save size={14} /> 
            Save WhatsApp Settings
          </button>
        </div>
      </div>

      <div className="settings-card">
        <div className="settings-card-header">
          <div className="settings-card-title">
            <div className="settings-icon-bg" style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'rgb(59, 130, 246)' }}>
              <Send size={18} />
            </div>
            <div>Test WhatsApp Connection</div>
          </div>
        </div>
        <div className="settings-card-body">
          <div className="form-grid-2">
            <ThemePhoneInput
              label="Recipient Phone Number"
              value={testData.to}
              onChange={(fullNum) => setTestData(p => ({ ...p, to: fullNum }))}
            />
            <SelectField
              label="Message Type"
              value={testData.messageType}
              onChange={(v) => setTestData(p => ({ ...p, messageType: v }))}
              options={[{ value: 'text', label: 'Free-form Text' }, { value: 'template', label: 'Template Message' }]}
            />
            {testData.messageType === 'template' ? (
              <>
                <InputField 
                  label="Template Name" 
                  value={testData.templateName} 
                  onChange={(v) => setTestData(p => ({ ...p, templateName: v }))} 
                  placeholder="Optional (falls back to default)" 
                />
                <InputField 
                  label="Language Code" 
                  value={testData.languageCode} 
                  onChange={(v) => setTestData(p => ({ ...p, languageCode: v }))} 
                  placeholder="Optional (e.g. en_US)" 
                />
              </>
            ) : (
              <div className="col-span-2 form-group">
                <label className="form-label">Message Text</label>
                <textarea 
                  className="form-control" 
                  rows={3} 
                  value={testData.message} 
                  onChange={(e) => setTestData(p => ({ ...p, message: e.target.value }))} 
                  placeholder="Type test message text..." 
                />
              </div>
            )}
          </div>
        </div>
        <div className="settings-card-footer">
          <button className="btn btn-secondary" onClick={handleTest} disabled={isTesting}>
            <Send size={14} /> 
            {isTesting ? 'Sending test...' : 'Send Test Message'}
          </button>
        </div>
      </div>
    </div>
  );
};


const GoogleMapsSettings = ({ settings, onSave }: any) => {
  const [formData, setFormData] = useState({
    googleMapsApiKey: settings?.googleMapsApiKey || '',
    googleMapsMapId: settings?.googleMapsMapId || '',
    googleMapsDefaultCenterLat: String(settings?.googleMapsDefaultCenterLat ?? 25.2854),
    googleMapsDefaultCenterLng: String(settings?.googleMapsDefaultCenterLng ?? 51.531),
    googleMapsDefaultZoom: String(settings?.googleMapsDefaultZoom ?? 11),
    googleMapsStatus: settings?.googleMapsStatus || 'inactive',
  });
  const mapRef = React.useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = React.useRef<any>(null);
  const markerRef = React.useRef<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    setFormData({
      googleMapsApiKey: settings?.googleMapsApiKey || '',
      googleMapsMapId: settings?.googleMapsMapId || '',
      googleMapsDefaultCenterLat: String(settings?.googleMapsDefaultCenterLat ?? 25.2854),
      googleMapsDefaultCenterLng: String(settings?.googleMapsDefaultCenterLng ?? 51.531),
      googleMapsDefaultZoom: String(settings?.googleMapsDefaultZoom ?? 11),
      googleMapsStatus: settings?.googleMapsStatus || 'inactive',
    });
  }, [settings]);

  const loadPreview = async () => {
    setPreviewError('');
    const apiKey = formData.googleMapsApiKey.trim();
    if (!apiKey) {
      setPreviewError('Enter Google Maps API key first.');
      return;
    }

    const lat = Number(formData.googleMapsDefaultCenterLat);
    const lng = Number(formData.googleMapsDefaultCenterLng);
    const zoom = Number(formData.googleMapsDefaultZoom);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setPreviewError('Latitude/Longitude must be valid numbers.');
      return;
    }
    if (!Number.isFinite(zoom) || zoom < 1 || zoom > 22) {
      setPreviewError('Zoom must be between 1 and 22.');
      return;
    }

    setPreviewLoading(true);
    try {
      await loadGoogleMaps(apiKey);
      const runtime = await getGoogleMapsRuntimeConfig();
      const g = (window as any).google;
      if (!g?.maps || !mapRef.current) throw new Error('Google Maps not available');

      const center = { lat, lng };
      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new g.maps.Map(mapRef.current, {
          center,
          zoom,
          mapId: formData.googleMapsMapId || runtime?.mapId,
        });
        markerRef.current = new g.maps.Marker({
          position: center,
          map: mapInstanceRef.current,
          title: 'Default Center',
        });
      }
    } catch (err: any) {
      setPreviewError(err?.message || 'Failed to load map preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header-banner">
        <div className="banner-left">
          <div className="banner-tag">
            <MapPin size={13} /> GEOCODING & MAPS PLATFORM
          </div>
          <div className="banner-title">Google Maps Integration</div>
        </div>
        <div className="banner-chips">
          <div className={`banner-chip ${formData.googleMapsStatus === 'active' ? 'banner-chip-active' : 'banner-chip-inactive'}`}>
            <span className={`status-dot ${formData.googleMapsStatus === 'active' ? 'status-dot-active' : 'status-dot-inactive'}`} />
            <span className="chip-label">STATUS</span>
            <span className="chip-value">
              {formData.googleMapsStatus === 'active' ? 'Active' : 'Inactive'}
            </span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={loadPreview} disabled={previewLoading}>
            {previewLoading ? <Spinner size={13} /> : <RefreshCw size={13} />} Test Map Preview
          </button>
        </div>
      </div>
      <div className="settings-card-body">
        <div className="form-section-title">
          <MapPin size={14} className="text-brand" />
          API Key & Map Configuration
        </div>
        <div className="form-grid-3">
          <SelectField
            label="Maps Service Status"
            value={formData.googleMapsStatus}
            onChange={(v) => setFormData((p) => ({ ...p, googleMapsStatus: v as 'active' | 'inactive' }))}
            options={[{ value: 'active', label: 'Active (Enabled)' }, { value: 'inactive', label: 'Inactive (Disabled)' }]}
          />
          <InputField
            label="Google Maps API Key"
            value={formData.googleMapsApiKey}
            onChange={(v) => setFormData((p) => ({ ...p, googleMapsApiKey: v }))}
            placeholder="AIzaSy..."
          />
          <InputField
            label="Map ID (Optional)"
            value={formData.googleMapsMapId}
            onChange={(v) => setFormData((p) => ({ ...p, googleMapsMapId: v }))}
            placeholder="Optional cloud-styled map id"
          />
        </div>

        <div className="form-section-title mt-4">
          <Compass size={14} className="text-brand" />
          Default Geolocation Center & Initial Zoom
        </div>
        <div className="form-grid-3">
          <InputField
            label="Default Latitude"
            value={formData.googleMapsDefaultCenterLat}
            onChange={(v) => setFormData((p) => ({ ...p, googleMapsDefaultCenterLat: v }))}
            type="number"
            placeholder="25.2854"
          />
          <InputField
            label="Default Longitude"
            value={formData.googleMapsDefaultCenterLng}
            onChange={(v) => setFormData((p) => ({ ...p, googleMapsDefaultCenterLng: v }))}
            type="number"
            placeholder="51.5310"
          />
          <InputField
            label="Default Zoom Level"
            value={formData.googleMapsDefaultZoom}
            onChange={(v) => setFormData((p) => ({ ...p, googleMapsDefaultZoom: v }))}
            type="number"
            placeholder="11"
          />
        </div>

        <div className="form-section-title mt-4">
          <Eye size={14} className="text-brand" />
          Live Map Verification Sandbox
        </div>
        <div>
          <div
            ref={mapRef}
            style={{
              width: '100%',
              height: 300,
              borderRadius: 14,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              overflow: 'hidden',
            }}
          />
          {previewError ? (
            <div style={{ marginTop: 10, color: 'var(--red)', fontSize: 12.5, fontWeight: 600 }}>{previewError}</div>
          ) : (
            <div style={{ marginTop: 8, color: 'var(--tx-4)', fontSize: 12 }}>
              Click "Test Map Preview" above to verify your API key and inspect default coordinates.
            </div>
          )}
        </div>
      </div>
      <div className="settings-card-footer">
        <button className="btn btn-primary" onClick={() => onSave(formData)}>
          <Save size={14} /> 
          Save Maps Config
        </button>
      </div>
    </div>
  );
};

const AppearanceSettings = ({ settings, onSave }: { settings: any; onSave: (data: any) => void }) => {
  const { setTheme, setBrandColor, setSecondaryColor, setTypography } = useThemeStore();
  const [localTheme, setLocalTheme] = useState<'light' | 'dark'>(settings?.theme || 'light');
  const [localColor, setLocalColor] = useState(settings?.brandColor || '#6d28d9');
  const [localSecondaryColor, setLocalSecondaryColor] = useState(settings?.secondaryColor || '#a855f7');
  const fallbackFont = isAppFontKey(settings?.appFont) ? settings.appFont : DEFAULT_APP_FONT;
  const [headingFont, setHeadingFont] = useState<FontChoice>(isFontChoice(settings?.headingFont) ? settings.headingFont : fallbackFont);
  const [contentFont, setContentFont] = useState<FontChoice>(isFontChoice(settings?.contentFont) ? settings.contentFont : fallbackFont);
  const [headingFontName, setHeadingFontName] = useState(settings?.headingFontName || '');
  const [headingFontUrl, setHeadingFontUrl] = useState(settings?.headingFontUrl || '');
  const [contentFontName, setContentFontName] = useState(settings?.contentFontName || '');
  const [contentFontUrl, setContentFontUrl] = useState(settings?.contentFontUrl || '');
  const [headingFontFile, setHeadingFontFile] = useState<File | null>(null);
  const [contentFontFile, setContentFontFile] = useState<File | null>(null);
  
  const [activePicker, setActivePicker] = useState<'primary' | 'secondary' | null>(null);

  const pickerRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setActivePicker(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const colors = [
    '#1e293b', '#0d9488', '#166534', '#84cc16', '#92400e',
    '#ea580c', '#be123c', '#7c3aed', '#4338ca', '#3b82f6',
    '#0891b2', '#451a03'
  ];

  const validateFontFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['woff2', 'woff', 'ttf', 'otf'].includes(ext)) {
      toast.error('Upload a WOFF2, WOFF, TTF, or OTF font file');
      return false;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Font file must be 5MB or smaller');
      return false;
    }
    return true;
  };

  const handleFontUpload = (target: 'heading' | 'content', file?: File) => {
    if (!file || !validateFontFile(file)) return;

    const familyName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'Uploaded Font';
    const previewUrl = URL.createObjectURL(file);

    if (target === 'heading') {
      setHeadingFont('custom');
      setHeadingFontFile(file);
      setHeadingFontName(familyName);
      setHeadingFontUrl(previewUrl);
    } else {
      setContentFont('custom');
      setContentFontFile(file);
      setContentFontName(familyName);
      setContentFontUrl(previewUrl);
    }
  };

  const fontOptions = [...APP_FONT_OPTIONS, { value: 'custom', label: 'Uploaded Font' }];

  const handleSave = () => {
    if (headingFont === 'custom' && !headingFontUrl && !headingFontFile) {
      toast.error('Please upload a heading font file');
      return;
    }
    if (contentFont === 'custom' && !contentFontUrl && !contentFontFile) {
      toast.error('Please upload a content font file');
      return;
    }

    // Apply changes globally
    setTheme(localTheme);
    setBrandColor(localColor);
    setSecondaryColor(localSecondaryColor);
    setTypography({
      headingFont,
      contentFont,
      headingFontName,
      headingFontUrl,
      contentFontName,
      contentFontUrl,
    });

    // Also persist theme preference for current logged-in user
    try {
      localStorage.setItem('wt_user_theme_set', 'true');
      localStorage.setItem('wt_theme', localTheme);
    } catch {}
    const currentUser = useAuthStore.getState().user;
    if (currentUser) {
      useAuthStore.getState().setUser({ ...currentUser, theme: localTheme });
    }
    api.patch('/auth/theme', { theme: localTheme }).catch(() => {});

    // Save to database
    onSave({ 
      theme: localTheme, 
      brandColor: localColor,
      secondaryColor: localSecondaryColor,
      headingFont,
      contentFont,
      headingFontName,
      headingFontUrl,
      contentFontName,
      contentFontUrl,
      headingFontFile,
      contentFontFile,
      appFont: contentFont === 'custom' ? fallbackFont : contentFont,
    });
  };

  const renderFontControl = (
    target: 'heading' | 'content',
    label: string,
    value: FontChoice,
    setValue: (value: FontChoice) => void,
    fontName: string,
    fontUrl: string
  ) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <SelectField
        label={label}
        value={value}
        onChange={(v) => {
          const next = isFontChoice(v) ? v : DEFAULT_APP_FONT;
          setValue(next);
        }}
        options={fontOptions}
      />
      {value === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 7, border: '1px solid var(--border)',
            background: 'var(--surface-2)', color: 'var(--tx-2)', fontSize: 12.5,
            fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0
          }}>
            <Upload size={13} />
            Upload Font
            <input type="file" hidden accept=".woff2,.woff,.ttf,.otf" onChange={(e) => handleFontUpload(target, e.target.files?.[0])} />
          </label>
          <span style={{ fontSize: 12, color: 'var(--tx-4)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fontName || (fontUrl ? 'Font uploaded' : 'No file chosen')}
          </span>
        </div>
      )}
    </div>
  );

  const ColorRow = ({ label, color, pickerId, onChange }: { label: string; color: string; pickerId: 'primary' | 'secondary'; onChange: (c: string) => void }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--tx-1)', marginBottom: 1 }}>{label}</div>
        <div style={{ fontSize: 12, color: 'var(--tx-4)' }}>{color}</div>
      </div>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div
          onClick={() => setActivePicker(activePicker === pickerId ? null : pickerId)}
          style={{
            width: 38, height: 38, borderRadius: 10, background: color,
            border: '2px solid var(--border)', cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)', transition: 'transform 0.15s ease'
          }}
          title="Click to change color"
        />
        {activePicker === pickerId && (
          <div style={{
            position: 'absolute', right: 0, top: 46, zIndex: 100,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 14, padding: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            display: 'flex', flexDirection: 'column', gap: 10
          }}>
            <HexColorPicker color={color} onChange={onChange} style={{ width: 220, height: 180 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)', padding: '6px 10px' }}>
              <span style={{ fontSize: 12, color: 'var(--tx-4)', fontWeight: 700 }}>#</span>
              <input
                type="text"
                value={color.replace('#', '')}
                onChange={(e) => onChange(`#${e.target.value}`)}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, fontFamily: 'var(--font-mono, monospace)', color: 'var(--tx-1)', fontWeight: 600 }}
                maxLength={6}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="settings-card" ref={pickerRef}>
      <div className="settings-card-header-banner">
        <div className="banner-left">
          <div className="banner-tag">
            <Palette size={13} /> THEMES & BRANDING
          </div>
          <div className="banner-title">Appearance & Global Styling</div>
        </div>
        <div className="banner-chips">
          <div className="banner-chip">
            <span className="chip-label">ACTIVE THEME</span>
            <span className="chip-value uppercase">{localTheme}</span>
          </div>
        </div>
      </div>

      <div className="settings-card-body">

        {/* Theme Mode Toggle */}
        <div>
          <div className="form-section-title"><Palette size={13} /> Theme Mode</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
            {/* Light Mode Card */}
            <button
              id="theme-mode-light"
              type="button"
              onClick={() => setLocalTheme('light')}
              style={{
                all: 'unset',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                padding: '18px 12px 14px',
                borderRadius: 14,
                border: `2px solid ${localTheme === 'light' ? 'var(--brand)' : 'var(--border)'}`,
                background: localTheme === 'light' ? 'var(--brand-light)' : 'var(--surface-2)',
                transition: 'border-color 0.18s, background 0.18s',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: localTheme === 'light' ? '0 0 0 3px var(--brand-muted)' : 'none',
              }}
            >
              {/* Mini preview */}
              <div style={{
                width: '100%', borderRadius: 10, overflow: 'hidden',
                border: '1px solid rgba(0,0,0,0.08)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.1)',
              }}>
                <div style={{ background: '#f8fafc', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24' }} />
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399' }} />
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#e2e8f0', marginLeft: 6 }} />
                </div>
                <div style={{ background: '#ffffff', padding: '10px 10px', display: 'flex', gap: 8 }}>
                  <div style={{ width: 32, background: '#f1f5f9', borderRadius: 6, minHeight: 36 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ height: 7, borderRadius: 3, background: '#6d28d9', width: '60%' }} />
                    <div style={{ height: 5, borderRadius: 3, background: '#cbd5e1', width: '85%' }} />
                    <div style={{ height: 5, borderRadius: 3, background: '#cbd5e1', width: '70%' }} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: localTheme === 'light' ? 'var(--brand)' : 'var(--surface-3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.18s',
                }}>
                  <Sun size={16} color={localTheme === 'light' ? '#ffffff' : 'var(--tx-4)'} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: localTheme === 'light' ? 'var(--brand-text)' : 'var(--tx-3)' }}>Light Mode</span>
                <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>Clean white interface</span>
              </div>
              {localTheme === 'light' && (
                <div style={{
                  position: 'absolute', top: 10, right: 10,
                  width: 18, height: 18, borderRadius: '50%',
                  background: 'var(--brand)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Check size={11} color="#ffffff" strokeWidth={3} />
                </div>
              )}
            </button>

            {/* Dark Mode Card */}
            <button
              id="theme-mode-dark"
              type="button"
              onClick={() => setLocalTheme('dark')}
              style={{
                all: 'unset',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                padding: '18px 12px 14px',
                borderRadius: 14,
                border: `2px solid ${localTheme === 'dark' ? 'var(--brand)' : 'var(--border)'}`,
                background: localTheme === 'dark' ? 'var(--brand-light)' : 'var(--surface-2)',
                transition: 'border-color 0.18s, background 0.18s',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: localTheme === 'dark' ? '0 0 0 3px var(--brand-muted)' : 'none',
              }}
            >
              {/* Mini preview */}
              <div style={{
                width: '100%', borderRadius: 10, overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.06)',
                boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
              }}>
                <div style={{ background: '#0d1424', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fbbf24' }} />
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#34d399' }} />
                  <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.08)', marginLeft: 6 }} />
                </div>
                <div style={{ background: '#0b1020', padding: '10px 10px', display: 'flex', gap: 8 }}>
                  <div style={{ width: 32, background: 'rgba(255,255,255,0.05)', borderRadius: 6, minHeight: 36 }} />
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ height: 7, borderRadius: 3, background: '#a78bfa', width: '60%' }} />
                    <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)', width: '85%' }} />
                    <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.1)', width: '70%' }} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: localTheme === 'dark' ? 'var(--brand)' : 'var(--surface-3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.18s',
                }}>
                  <Moon size={16} color={localTheme === 'dark' ? '#ffffff' : 'var(--tx-4)'} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: localTheme === 'dark' ? 'var(--brand-text)' : 'var(--tx-3)' }}>Dark Mode</span>
                <span style={{ fontSize: 11, color: 'var(--tx-4)' }}>Easy on the eyes</span>
              </div>
              {localTheme === 'dark' && (
                <div style={{
                  position: 'absolute', top: 10, right: 10,
                  width: 18, height: 18, borderRadius: '50%',
                  background: 'var(--brand)', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Check size={11} color="#ffffff" strokeWidth={3} />
                </div>
              )}
            </button>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--tx-4)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Check size={12} color="var(--green)" />
            Select a theme and click <strong style={{ color: 'var(--tx-3)' }}>Save Appearance</strong> to apply.
          </div>
        </div>

        {/* Brand Colors */}
        <div>
          <div className="form-section-title"><Palette size={13} /> Brand Colors</div>
          <div style={{ marginTop: 4 }}>
            <ColorRow label="Primary Brand Color" color={localColor} pickerId="primary" onChange={setLocalColor} />
            <ColorRow label="Secondary Brand Color" color={localSecondaryColor} pickerId="secondary" onChange={setLocalSecondaryColor} />
          </div>
        </div>

        {/* Typography */}
        <div>
          <div className="form-section-title"><Type size={13} /> Typography</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {renderFontControl('heading', 'Heading Font', headingFont, setHeadingFont, headingFontName, headingFontUrl)}
              <div style={{
                padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--surface-2)', fontFamily: 'var(--font-heading)',
                fontSize: 18, fontWeight: 700, color: 'var(--tx-1)', lineHeight: 1.3
              }}>
                Heading Preview
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {renderFontControl('content', 'Content Font', contentFont, setContentFont, contentFontName, contentFontUrl)}
              <div style={{
                padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--surface-2)', fontFamily: 'var(--font-content)',
                fontSize: 13.5, color: 'var(--tx-2)', lineHeight: 1.6
              }}>
                Content font preview — menus, tables, and forms.
              </div>
            </div>
          </div>
        </div>

      </div>

      <div className="settings-card-footer">
        <button className="btn btn-primary" onClick={handleSave}>
          <Save size={14} />
          Save Appearance
        </button>
      </div>
    </div>
  );
};
