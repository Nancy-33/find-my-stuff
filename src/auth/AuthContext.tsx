import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../types';
import { USERS_KEY, SESSION_KEY, hashPassword, verifyPassword, MIN_USERNAME_LENGTH, MIN_PASSWORD_LENGTH } from './authConfig';
import { hashSecurityAnswer, verifySecurityAnswer } from './securityConfig';
import { ResetResult, SecurityQuestionResult } from '../types';
import { migrateLegacyData } from '../storage/db';

// ── Types ──────────────────────────────────────────────────────

interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  securityQuestion?: string;
  securityAnswerHash?: string;
  securityAnswerSalt?: string;
  createdAt: number;
}

interface Session {
  userId: string;
  username: string;
  loginTime: number;
}

type LoginResult =
  | { success: true; user: User }
  | { success: false; error: string };

type RegisterResult =
  | { success: true; user: User }
  | { success: false; error: string };

interface AuthState {
  user: User | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  isLoggedIn: boolean;
  login: (username: string, password: string) => Promise<LoginResult>;
  register: (username: string, password: string, securityQuestion?: string, securityAnswer?: string) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  getSecurityQuestion: (username: string) => Promise<SecurityQuestionResult>;
  resetPassword: (username: string, answer: string, newPassword: string) => Promise<ResetResult>;
}

// ── Context ────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Helpers ────────────────────────────────────────────────────

async function getStoredUsers(): Promise<StoredUser[]> {
  const json = await AsyncStorage.getItem(USERS_KEY);
  return json ? JSON.parse(json) : [];
}

async function saveStoredUsers(users: StoredUser[]): Promise<void> {
  await AsyncStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function getSession(): Promise<Session | null> {
  const json = await AsyncStorage.getItem(SESSION_KEY);
  return json ? JSON.parse(json) : null;
}

async function saveSession(session: Session): Promise<void> {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

async function clearSession(): Promise<void> {
  await AsyncStorage.removeItem(SESSION_KEY);
}

function storedUserToUser(su: StoredUser): User {
  return { id: su.id, username: su.username, createdAt: su.createdAt };
}

// ── Provider ───────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, isLoading: true });

  // Restore session on mount
  useEffect(() => {
    (async () => {
      try {
        const session = await getSession();
        if (session) {
          // Verify the user still exists in the users list
          const users = await getStoredUsers();
          const storedUser = users.find(u => u.id === session.userId);
          if (storedUser) {
            setState({ user: storedUserToUser(storedUser), isLoading: false });
            return;
          }
        }
      } catch {
        // Session check failed — treat as logged out
      }
      setState({ user: null, isLoading: false });
    })();
  }, []);

  const login = useCallback(async (username: string, password: string): Promise<LoginResult> => {
    const trimmed = username.trim();
    if (trimmed.length < MIN_USERNAME_LENGTH) {
      return { success: false, error: `用户名至少 ${MIN_USERNAME_LENGTH} 个字符` };
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { success: false, error: `密码至少 ${MIN_PASSWORD_LENGTH} 位` };
    }

    const users = await getStoredUsers();
    const storedUser = users.find(u => u.username === trimmed);
    if (!storedUser) {
      return { success: false, error: '用户名或密码错误' };
    }

    const valid = await verifyPassword(password, storedUser.salt, storedUser.passwordHash);
    if (!valid) {
      return { success: false, error: '用户名或密码错误' };
    }

    const session: Session = { userId: storedUser.id, username: storedUser.username, loginTime: Date.now() };
    await saveSession(session);

    // Auto-migrate legacy (pre-auth) data on login
    try {
      await migrateLegacyData(storedUser.id);
    } catch {
      // Migration failure is non-critical
    }

    const user = storedUserToUser(storedUser);
    setState({ user, isLoading: false });
    return { success: true, user };
  }, []);

  const getSecurityQuestion = useCallback(async (username: string): Promise<SecurityQuestionResult> => {
    const trimmed = username.trim();
    if (!trimmed) {
      return { success: false, error: '请输入用户名' };
    }
    const users = await getStoredUsers();
    const user = users.find(u => u.username === trimmed);
    if (!user || !user.securityQuestion) {
      return { success: false, error: '该用户未设置密保问题' };
    }
    return { success: true, question: user.securityQuestion };
  }, []);

  const resetPassword = useCallback(async (
    username: string,
    answer: string,
    newPassword: string
  ): Promise<ResetResult> => {
    const trimmed = username.trim();
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return { success: false, error: `新密码至少 ${MIN_PASSWORD_LENGTH} 位` };
    }
    const users = await getStoredUsers();
    const idx = users.findIndex(u => u.username === trimmed);
    if (idx === -1 || !users[idx].securityAnswerHash || !users[idx].securityAnswerSalt) {
      return { success: false, error: '无法重置密码' };
    }
    const user = users[idx];
    const valid = await verifySecurityAnswer(answer, user.securityAnswerSalt!, user.securityAnswerHash!);
    if (!valid) {
      return { success: false, error: '密保答案错误' };
    }
    const { hash, salt } = await hashPassword(newPassword);
    users[idx] = { ...user, passwordHash: hash, salt };
    await saveStoredUsers(users);
    return { success: true };
  }, []);

  const register = useCallback(async (username: string, password: string, securityQuestion?: string, securityAnswer?: string): Promise<RegisterResult> => {
    const trimmed = username.trim();
    if (trimmed.length < MIN_USERNAME_LENGTH) {
      return { success: false, error: `用户名至少 ${MIN_USERNAME_LENGTH} 个字符` };
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { success: false, error: `密码至少 ${MIN_PASSWORD_LENGTH} 位` };
    }

    const users = await getStoredUsers();
    if (users.some(u => u.username === trimmed)) {
      return { success: false, error: '该用户名已存在' };
    }

    const { hash, salt } = await hashPassword(password);

    // Hash security answer if provided
    let securityAnswerHash: string | undefined;
    let securityAnswerSalt: string | undefined;
    if (securityQuestion && securityAnswer && securityAnswer.trim()) {
      const answerResult = await hashSecurityAnswer(securityAnswer.trim());
      securityAnswerHash = answerResult.hash;
      securityAnswerSalt = answerResult.salt;
    }

    const storedUser: StoredUser = {
      id: uuidv4(),
      username: trimmed,
      passwordHash: hash,
      salt,
      securityQuestion: securityQuestion || undefined,
      securityAnswerHash,
      securityAnswerSalt,
      createdAt: Date.now(),
    };

    users.push(storedUser);
    await saveStoredUsers(users);

    const session: Session = { userId: storedUser.id, username: storedUser.username, loginTime: Date.now() };
    await saveSession(session);

    // Auto-migrate legacy (pre-auth) data on first registration
    try {
      await migrateLegacyData(storedUser.id);
    } catch {
      // Migration failure is non-critical
    }

    const user = storedUserToUser(storedUser);
    setState({ user, isLoading: false });
    return { success: true, user };
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    setState({ user: null, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, isLoggedIn: state.user !== null, login, register, logout, getSecurityQuestion, resetPassword }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
