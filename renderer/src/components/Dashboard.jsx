import React, { useState, useEffect } from 'react';
import { 
  Images, 
  CheckCircle2, 
  Copy, 
  AlertCircle, 
  TrendingUp,
  History,
  PieChart,
  Clock,
  XCircle,
  Loader2,
  FileText,
  RefreshCw,
  Inbox
} from 'lucide-react';
import StatCard from './StatCard';
import { motion, AnimatePresence } from 'framer-motion';

const ActivityItem = ({ title, timestamp, status, details }) => (
  <div className="flex gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group">
    <div className="mt-1">
      <div className={`p-2 rounded-lg ${
        status === 'success' ? 'bg-emerald-500/10 text-emerald-500' : 
        status === 'warning' ? 'bg-orange-500/10 text-orange-500' : 
        status === 'error' ? 'bg-rose-500/10 text-rose-500' : 'bg-blue-500/10 text-blue-500'
      }`}>
        <History size={16} />
      </div>
    </div>
    <div className="flex-1">
      <div className="flex justify-between items-center mb-1">
        <h4 className="text-sm font-medium text-white">{title}</h4>
        <span className="text-[10px] text-text-dim lowercase">{timestamp}</span>
      </div>
      <p className="text-xs text-text-dim group-hover:text-gray-400 transition-colors truncate max-w-sm">
        {details}
      </p>
    </div>
  </div>
);

const ProcessingQueueCard = ({ queueCount, processingCount, completedCount, failedCount }) => (
  <div className="bg-bg-card-dark rounded-3xl border border-border-dark p-6 shadow-2xl">
    <div className="flex justify-between items-center mb-6">
      <h3 className="text-lg font-bold text-white flex items-center gap-2">
        <Loader2 size={20} className="text-primary" />
        Processing Queue
      </h3>
      <span className="text-[10px] bg-white/5 px-2 py-1 rounded font-bold text-text-dim">LIVE</span>
    </div>
    <div className="grid grid-cols-2 gap-4">
      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-center">
        <p className="text-2xl font-black text-amber-400">{queueCount}</p>
        <p className="text-[9px] text-amber-400/70 font-bold uppercase tracking-widest mt-1">Queued</p>
      </div>
      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-center">
        <p className="text-2xl font-black text-blue-400">{processingCount}</p>
        <p className="text-[9px] text-blue-400/70 font-bold uppercase tracking-widest mt-1">Processing</p>
      </div>
      <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center">
        <p className="text-2xl font-black text-emerald-400">{completedCount}</p>
        <p className="text-[9px] text-emerald-400/70 font-bold uppercase tracking-widest mt-1">Completed</p>
      </div>
      <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-center">
        <p className="text-2xl font-black text-rose-400">{failedCount}</p>
        <p className="text-[9px] text-rose-400/70 font-bold uppercase tracking-widest mt-1">Failed</p>
      </div>
    </div>
  </div>
);

const LastProcessedCard = ({ lastProcessed }) => (
  <div className="bg-bg-card-dark rounded-3xl border border-border-dark p-6 shadow-2xl">
    <div className="flex justify-between items-center mb-6">
      <h3 className="text-lg font-bold text-white flex items-center gap-2">
        <FileText size={20} className="text-primary" />
        Last Processed
      </h3>
    </div>
    {lastProcessed ? (
      <div className="space-y-4">
        <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mb-2">Filename</p>
          <p className="text-sm text-white font-medium truncate">{lastProcessed.filename}</p>
        </div>
        <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mb-2">Processed At</p>
          <p className="text-sm text-white font-medium">
            {new Date(lastProcessed.created_at).toLocaleString()}
          </p>
        </div>
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Inbox size={32} className="text-text-dim opacity-30 mb-3" />
        <p className="text-xs text-text-dim font-medium">No screenshots processed yet</p>
      </div>
    )}
  </div>
);

const RebuildProgressCard = ({ rebuildState }) => {
  if (!rebuildState || !rebuildState.active) return null;

  const progress = rebuildState.totalFiles > 0
    ? Math.round((rebuildState.filesProcessed / rebuildState.totalFiles) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-primary/10 border border-primary/30 rounded-3xl p-6 shadow-2xl mb-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <RefreshCw size={20} className="text-primary animate-spin" />
        <h3 className="text-lg font-bold text-white">Library Rebuild in Progress</h3>
      </div>
      <div className="space-y-3">
        <div className="flex justify-between text-xs">
          <span className="text-primary font-bold uppercase tracking-wider">{rebuildState.phase}</span>
          <span className="text-white font-bold">{progress}%</span>
        </div>
        <div className="w-full bg-white/10 h-2.5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            className="h-full bg-primary rounded-full"
            transition={{ duration: 0.5 }}
          />
        </div>
        {rebuildState.totalFiles > 0 && (
          <p className="text-[10px] text-text-dim text-center">
            {rebuildState.filesProcessed} / {rebuildState.totalFiles} files processed
          </p>
        )}
      </div>
    </motion.div>
  );
};

