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
  const { isAuthenticated, token, setAuth, logout } = useAuthStore();
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
          if (response.valid) {
            setAuth(token, response.username);
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
  }, [token, pathname, router, setAuth, logout]);

  if (isLoading) {
    return <PageLoading />;
  }

  return <>{children}</>;
}
