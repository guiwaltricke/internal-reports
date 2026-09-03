import { Shield, Plus, User as UserIcon, LogOut, Lock } from 'lucide-react';
import { User } from '../types';

interface HeaderProps {
  currentUser: User | null;
  onOpenUpload: () => void;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export function Header({ currentUser, onOpenUpload, onOpenAuth, onLogout }: HeaderProps) {
  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg text-slate-900 tracking-tight">
                Next Fit<span className="text-indigo-600"> Reports</span>
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                Workspace
              </span>
            </div>
            <p className="text-xs text-slate-500 hidden sm:block">
              Hospedagem & Compartilhamento Corporativo de Relatórios HTML
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {currentUser ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.name}
                    className="w-6 h-6 rounded-full object-cover border border-slate-200"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div
                    className="w-6 h-6 rounded-full text-white flex items-center justify-center font-bold text-[11px]"
                    style={{ backgroundColor: currentUser.avatarColor || '#4f46e5' }}
                  >
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                )}

                <div className="hidden sm:block text-left leading-tight">
                  <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                    <span>{currentUser.name}</span>
                    {currentUser.role === 'admin' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700">
                        ADMIN
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono">{currentUser.email}</div>
                </div>
              </div>

              <button
                onClick={onLogout}
                title="Sair da conta"
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors border border-transparent hover:border-slate-200"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-sm"
            >
              <UserIcon className="w-3.5 h-3.5 text-slate-500" />
              <span>Entrar</span>
            </button>
          )}

          {currentUser && (
            <button
              onClick={onOpenUpload}
              id="btn-new-report"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-all active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Publicar Relatório</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
