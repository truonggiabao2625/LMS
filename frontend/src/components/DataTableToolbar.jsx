import React from 'react';
import { Search } from 'lucide-react';

export default function DataTableToolbar({
  searchValue = '',
  onSearchChange,
  onSearchKeyDown,
  placeholder = 'Tìm kiếm...',
  pageSize = 5,
  onPageSizeChange,
  filters = null,
  actions = null,
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 mb-2">
      {/* Left controls: Search & custom filters */}
      <div className="flex flex-wrap items-center gap-3">
        {onSearchChange && (
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder={placeholder}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-4 text-xs outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
            />
          </div>
        )}
        {filters}
      </div>

      {/* Right controls: Page size & buttons */}
      <div className="flex flex-wrap items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Hiển thị:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
            >
              <option value={5}>5 dòng</option>
              <option value={10}>10 dòng</option>
              <option value={20}>20 dòng</option>
            </select>
          </div>
        )}
        {actions}
      </div>
    </div>
  );
}
