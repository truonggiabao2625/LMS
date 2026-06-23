import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Calendar,
  DollarSign,
  Edit3,
  Percent,
  Plus,
  Search,
  Send,
  Tag,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import DataTable from '../components/DataTable';
import DataTableToolbar from '../components/DataTableToolbar';

const formatCurrency = (amount = 0) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

const formatDate = (value) => {
  if (!value) return 'Chưa cập nhật';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa cập nhật';
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
};

const toDateInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const initialForm = {
  code: '',
  discountType: 'PERCENTAGE',
  discountValue: '',
  minPurchaseAmount: '',
  maxDiscountAmount: '',
  usageLimit: '',
  startDate: '',
  endDate: '',
  courseId: '',
};

const inputClass =
  'w-full rounded-2xl border border-slate-200/80 bg-slate-50/20 px-4 py-3 text-sm text-slate-800 outline-none transition-all duration-200 placeholder:text-slate-400 focus:border-purple-500 focus:bg-white focus:ring-4 focus:ring-purple-500/10';

const statusLabel = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Đã tắt',
  EXPIRED: 'Hết hạn',
};

const statusClass = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  INACTIVE: 'bg-slate-100 text-slate-500',
  EXPIRED: 'bg-amber-50 text-amber-700',
};

export default function InstructorVouchers() {
  const [vouchers, setVouchers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pageSize, setPageSize] = useState(5);
  const [form, setForm] = useState(initialForm);
  const [editingId, setEditingId] = useState(null);
  const [sendVoucher, setSendVoucher] = useState(null);
  const [sourceCourseId, setSourceCourseId] = useState('');
  const [eligibleStudents, setEligibleStudents] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const fetchCourses = useCallback(async () => {
    try {
      const response = await axios.get('/api/instructor/courses');
      setCourses(Array.isArray(response.data) ? response.data : response.data.items || []);
    } catch {
      setCourses([]);
    }
  }, []);

  const fetchVouchers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.get('/api/teacher/vouchers', {
        params: { q: query || undefined, status: status || undefined },
      });
      setVouchers(response.data.items || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [query, status]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  useEffect(() => {
    fetchVouchers();
  }, [fetchVouchers]);

  const stats = useMemo(() => {
    const active = vouchers.filter((item) => item.status === 'ACTIVE').length;
    const sent = vouchers.reduce((sum, item) => sum + Number(item.recipientCount || 0), 0);
    const used = vouchers.reduce((sum, item) => sum + Number(item.usedCount ?? item.usageCount ?? 0), 0);
    return { active, sent, used };
  }, [vouchers]);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
    setNotice('');
    setError('');
  };

  const openCreateForm = () => {
    resetForm();
    setShowForm(true);
  };

  const openEditForm = (voucher) => {
    setForm({
      code: voucher.code || '',
      discountType: voucher.discountType || 'PERCENTAGE',
      discountValue: voucher.discountValue?.toString() || '',
      minPurchaseAmount: voucher.minPurchaseAmount?.toString() || '',
      maxDiscountAmount: voucher.maxDiscountAmount?.toString() || '',
      usageLimit: (voucher.maxUses ?? voucher.usageLimit)?.toString() || '',
      startDate: toDateInput(voucher.startDate),
      endDate: toDateInput(voucher.endDate),
      courseId: voucher.courseId || '',
    });
    setEditingId(voucher.id);
    setShowForm(true);
    setNotice('');
    setError('');
  };

  const saveVoucher = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice('');
    setError('');

    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        discountType: form.discountType,
        discountValue: Number(form.discountValue),
        minPurchaseAmount: Number(form.minPurchaseAmount) || 0,
        maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) : null,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        courseId: form.courseId,
      };

      if (editingId) {
        const response = await axios.put(`/api/teacher/vouchers/${editingId}`, payload);
        setVouchers((prev) => prev.map((item) => (item.id === editingId ? response.data : item)));
        setNotice('Đã cập nhật mã giảm giá thành công.');
      } else {
        const response = await axios.post('/api/teacher/vouchers', payload);
        setVouchers((prev) => [response.data, ...prev]);
        setNotice('Đã tạo mã giảm giá cho khóa học.');
      }
      setForm(initialForm);
      setEditingId(null);
      setShowForm(false);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteVoucher = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError('');
    setNotice('');
    try {
      await axios.delete(`/api/teacher/vouchers/${deleteTarget.id}`);
      setVouchers((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setNotice('Đã xóa voucher thành công.');
      setDeleteTarget(null);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setDeleting(false);
    }
  };

  const toggleVoucher = async (voucher) => {
    setNotice('');
    setError('');
    try {
      const response = await axios.patch(`/api/teacher/vouchers/${voucher.id}/toggle`);
      setVouchers((prev) => prev.map((item) => (item.id === voucher.id ? response.data : item)));
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  };

  const openSendModal = (voucher) => {
    setSendVoucher(voucher);
    setSourceCourseId('');
    setEligibleStudents([]);
    setSelectedStudents([]);
    setNotice('');
    setError('');
  };

  const loadEligibleStudents = async (courseId) => {
    setSourceCourseId(courseId);
    setSelectedStudents([]);
    setEligibleStudents([]);
    if (!courseId) return;

    setLoadingStudents(true);
    try {
      const response = await axios.get('/api/teacher/vouchers/eligible-students', {
        params: { sourceCourseId: courseId },
      });
      setEligibleStudents(response.data.items || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoadingStudents(false);
    }
  };

  const toggleStudent = (studentId) => {
    setSelectedStudents((prev) =>
      prev.includes(studentId) ? prev.filter((item) => item !== studentId) : [...prev, studentId]
    );
  };

  const sendToStudents = async () => {
    if (!sendVoucher || !sourceCourseId || selectedStudents.length === 0) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const response = await axios.post(`/api/teacher/vouchers/${sendVoucher.id}/send`, {
        sourceCourseId,
        studentIds: selectedStudents,
      });
      setVouchers((prev) => prev.map((item) => (item.id === sendVoucher.id ? response.data.voucher : item)));
      setNotice(`Đã gửi voucher cho ${response.data.sentCount} học viên hợp lệ.`);
      setSendVoucher(null);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSending(false);
    }
  };

  const columns = [
    { title: 'Mã', data: 'code', className: 'px-4 py-3' },
    { title: 'Giảm giá', data: 'discountValue', className: 'px-4 py-3' },
    { title: 'Khóa học', data: 'course.title', className: 'px-4 py-3' },
    { title: 'Lượt dùng', data: 'usageCount', className: 'px-4 py-3' },
    { title: 'Thời hạn', data: 'endDate', className: 'px-4 py-3' },
    { title: 'Trạng thái', data: 'status', className: 'px-4 py-3' },
    { title: 'Thao tác', data: 'id', className: 'px-4 py-3 text-right', orderable: false }
  ];

  const slots = {
    0: (data, row) => (
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 border border-purple-100/40">
          <Tag className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <span className="inline-block px-2.5 py-0.5 font-mono text-sm font-bold tracking-wider text-purple-700 bg-purple-50 rounded-lg border border-purple-100/50 uppercase">
            {row.code}
          </span>
          {row.isPrivate && (
            <p className="text-[10px] font-bold text-purple-600 mt-1 flex items-center gap-0.5">
              🔒 Dành riêng cho học viên
            </p>
          )}
        </div>
      </div>
    ),
    1: (data, row) => (
      row.discountType === 'PERCENTAGE' ? (
        <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-xs font-bold text-indigo-700">
          <Percent className="h-3.5 w-3.5" />
          {row.discountValue}%
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
          <DollarSign className="h-3.5 w-3.5" />
          {formatCurrency(row.discountValue)}
        </span>
      )
    ),
    2: (data, row) => (
      <span className="block max-w-[200px] truncate text-slate-700 font-semibold text-xs" title={row.course?.title || 'Tất cả khóa học'}>
        {row.course?.title || 'Tất cả khóa học'}
      </span>
    ),
    3: (data, row) => (
      <div className="space-y-1">
        <div className="text-xs font-semibold text-slate-700">
          <span className="font-bold text-slate-900">{row.usedCount ?? row.usageCount ?? 0}</span>
          {row.maxUses || row.usageLimit ? (
            <span className="text-slate-400"> / {row.maxUses ?? row.usageLimit}</span>
          ) : (
            <span className="text-slate-400"> / ∞</span>
          )}
        </div>
        <p className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
          <Send className="h-3 w-3" /> {row.recipientCount || 0} học viên nhận
        </p>
      </div>
    ),
    4: (data, row) => (
      <div className="flex flex-col gap-1 text-[11px] text-slate-500 font-medium">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Bắt đầu: {formatDate(row.startDate)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
          Kết thúc: {formatDate(row.endDate)}
        </span>
      </div>
    ),
    5: (data, row) => (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold border ${
        row.status === 'ACTIVE' 
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' 
          : row.status === 'EXPIRED' 
          ? 'bg-amber-50 text-amber-700 border-amber-200/50' 
          : 'bg-slate-50 text-slate-500 border-slate-200/50'
      }`}>
        <span className={`h-1.5 w-1.5 rounded-full ${
          row.status === 'ACTIVE' 
            ? 'bg-emerald-500' 
            : row.status === 'EXPIRED' 
            ? 'bg-amber-500' 
            : 'bg-slate-400'
        }`} />
        {statusLabel[row.status] || row.status || 'Đang hoạt động'}
      </span>
    ),
    6: (data, row) => (
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => openEditForm(row)}
          className="rounded-xl border border-slate-100 p-2 text-slate-500 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 hover:scale-105 active:scale-95"
          title="Chỉnh sửa"
        >
          <Edit3 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => openSendModal(row)}
          className="rounded-xl border border-slate-100 p-2 text-slate-500 transition hover:border-purple-200 hover:bg-purple-50 hover:text-purple-600 hover:scale-105 active:scale-95"
          title="Gửi voucher"
        >
          <Send className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => toggleVoucher(row)}
          className="rounded-xl border border-slate-100 p-2 text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-700 hover:scale-105 active:scale-95"
          title={row.status === 'ACTIVE' ? 'Tắt voucher' : 'Bật voucher'}
        >
          {row.status === 'ACTIVE' ? <ToggleRight className="h-4 w-4 text-emerald-500" /> : <ToggleLeft className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={() => setDeleteTarget(row)}
          className="rounded-xl border border-slate-100 p-2 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 hover:scale-105 active:scale-95"
          title="Xóa voucher"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    )
  };

  return (
    <div className="animate-fade-in-up space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center border-b border-slate-100 pb-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">Quản lý mã giảm giá</h1>
          <p className="text-sm text-slate-500 mt-1">Tạo, cập nhật và chia sẻ các chương trình ưu đãi học phí dành cho học viên.</p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-purple-600 px-5 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-500/10 hover:shadow-purple-500/25 transition-all hover:bg-purple-700 hover:scale-[1.02] active:scale-[0.98]"
        >
          <Plus className="h-4.5 w-4.5" />
          Tạo mã mới
        </button>
      </div>

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

      {/* Metrics Section */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Đang hoạt động', value: stats.active, icon: ToggleRight, tone: 'text-emerald-600 bg-emerald-50 border-emerald-100/50' },
          { label: 'Đã gửi học viên', value: stats.sent, icon: Send, tone: 'text-purple-600 bg-purple-50 border-purple-100/50' },
          { label: 'Đã sử dụng', value: stats.used, icon: Users, tone: 'text-amber-600 bg-amber-50 border-amber-100/50' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm hover:shadow-md transition-all duration-200 hover:-translate-y-1">
            <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${item.tone}`}>
              <item.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{item.label}</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Create / Edit Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-sm p-4 flex justify-center items-center animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden my-auto scale-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-100 bg-white/95 backdrop-blur-md px-6 py-5 sticky top-0 z-20">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 border border-purple-100/30">
                  <Tag className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">{editingId ? 'Chỉnh sửa voucher' : 'Tạo voucher mới'}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{editingId ? 'Cập nhật thông tin mã giảm giá' : 'Tạo mã giảm giá cho khóa học của bạn'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
                aria-label="Đóng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={saveVoucher} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Mã giảm giá</label>
                <input
                  value={form.code}
                  onChange={handleChange('code')}
                  required
                  placeholder="VD: SKILLIO20"
                  className={`${inputClass} font-bold uppercase tracking-wider placeholder:normal-case`}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Khóa học áp dụng</label>
                <select 
                  value={form.courseId} 
                  onChange={handleChange('courseId')} 
                  required 
                  className={`${inputClass} appearance-none bg-no-repeat bg-[right_1rem_center]`}
                  style={{ backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundSize: '1.25rem' }}
                >
                  <option value="">Chọn khóa học</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title || course.tieuDe}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Loại giảm</label>
                  <select 
                    value={form.discountType} 
                    onChange={handleChange('discountType')} 
                    className={`${inputClass} appearance-none bg-no-repeat bg-[right_1rem_center]`}
                    style={{ backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundSize: '1.25rem' }}
                  >
                    <option value="PERCENTAGE">Phần trăm</option>
                    <option value="FIXED_AMOUNT">Số tiền cố định</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Giá trị</label>
                  <input
                    type="number"
                    value={form.discountValue}
                    onChange={handleChange('discountValue')}
                    required
                    min="1"
                    max={form.discountType === 'PERCENTAGE' ? '100' : undefined}
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Lượt dùng tối đa</label>
                  <input type="number" value={form.usageLimit} onChange={handleChange('usageLimit')} min="1" className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Đơn tối thiểu</label>
                  <input type="number" value={form.minPurchaseAmount} onChange={handleChange('minPurchaseAmount')} min="0" className={inputClass} />
                </div>
              </div>

              {form.discountType === 'PERCENTAGE' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Giảm tối đa</label>
                  <input type="number" value={form.maxDiscountAmount} onChange={handleChange('maxDiscountAmount')} min="0" className={inputClass} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Bắt đầu</label>
                  <input type="date" value={form.startDate} onChange={handleChange('startDate')} className={inputClass} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-700">Kết thúc</label>
                  <input type="date" value={form.endDate} onChange={handleChange('endDate')} className={inputClass} />
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-100 bg-slate-50/50 -mx-6 -mb-6 p-6">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); resetForm(); }}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-98"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-xl bg-purple-600 py-3 text-sm font-semibold text-white transition hover:bg-purple-700 active:scale-98 disabled:opacity-60"
                >
                  {saving ? 'Đang lưu...' : editingId ? 'Cập nhật' : 'Tạo voucher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Voucher List */}
      <section className="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
        <DataTableToolbar
          searchValue={query}
          onSearchChange={setQuery}
          onSearchKeyDown={(event) => event.key === 'Enter' && fetchVouchers()}
          placeholder="Tìm theo mã hoặc tên khóa học..."
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          filters={
            <select 
              value={status} 
              onChange={(event) => setStatus(event.target.value)} 
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100 w-auto min-w-[160px] appearance-none bg-[right_1rem_center] bg-no-repeat"
              style={{ backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundSize: '1rem' }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="ACTIVE">Đang hoạt động</option>
              <option value="INACTIVE">Đã tắt</option>
              <option value="EXPIRED">Hết hạn</option>
            </select>
          }
          actions={
            <button
              type="button"
              onClick={fetchVouchers}
              className="whitespace-nowrap rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800 active:scale-95"
            >
              Tìm kiếm
            </button>
          }
        />

        <div className="mt-4">
          <DataTable
            data={vouchers}
            columns={columns}
            slots={slots}
            loading={loading}
            error={error}
            pageSize={pageSize}
          />
        </div>
      </section>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-sm p-4 flex justify-center items-center animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-100 my-auto scale-100 animate-in zoom-in-95 duration-200">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 border border-rose-100/30">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Xóa mã giảm giá</h3>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Bạn có chắc muốn xóa mã giảm giá <span className="font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">{deleteTarget.code}</span> không?
              Học viên sẽ không thể sử dụng mã này được nữa. Hành động này không thể hoàn tác.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 active:scale-98"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={deleteVoucher}
                disabled={deleting}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-sm font-semibold text-white transition hover:bg-rose-700 active:scale-98 disabled:opacity-60"
              >
                {deleting ? 'Đang xóa...' : 'Xóa mã'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send Voucher Modal */}
      {sendVoucher && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-sm p-4 flex justify-center items-center animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-slate-100 overflow-hidden my-auto scale-100 animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-100 bg-white/95 backdrop-blur-md px-6 py-5 sticky top-0 z-20">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2.5 py-0.5 rounded border border-purple-100/40">Gửi voucher tặng học viên</span>
                <h2 className="mt-1.5 text-xl font-bold text-slate-900">Mã voucher: {sendVoucher.code}</h2>
                <p className="text-xs text-slate-500 mt-1">Chọn khóa học nguồn để lọc các học viên đủ điều kiện nhận mã giảm giá này.</p>
              </div>
              <button
                type="button"
                onClick={() => setSendVoucher(null)}
                className="rounded-full p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors"
                aria-label="Đóng"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700">Khóa học nguồn</label>
                <select 
                  value={sourceCourseId} 
                  onChange={(event) => loadEligibleStudents(event.target.value)} 
                  className={`${inputClass} appearance-none bg-no-repeat bg-[right_1rem_center]`}
                  style={{ backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundSize: '1.25rem' }}
                >
                  <option value="">Chọn khóa học để lấy danh sách học viên</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title || course.tieuDe}
                    </option>
                  ))}
                </select>
              </div>

              <div className="rounded-2xl border border-slate-100 overflow-hidden bg-slate-50/20">
                <div className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                    <Users className="h-4 w-4 text-purple-600" />
                    Học viên hợp lệ ({eligibleStudents.length})
                  </div>
                  {eligibleStudents.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedStudents(
                          selectedStudents.length === eligibleStudents.length ? [] : eligibleStudents.map((student) => student.id)
                        )
                      }
                      className="text-xs font-semibold text-purple-600 hover:text-purple-700 hover:underline transition-colors"
                    >
                      {selectedStudents.length === eligibleStudents.length ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                    </button>
                  )}
                </div>

                <div className="max-h-60 overflow-y-auto p-3">
                  {loadingStudents ? (
                    <div className="py-12 text-center text-sm font-semibold text-slate-400 flex flex-col items-center gap-2">
                      <span className="h-5 w-5 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
                      Đang tải danh sách...
                    </div>
                  ) : eligibleStudents.length === 0 ? (
                    <div className="py-12 text-center text-sm text-slate-400">
                      {sourceCourseId ? 'Chưa có học viên nào đủ điều kiện.' : 'Vui lòng chọn khóa học nguồn ở trên.'}
                    </div>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {eligibleStudents.map((student) => (
                        <label
                          key={student.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border p-2.5 transition-all duration-200 ${
                            selectedStudents.includes(student.id) 
                              ? 'bg-purple-50/50 border-purple-200' 
                              : 'bg-white border-slate-100 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedStudents.includes(student.id)}
                            onChange={() => toggleStudent(student.id)}
                            className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                          />
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-bold text-purple-700">
                            {(student.name || 'H').charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-bold text-slate-800">{student.name || 'Học viên'}</p>
                            <p className="truncate text-[10px] text-slate-400 mt-0.5">{student.email}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between gap-3 sticky bottom-0 z-20">
              <button
                type="button"
                onClick={() => setSendVoucher(null)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 active:scale-98 transition-all"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={sendToStudents}
                disabled={!sourceCourseId || selectedStudents.length === 0 || sending}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-700 active:scale-98 disabled:opacity-50 disabled:pointer-events-none shadow-md shadow-purple-200"
              >
                <Send className="h-4 w-4" />
                {sending ? 'Đang gửi...' : `Gửi cho ${selectedStudents.length} học viên`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