const Dashboard = () => {
  const [stats, setStats] = useState({ 
    total: 0, 
    categorized: 0, 
    duplicates: 0, 
    uncategorized: 0, 
    queueCount: 0, 
    processingCount: 0, 
    failedCount: 0 
  });
  const [logs, setLogs] = useState([]);
  const [scanProgress, setScanProgress] = useState({ total: 0, processed: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rebuildState, setRebuildState] = useState({ active: false });

  const fetchDashboardData = async () => {
    try {
      setError(null);
      const dbStats = await window.electronAPI.getStats();
      const dbLogs = await window.electronAPI.getLogs();
      const rebuild = await window.electronAPI.getRebuildStatus();
      setStats(dbStats || { 
        total: 0, 
        categorized: 0, 
        duplicates: 0, 
        uncategorized: 0, 
        queueCount: 0, 
        processingCount: 0, 
        failedCount: 0 
      });
      setLogs(dbLogs || []);
      setRebuildState(rebuild || { active: false });
    } catch (err) {
      console.error('get-stats failed', err);
      console.error('get-logs failed', err);
      setError('Failed to load dashboard data. The backend may be starting up.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    
    // Wire up events
    let unsubStats = null;
    let unsubLogs = null;
    let unsubProgress = null;
    let unsubRebuild = null;

    if (window.electronAPI && window.electronAPI.on) {
      unsubStats = window.electronAPI.on('stats-updated', (data) => {
        setStats(prev => ({ ...prev, ...data }));
      });

      unsubLogs = window.electronAPI.on('log-updated', (data) => {
        setLogs(data);
      });

      unsubProgress = window.electronAPI.on('scan-progress', (data) => {
        setScanProgress(prev => ({
          total: data.total || prev.total,
          processed: (prev.processed || 0) + (data.processed || 0)
        }));
      });

      unsubRebuild = window.electronAPI.on('rebuild-progress', (data) => {
        setRebuildState(data);
      });
    }

    return () => {
      if (unsubStats) unsubStats();
      if (unsubLogs) unsubLogs();
      if (unsubProgress) unsubProgress();
      if (unsubRebuild) unsubRebuild();
    };
  }, []);

  const progressPercentage = scanProgress.total > 0 
    ? Math.round((scanProgress.processed / scanProgress.total) * 100) 
    : 0;

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <Loader2 size={48} className="text-primary animate-spin" />
        <p className="text-text-dim font-bold uppercase tracking-widest text-xs animate-pulse">Loading dashboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="w-16 h-16 bg-rose-500/20 text-rose-500 rounded-2xl flex items-center justify-center mb-2">
          <AlertCircle size={32} />
        </div>
        <h3 className="text-white font-bold text-lg">Dashboard Error</h3>
        <p className="text-text-dim text-sm max-w-xs">{error}</p>
        <button onClick={fetchDashboardData} className="mt-4 px-6 py-2 bg-primary text-white rounded-xl font-bold">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-8 h-full overflow-y-auto">
      <header className="mb-10 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2">Dashboard</h2>
          <p className="text-text-dim">Real-time local AI processing status</p>
        </div>
        <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-2xl">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">System Monitoring Active</span>
        </div>
      </header>

      {/* Rebuild Progress */}
      <RebuildProgressCard rebuildState={rebuildState} />

      {/* Stats Grid - 7 metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard 
          title="Total Screenshots" 
          value={(stats.total || 0).toLocaleString()} 
          subtext="Scanned in directory" 
          color="blue" 
          icon={Images}
        />
        <StatCard 
          title="AI Categorized" 
          value={(stats.categorized || 0).toLocaleString()} 
          subtext={`${((stats.categorized / (stats.total || 1)) * 100).toFixed(1)}% complete`} 
          color="green" 
          icon={CheckCircle2}
        />
        <StatCard 
          title="Potential Duplicates" 
          value={(stats.duplicates || 0).toLocaleString()} 
          subtext="Detected visual overlap" 
          color="rose" 
          icon={Copy}
        />
        <StatCard 
          title="Uncategorized" 
          value={(stats.uncategorized || 0).toLocaleString()} 
          subtext="Unsorted captures" 
          color="orange" 
          icon={AlertCircle}
        />
      </div>

      {/* Second row: Queue, Failed, Last Processed mini-cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        <div className="p-5 rounded-2xl border bg-bg-card-dark border-amber-500/20 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-500/10">
            <Clock size={22} className="text-amber-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">
              {((stats.queueCount || 0) + (stats.processingCount || 0)).toLocaleString()}
            </p>
            <p className="text-[10px] text-amber-400 font-bold uppercase tracking-widest">In Queue</p>
          </div>
        </div>
        <div className="p-5 rounded-2xl border bg-bg-card-dark border-rose-500/20 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-rose-500/10">
            <XCircle size={22} className="text-rose-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{(stats.failedCount || 0).toLocaleString()}</p>
            <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest">Failed</p>
          </div>
        </div>
        <div className="p-5 rounded-2xl border bg-bg-card-dark border-primary/20 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary/10">
            <FileText size={22} className="text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white truncate">
              {stats.lastProcessed ? stats.lastProcessed.filename : '—'}
            </p>
            <p className="text-[10px] text-primary font-bold uppercase tracking-widest">Last Processed</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-bg-card-dark rounded-3xl border border-border-dark p-6 shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <History size={20} className="text-primary" />
              Live Process Logs
            </h3>
            <span className="text-[10px] bg-white/5 px-2 py-1 rounded font-bold text-text-dim">REAL-TIME</span>
          </div>
          <div className="space-y-1">
            {logs.length > 0 ? (
              logs.map((log) => (
                <ActivityItem 
                  key={log.id}
                  title={log.action} 
                  timestamp={log.timestamp} 
                  status={log.status}
                  details={log.details}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Inbox size={40} className="text-text-dim opacity-20 mb-3" />
                <p className="text-text-dim text-sm font-medium">No activity detected yet</p>
                <p className="text-text-dim text-xs mt-1 opacity-60">Screenshots will appear here as they are processed</p>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Queue + Overview */}
        <div className="space-y-6">
          {/* Processing Queue */}
          <ProcessingQueueCard 
            queueCount={stats.queueCount || 0}
            processingCount={stats.processingCount || 0}
            completedCount={stats.categorized || 0}
            failedCount={stats.failedCount || 0}
          />

          {/* Overview ring */}
          <div className="bg-bg-card-dark rounded-3xl border border-border-dark p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <PieChart size={20} className="text-primary" />
                Overview
              </h3>
            </div>
            
            <div className="relative h-48 flex items-center justify-center mb-10">
              <div className="w-40 h-40 rounded-full border-[12px] border-primary/20 flex items-center justify-center relative">
                 <div 
                   className="absolute inset-0 border-[12px] border-primary rounded-full transform rotate-45" 
                   style={{ clipPath: `inset(0 0 0 ${100 - ((stats.categorized || 0) / (stats.total || 1) * 100)}%)` }}
                 />
                 <div className="text-center">
                   <p className="text-2xl font-black text-white">{stats.total || 0}</p>
                   <p className="text-[9px] text-text-dim uppercase tracking-widest font-black">Total Files</p>
                 </div>
              </div>
            </div>

            <div className="space-y-4">
               {scanProgress.total > 0 && scanProgress.processed < scanProgress.total && (
                 <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 mb-4 text-center">
                   <p className="text-[10px] text-primary font-bold uppercase tracking-widest mb-2">Initial Scan in Progress</p>
                   <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden mb-2">
                     <motion.div 
                       initial={{ width: 0 }}
                       animate={{ width: `${progressPercentage}%` }}
                       className="h-full bg-primary"
                     />
                   </div>
                   <p className="text-[11px] text-white font-bold">{progressPercentage}% Complete</p>
                   <p className="text-[9px] text-text-dim mt-1">{scanProgress.processed} / {scanProgress.total} Files</p>
                 </div>
               )}

               <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                  <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mb-2 text-center">Current Status</p>
                  <div className="flex flex-col items-center gap-1">
                     {(stats.categorized || 0) < (stats.total || 0) ? (
                        <>
                          <p className="text-white text-sm font-bold animate-pulse">Scanning & Categorizing...</p>
                          <p className="text-[9px] text-primary font-bold uppercase tracking-wider">{(stats.total || 0) - (stats.categorized || 0)} files remaining</p>
                        </>
                     ) : stats.total > 0 ? (
                        <>
                          <p className="text-emerald-500 text-sm font-bold flex items-center gap-2"><CheckCircle2 size={16}/> All Files Scanned</p>
                          <p className="text-[9px] text-text-dim font-bold uppercase tracking-wider">Continuous monitoring active</p>
                        </>
                     ) : (
                        <>
                          <p className="text-text-dim text-sm font-medium">Waiting for screenshots</p>
                          <p className="text-[9px] text-text-dim font-bold uppercase tracking-wider">Drop files to begin</p>
                        </>
                     )}
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
