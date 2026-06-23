import React from 'react';
import DataTableReact from 'datatables.net-react';
import DT from 'datatables.net-dt';
import { Loader2 } from 'lucide-react';

DataTableReact.use(DT);

const VIETNAMESE_LANG = {
  processing: "Đang tải dữ liệu...",
  search: "Tìm kiếm:",
  lengthMenu: "Hiển thị _MENU_ bản ghi",
  info: "Hiển thị _START_ đến _END_ trong số _TOTAL_ bản ghi",
  infoEmpty: "Hiển thị 0 đến 0 trong số 0 bản ghi",
  infoFiltered: "(lọc từ _MAX_ bản ghi)",
  infoPostFix: "",
  loadingRecords: "Đang tải...",
  zeroRecords: "Không tìm thấy dữ liệu phù hợp",
  emptyTable: "Không có dữ liệu trong bảng",
  paginate: {
    first: "Đầu",
    previous: "Trước",
    next: "Sau",
    last: "Cuối"
  },
  aria: {
    sortAscending: ": kích hoạt để sắp xếp tăng dần",
    sortDescending: ": kích hoạt để sắp xếp giảm dần"
  }
};

export default function DataTable({
  data = [],
  columns = [],
  slots = {},
  options = {},
  loading = false,
  error = null,
  className = '',
  pageSize = 5,
  ...props
}) {
  const defaultOptions = {
    searching: false, // Dùng ô tìm kiếm custom của trang
    ordering: true,
    paging: true,
    lengthChange: false, // Tắt hiển thị bộ chọn mặc định vì đã có trên toolbar
    pageLength: pageSize,
    info: true,
    language: VIETNAMESE_LANG,
    responsive: true,
    dom: 'tpi', // Show only Table, Pagination, and Info
    autoWidth: false, // Allow custom column widths and truncation
    ...options
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600 mb-2" />
        <p className="text-sm font-medium">Đang tải dữ liệu...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-2xl">
        {error}
      </div>
    );
  }

  return (
    <div className={`overflow-x-auto w-full ${className}`}>
      <DataTableReact
        data={data}
        columns={columns}
        slots={slots}
        options={defaultOptions}
        className="w-full text-left text-sm display hover border-b border-slate-100"
        {...props}
      />
    </div>
  );
}
