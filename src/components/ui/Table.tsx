import React from 'react';

export interface TableColumn<T> {
  key: string;
  header: React.ReactNode;
  align?: 'left' | 'center' | 'right';
  numeric?: boolean;
  className?: string;
  render: (row: T, index: number) => React.ReactNode;
  mobileLabel?: string;
}

export interface ResponsiveTableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  rowKey: (row: T, index: number) => string;
  emptyState?: React.ReactNode;
  mobileCardRender?: (row: T, index: number) => React.ReactNode;
  className?: string;
}

/**
 * Komponen Tabel Standar:
 * - Header lengket (sticky top-0)
 * - Baris zebra halus (even:bg-slate-50/45)
 * - Mode kartu otomatis di bawah 768px (md:hidden / hidden md:block) bila menggunakan ResponsiveTable
 */
export function Table<T>({
  columns,
  data,
  rowKey,
  emptyState,
  mobileCardRender,
  className = ''
}: ResponsiveTableProps<T>) {
  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={`w-full ${className}`}>
      {/* Tampilan Kartu Otomatis untuk Layar < 768px */}
      <div className="md:hidden divide-y divide-slate-200">
        {data.map((row, idx) => (
          <div key={rowKey(row, idx)} className="p-4 bg-white space-y-2.5">
            {mobileCardRender ? (
              mobileCardRender(row, idx)
            ) : (
              columns.map((col) => (
                <div key={col.key} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-xs font-semibold text-slate-500 shrink-0">
                    {col.mobileLabel ?? col.header}
                  </span>
                  <div
                    className={`text-slate-900 text-right min-w-0 ${
                      col.numeric ? 'font-mono tabular-nums' : ''
                    }`}
                  >
                    {col.render(row, idx)}
                  </div>
                </div>
              ))
            )}
          </div>
        ))}
      </div>

      {/* Tampilan Tabel Desktop/Tablet >= 768px dengan Header Lengket & Baris Zebra Halus */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wider">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                      ? 'text-center'
                      : 'text-left'
                  } ${col.className || ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-800">
            {data.map((row, idx) => (
              <tr
                key={rowKey(row, idx)}
                className="even:bg-slate-50/50 hover:bg-emerald-50/40 transition-colors duration-150"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 ${
                      col.align === 'right'
                        ? 'text-right'
                        : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                    } ${col.numeric ? 'font-mono tabular-nums' : ''} ${col.className || ''}`}
                  >
                    {col.render(row, idx)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
