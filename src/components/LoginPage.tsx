import { useState } from 'react';
import { Shield, Lock, Users, Sparkles, CheckCircle2 } from 'lucide-react';
import { signInWithGoogleWorkspace } from '../services/firebase';
import { api } from '../services/api';
import { User } from '../types';

interface LoginPageProps {
  onLoginSuccess: (user: User) => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const { appUser, idToken } = await signInWithGoogleWorkspace();
      const serverAuth = await api.syncGoogleUser(appUser, idToken);
      onLoginSuccess(serverAuth.user);
    } catch (err: any) {
      console.error('Login error:', err);
      // Clean up Firebase error message if popup closed by user
      if (err.code === 'auth/popup-closed-by-user') {
        setErrorMsg('A janela de autenticação do Google foi fechada antes de concluir.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        setErrorMsg('Autenticação cancelada.');
      } else {
        setErrorMsg(err.message || 'Falha ao autenticar com Google Workspace @nextfit.com.br.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans selection:bg-indigo-600 selection:text-white">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-sm">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <span className="font-bold text-lg text-slate-900 tracking-tight">
              Next Fit<span className="text-indigo-600"> Reports</span>
            </span>
            <span className="ml-2 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
              Workspace
            </span>
          </div>
        </div>

        <div className="text-xs text-slate-500 hidden sm:flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Ambiente Corporativo Seguro</span>
        </div>
      </header>

      {/* Main Login Hero */}
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-12 flex flex-col items-center justify-center">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-8 shadow-sm space-y-6">
          {/* Logo & Headline */}
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-2xl flex items-center justify-center mx-auto shadow-sm">
              <Sparkles className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Next Fit Reports
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              Plataforma de publicação e hospedagem protegida de relatórios HTML gerados por IA.
            </p>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs text-center leading-relaxed">
              {errorMsg}
            </div>
          )}

          {/* Primary Action: Google Workspace */}
          <div className="space-y-3 pt-2">
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full py-3 px-4 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 hover:border-slate-400 rounded-xl font-medium text-sm transition-all shadow-sm flex items-center justify-center gap-3 active:scale-[0.99] disabled:opacity-60"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {/* Google Icon */}
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
                  <span className="font-semibold text-slate-800">
                    Entrar com Google Workspace
                  </span>
                </>
              )}
            </button>

            {/* Domain constraint indicator */}
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 font-medium">
              <Lock className="w-3 h-3 text-indigo-600" />
              <span>Restrito a contas <strong className="text-indigo-600">@nextfit.com.br</strong></span>
            </div>
          </div>

          {/* Security details */}
          <div className="pt-4 border-t border-slate-100 space-y-2 text-[11px] text-slate-500">
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
              <span>Sessão privada: cada usuário acessa apenas seus relatórios e arquivos compartilhados.</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
              <span>Persistência corporativa segura sincronizada via Firebase Firestore.</span>
            </div>
          </div>
        </div>

        {/* Feature Highlights beneath login */}
        <div className="mt-12 grid sm:grid-cols-3 gap-6 w-full max-w-4xl text-left">
          <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center mb-3">
              <Lock className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight">
              Privacidade Absoluta
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Nenhum relatório é exposto publicamente sem autorização expressa. Acesso restrito aos colaboradores da Next Fit.
            </p>
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mb-3">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight">
              Relatórios de IA
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Suba arquivos HTML produzidos por Gemini, ChatGPT ou Claude e obtenha links corporativos instantâneos.
            </p>
          </div>

          <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center mb-3">
              <Users className="w-4 h-4" />
            </div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-tight">
              Controle de Whitelist
            </h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              Defina listas específicas de e-mails autorizados e senhas de acesso para documentos confidenciais.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-slate-400">
        Next Fit Reports • Sistema Corporativo de Hospedagem Segura • Next Fit © {new Date().getFullYear()}
      </footer>
    </div>
  );
}
