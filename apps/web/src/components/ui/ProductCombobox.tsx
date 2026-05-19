'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { BBC_PRODUCTS } from '@/lib/constants'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function ProductCombobox({ value, onChange, placeholder = 'Seleccionar producto', className }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const filtered = BBC_PRODUCTS.filter(p =>
    p.toLowerCase().includes(search.toLowerCase())
  )

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  function handleOpen() {
    setOpen(true)
    setSearch('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function select(product: string) {
    onChange(product)
    setOpen(false)
    setSearch('')
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          'flex h-9 w-full items-center justify-between rounded-md border border-stone-200 bg-white px-3 py-2 text-sm shadow-sm transition-colors',
          'hover:border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-0',
          !value && 'text-stone-400'
        )}
      >
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-stone-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-stone-200 bg-white shadow-lg">
          <div className="border-b p-2">
            <input
              ref={inputRef}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar producto…"
              className="w-full rounded-sm px-2 py-1 text-sm outline-none placeholder:text-stone-400"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-stone-400">Sin resultados</li>
            ) : (
              filtered.map(product => (
                <li
                  key={product}
                  onClick={() => select(product)}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-amber-50 hover:text-amber-800"
                >
                  <Check className={cn('h-4 w-4 shrink-0 text-amber-600', value === product ? 'opacity-100' : 'opacity-0')} />
                  {product}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
