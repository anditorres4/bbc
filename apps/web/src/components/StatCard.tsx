import { TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface Props {
  label: string
  value: number | string
  delta?: number
  icon?: JSX.Element
}

export function StatCard({ label, value, delta, icon }: Props) {
  const isPositive = delta !== undefined && delta >= 0
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-sm font-medium text-stone-500">{label}</p>
          {icon && <div className="text-amber-600">{icon}</div>}
        </div>
        <p className="mt-2 text-3xl font-bold text-stone-900">{value}</p>
        {delta !== undefined && (
          <div className={cn('mt-1 flex items-center gap-1 text-xs font-medium', isPositive ? 'text-green-600' : 'text-red-500')}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span>{Math.abs(delta)}% vs ayer</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
