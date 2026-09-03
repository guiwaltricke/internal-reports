import { useState, useRef, ChangeEvent, DragEvent, FormEvent } from 'react';
import {
  X,
  UploadCloud,
  FileCode,
  Lock,
  Users,
  KeyRound,
  Link as LinkIcon,
  ShieldCheck,
  AlertCircle,
  Clock,
  Eye,
  Check,
} from 'lucide-react';
import { AccessType, ExpirationDuration, Report } from '../types';

interface ReportUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (report: Report) => void;
  currentUserEmail?: string;
}

export function ReportUploadModal({
  isOpen,
  onClose,
  onSuccess,
  currentUserEmail = 'guilherme@nextfit.com.br',
}: ReportUploadModalProps) {
  if (!isOpen) return null;

  // Tabs: 'upload' | 'paste'
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');

  // HTML Content & Metadata
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [slug, setSlug] = useState<string>('');
  const [tagsInput, setTagsInput] = useState<string>('IA, Relatório');

  // Security Settings
  const [accessType, setAccessType] = useState<AccessType>('authenticated_only');
  const [password, setPassword] = useState<string>('');
  const [allowedEmailsText, setAllowedEmailsText] = useState<string>(currentUserEmail);
  const [expiration, setExpiration] = useState<ExpirationDuration>('never');
  const [showWatermark, setShowWatermark] = useState<boolean>(true);
  const [allowDownload, setAllowDownload] = useState<boolean>(true);
  const [allowPrint, setAllowPrint] = useState<boolean>(true);

  // States
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Parse HTML for Title and details
  const processHtmlInput = (content: string, suggestedTitle = '') => {
    setHtmlContent(content);
    setErrorMsg('');

    // Extract title if not manually filled
    if (!title) {
      const match = content.match(/<title[^>]*>([^<]+)<\/title>/i);
      const detected = match ? match[1].trim() : suggestedTitle || 'Relatório Gerado por IA';
      setTitle(detected);

      // Auto generate slug
      const generatedSlug = detected
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .substring(0, 28);
      setSlug(generatedSlug);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
      setErrorMsg('Por favor, selecione um arquivo válido com extensão .html ou .htm');
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      processHtmlInput(content, file.name.replace(/\.[^/.]+$/, ''));
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.html') && !file.name.endsWith('.htm')) {
      setErrorMsg('O arquivo precisa ser em formato .html');
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      processHtmlInput(content, file.name.replace(/\.[^/.]+$/, ''));
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!htmlContent.trim()) {
      setErrorMsg('Adicione ou selecione um conteúdo HTML para o relatório.');
      return;
    }

    if (accessType === 'password_protected' && !password.trim()) {
      setErrorMsg('Defina uma senha de acesso para proteger este relatório.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      // Calculate expiration date
      let expiresAt: string | null = null;
      if (expiration === '24h') {
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      } else if (expiration === '7d') {
        expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (expiration === '30d') {
        expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      const allowedEmails = allowedEmailsText
        .split(/[\n,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean);

      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const payload = {
        title: title.trim() || 'Relatório Gerado por IA',
        description: description.trim(),
        htmlContent,
        slug: slug.trim() || undefined,
        tags,
        security: {
          accessType,
          password: accessType === 'password_protected' ? password.trim() : undefined,
          allowedEmails,
          expiresAt,
          active: true,
          showWatermark,
          allowDownload,
          allowPrint,
        },
      };

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('hostreport_token')
            ? { Authorization: `Bearer ${localStorage.getItem('hostreport_token')}` }
            : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao hospedar relatório');
      }

      onSuccess(data.report);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao publicar relatório');
    } finally {
      setIsSubmitting(false);
    }
  };

  const contentSizeKb = Math.round(new Blob([htmlContent]).size / 1024);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto text-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
              <UploadCloud className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Publicar Novo Relatório HTML</h2>
              <p className="text-xs text-slate-500">Hospedagem instantânea com link direto e controle de acesso</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Step 1: Input source */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                1. Selecione a Origem do Relatório HTML
              </label>
              {htmlContent && (
                <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> HTML Carregado ({contentSizeKb} KB)
                </span>
              )}
            </div>

            {/* Sub-tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 mb-3">
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`py-2 text-xs font-medium rounded-md flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'upload'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5 text-indigo-600" />
                Upload de Arquivo
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('paste')}
                className={`py-2 text-xs font-medium rounded-md flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'paste'
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <FileCode className="w-3.5 h-3.5 text-indigo-600" />
                Colar Código HTML
              </button>
            </div>

            {/* Tab 1: Drag and Drop */}
            {activeTab === 'upload' && (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50/60'
                    : 'border-slate-200 hover:border-indigo-400 bg-slate-50/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".html,.htm"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100 mx-auto flex items-center justify-center mb-3">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-slate-900 mb-1">
                  {fileName ? (
                    <span className="text-indigo-600 font-semibold">{fileName}</span>
                  ) : (
                    'Arraste o arquivo HTML ou clique para escolher'
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  Suporta arquivos .html gerados por ChatGPT, Claude, Gemini, DeepSeek ou scripts corporativos
                </p>
              </div>
            )}

            {/* Tab 2: Paste Raw HTML */}
            {activeTab === 'paste' && (
              <div>
                <textarea
                  value={htmlContent}
                  onChange={(e) => processHtmlInput(e.target.value)}
                  placeholder="<!DOCTYPE html><html><head><title>Meu Relatório</title>...</head><body>...</body></html>"
                  rows={6}
                  className="w-full bg-white border border-slate-200 rounded-xl p-3 font-mono text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <div className="flex justify-between text-[11px] text-slate-400 mt-1">
                  <span>Cole a estrutura HTML completa incluindo estilos CSS e tags</span>
                  <span>{htmlContent.length} caracteres</span>
                </div>
              </div>
            )}
          </div>

          {/* Step 2: Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Título da Publicação <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Diagnóstico Q3 - Resultados de IA"
                required
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Slug do Link Direto (/r/...)
              </label>
              <div className="flex rounded-lg overflow-hidden border border-slate-200 bg-white">
                <span className="px-2.5 py-2 text-xs text-slate-400 bg-slate-50 border-r border-slate-200 select-none font-medium">
                  /r/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) =>
                    setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                  }
                  placeholder="meu-relatorio-ia"
                  className="w-full bg-transparent px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Breve Descrição ou Contexto (Opcional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Documento para apresentação de metas ao comitê de inovação."
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Step 3: Security & Access Control */}
          <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">Ferramentas de Segurança & Controle de Acesso</h3>
                <p className="text-xs text-slate-500">
                  Configure quem pode abrir e visualizar as informações confidenciais do relatório
                </p>
              </div>
            </div>

            {/* Access Mode Grid */}
            <div className="grid sm:grid-cols-2 gap-3 pt-2">
              {/* Option 1: Authenticated Only */}
              <label
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  accessType === 'authenticated_only'
                    ? 'border-indigo-600 bg-white shadow-sm ring-1 ring-indigo-600'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="accessType"
                  value="authenticated_only"
                  checked={accessType === 'authenticated_only'}
                  onChange={() => setAccessType('authenticated_only')}
                  className="mt-1 text-indigo-600"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <Lock className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Usuários Autenticados (Recomendado)</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Apenas pessoas com login institucional ativo conseguem acessar a página.
                  </p>
                </div>
              </label>

              {/* Option 2: Email Whitelist */}
              <label
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  accessType === 'email_whitelist'
                    ? 'border-indigo-600 bg-white shadow-sm ring-1 ring-indigo-600'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="accessType"
                  value="email_whitelist"
                  checked={accessType === 'email_whitelist'}
                  onChange={() => setAccessType('email_whitelist')}
                  className="mt-1 text-indigo-600"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                    <span>Lista Específica de E-mails</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Permitir somente contas ou domínios específicos (ex: @empresa.com.br).
                  </p>
                </div>
              </label>

              {/* Option 3: Password */}
              <label
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  accessType === 'password_protected'
                    ? 'border-indigo-600 bg-white shadow-sm ring-1 ring-indigo-600'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="accessType"
                  value="password_protected"
                  checked={accessType === 'password_protected'}
                  onChange={() => setAccessType('password_protected')}
                  className="mt-1 text-indigo-600"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                    <span>Protegido com Senha</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Exige uma senha secreta para desbloquear o relatório antes da visualização.
                  </p>
                </div>
              </label>

              {/* Option 4: Public */}
              <label
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                  accessType === 'public_link'
                    ? 'border-indigo-600 bg-white shadow-sm ring-1 ring-indigo-600'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="accessType"
                  value="public_link"
                  checked={accessType === 'public_link'}
                  onChange={() => setAccessType('public_link')}
                  className="mt-1 text-indigo-600"
                />
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                    <LinkIcon className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Link Direto / Público</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Qualquer pessoa com o link gerado pode visualizar sem autenticação.
                  </p>
                </div>
              </label>
            </div>

            {/* Conditional fields based on accessType */}
            {accessType === 'password_protected' && (
              <div className="p-3 bg-white rounded-xl border border-amber-200 shadow-sm">
                <label className="block text-xs font-bold text-amber-900 mb-1.5">
                  Defina a Senha de Acesso ao Relatório <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite uma senha forte para este documento"
                  required
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs sm:text-sm text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            )}

            {accessType === 'email_whitelist' && (
              <div className="p-3 bg-white rounded-xl border border-blue-200 shadow-sm">
                <label className="block text-xs font-bold text-blue-900 mb-1.5">
                  E-mails ou Domínios Autorizados (separados por vírgula ou nova linha)
                </label>
                <textarea
                  value={allowedEmailsText}
                  onChange={(e) => setAllowedEmailsText(e.target.value)}
                  placeholder="guilherme@nextfit.com.br, @nextfit.com.br, diretor@empresa.com"
                  rows={2}
                  className="w-full bg-white border border-slate-200 rounded-lg p-2.5 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Dica: Você pode colocar um domínio inteiro como <code className="text-indigo-600 font-mono">@nextfit.com.br</code> para liberar todos os funcionários.
                </p>
              </div>
            )}

            {/* Additional Security Toggles */}
            <div className="pt-3 border-t border-slate-200 grid sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  Validade do Acesso
                </label>
                <select
                  value={expiration}
                  onChange={(e) => setExpiration(e.target.value as ExpirationDuration)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-indigo-500 shadow-sm"
                >
                  <option value="never">Sem Expiração (Permanente)</option>
                  <option value="24h">Expira em 24 Horas</option>
                  <option value="7d">Expira em 7 Dias</option>
                  <option value="30d">Expira em 30 Dias</option>
                </select>
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 hover:text-slate-900">
                  <input
                    type="checkbox"
                    checked={showWatermark}
                    onChange={(e) => setShowWatermark(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                  />
                  <span>Marca d'água dinâmica do visualizador</span>
                </label>

                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={allowDownload}
                      onChange={(e) => setAllowDownload(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    <span>Permitir download</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 hover:text-slate-900">
                    <input
                      type="checkbox"
                      checked={allowPrint}
                      onChange={(e) => setAllowPrint(e.target.checked)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-0"
                    />
                    <span>Permitir impressão</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Submit CTA */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors shadow-sm"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !htmlContent.trim()}
              className="px-6 py-2.5 text-xs sm:text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all active:scale-95 flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Publicando...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Publicar e Gerar Link Seguro</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
