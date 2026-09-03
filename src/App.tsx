import { useState, useEffect, useMemo } from 'react';
import {
  Shield,
  UploadCloud,
  FileCode,
  Search,
  Filter,
  Lock,
  Users,
  KeyRound,
  Eye,
  CheckCircle2,
  Sparkles,
  ExternalLink,
  UserCheck,
} from 'lucide-react';
import { Header } from './components/Header';
import { LoginPage } from './components/LoginPage';
import { ReportUploadModal } from './components/ReportUploadModal';
import { ReportCard } from './components/ReportCard';
import { ShareSuccessModal } from './components/ShareSuccessModal';
import { ReportSecurityModal } from './components/ReportSecurityModal';
import { ReportPreviewModal } from './components/ReportPreviewModal';
import { AuthModal } from './components/AuthModal';
import { api } from './services/api';
import {
  onFirebaseAuthStateChanged,
  signOutFromFirebase,
  saveReportToFirestore,
  deleteReportFromFirestore,
} from './services/firebase';
import { Report, User, AccessType } from './types';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAccessFilter, setSelectedAccessFilter] = useState<string>('all');
  const [ownershipFilter, setOwnershipFilter] = useState<'all' | 'mine' | 'shared'>('all');

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState<boolean>(false);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [shareSuccessReport, setShareSuccessReport] = useState<Report | null>(null);
  const [securityModalReport, setSecurityModalReport] = useState<Report | null>(null);
  const [previewReport, setPreviewReport] = useState<Report | null>(null);

  // Initial load & Auth Listener
  useEffect(() => {
    let unsubscribeFirebase: (() => void) | undefined;

    async function init() {
      setIsLoading(true);
      try {
        const user = await api.getCurrentUser();
        if (user) {
          setCurrentUser(user);
          const data = await api.getReports();
          setReports(data.reports);
        } else {
          // Listen to Firebase auth state
          unsubscribeFirebase = onFirebaseAuthStateChanged(async (fbUser) => {
            if (fbUser && fbUser.email?.toLowerCase().endsWith('@nextfit.com.br')) {
              try {
                const idToken = await fbUser.getIdToken();
                const appUser: User = {
                  id: fbUser.uid,
                  email: fbUser.email.toLowerCase(),
                  name: fbUser.displayName || fbUser.email.split('@')[0],
                  photoURL: fbUser.photoURL || undefined,
                  role: fbUser.email.includes('admin') || fbUser.email.startsWith('guilherme') ? 'admin' : 'member',
                  createdAt: new Date().toISOString(),
                  avatarColor: '#4f46e5',
                };
                const serverAuth = await api.syncGoogleUser(appUser, idToken);
                setCurrentUser(serverAuth.user);
                const data = await api.getReports();
                setReports(data.reports);
              } catch (e) {
                console.error('Erro na sincronização Firebase/Google:', e);
              }
            }
          });
        }
      } catch (err) {
        console.error('Erro na inicialização:', err);
      } finally {
        setIsLoading(false);
      }
    }

    init();

    return () => {
      if (unsubscribeFirebase) unsubscribeFirebase();
    };
  }, []);

  const handleLoginSuccess = async (user: User) => {
    setCurrentUser(user);
    try {
      const data = await api.getReports();
      setReports(data.reports);
    } catch (e) {
      console.error('Erro ao buscar relatórios após login:', e);
    }
  };

  const handleLogout = async () => {
    try {
      await signOutFromFirebase();
    } catch (e) {
      // ignore
    }
    await api.logout();
    setCurrentUser(null);
    setReports([]);
  };

  const handleUploadSuccess = async (newReport: Report) => {
    setReports((prev) => [newReport, ...prev]);
    setShareSuccessReport(newReport);
    // Persist in cloud Firestore database
    await saveReportToFirestore(newReport);
  };

  const handleSecuritySaved = async (updated: Report) => {
    setReports((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    await saveReportToFirestore(updated);
  };

  const handleDeleteReport = async (reportId: string) => {
    try {
      await api.deleteReport(reportId);
      await deleteReportFromFirestore(reportId);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
    } catch (err: any) {
      alert(err.message || 'Erro ao remover relatório.');
    }
  };

  const handleToggleActive = async (report: Report) => {
    try {
      const updated = await api.updateReport(report.id, {
        security: { ...report.security, active: !report.security.active },
      });
      handleSecuritySaved(updated);
    } catch (err) {
      alert('Erro ao atualizar status.');
    }
  };

  // Deterministic browser fingerprint calculation for session audit
  const browserFingerprint = useMemo(() => {
    try {
      const nav = window.navigator;
      const scr = window.screen;
      const raw = [
        nav.userAgent,
        nav.language,
        `${scr.width}x${scr.height}`,
        scr.colorDepth,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        (nav as any).hardwareConcurrency || '',
        (nav as any).platform || '',
      ].join('###');

      let hash = 0;
      for (let i = 0; i < raw.length; i++) {
        hash = (hash << 5) - hash + raw.charCodeAt(i);
        hash |= 0;
      }
      const hex = Math.abs(hash).toString(16).padStart(8, '0').toUpperCase();
      return `FP-${hex}`;
    } catch {
      return 'FP-NEXTFIT-BROWSER';
    }
  }, []);

  // Filtered reports calculation
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      const matchesSearch =
        r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.slug.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.description?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesAccessFilter =
        selectedAccessFilter === 'all' || r.security.accessType === selectedAccessFilter;

      const matchesOwnership =
        ownershipFilter === 'all' ||
        (ownershipFilter === 'mine' && (r.isOwner || r.ownerId === currentUser?.id)) ||
        (ownershipFilter === 'shared' && !r.isOwner && r.ownerId !== currentUser?.id);

      return matchesSearch && matchesAccessFilter && matchesOwnership;
    });
  }, [reports, searchQuery, selectedAccessFilter, ownershipFilter, currentUser]);

  // Key metrics
  const totalViews = reports.reduce((acc, curr) => acc + (curr.viewsCount || 0), 0);
  const myReportsCount = reports.filter((r) => r.isOwner || r.ownerId === currentUser?.id).length;
  const protectedCount = reports.filter(
    (r) => r.security.accessType !== 'public_link'
  ).length;

  // If initial load is checking session
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <span className="text-sm font-semibold text-slate-800">Carregando Next Fit Reports...</span>
        <span className="text-xs text-slate-400 mt-1">Verificando credenciais corporativas</span>
      </div>
    );
  }

  // If user is not authenticated, present the dedicated Google Workspace Login Page
  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Navigation Header */}
      <Header
        currentUser={currentUser}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* User Session Banner */}
        <section className="bg-indigo-900 text-white rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {currentUser.photoURL ? (
              <img
                src={currentUser.photoURL}
                alt={currentUser.name}
                className="w-12 h-12 rounded-xl object-cover border-2 border-white/20 shadow-sm"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-xl bg-indigo-700 border-2 border-white/20 flex items-center justify-center text-lg font-bold text-white shadow-sm"
              >
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight">
                  Olá, {currentUser.name}!
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-indigo-800 border border-indigo-700 text-indigo-200">
                  {currentUser.role === 'admin' ? 'Administrador' : 'Colaborador'}
                </span>
              </div>
              <p className="text-xs text-indigo-200 mt-0.5">
                Sessão ativa: <span className="font-mono text-white">{currentUser.email}</span> • Banco de dados corporativo Firestore
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end">
            <button
              onClick={() => setIsUploadOpen(true)}
              className="px-4 py-2 bg-white text-indigo-950 hover:bg-slate-100 rounded-xl font-semibold text-xs transition-all shadow-sm flex items-center gap-2"
            >
              <UploadCloud className="w-4 h-4 text-indigo-600" />
              <span>Novo Relatório</span>
            </button>
          </div>
        </section>

        {/* Clean Minimalism Hero Section */}
        <section className="bg-white border border-slate-200 rounded-xl p-8 sm:p-10 flex flex-col items-center justify-center border-dashed border-2 hover:border-indigo-400 transition-colors shadow-sm text-center">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm border border-indigo-100">
            <UploadCloud className="w-8 h-8" />
          </div>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-xs text-indigo-700 font-semibold mb-3">
            <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
            <span>Next Fit Reports • Hospedagem Corporativa</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mb-2">
            Hospede seus relatórios HTML gerados por IA
          </h1>

          <p className="text-sm text-slate-500 max-w-lg mb-6 leading-relaxed">
            Gere instantaneamente um link corporativo protegido para relatórios criados em ChatGPT, Claude ou Gemini.
            Restrinja o acesso exclusivamente a usuários autenticados da Next Fit.
          </p>

          {/* Action buttons */}
          <div className="flex items-center justify-center">
            <button
              onClick={() => setIsUploadOpen(true)}
              className="px-6 py-2.5 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 transition-all shadow-sm active:scale-95 flex items-center gap-2 text-sm"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Selecionar Arquivo HTML</span>
            </button>
          </div>

          {/* Quick trust indicators */}
          <div className="mt-8 pt-6 border-t border-slate-100 w-full max-w-md flex items-center justify-center gap-6 text-xs text-slate-500">
            <span className="flex items-center gap-1.5 font-medium">
              <div className="w-2 h-2 rounded-full bg-emerald-500" /> Link Protegido
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <div className="w-2 h-2 rounded-full bg-blue-500" /> Firebase Firestore
            </span>
            <span className="flex items-center gap-1.5 font-medium">
              <div className="w-2 h-2 rounded-full bg-indigo-500" /> @nextfit.com.br
            </span>
          </div>
        </section>

        {/* Metric Cards */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">
              Seus Relatórios
            </div>
            <div className="text-2xl font-bold text-slate-900">{myReportsCount}</div>
            <div className="text-[11px] text-slate-500 mt-1">Criados por você</div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">
              Acesso Protegido
            </div>
            <div className="text-2xl font-bold text-indigo-600">
              {protectedCount} <span className="text-sm font-normal text-slate-400">/ {reports.length}</span>
            </div>
            <div className="text-[11px] text-indigo-600 font-medium mt-1">Autenticação Corporativa</div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">
              Visualizações Auditadas
            </div>
            <div className="text-2xl font-bold text-emerald-600">{totalViews}</div>
            <div className="text-[11px] text-emerald-600 font-medium mt-1">Leituras registradas com log</div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-1">
              Tempo de Publicação
            </div>
            <div className="text-2xl font-bold text-slate-900">&lt; 1s</div>
            <div className="text-[11px] text-slate-500 mt-1">Disponibilização instantânea</div>
          </div>
        </section>

        {/* Reports Management Section */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <span>Relatórios Disponíveis ({filteredReports.length})</span>
                <span className="text-xs font-normal text-slate-500">
                  (Privacidade por usuário garantida)
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Gerencie links, visualize métricas de acesso e configure permissões de sigilo
              </p>
            </div>

            {/* Ownership & Access Filters */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {/* Ownership filter */}
              <div className="flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200">
                <button
                  onClick={() => setOwnershipFilter('all')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                    ownershipFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setOwnershipFilter('mine')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                    ownershipFilter === 'mine'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Meus Documentos
                </button>
                <button
                  onClick={() => setOwnershipFilter('shared')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                    ownershipFilter === 'shared'
                      ? 'bg-white text-slate-900 shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Compartilhados
                </button>
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  onClick={() => setSelectedAccessFilter('all')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    selectedAccessFilter === 'all'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Todos ({reports.length})
                </button>
                <button
                  onClick={() => setSelectedAccessFilter('authenticated_only')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                    selectedAccessFilter === 'authenticated_only'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Lock className="w-3 h-3 text-indigo-600" />
                  Autenticados
                </button>
                <button
                  onClick={() => setSelectedAccessFilter('email_whitelist')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                    selectedAccessFilter === 'email_whitelist'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Users className="w-3 h-3 text-blue-600" />
                  Whitelist
                </button>
                <button
                  onClick={() => setSelectedAccessFilter('password_protected')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors flex items-center gap-1 ${
                    selectedAccessFilter === 'password_protected'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:text-slate-900 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <KeyRound className="w-3 h-3 text-amber-600" />
                  Com Senha
                </button>
              </div>
            </div>
          </div>

          {/* Search Input Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por título, slug (/r/...) ou palavras-chave..."
              className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 shadow-sm"
            />
          </div>

          {/* Reports Grid */}
          {filteredReports.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredReports.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  onPreview={(rep) => setPreviewReport(rep)}
                  onManageSecurity={(rep) => setSecurityModalReport(rep)}
                  onToggleActive={handleToggleActive}
                  onDelete={handleDeleteReport}
                />
              ))}
            </div>
          ) : (
            /* Empty State */
            <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-xl bg-white p-8 space-y-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center border border-indigo-100">
                <FileCode className="w-6 h-6" />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-sm font-semibold text-slate-900">
                  {ownershipFilter === 'mine'
                    ? 'Você ainda não publicou relatórios próprios'
                    : 'Nenhum relatório encontrado'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {searchQuery
                    ? 'Nenhum resultado corresponde à sua busca atual.'
                    : 'Suba um arquivo HTML gerado por IA para gerar o primeiro link seguro da sua sessão.'}
                </p>
              </div>
              <div className="flex items-center justify-center pt-2">
                <button
                  onClick={() => setIsUploadOpen(true)}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Subir Arquivo HTML</span>
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Rodapé da área logada: apenas fingerprint do navegador logado e nome do produto, nada mais */}
      <footer className="border-t border-slate-200 bg-white py-3 px-4 text-center text-xs text-slate-500 font-mono">
        Next Fit Reports • Fingerprint: {browserFingerprint}
      </footer>

      {/* Modals */}
      <ReportUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={handleUploadSuccess}
        currentUserEmail={currentUser.email}
      />

      <ShareSuccessModal
        isOpen={!!shareSuccessReport}
        report={shareSuccessReport}
        onClose={() => setShareSuccessReport(null)}
        onPreview={(rep) => {
          setShareSuccessReport(null);
          setPreviewReport(rep);
        }}
      />

      <ReportSecurityModal
        isOpen={!!securityModalReport}
        report={securityModalReport}
        onClose={() => setSecurityModalReport(null)}
        onSave={handleSecuritySaved}
        onDelete={handleDeleteReport}
      />

      <ReportPreviewModal
        isOpen={!!previewReport}
        report={previewReport}
        onClose={() => setPreviewReport(null)}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSuccess={(user) => {
          handleLoginSuccess(user);
        }}
      />
    </div>
  );
}
