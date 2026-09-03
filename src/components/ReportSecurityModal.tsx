import { useState, FormEvent } from 'react';
import {
  X,
  Shield,
  Lock,
  Users,
  KeyRound,
  Link as LinkIcon,
  Clock,
  Save,
  PauseCircle,
  PlayCircle,
  Trash2,
} from 'lucide-react';
import { AccessType, ExpirationDuration, Report } from '../types';

interface ReportSecurityModalProps {
  report: Report | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedReport: Report) => void;
  onDelete: (reportId: string) => void;
}

export function ReportSecurityModal({
  report,
  isOpen,
  onClose,
  onSave,
  onDelete,
}: ReportSecurityModalProps) {
  if (!isOpen || !report) return null;

  const [accessType, setAccessType] = useState<AccessType>(report.security.accessType);
  const [password, setPassword] = useState<string>(report.security.password || '');
  const [allowedEmailsText, setAllowedEmailsText] = useState<string>(
    report.security.allowedEmails.join(', ')
  );
  const [active, setActive] = useState<boolean>(report.security.active);
  const [showWatermark, setShowWatermark] = useState<boolean>(report.security.showWatermark);
  const [allowDownload, setAllowDownload] = useState<boolean>(report.security.allowDownload);
  const [allowPrint, setAllowPrint] = useState<boolean>(report.security.allowPrint);
  const [expiration, setExpiration] = useState<ExpirationDuration>(
    report.security.expiresAt ? '24h' : 'never'
  );

  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg('');

    try {
      let expiresAt: string | null = report.security.expiresAt;
      if (expiration === 'never') expiresAt = null;
      else if (expiration === '24h') expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      else if (expiration === '7d') expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      else if (expiration === '30d') expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const allowedEmails = allowedEmailsText
        .split(/[\n,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      const payload = {
        security: {
          accessType,
          password: accessType === 'password_protected' ? password.trim() : undefined,
          allowedEmails,
          expiresAt,
          active,
          showWatermark,
          allowDownload,
          allowPrint,
        },
      };

      const res = await fetch(`/api/reports/${report.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('hostreport_token')
            ? { Authorization: `Bearer ${localStorage.getItem('hostreport_token')}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar alterações');

      onSave(data.report);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao atualizar');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden p-6 space-y-5 my-auto text-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Configurar Segurança do Relatório</h3>
              <p className="text-xs text-slate-500 truncate max-w-sm">{report.title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          {/* Quick Active/Paused status switch */}
          <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
            <div>
              <div className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                {active ? (
                  <PlayCircle className="w-4 h-4 text-emerald-600" />
                ) : (
                  <PauseCircle className="w-4 h-4 text-amber-600" />
                )}
                <span>Status da Publicação: {active ? 'Ativo (Online)' : 'Pausado (Acesso Bloqueado)'}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {active
                  ? 'O link está funcionando normalmente conforme as regras abaixo.'
                  : 'Nenhum usuário consegue visualizar o relatório enquanto pausado.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActive(!active)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                active
                  ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              {active ? 'Pausar Acesso' : 'Reativar Link'}
            </button>
          </div>

          {/* Access Mode selection */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">Modo de Autenticação</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <label
                className={`p-3 rounded-xl border cursor-pointer flex items-center gap-2.5 text-xs transition-all ${
                  accessType === 'authenticated_only'
                    ? 'border-indigo-600 bg-white text-slate-900 ring-1 ring-indigo-600 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="modalAccessType"
                  checked={accessType === 'authenticated_only'}
                  onChange={() => setAccessType('authenticated_only')}
                  className="text-indigo-600"
                />
                <Lock className="w-3.5 h-3.5 text-indigo-600" />
                <span className="font-medium">Usuários Autenticados</span>
              </label>

              <label
                className={`p-3 rounded-xl border cursor-pointer flex items-center gap-2.5 text-xs transition-all ${
                  accessType === 'email_whitelist'
                    ? 'border-indigo-600 bg-white text-slate-900 ring-1 ring-indigo-600 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="modalAccessType"
                  checked={accessType === 'email_whitelist'}
                  onChange={() => setAccessType('email_whitelist')}
                  className="text-indigo-600"
                />
                <Users className="w-3.5 h-3.5 text-blue-600" />
                <span className="font-medium">Whitelist de E-mails</span>
              </label>

              <label
                className={`p-3 rounded-xl border cursor-pointer flex items-center gap-2.5 text-xs transition-all ${
                  accessType === 'password_protected'
                    ? 'border-indigo-600 bg-white text-slate-900 ring-1 ring-indigo-600 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="modalAccessType"
                  checked={accessType === 'password_protected'}
                  onChange={() => setAccessType('password_protected')}
                  className="text-indigo-600"
                />
                <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                <span className="font-medium">Protegido por Senha</span>
              </label>

              <label
                className={`p-3 rounded-xl border cursor-pointer flex items-center gap-2.5 text-xs transition-all ${
                  accessType === 'public_link'
                    ? 'border-indigo-600 bg-white text-slate-900 ring-1 ring-indigo-600 shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="modalAccessType"
                  checked={accessType === 'public_link'}
                  onChange={() => setAccessType('public_link')}
                  className="text-indigo-600"
                />
                <LinkIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span className="font-medium">Link Público</span>
              </label>
            </div>
          </div>

          {/* Conditional inputs */}
          {accessType === 'password_protected' && (
            <div className="p-3 bg-white rounded-xl border border-amber-200 shadow-sm">
              <label className="block text-xs font-bold text-amber-900 mb-1">
                Nova Senha de Acesso
              </label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Deixe em branco para manter a atual"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {accessType === 'email_whitelist' && (
            <div className="p-3 bg-white rounded-xl border border-blue-200 shadow-sm">
              <label className="block text-xs font-bold text-blue-900 mb-1">
                E-mails ou Domínios Autorizados
              </label>
              <input
                type="text"
                value={allowedEmailsText}
                onChange={(e) => setAllowedEmailsText(e.target.value)}
                placeholder="guilherme@nextfit.com.br, @empresa.com"
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500"
              />
            </div>
          )}

          {/* Expiration & Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
            <div>
              <label className="block font-medium text-slate-700 mb-1 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Validade / Expiração
              </label>
              <select
                value={expiration}
                onChange={(e) => setExpiration(e.target.value as ExpirationDuration)}
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 shadow-sm"
              >
                <option value="never">Sem Expiração</option>
                <option value="24h">24 Horas a partir de agora</option>
                <option value="7d">7 Dias a partir de agora</option>
                <option value="30d">30 Dias a partir de agora</option>
              </select>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="flex items-center gap-2 cursor-pointer text-slate-700 hover:text-slate-900">
                <input
                  type="checkbox"
                  checked={showWatermark}
                  onChange={(e) => setShowWatermark(e.target.checked)}
                  className="rounded text-indigo-600 border-slate-300"
                />
                <span>Marca d'água de auditoria</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-slate-700 hover:text-slate-900">
                <input
                  type="checkbox"
                  checked={allowDownload}
                  onChange={(e) => setAllowDownload(e.target.checked)}
                  className="rounded text-indigo-600 border-slate-300"
                />
                <span>Permitir download do HTML</span>
              </label>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                if (confirm(`Tem certeza que deseja remover o relatório "${report.title}"?`)) {
                  onDelete(report.id);
                  onClose();
                }
              }}
              className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir Relatório</span>
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 shadow-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Salvar Alterações</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
