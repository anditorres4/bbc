'use client'

import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export interface Column<T> {
  key: keyof T | string
  header: string
  render?: (row: T) => React.ReactNode
  sortable?: boolean
  className?: string
}

interface PaginationProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

interface Props<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  pagination?: PaginationProps
  onRowClick?: (row: T) => void
  emptyMessage?: string
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  loading,
  pagination,
  onRowClick,
  emptyMessage = 'Sin resultados',
}: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null)

  const sorted = sort
    ? [...data].sort((a, b) => {
        const av = a[sort.key] as string
        const bv = b[sort.key] as string
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return sort.dir === 'asc' ? cmp : -cmp
      })
    : data

  function toggleSort(key: string) {
    setSort(prev => (prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-white">
      <table className="min-w-full divide-y divide-stone-200 text-sm">
        <thead className="bg-stone-50">
          <tr>
            {columns.map(col => (
              <th
                key={String(col.key)}
                className={cn(
                  'px-4 py-3 text-left font-medium text-stone-500 whitespace-nowrap',
                  col.sortable && 'cursor-pointer select-none hover:text-stone-900',
                  col.className
                )}
                onClick={() => col.sortable && toggleSort(String(col.key))}
              >
                <div className="flex items-center gap-1">
                  {col.header}
                  {col.sortable && (
                    <span className="opacity-50">
                      {sort?.key === String(col.key) ? (
                        sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3" />
                      )}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map(col => (
                    <td key={String(col.key)} className="px-4 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            : sorted.length === 0
            ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-stone-400">
                  {emptyMessage}
                </td>
              </tr>
            )
            : sorted.map((row, idx) => (
              <tr
                key={idx}
                className={cn('hover:bg-stone-50', onRowClick && 'cursor-pointer')}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map(col => (
                  <td key={String(col.key)} className={cn('px-4 py-3 text-stone-700', col.className)}>
                    {col.render ? col.render(row) : String(row[String(col.key)] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-3">
          <p className="text-xs text-stone-500">Página {pagination.page} de {pagination.totalPages}</p>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
