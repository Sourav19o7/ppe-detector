'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';
import { PageLoading } from './Loading';

const publicPaths = ['/login'];

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { token, setStaffAuth, setWorkerAuth, logout } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const isPublicPath = publicPaths.includes(pathname);

      if (!token && !isPublicPath) {
        router.push('/login');
        setIsLoading(false);
        return;
      }

      if (token) {
        try {
          const response = await authApi.verify();
          // authApi.verify() returns { user?: User, worker?: Worker }
          if (response.user || response.worker) {
            // Update auth state with the verified user/worker data
            if (response.user) {
              setStaffAuth(token, response.user);
            } else if (response.worker) {
              setWorkerAuth(token, response.worker);
            }
            if (pathname === '/login') {
              router.push('/');
            }
          } else {
            logout();
            if (!isPublicPath) {
              router.push('/login');
            }
          }
        } catch {
          logout();
          if (!isPublicPath) {
            router.push('/login');
          }
        }
      }

      setIsLoading(false);
    };

    checkAuth();
  }, [token, pathname, router, setStaffAuth, setWorkerAuth, logout]);

  if (isLoading) {
    return <PageLoading />;
  }

  return <>{children}</>;
}
