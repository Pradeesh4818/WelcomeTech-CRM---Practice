import React, { useState, useMemo } from 'react';
import { 
  Search, Upload, 
  HardDrive, Link, Trash2, Edit2,
  FileText, Image as ImageIcon, Video, Music, CheckCircle2, Download
} from 'lucide-react';
import { Spinner, Badge, EmptyState, Modal, ConfirmDialog, Select, InputField, SelectField } from '../../components/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import { formatFileSize, toAssetUrl } from '../../utils/helpers';
import { exportExcelRows } from '../../utils/excelExport';

export interface MediaFile {
  _id: string;
  name: string;
  mimeType: string;
  type: 'image' | 'video' | 'audio' | 'document';
  size: number;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface MediaLibraryProps {
  onSelect?: (file: MediaFile) => void;
  isPicker?: boolean;
}

export const MediaLibraryPage: React.FC<MediaLibraryProps> = ({ onSelect, isPicker }) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<MediaFile['type'] | 'all'>('all');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<string | null>(null);
  const [externalUrl, setExternalUrl] = useState('');
  const [externalType, setExternalType] = useState<MediaFile['type']>('image');
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [editingMedia, setEditingMedia] = useState<MediaFile | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; type: MediaFile['type']; url: string }>({ name: '', type: 'image', url: '' });

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['media', search, activeTab],
    queryFn: async () => {
      const res = await api.get('/media', { 
        params: { 
          search, 
          type: activeTab === 'all' ? undefined : activeTab 
        } 
      });
      return res.data.data as MediaFile[];
    },
  });

  const stats = useMemo(() => ({
    total: files.length,
    images: files.filter(f => f.type === 'image').length,
    videos: files.filter(f => f.type === 'video').length,
    docs: files.filter(f => f.type === 'document' || f.type === 'audio').length,
  }), [files]);

  const uploadMutation = useMutation({
    mutationFn: async (data: { files?: FileList, url?: string, type?: string }) => {
      if (data.files) {
        const formData = new FormData();
        Array.from(data.files).forEach(file => {
          formData.append('files', file);
        });
        return api.post('/media', formData);
      } else if (data.url && data.type) {
        return api.post('/media', { url: data.url, type: data.type });
      }
      throw new Error('Invalid upload data');
    },
    onSuccess: () => {
      toast.success('Media added successfully');
      setIsUploadModalOpen(false);
      setExternalUrl('');
      setSelectedFiles(null);
      queryClient.invalidateQueries({ queryKey: ['media'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Failed to upload files');
    },
    onSettled: () => setUploading(false)
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/media/${id}`),
    onSuccess: () => {
      toast.success('File deleted');
      queryClient.invalidateQueries({ queryKey: ['media'] });
      setFileToDelete(null);
    },
    onError: () => {
      toast.error('Failed to delete file');
      setFileToDelete(null);
    }
  });

  const editMutation = useMutation({
    mutationFn: (data: { id: string; name: string; type: string; url?: string }) => 
      api.patch(`/media/${data.id}`, data),
    onSuccess: () => {
      toast.success('Media updated');
      setEditingMedia(null);
      queryClient.invalidateQueries({ queryKey: ['media'] });
    },
    onError: () => toast.error('Failed to update media')
  });

  const openEdit = (file: MediaFile) => {
    setEditingMedia(file);
    setEditForm({ name: file.name, type: file.type, url: file.url || '' });
  };

  const handleEditSubmit = () => {
    if (!editingMedia) return;
    editMutation.mutate({
      id: editingMedia._id,
      name: editForm.name,
      type: editForm.type,
      url: editForm.url
    });
  };

  const handleCopyUrl = (url: string) => {
    const fullUrl = toAssetUrl(url).startsWith('http') 
      ? toAssetUrl(url) 
      : `${window.location.origin}${toAssetUrl(url)}`;
    navigator.clipboard.writeText(fullUrl);
    toast.success('URL copied to clipboard');
  };

  const handleSubmit = () => {
    if (selectedFiles) {
      setUploading(true);
      uploadMutation.mutate({ files: selectedFiles });
    } else if (externalUrl) {
      setUploading(true);
      uploadMutation.mutate({ url: externalUrl, type: externalType });
    }
  };

  const getFileIcon = (type: MediaFile['type']) => {
    switch (type) {
      case 'image': return <ImageIcon size={20} className="text-blue-500" />;
      case 'video': return <Video size={20} className="text-purple-500" />;
      case 'audio': return <Music size={20} className="text-pink-500" />;
      default: return <FileText size={20} className="text-amber-500" />;
    }
  };

  return (
    <div className="media-layout">
      {!isPicker && (
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div>
            <div className="page-title">Media Library</div>
            <div className="page-subtitle">Manage and organize your enterprise digital assets</div>
          </div>
        </div>
      )}

      {!isPicker && (
        <div className="kpi-grid">
          {[
            { label: 'Total Assets', value: stats.total, icon: <HardDrive size={18} />, color: 'var(--brand)', bg: 'var(--brand-light)', bottom: 'All files' },
            { label: 'Images', value: stats.images, icon: <ImageIcon size={18} />, color: 'var(--blue)', bg: 'rgba(59,130,246,0.1)', bottom: 'Visual media' },
            { label: 'Videos', value: stats.videos, icon: <Video size={18} />, color: 'var(--purple)', bg: 'rgba(139,92,246,0.1)', bottom: 'Dynamic content' },
            { label: 'Documents', value: stats.docs, icon: <FileText size={18} />, color: 'var(--amber)', bg: 'var(--amber-bg)', bottom: 'Text assets' },
          ].map((kpi, i) => (
            <div key={kpi.label} className="kpi-card fade-in-up" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="kpi-icon-wrap" style={{ background: kpi.bg, color: kpi.color }}>
                {kpi.icon}
              </div>
              <div className="kpi-label">{kpi.label}</div>
              <div className="kpi-value">{isLoading ? '—' : kpi.value}</div>
              <div className="kpi-change">{kpi.bottom}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card card-table-sep fade-in-up" style={{ animationDelay: '240ms' }}>
        <div className="card-header table-toolbar-row">
          <div className="search-wrap">
            <Search size={13} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search assets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-group">
            <Select
              className="filter-select"
              value={activeTab}
              onChange={(v) => setActiveTab(v as any)}
              options={[
                { value: 'all', label: 'All Types' },
                { value: 'image', label: 'Images' },
                { value: 'video', label: 'Videos' },
                { value: 'document', label: 'Documents' },
                { value: 'audio', label: 'Audio' }
              ]}
              style={{ width: 140, height: 34, fontSize: 12.5 }}
            />
          </div>
          <div className="toolbar-actions">
            <button className="btn btn-export btn-sm" onClick={() => exportExcelRows('media-library', 'Media Library', files as unknown as Record<string, unknown>[])}>
              <Download size={13} /> Export
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setIsUploadModalOpen(true)}>
              <Upload size={13} /> Upload New
            </button>
          </div>
        </div>

        <div className="tbl-wrap">
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '60px 0' }}>
              <Spinner size={32} />
              <div className="text-tx-3 font-medium">Loading your assets...</div>
            </div>
          ) : files.length === 0 ? (
            <EmptyState
              icon={<HardDrive size={22} />}
              title="No media found"
              description={`You haven't uploaded any ${activeTab === 'all' ? 'assets' : activeTab + 's'} yet.`}
              action={
                <button className="btn btn-primary btn-sm mt-4" style={{ marginTop: 12 }} onClick={() => setIsUploadModalOpen(true)}>
                  <Upload size={13} /> Upload Now
                </button>
              }
            />
          ) : (
            <table className="table-pro table-center">
              <thead>
                <tr>
                  <th className="sno-col">S NO</th>
                  <th className="text-center">Asset</th>
                  <th>Type</th>
                  <th>URL</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th className="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file, idx) => (
                  <tr key={file._id}>
                    <td className="sno-col">{idx + 1}</td>
                    <td className="text-center">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ width: 42, height: 42, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {file.type === 'image' ? (
                            <img src={toAssetUrl(file.url)} className="w-full h-full object-cover" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            getFileIcon(file.type)
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <Badge 
                        label={file.type.toUpperCase()} 
                        status={file.type === 'image' ? 'success' : file.type === 'video' ? 'warning' : 'info'} 
                      />
                    </td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.url.startsWith('http') ? (
                        <a href={file.url} target="_blank" rel="noreferrer" style={{ color: 'var(--brand)', textDecoration: 'none', fontSize: 12, fontWeight: 500 }}>
                          {file.url}
                        </a>
                      ) : (
                        <span style={{ color: 'var(--tx-4)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatFileSize(file.size)}</td>
                    <td style={{ fontSize: 12, color: 'var(--tx-3)', fontFamily: 'var(--font-mono)' }}>{new Date(file.createdAt).toLocaleDateString()}</td>
                    <td className="text-center">
                      <div className="table-actions" style={{ justifyContent: 'center' }}>
                        {isPicker ? (
                          <button className="btn btn-primary btn-sm" style={{ padding: '4px 12px', fontSize: 11 }} onClick={() => onSelect?.(file)}>Select</button>
                        ) : (
                          <>
                            <button className="btn-action btn-action-amber" title="Edit" onClick={() => openEdit(file)}><Edit2 size={13} /></button>
                            <button className="btn-action btn-action-red" title="Delete" onClick={() => setFileToDelete(file._id)}><Trash2 size={13} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Modal 
        open={isUploadModalOpen} 
        onClose={() => !uploading && setIsUploadModalOpen(false)} 
        title="Upload Media"
        size="lg"
        footer={
          <>
            <button className="btn btn-cancel" onClick={() => setIsUploadModalOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={(!selectedFiles && !externalUrl) || uploading}>
              {uploading ? <Spinner size={14} /> : <Upload size={14} />}
              {uploading ? 'Uploading...' : 'Upload Media'}
            </button>
          </>
        }
      >
        <div className="form-group">
          <label className="form-label">Upload File</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-3)' }}>
              <Upload size={20} />
            </div>
            <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
              <Upload size={13} /> {selectedFiles ? `${selectedFiles.length} file(s) selected` : 'Select File(s)'}
              <input type="file" hidden multiple onChange={(e) => setSelectedFiles(e.target.files)} />
            </label>
            {selectedFiles && (
              <button className="btn-action btn-action-red" onClick={() => setSelectedFiles(null)}><Trash2 size={13} /></button>
            )}
          </div>
        </div>

        <div style={{ padding: '16px 0', display: 'flex', alignItems: 'center', gap: 16 }}>
           <div style={{ height: 1, flex: 1, background: 'var(--border)' }}></div>
           <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--tx-4)' }}>OR EXTERNAL LINK</div>
           <div style={{ height: 1, flex: 1, background: 'var(--border)' }}></div>
        </div>

        <div className="form-grid-2">
          <SelectField
            label="Media Type"
            value={externalType}
            onChange={(v) => setExternalType(v as any)}
            options={[
              { value: 'image', label: 'Image' },
              { value: 'video', label: 'Video' },
              { value: 'document', label: 'Document' },
              { value: 'audio', label: 'Audio' }
            ]}
          />
          <InputField 
            label="External URL" 
            type="url" 
            placeholder="https://example.com/asset.png" 
            value={externalUrl} 
            onChange={(v) => setExternalUrl(v)} 
          />
        </div>
      </Modal>
      
      <ConfirmDialog
        open={!!fileToDelete}
        title="Delete File"
        message="Are you sure you want to permanently delete this file?"
        onConfirm={() => fileToDelete && deleteMutation.mutate(fileToDelete)}
        onCancel={() => setFileToDelete(null)}
        loading={deleteMutation.isPending}
      />

      <Modal 
        open={!!editingMedia} 
        onClose={() => !editMutation.isPending && setEditingMedia(null)} 
        title="Edit Media"
        size="md"
        footer={
          <>
            <button className="btn btn-cancel" onClick={() => setEditingMedia(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleEditSubmit} disabled={editMutation.isPending || !editForm.name}>
              {editMutation.isPending ? <Spinner size={14} /> : <Edit2 size={14} />}
              {editMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </>
        }
      >
        <div className="form-grid-1" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <InputField 
            label="File Name" 
            value={editForm.name} 
            onChange={(v) => setEditForm(p => ({ ...p, name: v }))} 
            required
          />
          <SelectField
            label="Media Type"
            value={editForm.type}
            onChange={(v) => setEditForm(p => ({ ...p, type: v as any }))}
            options={[
              { value: 'image', label: 'Image' },
              { value: 'video', label: 'Video' },
              { value: 'document', label: 'Document' },
              { value: 'audio', label: 'Audio' }
            ]}
          />
          {editingMedia?.mimeType === 'external/link' && (
            <InputField 
              label="External URL" 
              type="url" 
              value={editForm.url} 
              onChange={(v) => setEditForm(p => ({ ...p, url: v }))} 
              required
            />
          )}
        </div>
      </Modal>

      <style>{`
        .media-layout { display: flex; flex-direction: column; gap: 24px; animation: fadeIn 0.4s ease-out; }
      `}</style>
    </div>
  );
};
