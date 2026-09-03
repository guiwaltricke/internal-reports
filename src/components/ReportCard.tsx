import { useState } from 'react';
import {
  Lock,
  Users,
  KeyRound,
  Link as LinkIcon,
  Copy,
  Check,
  ExternalLink,
  Shield,
  Eye,
  Settings,
  Clock,
  FileText,
  PauseCircle,
  PlayCircle,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { Report } from '../types';

interface ReportCardProps {
  key?: string;
  report: Report;
  onPreview: (report: Report) => void;
  onManageSecurity: (report: Report) => void;
  onToggleActive: (report: Report) => void;
  onDelete: (reportId: string) => void;
}

export function ReportCard({
  report,
  onPreview,
  onManageSecurity,
  onToggleActive,
  onDelete,
}: ReportCardProps) {
  const [copied, setCopied] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  const origin = window.location.origin;
  const publicUrl = `${origin}/r/${report.slug || report.id}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(report.id);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const getSecurityInfo = () => {
    switch (report.security.accessType) {
      case 'authenticated_only':
        return {
          icon: <Lock className="w-3.5 h-3.5" />,
          label: 'Apenas Autenticados',
          color: 'bg-indigo-50 text-indigo-700 border-indigo-100',
        };
      case 'email_whitelist':
        return {
          icon: <Users className="w-3.5 h-3.5" />,
          label: `Whitelist (${report.security.allowedEmails.length})`,
          color: 'bg-blue-50 text-blue-700 border-blue-100',
        };
      case 'password_protected':
        return {
          icon: <KeyRound className="w-3.5 h-3.5" />,
          label: 'Com Senha',
          color: 'bg-amber-50 text-amber-800 border-amber-100',
        };
      default:
        return {
          icon: <LinkIcon className="w-3.5 h-3.5" />,
          label: 'Link Público',
          color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        };
    }
  };

  const sec = getSecurityInfo();
  const isExpired =
    report.security.expiresAt && new Date(report.security.expiresAt).getTime() < Date.now();

  const formattedDate = new Date(report.createdAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  return (
    <div className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-5 flex flex-col justify-between transition-all duration-200 group shadow-sm hover:shadow">
      <div>
        {/* Top Badges & Status */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded ${sec.color} border`}
            >
              {sec.icon}
              {sec.label}
            </span>

            {report.isOwner ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                Seu Documento
              </span>
            ) : report.ownerEmail ? (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                {report.ownerName || report.ownerEmail.split('@')[0]}
              </span>
            ) : null}

            {isExpired ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-100 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Expirado
              </span>
            ) : !report.security.active ? (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                <PauseCircle className="w-3 h-3" /> Pausado
              </span>
            ) : (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                Online
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              <span>{report.viewsCount} views</span>
            </div>
            {report.isOwner !== false && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                title="Excluir este relatório"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Delete Confirmation Box */}
        {showDeleteConfirm && (
          <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs space-y-2">
            <div className="flex items-center gap-1.5 text-red-800 font-semibold">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>Confirmar exclusão do relatório?</span>
            </div>
            <p className="text-red-700 text-[11px] leading-tight">
              O link corporativo e o arquivo HTML serão removidos permanentemente.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-2.5 py-1 text-[11px] font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors flex items-center gap-1 shadow-sm"
              >
                <Trash2 className="w-3 h-3" />
                {isDeleting ? 'Excluindo...' : 'Excluir Definitivamente'}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteConfirm(false)}
                className="px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-colors shadow-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Title & Description */}
        <h3 className="text-sm font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1 mb-1">
          {report.title}
        </h3>

        {report.description ? (
          <p className="text-xs text-slate-500 line-clamp-2 mb-3">{report.description}</p>
        ) : (
          <p className="text-xs text-slate-400 italic mb-3">Sem descrição adicional fornecida</p>
        )}

        {/* Slug URL Bar with quick copy */}
        <div className="flex items-center justify-between gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200 mb-4">
          <div className="flex items-center gap-1.5 overflow-hidden text-xs">
            <LinkIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-mono text-[11px] text-slate-600 truncate">
              /r/{report.slug || report.id}
            </span>
          </div>
          <button
            onClick={handleCopy}
            className={`p-1.5 rounded-md text-xs font-medium transition-colors shrink-0 ${
              copied
                ? 'bg-emerald-100 text-emerald-800'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
            title="Copiar Link de Hospedagem"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Footer Info & Actions */}
      <div className="pt-3 border-t border-slate-100">
        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-3 font-medium">
          <span>{Math.round(report.fileSize / 1024)} KB</span>
          <span>{formattedDate}</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => onPreview(report)}
            className="py-1.5 px-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          >
            <Eye className="w-3.5 h-3.5 text-indigo-600" />
            <span>Prévia</span>
          </button>

          <button
            onClick={() => onManageSecurity(report)}
            className="py-1.5 px-2 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          >
            <Settings className="w-3.5 h-3.5 text-slate-500" />
            <span>Acesso</span>
          </button>

          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="py-1.5 px-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center justify-center gap-1.5 transition-colors shadow-sm"
          >
            <span>Abrir</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  );
}
