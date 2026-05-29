import React, { useState, useEffect } from 'react';
import { 
  Images, 
  CheckCircle2, 
  Copy, 
  AlertCircle, 
  TrendingUp,
  History,
  PieChart
} from 'lucide-react';
import StatCard from './StatCard';
import { motion } from 'framer-motion';

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

const Dashboard = () => {
  const [stats, setStats] = useState({ total: 0, categorized: 0, duplicates: 0, uncategorized: 0 });
  const [logs, setLogs] = useState([]);
  const [scanProgress, setScanProgress] = useState({ total: 0, processed: 0 });
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    try {
      const dbStats = await window.electronAPI.getStats();
      const dbLogs = await window.electronAPI.getLogs();
      setStats(dbStats);
      setLogs(dbLogs);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
    
    // Safety check for Electron API
    let unsubscribe = null;
    if (window.electronAPI && window.electronAPI.on) {
      unsubscribe = window.electronAPI.on('scan-progress', (data) => {
        setScanProgress(prev => ({
          total: data.total || prev.total,
          processed: (prev.processed || 0) + (data.processed || 0)
        }));
      });
    }

    const interval = setInterval(fetchDashboardData, 3000); 
    return () => {
      clearInterval(interval);
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const progressPercentage = scanProgress.total > 0 
    ? Math.round((scanProgress.processed / scanProgress.total) * 100) 
    : 0;

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

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <StatCard 
          title="Total Screenshots" 
          value={stats.total.toLocaleString()} 
          subtext="Scanned in directory" 
          color="blue" 
          icon={Images}
        />
        <StatCard 
          title="AI Categorized" 
          value={stats.categorized.toLocaleString()} 
          subtext={`${((stats.categorized / (stats.total || 1)) * 100).toFixed(1)}% complete`} 
          color="green" 
          icon={CheckCircle2}
        />
        <StatCard 
          title="Potential Duplicates" 
          value={stats.duplicates.toLocaleString()} 
          subtext="Detected visual overlap" 
          color="rose" 
          icon={Copy}
        />
        <StatCard 
          title="Requires Classification" 
          value={stats.uncategorized.toLocaleString()} 
          subtext="Unsorted captures" 
          color="orange" 
          icon={AlertCircle}
        />
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
              <p className="text-center text-text-dim py-10 text-sm">No activity detected yet.</p>
            )}
          </div>
        </div>

        {/* Category Breakdown */}
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
                 style={{ clipPath: `inset(0 0 0 ${100 - (stats.categorized / stats.total * 100)}%)` }}
               />
               <div className="text-center">
                 <p className="text-2xl font-black text-white">{stats.total}</p>
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
                   {stats.categorized < stats.total ? (
                      <>
                        <p className="text-white text-sm font-bold animate-pulse">Scanning & Categorizing...</p>
                        <p className="text-[9px] text-primary font-bold uppercase tracking-wider">{stats.total - stats.categorized} files remaining</p>
                      </>
                   ) : (
                      <>
                        <p className="text-emerald-500 text-sm font-bold flex items-center gap-2"><CheckCircle2 size={16}/> All Files Scanned</p>
                        <p className="text-[9px] text-text-dim font-bold uppercase tracking-wider">Continuous monitoring active</p>
                      </>
                   )}
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
