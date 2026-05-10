import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  History, 
  User, 
  LogOut, 
  FileText, 
  Upload, 
  Activity, 
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Info
} from 'lucide-react';
import { auth, db } from './firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs, 
  addDoc, 
  doc,
  getDoc
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeBloodReport } from './services/geminiService';
import { AnalysisResult, HealthReport } from './types';
import { handleFirestoreError, OperationType } from './lib/firestore-errors';

export default function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [reports, setReports] = useState<HealthReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedReport, setSelectedReport] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    if (!auth.currentUser) return;
    try {
      const q = query(
        collection(db, 'reports'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const fetchedReports = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as HealthReport[];
      setReports(fetchedReports);
    } catch (err) {
      console.error('Error fetching reports:', err);
      try {
        handleFirestoreError(err, OperationType.LIST, 'reports');
      } catch (e: any) {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setError('Please upload a valid PDF blood report.');
      return;
    }

    setAnalyzing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('report', file);

      const extractResponse = await fetch('/api/extract-pdf', {
        method: 'POST',
        body: formData,
      });

      if (!extractResponse.ok) {
        const contentType = extractResponse.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await extractResponse.json();
          throw new Error(errorData.error || `Server error (${extractResponse.status})`);
        } else {
          const errorText = await extractResponse.text();
          throw new Error(`Extraction failed (${extractResponse.status}): ${errorText.substring(0, 100)}`);
        }
      }
      
      const contentType = extractResponse.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const bodyText = await extractResponse.text();
        console.error('Expected JSON but received:', bodyText.substring(0, 500));
        throw new Error('Server returned HTML instead of JSON. This usually means the server route is not found or crashed.');
      }

      const responseData = await extractResponse.json();
      const text = responseData.text;
      
      if (!text || text.trim().length < 50) {
        throw new Error('Could not find enough text in the report to analyze.');
      }

      const analysis = await analyzeBloodReport(text);

      const reportData = {
        userId: auth.currentUser?.uid,
        fileName: file.name,
        extractedText: text.substring(0, 5000), // Limit storage
        analysis,
        createdAt: new Date().toISOString(),
      };

      let docRef;
      try {
        docRef = await addDoc(collection(db, 'reports'), reportData);
      } catch (dbErr) {
        handleFirestoreError(dbErr, OperationType.CREATE, 'reports');
        throw dbErr; // Should not reach here because handleFirestoreError throws
      }
      
      const newReport = { id: docRef.id, ...reportData } as HealthReport;
      
      setReports([newReport, ...reports]);
      setSelectedReport(newReport);
    } catch (err: any) {
      console.error('Analysis error:', err);
      setError(err.message || 'An error occurred during analysis.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-nature text-text-nature font-sans">
      {/* Header */}
      <header className="border-b border-border-nature bg-surface-nature sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-nature rounded-xl flex items-center justify-center text-white shadow-lg">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-tight">HIA</h1>
              <p className="text-[10px] uppercase tracking-widest text-brand-nature opacity-70 font-bold font-mono">Health Insights Agent</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex flex-col items-end mr-2">
              <span className="text-sm font-bold text-text-nature">{auth.currentUser?.displayName || 'User'}</span>
              <span className="text-[10px] text-text-muted font-mono uppercase tracking-wider">{auth.currentUser?.email}</span>
            </div>
            <div className="w-10 h-10 rounded-full bg-accent-nature border-2 border-surface-nature shadow-sm overflow-hidden flex items-center justify-center">
              <User className="text-brand-nature w-5 h-5 opacity-40" />
            </div>
            <button 
              onClick={onLogout}
              className="p-2.5 hover:bg-black/5 rounded-full transition-colors text-text-muted hover:text-rose-600"
              title="Logout"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Upload & History */}
        <div className="lg:col-span-4 space-y-6">
          {/* Upload Card */}
          <div className="bg-surface-nature rounded-[32px] border border-border-nature p-8 shadow-sm">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-nature mb-4 font-mono">Upload Report</h2>
            <div className="relative group">
              <input 
                type="file" 
                accept=".pdf"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                disabled={analyzing}
              />
              <div className={`
                border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center gap-3 transition-all
                ${analyzing ? 'bg-accent-nature/50 border-brand-nature/20' : 'border-border-nature group-hover:border-brand-nature/40 group-hover:bg-bg-nature'}
              `}>
                {analyzing ? (
                  <Loader2 className="w-12 h-12 animate-spin text-brand-nature opacity-40" />
                ) : (
                  <div className="w-16 h-16 bg-surface-nature rounded-full flex items-center justify-center shadow-sm mb-2">
                    <Upload className="w-8 h-8 text-brand-nature opacity-60 group-hover:opacity-100 transition-opacity" />
                  </div>
                )}
                <div className="text-center">
                  <p className="text-sm font-semibold text-text-nature">
                    {analyzing ? 'Analyzing your report...' : 'Upload Blood Test'}
                  </p>
                  <p className="text-xs text-text-muted mt-1">PDF format supported</p>
                </div>
                <button className="mt-4 px-6 py-2.5 bg-brand-nature text-white text-xs rounded-xl font-bold uppercase tracking-wider shadow-md hover:shadow-lg transition-all">
                  Browse Files
                </button>
              </div>
            </div>
            
            {error && (
              <div className="mt-4 p-4 bg-rose-50 border border-rose-100 rounded-2xl flex gap-3 text-rose-700 shadow-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="text-xs font-medium leading-relaxed">{error}</p>
              </div>
            )}
          </div>

          {/* History Card */}
          <div className="bg-surface-nature rounded-[32px] border border-border-nature p-8 shadow-sm overflow-hidden flex flex-col max-h-[600px]">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-nature font-mono">History</h2>
              <History className="w-4 h-4 text-text-muted opacity-40" />
            </div>
            
            <div className="space-y-3 overflow-y-auto flex-1 pr-2 -mr-2 custom-scrollbar">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-20 bg-accent-nature rounded-[20px] animate-pulse" />
                ))
              ) : reports.length === 0 ? (
                <div className="text-center py-16 text-text-muted/40">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p className="text-xs font-medium">No previous reports</p>
                </div>
              ) : (
                reports.map(report => (
                  <button
                    key={report.id}
                    onClick={() => setSelectedReport(report)}
                    className={`
                      w-full text-left p-5 rounded-[24px] border transition-all flex items-center justify-between group
                      ${selectedReport?.id === report.id 
                        ? 'bg-accent-nature border-brand-nature/20 shadow-md' 
                        : 'bg-surface-nature border-border-nature hover:border-brand-nature/30'}
                    `}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate text-text-nature">{report.fileName}</p>
                      <p className="text-[10px] mt-1.5 text-text-muted font-medium font-mono uppercase tracking-wider">
                        {new Date(report.createdAt).toLocaleDateString()} • {report.analysis.parameters.length} MARKERS
                      </p>
                    </div>
                    <div className={`p-2 rounded-xl transition-all ${selectedReport?.id === report.id ? 'bg-brand-nature text-white' : 'bg-bg-nature text-text-muted opacity-40 group-hover:opacity-100 group-hover:bg-brand-nature group-hover:text-white'}`}>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Analysis Detail */}
        <div className="lg:col-span-8">
          <AnimatePresence mode="wait">
            {selectedReport ? (
              <motion.div
                key={selectedReport.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-surface-nature rounded-[32px] border border-border-nature shadow-sm overflow-hidden"
              >
                {/* Hero Section */}
                <div className="bg-brand-nature p-10 md:p-14 text-white relative overflow-hidden text-center md:text-left">
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6 justify-center md:justify-start">
                      <span className="px-3 py-1 bg-white/20 rounded-full text-[10px] uppercase font-black tracking-widest border border-white/30 font-mono">Detailed Analysis</span>
                      <span className="text-white/60 text-[10px] uppercase font-black tracking-widest font-mono">
                        ID: #{selectedReport.id.slice(0, 8).toUpperCase()}
                      </span>
                    </div>
                    <h2 className="text-4xl md:text-5xl font-black tracking-tight leading-none mb-6 italic font-serif">
                      {selectedReport.fileName}
                    </h2>
                    <p className="text-white/80 max-w-2xl text-lg leading-relaxed font-light mx-auto md:mx-0">
                      {selectedReport.analysis.summary}
                    </p>
                  </div>
                  <div className="absolute -right-16 -bottom-16 w-80 h-80 bg-white/10 rounded-full blur-3xl"></div>
                </div>

                <div className="p-8 md:p-12 space-y-16">
                  {/* Parameter Grid */}
                  <section>
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 pb-5 border-b border-border-nature gap-4">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-[0.2em] text-text-nature font-mono mb-1">Blood Markers</h3>
                        <p className="text-xs text-text-muted font-medium italic">Key metrics from your hematology report</p>
                      </div>
                      <div className="flex gap-4 text-[9px] font-black uppercase tracking-wider font-mono bg-bg-nature p-3 rounded-2xl border border-border-nature">
                        <span className="flex items-center gap-1.5 text-emerald-700 bg-emerald-100/50 px-2.5 py-1 rounded-lg">Normal</span>
                        <span className="flex items-center gap-1.5 text-amber-700 bg-amber-100/50 px-2.5 py-1 rounded-lg">Warning</span>
                        <span className="flex items-center gap-1.5 text-rose-700 bg-rose-100/50 px-2.5 py-1 rounded-lg">Critical</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {selectedReport.analysis.parameters.map((param, i) => (
                        <div key={i} className="group p-6 rounded-[24px] border border-border-nature bg-accent-nature/30 hover:bg-surface-nature hover:shadow-2xl hover:-translate-y-1 transition-all">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h4 className="text-base font-bold tracking-tight text-text-nature mb-1">{param.name}</h4>
                              <p className="text-xs text-text-muted font-semibold font-mono">{param.range} {param.unit}</p>
                            </div>
                            <div className={`
                              px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.1em] shadow-sm
                              ${param.status === 'normal' ? 'bg-emerald-100 text-emerald-700' : 
                                param.status === 'abnormal' ? 'bg-rose-100 text-rose-700' :
                                param.status === 'concerning' ? 'bg-amber-100 text-amber-700' :
                                'bg-gray-100 text-text-muted'}
                            `}>
                              {param.status}
                            </div>
                          </div>
                          <div className="flex items-end gap-3 mb-4">
                            <span className="text-3xl font-black font-mono tracking-tighter text-text-nature">{param.value}</span>
                            <span className="text-[11px] text-text-muted font-black uppercase mb-1.5">{param.unit}</span>
                          </div>
                          <div className="pt-5 border-t border-border-nature">
                            <p className="text-xs leading-relaxed text-text-muted font-medium italic">
                              <Info className="w-3.5 h-3.5 inline mr-2 text-brand-nature opacity-60" />
                              {param.explanation}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Recommendations */}
                  <section className="bg-accent-nature border border-brand-nature/20 rounded-[40px] p-10 md:p-14 relative overflow-hidden">
                    <div className="relative z-10">
                      <h3 className="text-sm font-black uppercase tracking-[0.2em] text-brand-nature mb-10 font-mono text-center">AI Recommendations</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                        {selectedReport.analysis.recommendations.map((rec, i) => (
                          <div key={i} className="flex gap-5 items-start">
                            <div className="w-10 h-10 rounded-2xl bg-brand-nature flex items-center justify-center shrink-0 text-white font-mono font-bold shadow-lg text-sm">
                              {i+1}
                            </div>
                            <p className="text-sm text-brand-nature/80 leading-relaxed font-semibold italic mt-1.5 bg-white/40 p-4 rounded-2xl border border-brand-nature/5">
                              "{rec}"
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  {/* Disclaimer */}
                  <div className="p-8 rounded-[28px] bg-amber-50/50 border border-amber-200/50 flex flex-col md:flex-row gap-6 items-center md:items-start text-center md:text-left">
                    <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center shrink-0 shadow-sm">
                      <AlertCircle className="w-6 h-6 text-amber-600" />
                    </div>
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-widest text-amber-800 mb-2 font-mono">Medical Disclaimer</h4>
                      <p className="text-xs text-amber-800/70 leading-relaxed font-medium italic">
                        {selectedReport.analysis.disclaimer}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="h-[600px] bg-surface-nature rounded-[32px] border border-border-nature border-dashed flex flex-col items-center justify-center text-center p-12">
                <div className="w-24 h-24 bg-accent-nature rounded-full flex items-center justify-center mb-6 shadow-inner">
                  <FileText className="w-12 h-12 text-brand-nature opacity-20" />
                </div>
                <h3 className="text-3xl font-serif italic mb-4 tracking-tight text-text-nature">Report Details</h3>
                <p className="text-sm text-text-muted max-w-xs leading-relaxed font-medium">
                  Select an analysis from your history or upload a new blood report to see your medical insights.
                </p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
