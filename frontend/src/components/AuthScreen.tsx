import { useState, type FormEvent } from 'react';

export type AuthSession = {
  authenticated: boolean;
  needsRegistration: boolean;
  user: { id: number; email: string; createdAt: string } | null;
};

export function AuthScreen({
  session,
  apiUrl,
  onAuthenticated,
}: {
  session: AuthSession | null;
  apiUrl: string;
  onAuthenticated: (session: AuthSession) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (session === null) return <main className="auth-screen"><div className="auth-card auth-loading" role="status"><i /><span>Проверяем локальную сессию…</span></div></main>;

  const isRegister = session.needsRegistration || mode === 'register';
  const title = session.needsRegistration ? 'Создайте первый аккаунт' : isRegister ? 'Создать аккаунт' : 'Войти в Капитал';
  const description = session.needsRegistration
    ? 'Ваши уже сохранённые локальные портфели и операции будут закреплены за этим аккаунтом.'
    : isRegister ? 'Новый аккаунт начнёт с пустых портфелей и не увидит данные других пользователей.' : 'Войдите, чтобы увидеть только свои портфели, операции и аналитику.';

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    if (isRegister && password !== confirmation) {
      setError('Пароли не совпадают.');
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(`${apiUrl}/auth/${isRegister ? 'register' : 'login'}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json() as AuthSession & { error?: string };
      if (!response.ok || !result.authenticated) throw new Error(result.error ?? 'Не удалось выполнить вход.');
      onAuthenticated({ authenticated: true, needsRegistration: false, user: result.user });
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Не удалось выполнить вход.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return <main className="auth-screen">
    <section className="auth-card">
      <div className="auth-brand"><span>●</span><strong>Капитал</strong></div>
      <p className="section-label">ЛОКАЛЬНЫЙ ДОСТУП</p>
      <h1>{title}</h1>
      <p>{description}</p>
      <form onSubmit={submit}>
        <label htmlFor="auth-email">Email</label>
        <input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="you@example.com" required />
        <label htmlFor="auth-password">Пароль</label>
        <input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={8} maxLength={200} placeholder="Не менее 8 символов" required />
        {isRegister && <><label htmlFor="auth-confirmation">Повторите пароль</label><input id="auth-confirmation" type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" minLength={8} maxLength={200} required /></>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Подождите…' : isRegister ? 'Создать аккаунт' : 'Войти'}</button>
      </form>
      {!session.needsRegistration && <button type="button" className="auth-switch" onClick={() => { setMode(isRegister ? 'login' : 'register'); setError(''); }}>{isRegister ? 'У меня уже есть аккаунт' : 'Создать новый аккаунт'}</button>}
      <small>Пароль хранится на этом устройстве только в виде криптографического хэша. Сеанс сохраняется в защищённой cookie браузера.</small>
    </section>
  </main>;
}
