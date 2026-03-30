import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

interface AuthData {
  isAdmin: boolean;
}

/** Auth hook — provides isAdmin flag. Never throws. */
export function useAuth() {
  const { data } = useQuery({
    queryKey: ['auth'],
    queryFn: async (): Promise<AuthData> => {
      try {
        const res = await api.get<{ isAdmin: boolean }>('/api/v1/dashboard');
        return { isAdmin: res.isAdmin };
      } catch {
        return { isAdmin: false };
      }
    },
    staleTime: 120_000,
    retry: false,
  });

  return {
    isAdmin: data?.isAdmin ?? false,
  };
}
