import type { AuthTokenResponseType, LoginRequestType, RegisterRequestType } from '@landmatch/api';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import { apiPost, setOnAuthFailure } from '../api/client';

import { clearTokens, getTokens, setTokens } from './tokenStorage';

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
    await clearTokens();
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
  }, [queryClient]);

  const login = useCallback(async (data: LoginRequestType) => {
    const result = await apiPost<LoginRequestType, AuthTokenResponseType>(
      '/api/v1/auth/login',
      data,
      { noAuth: true },
    );
    await setTokens(result.accessToken, result.refreshToken);
    setIsAuthenticated(true);
  }, []);

  const register = useCallback(async (data: RegisterRequestType) => {
    const result = await apiPost<RegisterRequestType, AuthTokenResponseType>(
      '/api/v1/auth/register',
      data,
      { noAuth: true },
    );
    await setTokens(result.accessToken, result.refreshToken);
    setIsAuthenticated(true);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ isAuthenticated, isLoading, login, register, logout }),
    [isAuthenticated, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
