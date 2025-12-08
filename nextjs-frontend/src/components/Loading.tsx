import { cn } from '@/lib/utils';

interface LoadingProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Spinner({ size = 'md', className }: LoadingProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-3',
    lg: 'w-12 h-12 border-4',
  };

  return (
    <div
      className={cn(
        'border-gray-200 border-t-[#1e3a5f] rounded-full animate-spin',
        sizeClasses[size],
        className
      )}
    />
  );
}

export function LoadingOverlay({ message = 'Loading...' }: { message?: string }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-8 flex flex-col items-center gap-4">
        <Spinner size="lg" />
        <p className="text-gray-600 font-medium">{message}</p>
      </div>
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Spinner size="lg" />
    </div>
  );
}
