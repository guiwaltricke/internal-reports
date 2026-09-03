import { useState } from 'react';
import {
  X,
  ExternalLink,
  Monitor,
  Tablet,
  Smartphone,
  Shield,
  Lock,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { Report } from '../types';

interface ReportPreviewModalProps {
  report: Report | null;
  isOpen: boolean;
  onClose: () => void;
}

export function ReportPreviewModal({ report, isOpen, onClose }: ReportPreviewModalProps) {
  if (!isOpen || !report) return null;

  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [viewMode, setViewMode] = useState<'authenticated' | 'gate_simulation'>('authenticated');
  const [reloadKey, setReloadKey] = useState<number>(0);

  const hostedUrl = `/r/${report.slug || report.id}`;
  // For simulation of unauthenticated view, pass simulated param
  const iframeSrc =
    viewMode === 'authenticated'
      ? hostedUrl
      : `${hostedUrl}?simulate_guest=1`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-6xl h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Control Bar */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center shrink-0">
              <Eye className="w-4 h-4" />
            </div>
            <div className="truncate">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 truncate">{report.title}</h3>
              <p className="text-[11px] text-slate-500 truncate">
                Link: <span className="font-mono text-indigo-600 font-medium">{hostedUrl}</span>
              </p>
            </div>
          </div>

          {/* Center: Device Switchers */}
          <div className="hidden md:flex items-center gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200">
            <button
              onClick={() => setDevice('desktop')}
              className={`p-1.5 rounded-md text-xs flex items-center gap-1.5 transition-all ${
                device === 'desktop'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Visão Desktop"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span className="text-[11px]">Desktop</span>
            </button>
            <button
              onClick={() => setDevice('tablet')}
              className={`p-1.5 rounded-md text-xs flex items-center gap-1.5 transition-all ${
                device === 'tablet'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Visão Tablet (768px)"
            >
              <Tablet className="w-3.5 h-3.5" />
              <span className="text-[11px]">Tablet</span>
            </button>
            <button
              onClick={() => setDevice('mobile')}
              className={`p-1.5 rounded-md text-xs flex items-center gap-1.5 transition-all ${
                device === 'mobile'
                  ? 'bg-white text-slate-900 shadow-sm font-semibold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
              title="Visão Celular (375px)"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="text-[11px]">Mobile</span>
            </button>
          </div>

          {/* Right Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setReloadKey((prev) => prev + 1)}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors"
              title="Recarregar Prévia"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <a
              href={hostedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <span>Abrir em Nova Aba</span>
              <ExternalLink className="w-3 h-3" />
            </a>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Device Container Frame */}
        <div className="flex-1 bg-slate-100 p-3 sm:p-6 flex items-center justify-center overflow-auto">
          <div
            className={`transition-all duration-300 h-full rounded-xl overflow-hidden shadow-md border border-slate-300/80 bg-white ${
              device === 'desktop'
                ? 'w-full'
                : device === 'tablet'
                ? 'w-[768px] max-w-full'
                : 'w-[375px] max-w-full'
            }`}
          >
            <iframe
              key={reloadKey}
              src={iframeSrc}
              title={report.title}
              className="w-full h-full border-none"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-downloads"
            />
          </div>
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-indigo-600" />
            <span>
              Segurança: <strong className="text-slate-800">{report.security.accessType}</strong> • {report.viewsCount} visualizações
            </span>
          </div>
          <div>Visualização renderizada isoladamente com sandbox e suporte a CSS/JS inline</div>
        </div>
      </div>
    </div>
  );
}
