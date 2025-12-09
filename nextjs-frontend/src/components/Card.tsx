import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export function Card({ children, className, title, description, icon, action }: CardProps) {
  return (
    <div className={cn(
      'bg-white rounded-2xl border border-gray-100 shadow-sm',
      className
    )}>
      {(title || description || action) && (
        <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {icon && (
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-amber-400 flex items-center justify-center shadow-md">
                {icon}
              </div>
            )}
            <div>
              {title && <h3 className="text-lg font-bold text-stone-700">{title}</h3>}
              {description && <p className="text-sm text-stone-400 mt-0.5">{description}</p>}
            </div>
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  trend?: {
    value: number;
    positive: boolean;
  };
  color?: 'orange' | 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'cyan' | 'yellow';
}

export function StatCard({ title, value, icon, trend, color = 'orange' }: StatCardProps) {
  const colorClasses = {
    orange: 'from-orange-400 to-amber-400',
    green: 'from-emerald-400 to-green-400',
    red: 'from-red-400 to-rose-400',
    amber: 'from-amber-400 to-yellow-400',
    blue: 'from-blue-400 to-cyan-400',
    purple: 'from-purple-400 to-violet-400',
    cyan: 'from-cyan-400 to-blue-400',
    yellow: 'from-yellow-400 to-amber-400',
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm card-hover">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-stone-400 uppercase tracking-wide">{title}</p>
          <p className="text-4xl font-bold text-stone-700 mt-3">{value}</p>
          {trend && (
            <div className={cn(
              'inline-flex items-center gap-1.5 mt-3 px-2.5 py-1 rounded-lg text-sm font-semibold',
              trend.positive
                ? 'bg-emerald-50 text-emerald-600'
                : 'bg-red-50 text-red-600'
            )}>
              <span className="text-xs">{trend.positive ? '▲' : '▼'}</span>
              {Math.abs(trend.value)}%
            </div>
          )}
        </div>
        <div className={cn(
          'w-14 h-14 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-md',
          colorClasses[color as keyof typeof colorClasses] || colorClasses.orange
        )}>
          {icon}
        </div>
      </div>
    </div>
  );
}
