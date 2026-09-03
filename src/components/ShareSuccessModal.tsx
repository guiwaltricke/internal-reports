import { useState } from 'react';
import {
  X,
  Check,
  Copy,
  ExternalLink,
  Shield,
  QrCode,
  Code,
  Lock,
  Users,
  KeyRound,
  Eye,
} from 'lucide-react';
import { Report } from '../types';

interface ShareSuccessModalProps {
  report: Report | null;
  isOpen: boolean;
  onClose: () => void;
  onPreview: (report: Report) => void;
}

export function ShareSuccessModal({ report, isOpen, onClose, onPreview }: ShareSuccessModalProps) {
  if (!isOpen || !report) return null;

  const [copied, setCopied] = useState<boolean>(false);
  const [showQr, setShowQr] = useState<boolean>(false);
  const [showEmbed, setShowEmbed] = useState<boolean>(false);

  const origin = window.location.origin;
  const hostedUrl = `${origin}/r/${report.slug || report.id}`;
  const embedCode = `<iframe src="${hostedUrl}" width="100%" height="700" frameborder="0" allowfullscreen></iframe>`;

  const handleCopy = () => {
    navigator.clipboard.writeText(hostedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const getSecurityBadge = () => {
    switch (report.security.accessType) {
      case 'authenticated_only':
        return {
          icon: <Lock className="w-3.5 h-3.5 text-indigo-600" />,
          label: 'Apenas Usuários Autenticados',
          color: 'bg-indigo-50 text-indigo-700 border-indigo-100',
          desc: 'Somente pessoas logadas na plataforma têm permissão de acesso.',
        };
      case 'email_whitelist':
        return {
          icon: <Users className="w-3.5 h-3.5 text-blue-600" />,
          label: `Whitelist (${report.security.allowedEmails.length} e-mails)`,
          color: 'bg-blue-50 text-blue-700 border-blue-100',
          desc: `Acesso restrito aos endereços: ${report.security.allowedEmails.join(', ')}`,
        };
      case 'password_protected':
        return {
          icon: <KeyRound className="w-3.5 h-3.5 text-amber-600" />,
          label: 'Protegido por Senha',
          color: 'bg-amber-50 text-amber-800 border-amber-100',
          desc: 'Exige a senha cadastrada para desbloquear o relatório.',
        };
      default:
        return {
          icon: <Shield className="w-3.5 h-3.5 text-emerald-600" />,
          label: 'Link Público Direto',
          color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
          desc: 'Acesso imediato para qualquer pessoa em posse deste link.',
        };
    }
  };

  const sec = getSecurityBadge();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden p-6 space-y-5 text-slate-900">
        {/* Title */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center">
              <Check className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Relatório Publicado com Sucesso!</h3>
              <p className="text-xs text-slate-500">Link de hospedagem gerado e pronto para compartilhamento</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Report Info */}
        <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
          <div className="text-xs text-slate-500 mb-1">Documento Hospedado:</div>
          <div className="text-sm font-semibold text-slate-900 truncate">{report.title}</div>
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-bold border ${sec.color}`}
            >
              {sec.icon}
              {sec.label}
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              {Math.round(report.fileSize / 1024)} KB • Criado agora
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">{sec.desc}</p>
        </div>

        {/* Copy Link Input Bar */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Link Público de Visualização
          </label>
          <div className="flex rounded-lg overflow-hidden border border-slate-200 bg-white p-1 shadow-sm">
            <input
              type="text"
              readOnly
              value={hostedUrl}
              className="flex-1 bg-transparent px-3 py-2 text-xs font-mono text-slate-700 focus:outline-none select-all"
            />
            <button
              onClick={handleCopy}
              className={`px-4 py-2 text-xs font-semibold rounded-md flex items-center gap-1.5 transition-all ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copiado!' : 'Copiar Link'}
            </button>
          </div>
        </div>

        {/* Secondary options (QR Code, Embed) */}
        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
          <div className="flex gap-2">
            <button
              onClick={() => setShowQr(!showQr)}
              className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <QrCode className="w-3.5 h-3.5 text-slate-500" />
              <span>{showQr ? 'Ocultar QR' : 'Ver QR Code'}</span>
            </button>
            <button
              onClick={() => setShowEmbed(!showEmbed)}
              className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-slate-900 flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Code className="w-3.5 h-3.5 text-slate-500" />
              <span>{showEmbed ? 'Ocultar Embed' : 'Código Embed'}</span>
            </button>
          </div>

          <button
            onClick={() => onPreview(report)}
            className="text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Pré-visualizar</span>
          </button>
        </div>

        {/* QR Code view */}
        {showQr && (
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center flex flex-col items-center">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                hostedUrl
              )}`}
              alt="QR Code do Relatório"
              className="w-40 h-40 rounded border border-slate-200"
            />
            <span className="text-[11px] text-slate-600 font-medium mt-2">
              Aponte a câmera do celular para abrir o relatório
            </span>
          </div>
        )}

        {/* Embed code view */}
        {showEmbed && (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] font-semibold text-slate-700">Código HTML &lt;iframe&gt;</span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(embedCode);
                }}
                className="text-[10px] text-indigo-600 font-medium hover:underline"
              >
                Copiar Embed
              </button>
            </div>
            <textarea
              readOnly
              value={embedCode}
              rows={2}
              className="w-full bg-white border border-slate-200 rounded p-2 text-[11px] font-mono text-slate-800"
            />
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-sm"
          >
            Fechar
          </button>
          <a
            href={hostedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
          >
            <span>Abrir Página Publicada</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
