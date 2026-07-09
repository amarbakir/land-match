import type { AuthTokenResponseType, LoginRequestType, RegisterRequestType } from '@landmatch/api';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import { apiLogout, apiPost, setOnAuthFailure } from '../api/client';

import { getTokens, setTokens } from './tokenStorage';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (data: LoginRequestType) => Promise<void>;
  register: (data: RegisterRequestType) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const queryClient = useQueryClient();

  const logout = useCallback(async () => {
    // Server-side revoke + local clear — see ApiClient.logout for the contract
    await apiLogout();
    setIsAuthenticated(false);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    getTokens().then((tokens) => {
      setIsAuthenticated(tokens !== null);
      setIsLoading(false);
    });

    setOnAuthFailure(() => {
      setIsAuthenticated(false);
      queryClient.clear();
    });

    return () => {
      setOnAuthFailure(() => {});
    };
  }, [queryClient]);

  const login = useCallback(async (data: LoginRequestType) => {
    const result = await apiPost<LoginRequestType, AuthTokenResponseType>(
      '/auth/login',
      data,
      { noAuth: true },
    );
    await setTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    setIsAuthenticated(true);
  }, []);

  const register = useCallback(async (data: RegisterRequestType) => {
    await apiPost<RegisterRequestType, AuthTokenResponseType>(
      '/auth/register',
      data,
      { noAuth: true },
    );
  }, []);

  const value = useMemo<AuthState>(
    () => ({ isAuthenticated, isLoading, login, register, logout }),
    [isAuthenticated, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
