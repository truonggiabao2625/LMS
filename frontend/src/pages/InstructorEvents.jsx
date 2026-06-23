import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Crown,
  Edit3,
  ExternalLink,
  Image as ImageIcon,
  MapPin,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
  Users,
  Video,
  X,
  XCircle,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { resolveMediaUrl } from '../utils/mediaUrl';

const TYPES = [
  { value: 'WORKSHOP', label: 'Workshop' },
  { value: 'SEMINAR', label: 'Hội thảo' },
  { value: 'SPECIAL_TOPIC', label: 'Chuyên đề' },
  { value: 'WEBINAR', label: 'Livestream' },
  { value: 'OTHER', label: 'Khác' },
];

const FORMATS = [
  { value: 'OFFLINE', label: 'Trực tiếp' },
  { value: 'ONLINE', label: 'Trực tuyến' },
  { value: 'HYBRID', label: 'Kết hợp' },
];

const STATUS = {
  DRAFT: { label: 'Bản nháp', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  PUBLISHED: { label: 'Đã xuất bản', className: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
  CANCELLED: { label: 'Đã hủy', className: 'bg-rose-50 text-rose-700 ring-rose-100' },
};

const emptyForm = {
  title: '',
  description: '',
  type: 'WORKSHOP',
  format: 'OFFLINE',
  startAt: '',
  endAt: '',
  location: '',
  linkThamGia: '',
  capacity: 50,
  pointCost: 0,
};

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const fieldClass =
  'w-full rounded-2xl border border-slate-200/80 bg-slate-50/20 px-4 py-3 text-sm text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-purple-500 focus:bg-white focus:ring-4 focus:ring-purple-500/10';
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
const typeLabel = (value) => TYPES.find((item) => item.value === value)?.label || 'Sự kiện';
const formatLabel = (value) => FORMATS.find((item) => item.value === value)?.label || 'Chưa rõ';

const toInputDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

const API_BASE = '/api/instructor/events';

export default function InstructorEvents() {
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef(null);
  const [events, setEvents] = useState([]);
  const [googleMeetLink, setGoogleMeetLink] = useState('');
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showAttendees, setShowAttendees] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Image management state
  const [existingImages, setExistingImages] = useState([]); // Images already on server
  const [newFiles, setNewFiles] = useState([]); // Files selected but not yet uploaded
  const [uploadingImages, setUploadingImages] = useState(false);
  const [imageError, setImageError] = useState('');

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get(API_BASE);
      setEvents(Array.isArray(response.data) ? response.data : []);
      setError('');
    } catch (requestError) {
      if (requestError.response?.status === 401 || requestError.response?.status === 403) {
        setError('');
        setEvents([]);
      } else {
        setError(requestError.response?.data?.message || 'Không thể tải danh sách sự kiện.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
    axios.get('/api/instructor/settings/meet-link')
      .then((response) => setGoogleMeetLink(response.data?.googleMeetLink || ''))
      .catch(() => setGoogleMeetLink(''));
  }, [loadEvents]);

  const useSavedGoogleMeet = () => {
    if (!googleMeetLink) {
      setError('Bạn chưa cấu hình Google Meet. Vui lòng mở Avatar > Cài đặt tài khoản để thêm liên kết.');
      return;
    }
    setForm((prev) => ({ ...prev, linkThamGia: googleMeetLink }));
    setError('');
  };

  const openMeetingRoom = (url) => {
    if (!url) {
      setError('Sự kiện chưa có liên kết tham gia.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const filteredEvents = useMemo(() => {
    const text = keyword.trim().toLowerCase();
    return events.filter((item) => {
      const matchesStatus = filter === 'ALL' || item.status === filter;
      const matchesText =
        !text ||
        item.title.toLowerCase().includes(text) ||
        item.description.toLowerCase().includes(text) ||
        typeLabel(item.type).toLowerCase().includes(text) ||
        formatLabel(item.format).toLowerCase().includes(text);
      return matchesStatus && matchesText;
    });
  }, [events, keyword, filter]);

  // ===== Form handlers =====
  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setExistingImages([]);
    setNewFiles([]);
    setImageError('');
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      title: item.title,
      description: item.description,
      type: item.type,
      format: item.format,
      startAt: toInputDate(item.startAt),
      endAt: toInputDate(item.endAt),
      location: item.location || '',
      linkThamGia: item.linkThamGia || item.onlineUrl || '',
      capacity: item.capacity,
      pointCost: item.pointCost ?? 0,
    });
    setExistingImages(item.images || []);
    setNewFiles([]);
    setImageError('');
    setShowForm(true);
  };

  useEffect(() => {
    const editId = searchParams.get('edit');
    const item = events.find((event) => event.id === editId);
    if (item) {
      openEdit(item);
      setSearchParams({}, { replace: true });
    }
  }, [events, searchParams, setSearchParams]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        ...form,
        capacity: Number(form.capacity),
        pointCost: Number(form.pointCost || 0),
        startAt: new Date(form.startAt).toISOString(),
        endAt: new Date(form.endAt).toISOString(),
      };

      let eventId;
      if (editing) {
        await axios.put(`${API_BASE}/${editing.id}`, payload);
        eventId = editing.id;
        setNotice('Đã cập nhật sự kiện.');
      } else {
        const response = await axios.post(API_BASE, payload);
        eventId = response.data.id;
        setNotice('Đã tạo sự kiện mới.');
      }

      // Upload new images if any
      if (newFiles.length > 0 && eventId) {
        await uploadImages(eventId, newFiles);
      }

      setShowForm(false);
      setNewFiles([]);
      await loadEvents();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể lưu sự kiện. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setSaving(false);
    }
  };

  // ===== Image handlers =====
  const uploadImages = async (eventId, files) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f.file));
    try {
      const response = await axios.post(`${API_BASE}/${eventId}/images`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // If the first image was uploaded and there was no cover, auto-set cover
      if (response.data?.images?.length > 0) {
        const newImages = response.data.images;
        // Check if we need to set cover for a specific new file
        const coverFile = files.find((f) => f.isCover);
        if (coverFile && newImages.length > 0) {
          const coverIndex = files.indexOf(coverFile);
          if (coverIndex < newImages.length) {
            await axios.patch(`${API_BASE}/${eventId}/images/${newImages[coverIndex].id}/set-cover`);
          }
        }
      }
    } catch (uploadError) {
      console.error('Upload error:', uploadError);
    }
  };

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    setImageError('');

    const validFiles = [];
    const errors = [];

    selectedFiles.forEach((file) => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        errors.push(`"${file.name}": Chỉ hỗ trợ PNG, JPG, JPEG, WEBP.`);
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`"${file.name}": Kích thước tối đa 5MB.`);
        return;
      }
      validFiles.push({
        id: `new_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        file,
        preview: URL.createObjectURL(file),
        isCover: false,
      });
    });

    if (errors.length > 0) {
      setImageError(errors.join(' '));
    }

    if (validFiles.length > 0) {
      setNewFiles((prev) => {
        const updated = [...prev, ...validFiles];
        // If no cover set anywhere, set first overall image as cover
        const hasAnyCover = existingImages.some((img) => img.isCover) || updated.some((f) => f.isCover);
        if (!hasAnyCover && existingImages.length === 0 && updated.length > 0) {
          updated[0].isCover = true;
        }
        return updated;
      });
    }

    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeNewFile = (fileId) => {
    setNewFiles((prev) => {
      const updated = prev.filter((f) => f.id !== fileId);
      const removed = prev.find((f) => f.id === fileId);
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      // If removed file was cover, reassign
      if (removed?.isCover && updated.length > 0) {
        if (!existingImages.some((img) => img.isCover)) {
          updated[0].isCover = true;
        }
      }
      return updated;
    });
  };

  const removeExistingImage = async (imageId) => {
    if (!editing) return;
    if (!window.confirm('Bạn chắc chắn muốn xóa ảnh này?')) return;
    try {
      await axios.delete(`${API_BASE}/${editing.id}/images/${imageId}`);
      setExistingImages((prev) => prev.filter((img) => img.id !== imageId));
      setNotice('Đã xóa ảnh.');
      // Reload event to get updated cover info
      try {
        const response = await axios.get(`${API_BASE}/${editing.id}`);
        setExistingImages(response.data.images || []);
      } catch { /* ignore */ }
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể xóa ảnh.');
    }
  };

  const setCoverExisting = async (imageId) => {
    if (!editing) return;
    try {
      await axios.patch(`${API_BASE}/${editing.id}/images/${imageId}/set-cover`);
      setExistingImages((prev) =>
        prev.map((img) => ({ ...img, isCover: img.id === imageId }))
      );
      // Clear cover from new files
      setNewFiles((prev) => prev.map((f) => ({ ...f, isCover: false })));
      setNotice('Đã đặt ảnh đại diện.');
    } catch (err) {
      setError(err.response?.data?.message || 'Không thể đặt ảnh đại diện.');
    }
  };

  const setCoverNewFile = (fileId) => {
    setExistingImages((prev) => prev.map((img) => ({ ...img, isCover: false })));
    setNewFiles((prev) => prev.map((f) => ({ ...f, isCover: f.id === fileId })));
  };

  // Upload images immediately when editing (not creating)
  const uploadImmediately = async () => {
    if (!editing || newFiles.length === 0) return;
    setUploadingImages(true);
    setImageError('');
    try {
      await uploadImages(editing.id, newFiles);
      // Clean up previews
      newFiles.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
      setNewFiles([]);
      // Reload images
      const response = await axios.get(`${API_BASE}/${editing.id}`);
      setExistingImages(response.data.images || []);
      setNotice('Đã upload ảnh thành công.');
    } catch {
      setImageError('Không thể upload ảnh. Vui lòng thử lại.');
    } finally {
      setUploadingImages(false);
    }
  };

  const runAction = async (item, action, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError('');
    setNotice('');
    try {
      if (action === 'delete') {
        await axios.delete(`${API_BASE}/${item.id}`);
      } else {
        await axios.patch(`${API_BASE}/${item.id}/${action}`);
      }
      setNotice(action === 'publish' ? 'Đã xuất bản sự kiện.' : action === 'cancel' ? 'Đã hủy sự kiện.' : 'Đã xóa sự kiện.');
      await loadEvents();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Không thể thực hiện thao tác.');
    }
  };

  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
      newFiles.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const allImages = [
    ...existingImages.map((img) => ({ ...img, source: 'existing' })),
    ...newFiles.map((f) => ({ id: f.id, imageUrl: f.preview, isCover: f.isCover, source: 'new' })),
  ];

  const coverImageUrl = (item) => {
    if (item.images?.length > 0) {
      const cover = item.images.find((img) => img.isCover) || item.images[0];
      return cover.imageUrl;
    }
    return item.imageUrl;
  };

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* Page Header */}
      <header className="flex flex-col gap-4 border-b border-slate-100 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">Quản lý sự kiện</h1>
          <p className="text-sm text-slate-500 mt-1">Thiết lập, theo dõi và quảng bá các hoạt động hội thảo, livestream học thuật.</p>
        </div>
        <button 
          type="button" 
          onClick={openCreate} 
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-purple-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/10 hover:shadow-purple-500/25 transition-all hover:bg-purple-700 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="h-4.5 w-4.5" />
          Tạo sự kiện mới
        </button>
      </header>

      {/* Stats Summary Panel */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Tổng sự kiện</span>
            <CalendarDays className="h-5 w-5 text-slate-400" />
          </div>
          <p className="text-3xl font-extrabold text-slate-900 mt-3 tabular-nums">{events.length}</p>
        </div>
        <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Đang hoạt động</span>
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
          </div>
          <p className="text-3xl font-extrabold text-emerald-600 mt-3 tabular-nums">
            {events.filter(e => e.status === 'PUBLISHED').length}
          </p>
        </div>
        <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Bản nháp</span>
            <Clock3 className="h-5 w-5 text-amber-500" />
          </div>
          <p className="text-3xl font-extrabold text-amber-600 mt-3 tabular-nums">
            {events.filter(e => e.status === 'DRAFT').length}
          </p>
        </div>
        <div className="bg-white border border-slate-100 p-5 rounded-3xl shadow-sm hover:shadow-md transition-all duration-200">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-bold uppercase tracking-wider">Người đăng ký</span>
            <Users className="h-5 w-5 text-purple-500" />
          </div>
          <p className="text-3xl font-extrabold text-purple-600 mt-3 tabular-nums">
            {events.reduce((acc, curr) => acc + (curr.registrationCount || 0), 0)}
          </p>
        </div>
      </section>

      {/* Filter and Search Panel */}
      <section className="rounded-3xl border border-slate-100 bg-white/80 backdrop-blur-md p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] items-center">
          <label className="relative block w-full">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input 
              value={keyword} 
              onChange={(event) => setKeyword(event.target.value)} 
              placeholder="Tìm sự kiện theo tên, loại, địa điểm..." 
              className={`${fieldClass} pl-11`} 
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {['ALL', 'DRAFT', 'PUBLISHED', 'CANCELLED'].map((value) => (
              <button 
                key={value} 
                type="button" 
                onClick={() => setFilter(value)} 
                className={`rounded-2xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${
                  filter === value 
                    ? 'bg-slate-900 text-white shadow-md shadow-slate-900/10' 
                    : 'border border-slate-200 bg-white text-slate-600 hover:border-purple-200 hover:bg-purple-50/40 hover:text-purple-700'
                }`}
              >
                {value === 'ALL' ? 'Tất cả' : STATUS[value].label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Notifications */}
      {(notice || error) && (
        <div className={`rounded-2xl border px-5 py-4 text-sm font-semibold flex items-center justify-between transition-all duration-300 animate-in fade-in-50 slide-in-from-top-1 ${
          error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}>
          <span className="flex items-center gap-2">
            <span>{error ? '⚠️' : '✨'}</span>
            <span>{error || notice}</span>
          </span>
          <button 
            type="button" 
            onClick={() => { setError(''); setNotice(''); }} 
            className="text-current opacity-60 hover:opacity-100 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main content grid */}
      {loading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
              <div className="h-52 w-full bg-slate-200/60" />
              <div className="flex-1 p-6 space-y-4">
                <div className="flex gap-2">
                  <div className="h-5 w-16 bg-slate-200/60 rounded-full" />
                  <div className="h-5 w-20 bg-slate-200/60 rounded-full" />
                </div>
                <div className="h-6 w-3/4 bg-slate-200/80 rounded-md" />
                <div className="space-y-2 pt-2">
                  <div className="h-4 w-full bg-slate-100 rounded-md" />
                  <div className="h-4 w-5/6 bg-slate-100 rounded-md" />
                </div>
                <div className="h-12 bg-slate-50/80 rounded-2xl mt-4" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-white border border-slate-100 rounded-3xl shadow-sm max-w-lg mx-auto my-8">
          <div className="w-16 h-16 bg-purple-50 rounded-full flex items-center justify-center mb-6 text-purple-600 shadow-inner">
            <CalendarDays className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Chưa có sự kiện nào</h3>
          <p className="text-slate-500 text-sm max-w-sm mb-6">
            {keyword || filter !== 'ALL' 
              ? 'Không tìm thấy sự kiện phù hợp với bộ lọc hiện tại. Thử xóa tìm kiếm hoặc đặt lại trạng thái.' 
              : 'Bắt đầu kết nối với học viên của bạn bằng cách đăng tải sự kiện mới ngay hôm nay.'}
          </p>
          {keyword || filter !== 'ALL' ? (
            <button
              type="button"
              onClick={() => { setKeyword(''); setFilter('ALL'); }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Đặt lại bộ lọc
            </button>
          ) : (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-purple-200 transition-all hover:bg-purple-700 hover:scale-[1.02] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              Tạo sự kiện ngay
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredEvents.map((item) => {
            const capacityPercentage = Math.min(((item.registrationCount || 0) / (item.capacity || 1)) * 100, 100);
            return (
              <article key={item.id} className="group flex flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 ease-out">
                {/* Image Cover Container */}
                <div className="relative h-52 w-full overflow-hidden bg-slate-50">
                  {coverImageUrl(item) ? (
                    <img
                      src={resolveMediaUrl(coverImageUrl(item))}
                      alt={item.title}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-50">
                      <CalendarDays className="h-12 w-12 text-purple-200" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent" />
                  
                  {/* Status & Format overlays */}
                  <div className="absolute top-4 left-4 z-10 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold backdrop-blur-md bg-white/95 shadow-sm border border-slate-200/50 text-slate-800">
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        item.status === 'PUBLISHED' ? 'bg-emerald-500' :
                        item.status === 'CANCELLED' ? 'bg-rose-500' : 'bg-slate-400'
                      }`} />
                      {STATUS[item.status]?.label}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-purple-600/90 text-white px-2.5 py-1 text-xs font-semibold backdrop-blur-sm shadow-sm border border-purple-500/30">
                      {formatLabel(item.format)}
                    </span>
                  </div>

                  {item.images?.length > 1 && (
                    <span className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm border border-white/10 shadow-sm">
                      <ImageIcon className="h-3.5 w-3.5" />
                      {item.images.length} ảnh
                    </span>
                  )}
                </div>

                {/* Content Section */}
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex-1 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-lg font-bold text-slate-900 group-hover:text-purple-600 transition-colors duration-200 line-clamp-2" title={item.title}>
                        {item.title}
                      </h2>
                      <button 
                        type="button" 
                        title="Chỉnh sửa" 
                        onClick={() => openEdit(item)} 
                        className="rounded-xl border border-slate-200 p-2.5 text-slate-500 transition-all hover:border-purple-200 hover:bg-purple-50 hover:text-purple-700 hover:scale-105 active:scale-95 flex-shrink-0"
                      >
                        <Edit3 className="h-4 w-4" />
                      </button>
                    </div>

                    <p className="line-clamp-2 text-sm leading-relaxed text-slate-500">{item.description}</p>
                    
                    {/* Capacity Progress Bar */}
                    <button 
                      type="button" 
                      onClick={() => setShowAttendees(item)} 
                      className="w-full text-left transition-opacity hover:opacity-90 block"
                      title="Xem danh sách người đăng ký"
                    >
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-center text-xs font-semibold">
                          <span className="flex items-center gap-1.5 text-slate-500">
                            <Users className="h-4 w-4 text-slate-400" />
                            <span>{item.registrationCount} / {item.capacity} đã đăng ký</span>
                          </span>
                          <span className={capacityPercentage >= 100 ? 'text-rose-600 font-bold' : capacityPercentage >= 80 ? 'text-amber-600 font-bold' : 'text-purple-600'}>
                            {Math.round(capacityPercentage)}%
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${
                              capacityPercentage >= 100 ? 'bg-rose-500' :
                              capacityPercentage >= 80 ? 'bg-amber-500' : 'bg-purple-600'
                            }`}
                            style={{ width: `${capacityPercentage}%` }} 
                          />
                        </div>
                      </div>
                    </button>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs text-slate-500">
                      <div className="flex items-center gap-2 min-w-0">
                        <Clock3 className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <span className="truncate" title={dateTime.format(new Date(item.startAt))}>
                          {dateTime.format(new Date(item.startAt))}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <span className="truncate" title={item.location || formatLabel(item.format)}>
                          {item.location || formatLabel(item.format)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Badges footer */}
                  <div className="mt-5 pt-3 flex items-center justify-between border-t border-slate-100">
                    <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-100/50 uppercase tracking-wide">
                      {typeLabel(item.type)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/40 uppercase tracking-wide">
                      <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                      {(item.pointCost ?? 0) > 0 ? `${item.pointCost} điểm` : 'Miễn phí'}
                    </span>
                  </div>
                </div>

                {/* Actions Row */}
                <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-slate-50/30 px-6 py-4">
                  <Link to={`/instructor/events/${item.id}`} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-50 hover:border-slate-300 hover:scale-[1.02] active:scale-[0.98]">
                    <ExternalLink className="h-3.5 w-3.5" /> Xem chi tiết
                  </Link>
                  {item.status === 'PUBLISHED' && (item.format === 'ONLINE' || item.format === 'HYBRID') && new Date(item.endAt) > new Date() && (
                    <button
                      type="button"
                      onClick={() => openMeetingRoom(item.linkThamGia || item.onlineUrl)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-purple-700 hover:scale-[1.02] active:scale-[0.98]"
                    >
                      <Video className="h-3.5 w-3.5" />
                      Vào phòng
                    </button>
                  )}
                  {item.status !== 'PUBLISHED' && (
                    <button type="button" onClick={() => runAction(item, 'publish')} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-emerald-700 hover:scale-[1.02] active:scale-[0.98]">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Xuất bản
                    </button>
                  )}
                  {item.status !== 'CANCELLED' && (
                    <button type="button" onClick={() => runAction(item, 'cancel', 'Bạn chắc chắn muốn hủy sự kiện này?')} className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-white px-4 py-2 text-xs font-semibold text-amber-700 transition-all hover:bg-amber-50 hover:scale-[1.02] active:scale-[0.98]">
                      <XCircle className="h-3.5 w-3.5" /> Hủy sự kiện
                    </button>
                  )}
                  <button type="button" onClick={() => runAction(item, 'delete', 'Bạn chắc chắn muốn xóa sự kiện này?')} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-700 transition-all hover:bg-rose-50 hover:scale-[1.02] active:scale-[0.98]">
                    <Trash2 className="h-3.5 w-3.5" /> Xóa
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* ===== Create/Edit Form Modal ===== */}
      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-sm p-4 flex justify-center items-center animate-in fade-in duration-200">
          <form 
            onSubmit={submit} 
            className="w-full max-w-3xl rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden my-auto scale-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-white/95 backdrop-blur-md px-6 py-5 sticky top-0 z-20">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{editing ? 'Chỉnh sửa sự kiện' : 'Tạo sự kiện mới'}</h2>
                <p className="text-xs text-slate-500 mt-1">Cung cấp đầy đủ thông tin chi tiết cho sự kiện của bạn.</p>
              </div>
              <button 
                type="button" 
                title="Đóng" 
                onClick={() => setShowForm(false)} 
                className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content - Scrollable */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid gap-5 md:grid-cols-2">
                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                    Tên sự kiện <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    required 
                    minLength={5} 
                    value={form.title} 
                    onChange={(event) => setForm({ ...form, title: event.target.value })} 
                    className={fieldClass} 
                    placeholder="Nhập tên sự kiện (tối thiểu 5 ký tự)..."
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Loại sự kiện</label>
                  <select 
                    value={form.type} 
                    onChange={(event) => setForm({ ...form, type: event.target.value })} 
                    className={`${fieldClass} appearance-none bg-no-repeat bg-[right_1rem_center]`}
                    style={{ backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundSize: '1.25rem' }}
                  >
                    {TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Hình thức</label>
                  <select 
                    value={form.format} 
                    onChange={(event) => setForm({ ...form, format: event.target.value })} 
                    className={`${fieldClass} appearance-none bg-no-repeat bg-[right_1rem_center]`}
                    style={{ backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundSize: '1.25rem' }}
                  >
                    {FORMATS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                    Thời gian bắt đầu <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    required 
                    type="datetime-local" 
                    value={form.startAt} 
                    onChange={(event) => setForm({ ...form, startAt: event.target.value })} 
                    className={fieldClass} 
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                    Thời gian kết thúc <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    required 
                    type="datetime-local" 
                    value={form.endAt} 
                    onChange={(event) => setForm({ ...form, endAt: event.target.value })} 
                    className={fieldClass} 
                  />
                </div>

                {(form.format === 'OFFLINE' || form.format === 'HYBRID') && (
                  <div className="md:col-span-2 space-y-1.5">
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                      Địa điểm diễn ra <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      required 
                      value={form.location} 
                      onChange={(event) => setForm({ ...form, location: event.target.value })} 
                      className={fieldClass} 
                      placeholder="Nhập địa chỉ chi tiết nơi diễn ra sự kiện..."
                    />
                  </div>
                )}

                {(form.format === 'ONLINE' || form.format === 'HYBRID') && (
                  <div className="md:col-span-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-4">
                      <label className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                        Liên kết tham gia <span className="text-rose-500">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={useSavedGoogleMeet}
                        className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100 hover:border-purple-300 transition-all active:scale-95"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Dùng Meet mặc định
                      </button>
                    </div>
                    <input 
                      required 
                      type="url" 
                      value={form.linkThamGia} 
                      onChange={(event) => setForm({ ...form, linkThamGia: event.target.value })} 
                      placeholder="https://meet.google.com/abc-xyz-def" 
                      className={fieldClass} 
                    />
                    {!googleMeetLink && (
                      <p className="text-xs font-medium text-amber-600 mt-1 flex items-center gap-1">
                        ⚠️ Bạn chưa cấu hình Google Meet mặc định trong Cài đặt tài khoản.
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                    Số người tối đa <span className="text-rose-500">*</span>
                  </label>
                  <input 
                    required 
                    type="number" 
                    min="1" 
                    max="10000" 
                    value={form.capacity} 
                    onChange={(event) => setForm({ ...form, capacity: event.target.value })} 
                    className={fieldClass} 
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Điểm đổi vé</label>
                  <input 
                    type="number" 
                    min="0" 
                    max="10000" 
                    value={form.pointCost} 
                    onChange={(event) => setForm({ ...form, pointCost: event.target.value })} 
                    className={fieldClass} 
                  />
                </div>

                <div className="md:col-span-2 space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                    Mô tả sự kiện <span className="text-rose-500">*</span>
                  </label>
                  <textarea 
                    required 
                    minLength={20} 
                    rows={4} 
                    value={form.description} 
                    onChange={(event) => setForm({ ...form, description: event.target.value })} 
                    className={`${fieldClass} resize-none`}
                    placeholder="Mô tả chi tiết nội dung sự kiện, lịch trình diễn ra (tối thiểu 20 ký tự)..."
                  />
                </div>
              </div>

              {/* ===== Image Upload Section ===== */}
              <div className="border-t border-slate-100 pt-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <ImageIcon className="h-4.5 w-4.5 text-purple-600" />
                      Hình ảnh sự kiện
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">Tải lên các hình ảnh quảng bá cho sự kiện này</p>
                  </div>
                  <span className="text-xs font-semibold text-slate-400 bg-slate-50 px-2 py-1 rounded-md">
                    PNG, JPG, WEBP • Max 5MB
                  </span>
                </div>

                {imageError && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 flex items-start gap-2">
                    <span>⚠️</span>
                    <span>{imageError}</span>
                  </div>
                )}

                {/* Previews Grid */}
                {allImages.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
                    {allImages.map((img) => (
                      <div key={img.id} className="group relative aspect-[4/3] rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 shadow-sm transition hover:shadow-md hover:border-purple-300">
                        <img
                          src={img.source === 'existing' ? resolveMediaUrl(img.imageUrl) : img.imageUrl}
                          alt="Xem trước ảnh sự kiện"
                          className="h-full w-full object-cover"
                        />
                        {/* Cover Crown Badge */}
                        {img.isCover ? (
                          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-amber-500/90 text-white px-2 py-0.5 text-[9px] font-bold shadow-md backdrop-blur-sm">
                            <Crown className="h-3 w-3" />
                            Đại diện
                          </span>
                        ) : (
                          <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              title="Đặt làm ảnh đại diện"
                              onClick={(e) => {
                                e.preventDefault();
                                if (img.source === 'existing') setCoverExisting(img.id);
                                else setCoverNewFile(img.id);
                              }}
                              className="rounded-full bg-white/95 p-1.5 text-amber-600 shadow transition hover:scale-105 active:scale-95"
                            >
                              <Crown className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                        
                        {/* Actions overlay */}
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            title="Xóa ảnh"
                            onClick={(e) => {
                              e.preventDefault();
                              if (img.source === 'existing') removeExistingImage(img.id);
                              else removeNewFile(img.id);
                            }}
                            className="rounded-full bg-white/95 p-1.5 text-rose-600 shadow transition hover:scale-105 active:scale-95"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload Action Row */}
                <div className="flex flex-wrap items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png,.jpg,.jpeg,.webp"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    id="event-image-upload"
                  />
                  <label
                    htmlFor="event-image-upload"
                    className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-purple-200 bg-purple-50/50 px-5 py-3 text-sm font-semibold text-purple-700 transition hover:border-purple-300 hover:bg-purple-50/80 active:scale-98"
                  >
                    <Upload className="h-4 w-4" />
                    Tải ảnh lên
                  </label>
                  
                  {editing && newFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={uploadImmediately}
                      disabled={uploadingImages}
                      className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 active:scale-98 disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {uploadingImages ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                          Đang tải lên...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Tải lên ngay ({newFiles.length})
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4 flex justify-end gap-3 items-center sticky bottom-0 z-20">
              <button 
                type="button" 
                onClick={() => setShowForm(false)} 
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 active:scale-98 transition-all"
              >
                Đóng
              </button>
              <button 
                disabled={saving} 
                className="rounded-xl bg-purple-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-purple-200 hover:bg-purple-700 active:scale-98 transition-all disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Tạo bản nháp'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== Attendees Modal ===== */}
      {showAttendees && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-sm p-4 flex justify-center items-center animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden my-auto scale-100 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-white/95 backdrop-blur-md px-6 py-5 sticky top-0 z-20">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Danh sách người đăng ký</h2>
                <p className="text-xs text-slate-500 mt-1 truncate max-w-[280px] sm:max-w-md" title={showAttendees.title}>
                  {showAttendees.title}
                </p>
              </div>
              <button 
                type="button" 
                title="Đóng" 
                onClick={() => setShowAttendees(null)} 
                className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            
            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {showAttendees.attendees?.length ? (
                <div className="divide-y divide-slate-100">
                  {showAttendees.attendees.map((person) => (
                    <div key={person.id} className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{person.name}</p>
                        <p className="text-xs text-slate-500 truncate mt-0.5">{person.email}</p>
                        {person.pointsUsed > 0 && (
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-100">
                            ⭐ Đã đổi {person.pointsUsed} điểm
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-slate-400 flex-shrink-0 bg-slate-50 px-2 py-1 rounded-md">
                        {dateTime.format(new Date(person.registeredAt))}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-4">
                    <Users className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">Chưa có người đăng ký</p>
                  <p className="text-xs text-slate-400 mt-1">Danh sách học viên đăng ký sự kiện sẽ hiển thị tại đây.</p>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4 flex justify-end">
              <button 
                type="button" 
                onClick={() => setShowAttendees(null)} 
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 active:scale-98 transition-all"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
