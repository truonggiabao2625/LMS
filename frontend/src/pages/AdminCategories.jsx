import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { FolderTree, RefreshCw, Plus, X, Loader2 } from 'lucide-react';
import DataTable from '../components/DataTable';
import DataTableToolbar from '../components/DataTableToolbar';

export default function AdminCategories() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pageSize, setPageSize] = useState(5);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/admin/categories', { params: { q: query || undefined } });
      setItems(response.data || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormName('');
    setFormDesc('');
    setModalError('');
    setModalOpen(true);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormName(item.name || '');
    setFormDesc(item.moTa || '');
    setModalError('');
    setModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;

    const trimmedName = formName.trim();
    if (!trimmedName) {
      setModalError('Tên danh mục không được để trống.');
      return;
    }

    setSaving(true);
    setModalError('');
    try {
      if (editingItem) {
        await axios.put(`/api/admin/categories/${editingItem.id}`, {
          ten: trimmedName,
          moTa: formDesc.trim() || null
        });
      } else {
        await axios.post('/api/admin/categories', {
          ten: trimmedName,
          moTa: formDesc.trim() || null
        });
      }
      setModalOpen(false);
      fetchItems();
    } catch (err) {
      setModalError(err.response?.data?.message || err.message || 'Có lỗi xảy ra khi lưu.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (window.confirm(`Bạn có chắc chắn muốn xóa danh mục "${item.name}"?`)) {
      try {
        await axios.delete(`/api/admin/categories/${item.id}`);
        fetchItems();
      } catch (err) {
        alert(err.response?.data?.message || err.message || 'Không thể xóa danh mục.');
      }
    }
  };

  const columns = useMemo(() => [
    { title: 'Danh mục', data: 'name', className: 'px-5 py-4 font-semibold text-slate-900' },
    { title: 'Khóa học', data: 'courseCount', className: 'px-5 py-4 text-slate-700' },
    { title: 'Đang xuất bản', data: 'publishedCount', className: 'px-5 py-4 text-slate-700' },
    { title: 'Học viên', data: 'studentCount', className: 'px-5 py-4 text-slate-700' },
    { title: 'Thao tác', data: null, className: 'px-5 py-4 text-slate-700 text-center', orderable: false, searchable: false }
  ], []);

  const slots = useMemo(() => ({
    0: (data, row) => (
      <div className="flex items-center gap-3">
        <FolderTree className="h-4 w-4 text-purple-650" />
        <div>
          <div className="font-semibold text-slate-900">{row.name}</div>
          {row.moTa && <div className="text-xs text-slate-400 font-normal mt-0.5 max-w-[200px] truncate" title={row.moTa}>{row.moTa}</div>}
        </div>
      </div>
    ),
    4: (data, row) => {
      const hasCourses = row.courseCount > 0;
      return (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => handleEdit(row)}
            disabled={hasCourses}
            title={hasCourses ? 'Không thể sửa vì danh mục đang có khóa học' : 'Sửa danh mục'}
            className={`inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 ${
              hasCourses ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'
            }`}
          >
            Sửa
          </button>
          <button
            onClick={() => handleDelete(row)}
            disabled={hasCourses}
            title={hasCourses ? 'Không thể xóa vì danh mục đang có khóa học' : 'Xóa danh mục'}
            className={`inline-flex items-center justify-center rounded-lg border border-red-100 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-650 shadow-sm transition hover:bg-red-100 ${
              hasCourses ? 'opacity-40 cursor-not-allowed' : 'active:scale-95'
            }`}
          >
            Xóa
          </button>
        </div>
      );
    }
  }), []);

  return (
    <div className="animate-fade-in-up space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Quản lý danh mục</h1>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <DataTableToolbar
          searchValue={query}
          onSearchChange={setQuery}
          onSearchKeyDown={(event) => {
            if (event.key === 'Enter') fetchItems();
          }}
          placeholder="Tìm danh mục"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={handleOpenCreate}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-purple-700 shadow-sm"
              >
                <Plus className="h-4 w-4" />
                Thêm danh mục
              </button>
              <button onClick={fetchItems} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-800">
                <RefreshCw className="h-4 w-4" />
                Tải lại
              </button>
            </div>
          }
        />
        <DataTable
          data={items}
          columns={columns}
          slots={slots}
          loading={loading}
          error={error}
          pageSize={pageSize}
        />
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          
          <div className="relative w-full max-w-md transform rounded-2xl bg-white p-6 shadow-2xl transition-all border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {editingItem ? 'Sửa danh mục' : 'Thêm danh mục mới'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-655 transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {modalError && (
              <div className="mt-3 rounded-lg bg-rose-50 border border-rose-100 p-3 text-xs font-semibold text-rose-600">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSave} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Tên danh mục *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ví dụ: Thiết kế đồ họa"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-purple-400 focus:bg-white focus:ring-2 focus:ring-purple-100"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                  Mô tả (không bắt buộc)
                </label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Mô tả ngắn gọn về danh mục này..."
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-purple-400 focus:bg-white focus:ring-2 focus:ring-purple-100 resize-none"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 mt-5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-purple-650 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-purple-100 transition hover:bg-purple-700 disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Đang lưu...
                    </>
                  ) : (
                    'Lưu lại'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
