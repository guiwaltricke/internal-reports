import { useState, FormEvent } from 'react';
import { X, Shield, Lock, Mail, User as UserIcon, ArrowRight } from 'lucide-react';
import { api } from '../services/api';
import { signInWithGoogleWorkspace } from '../services/firebase';
import { User } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  if (!isOpen) return null;

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('guilherme@nextfit.com.br');
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const { appUser, idToken } = await signInWithGoogleWorkspace();
      const serverAuth = await api.syncGoogleUser(appUser, idToken);
      onSuccess(serverAuth.user);
      onClose();
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setErrorMsg('Janela do Google fechada.');
      } else {
        setErrorMsg(err.message || 'Falha ao autenticar com Google Workspace');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');

    try {
      let data;
      if (mode === 'register') {
        data = await api.register(name, email, password);
      } else {
        data = await api.login(email, password);
      }
      onSuccess(data.user);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro na autenticação');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden p-6 space-y-5 text-slate-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Next Fit Reports
              </h3>
              <p className="text-xs text-slate-500">Acesso Corporativo Seguro</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Google Workspace Button */}
        <div>
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-xl font-medium text-xs sm:text-sm transition-all shadow-sm flex items-center justify-center gap-2.5 disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.24v3.15C3.26 21.36 7.34 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.24C.45 8.15 0 9.92 0 12s.45 3.85 1.24 5.42l4.04-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.24 6.58l4.04 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>Entrar com Google Workspace (@nextfit.com.br)</span>
          </button>
        </div>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-slate-200"></div>
          <span className="flex-shrink mx-3 text-[11px] text-slate-400 uppercase font-medium">ou credenciais</span>
          <div className="flex-grow border-t border-slate-200"></div>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`py-1.5 rounded-md font-medium transition-all ${
              mode === 'login' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={`py-1.5 rounded-md font-medium transition-all ${
              mode === 'register' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Cadastrar
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs text-center">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Seu Nome</label>
              <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-xs focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
                <UserIcon className="w-4 h-4 text-slate-400 mr-2" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome do colaborador ou gestor"
                  required
                  className="w-full bg-transparent focus:outline-none text-slate-900 text-xs"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">E-mail Corporativo</label>
            <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-xs focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
              <Mail className="w-4 h-4 text-slate-400 mr-2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@nextfit.com.br"
                required
                className="w-full bg-transparent focus:outline-none text-slate-900 text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Senha</label>
            <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 text-xs focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500">
              <Lock className="w-4 h-4 text-slate-400 mr-2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full bg-transparent focus:outline-none text-slate-900 text-xs"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 text-xs sm:text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 mt-2"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>{mode === 'login' ? 'Entrar no Sistema' : 'Criar Conta de Acesso'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
