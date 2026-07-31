import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { SECURITY_QUESTIONS } from '../auth/securityConfig';

declare global {
  interface Window {
    __pwaCanInstall?: boolean;
    __pwaIsInstalled?: boolean;
    __pwaInstall?: () => void;
  }
}

type Mode = 'login' | 'register' | 'forgotPassword';

export default function LoginScreen() {
  const { login, register, getSecurityQuestion, resetPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('register');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pwaInstallable, setPwaInstallable] = useState(false);
  const [pwaInstalled, setPwaInstalled] = useState(false);

  // Check PWA install availability
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (window.__pwaIsInstalled || window.matchMedia?.('(display-mode: standalone)').matches) {
        setPwaInstalled(true);
        return;
      }
      // Always show the install button — if beforeinstallprompt hasn't fired yet,
      // we'll show manual instructions on click
      setPwaInstallable(true);
    }
  }, []);

  // Security question (register mode)
  const [securityQuestion, setSecurityQuestion] = useState('');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [showQuestionPicker, setShowQuestionPicker] = useState(false);

  // Forgot password wizard
  const [fpStep, setFpStep] = useState<1 | 2 | 3>(1);
  const [fpUsername, setFpUsername] = useState('');
  const [fpQuestion, setFpQuestion] = useState('');
  const [fpAnswer, setFpAnswer] = useState('');
  const [fpNewPassword, setFpNewPassword] = useState('');
  const [fpConfirmPassword, setFpConfirmPassword] = useState('');
  const [fpSuccess, setFpSuccess] = useState('');

  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const resetForm = () => {
    setUsername('');
    setPassword('');
    setConfirmPassword('');
    setError('');
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError('');
  };

  const handleSubmit = async () => {
    setError('');

    if (!username.trim()) {
      setError('请输入用户名');
      return;
    }
    if (!password) {
      setError('请输入密码');
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('两次密码输入不一致');
        return;
      }
    }

    setLoading(true);
    try {
      const result = mode === 'login'
        ? await login(username.trim(), password)
        : await register(username.trim(), password, securityQuestion || undefined, securityAnswer);

      if (!result.success) {
        setError(result.error);
      }
      // On success, the parent AuthProvider sets user, and the navigator
      // automatically switches to the main stack. No navigation needed.
    } catch {
      setError('操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const resetForgotPasswordState = () => {
    setFpStep(1);
    setFpUsername('');
    setFpQuestion('');
    setFpAnswer('');
    setFpNewPassword('');
    setFpConfirmPassword('');
    setFpSuccess('');
  };

  const handleFpStep1 = async () => {
    setError('');
    setFpSuccess('');
    if (!fpUsername.trim()) {
      setError('请输入用户名');
      return;
    }
    setLoading(true);
    try {
      const result = await getSecurityQuestion(fpUsername.trim());
      if (!result.success) {
        setError(result.error);
        return;
      }
      setFpQuestion(result.question);
      setFpStep(2);
    } catch {
      setError('操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleFpStep2 = () => {
    setError('');
    if (!fpAnswer.trim()) {
      setError('请输入密保答案');
      return;
    }
    setFpStep(3);
  };

  const handleFpStep3 = async () => {
    setError('');
    if (!fpNewPassword) {
      setError('请输入新密码');
      return;
    }
    if (fpNewPassword !== fpConfirmPassword) {
      setError('两次密码输入不一致');
      return;
    }
    setLoading(true);
    try {
      const result = await resetPassword(fpUsername.trim(), fpAnswer, fpNewPassword);
      if (!result.success) {
        setError(result.error);
        if (result.error.includes('答案')) {
          setFpStep(2);
        }
        return;
      }
      setFpSuccess('密码重置成功，请登录');
      // Return to login mode after short delay
      setTimeout(() => {
        setMode('login');
        resetForgotPasswordState();
      }, 1500);
    } catch {
      setError('操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* App title */}
        <View style={styles.header}>
          <Text style={styles.appName}>找东西</Text>
          <Text style={styles.subtitle}>记录物品位置，轻松查找</Text>
          {pwaInstallable && (
            <TouchableOpacity
              style={[styles.installBtn, pwaInstalled && styles.installBtnDone]}
              onPress={() => {
                if (pwaInstalled) return;
                if (window.__pwaInstall) {
                  window.__pwaInstall();
                } else {
                  // Fallback: show manual install instructions
                  alert('请使用浏览器菜单：\nChrome: 右上角 ⋮ → 安装页面\nEdge: 右上角 ··· → 将此站点作为应用安装\nSafari: 分享 → 添加到主屏幕');
                }
              }}
              activeOpacity={0.7}
            >
              <Text style={styles.installBtnText}>
                {pwaInstalled ? '已安装' : '安装到桌面'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tab switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, mode === 'login' && styles.tabActive]}
            onPress={() => switchMode('login')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>
              登录
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, mode === 'register' && styles.tabActive]}
            onPress={() => switchMode('register')}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>
              注册
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>用户名</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="请输入用户名"
            placeholderTextColor="#ccc"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <Text style={styles.label}>密码</Text>
          <TextInput
            ref={passwordRef}
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="请输入密码"
            placeholderTextColor="#ccc"
            secureTextEntry
            returnKeyType={mode === 'register' ? 'next' : 'done'}
            onSubmitEditing={() => {
              if (mode === 'register') {
                confirmRef.current?.focus();
              } else {
                handleSubmit();
              }
            }}
          />

          {mode === 'register' && (
            <>
              <Text style={styles.label}>确认密码</Text>
              <TextInput
                ref={confirmRef}
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="请再次输入密码"
                placeholderTextColor="#ccc"
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />

              {/* Security question (register only, optional) */}
              <Text style={styles.label}>密保问题（可选）</Text>
              <TouchableOpacity
                style={styles.input}
                onPress={() => setShowQuestionPicker(!showQuestionPicker)}
                activeOpacity={0.7}
              >
                <Text style={securityQuestion ? styles.inputText : styles.placeholderText}>
                  {securityQuestion || '选择密保问题（可选，用于找回密码）'}
                </Text>
              </TouchableOpacity>
              {showQuestionPicker && (
                <View style={styles.questionDropdown}>
                  {SECURITY_QUESTIONS.map((q, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[
                        styles.questionItem,
                        i < SECURITY_QUESTIONS.length - 1 && styles.questionItemBorder,
                      ]}
                      onPress={() => { setSecurityQuestion(q); setShowQuestionPicker(false); }}
                    >
                      <Text style={[
                        styles.questionItemText,
                        securityQuestion === q && styles.questionItemTextActive,
                      ]}>{q}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {securityQuestion !== '' && (
                <>
                  <Text style={styles.label}>密保答案</Text>
                  <TextInput
                    style={styles.input}
                    value={securityAnswer}
                    onChangeText={setSecurityAnswer}
                    placeholder="请输入密保答案"
                    placeholderTextColor="#ccc"
                    secureTextEntry
                    autoCapitalize="none"
                  />
                </>
              )}
            </>
          )}

          {/* Forgot Password Wizard */}
          {mode === 'forgotPassword' && (
            <View>
              {/* Step indicator */}
              <View style={styles.fpSteps}>
                {[1, 2, 3].map(step => (
                  <View key={step} style={styles.fpStepRow}>
                    <View style={[styles.fpStepDot, fpStep >= step && styles.fpStepDotActive]} />
                    {step < 3 && <View style={[styles.fpStepLine, fpStep > step && styles.fpStepLineActive]} />}
                  </View>
                ))}
              </View>
              <Text style={styles.fpStepLabel}>
                {fpStep === 1 ? '输入用户名' : fpStep === 2 ? '验证身份' : '设置新密码'}
              </Text>

              {/* Success message */}
              {fpSuccess !== '' && (
                <View style={styles.successBox}>
                  <Text style={styles.successText}>{fpSuccess}</Text>
                </View>
              )}

              {/* Step 1: Enter username */}
              {fpStep === 1 && (
                <>
                  <Text style={styles.label}>用户名</Text>
                  <TextInput
                    style={styles.input}
                    value={fpUsername}
                    onChangeText={setFpUsername}
                    placeholder="请输入用户名"
                    placeholderTextColor="#ccc"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleFpStep1}
                  />
                  <TouchableOpacity
                    style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                    onPress={handleFpStep1}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.submitText}>下一步</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* Step 2: Answer security question */}
              {fpStep === 2 && (
                <>
                  <View style={styles.fpQuestionBox}>
                    <Text style={styles.fpQuestionLabel}>密保问题</Text>
                    <Text style={styles.fpQuestionText}>{fpQuestion}</Text>
                  </View>
                  <Text style={styles.label}>答案</Text>
                  <TextInput
                    style={styles.input}
                    value={fpAnswer}
                    onChangeText={setFpAnswer}
                    placeholder="请输入密保答案"
                    placeholderTextColor="#ccc"
                    secureTextEntry
                    autoCapitalize="none"
                    returnKeyType="done"
                    onSubmitEditing={handleFpStep2}
                  />
                  <TouchableOpacity
                    style={styles.submitBtn}
                    onPress={handleFpStep2}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.submitText}>验证</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Step 3: Set new password */}
              {fpStep === 3 && (
                <>
                  <Text style={styles.label}>新密码</Text>
                  <TextInput
                    style={styles.input}
                    value={fpNewPassword}
                    onChangeText={setFpNewPassword}
                    placeholder="请输入新密码"
                    placeholderTextColor="#ccc"
                    secureTextEntry
                    returnKeyType="next"
                  />
                  <Text style={styles.label}>确认新密码</Text>
                  <TextInput
                    style={styles.input}
                    value={fpConfirmPassword}
                    onChangeText={setFpConfirmPassword}
                    placeholder="请再次输入新密码"
                    placeholderTextColor="#ccc"
                    secureTextEntry
                    returnKeyType="done"
                    onSubmitEditing={handleFpStep3}
                  />
                  <TouchableOpacity
                    style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
                    onPress={handleFpStep3}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.submitText}>重置密码</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* Back to login */}
              <TouchableOpacity
                style={styles.forgotLink}
                onPress={() => { setMode('login'); resetForgotPasswordState(); setError(''); }}
                activeOpacity={0.6}
              >
                <Text style={styles.forgotLinkText}>返回登录</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Inline error */}
          {error !== '' && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Submit button */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.submitText}>
                {mode === 'login' ? '登录' : '注册'}
              </Text>
            )}
          </TouchableOpacity>

          {mode === 'login' && (
            <TouchableOpacity
              style={styles.forgotLink}
              onPress={() => { setMode('forgotPassword'); resetForgotPasswordState(); setError(''); }}
              activeOpacity={0.6}
            >
              <Text style={styles.forgotLinkText}>忘记密码？</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 48,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#007AFF',
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  installBtn: {
    marginTop: 14,
    backgroundColor: '#34C759',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    alignSelf: 'center',
  },
  installBtnDone: {
    backgroundColor: '#999',
  },
  installBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 32,
    borderRadius: 10,
    backgroundColor: '#f0f0f0',
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 16,
    color: '#999',
    fontWeight: '500',
  },
  tabTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  form: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#fafafa',
  },
  errorBox: {
    backgroundColor: '#FFF0F0',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FFD0D0',
  },
  errorText: {
    color: '#E04040',
    fontSize: 14,
    textAlign: 'center',
  },
  submitBtn: {
    height: 50,
    backgroundColor: '#007AFF',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  // Forgot password styles
  forgotLink: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  forgotLinkText: {
    color: '#007AFF',
    fontSize: 14,
  },
  // Security question picker
  placeholderText: {
    color: '#ccc',
    fontSize: 16,
  },
  inputText: {
    color: '#333',
    fontSize: 16,
  },
  questionDropdown: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 10,
    backgroundColor: '#fff',
    marginTop: -4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  questionItem: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  questionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  questionItemText: {
    fontSize: 15,
    color: '#333',
  },
  questionItemTextActive: {
    color: '#007AFF',
    fontWeight: '600',
  },
  // Forgot password wizard
  fpSteps: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  fpStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fpStepDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#e0e0e0',
  },
  fpStepDotActive: {
    backgroundColor: '#007AFF',
  },
  fpStepLine: {
    width: 40,
    height: 2,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 4,
  },
  fpStepLineActive: {
    backgroundColor: '#007AFF',
  },
  fpStepLabel: {
    textAlign: 'center',
    fontSize: 14,
    color: '#999',
    marginBottom: 20,
  },
  fpQuestionBox: {
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e8e8e8',
  },
  fpQuestionLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  fpQuestionText: {
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  successBox: {
    backgroundColor: '#F0FFF0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#D0FFD0',
  },
  successText: {
    color: '#40A040',
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
});
