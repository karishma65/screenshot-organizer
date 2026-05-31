import React from 'react';
import { 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  Search,
  Filter,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { motion } from 'framer-motion';

const LogItem = ({ type, action, details, timestamp }) => {
  const styles = {
    success: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    warning: { icon: AlertCircle, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    error: { icon: AlertCircle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  };

  const { icon: Icon, color, bg } = styles[type] || styles.info;

  return (
    <motion.div 
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-4 p-4 border-b border-border-dark last:border-0 hover:bg-white/5 transition-colors group"
    >
      <div className={`p-2.5 rounded-xl ${bg} ${color} transition-transform group-hover:scale-110`}>
        <Icon size={18} />
      </div>
      <div className="flex-1">
        <div className="flex justify-between items-center mb-0.5">
          <h4 className="text-sm font-bold text-white tracking-tight">{action}</h4>
          <span className="text-[10px] font-semibold text-text-dim/80">{timestamp}</span>
        </div>
        <p className="text-xs text-text-dim group-hover:text-gray-400 transition-colors uppercase tracking-wider font-bold text-[9px]">
          {details}
        </p>
      </div>
      <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${bg} ${color}`}>
        {type}
      </div>
    </motion.div>
  );
};

const ActivityView = () => {
  const [logs, setLogs] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  const fetchLogs = async () => {
    try {
      console.log('Renderer: Fetching activity logs...');
      setLoading(true);
      const data = await window.electronAPI.getLogs();
      if (!data) {
        console.error('get-logs failed: Backend returned null');
        setLogs([]);
      } else {
        setLogs(Array.isArray(data) ? data : []);
      }
      setError(null);
    } catch (e) {
      console.error('get-logs failed', e);
      setError(`Failed to load activity: ${e.message}`);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchLogs();

    let unsub = null;
    try {
      unsub = window.electronAPI.on('log-updated', (data) => {
        if (Array.isArray(data)) {
          setLogs(data);
        }
      });
    } catch (e) {
      console.error('Failed to subscribe to log-updated', e);
    }

    return () => {
      if (unsub) unsub();
    };
  }, []);

  const mapType = (status) => {
    if (status === 'success') return 'success';
    if (status === 'warning') return 'warning';
    if (status === 'error') return 'error';
    return 'info';
  };

  if (loading) {
     return (
       <div className="h-full flex flex-col items-center justify-center gap-4">
         <Loader2 size={48} className="text-primary animate-spin" />
         <p className="text-text-dim font-bold uppercase tracking-widest text-xs animate-pulse">Loading activity...</p>
       </div>
     );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="w-16 h-16 bg-rose-500/20 text-rose-500 rounded-2xl flex items-center justify-center mb-2">
          <AlertCircle size={32} />
        </div>
        <h3 className="text-white font-bold text-lg">Activity Error</h3>
        <p className="text-text-dim text-sm max-w-xs">{error}</p>
        <button onClick={fetchLogs} className="mt-4 px-6 py-2 bg-primary text-white rounded-xl font-bold">Retry</button>
      </div>
    );
  }

  return (
    <div className="p-8 h-full flex flex-col overflow-hidden">
      <header className="mb-8 flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">System Activity</h2>
          <p className="text-text-dim text-sm font-medium">Real-time logs of the AI classification engine</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={16} />
            <input 
              type="text" 
              placeholder="Filter logs..." 
              className="pl-10 pr-4 py-2 bg-bg-card-dark border border-border-dark rounded-xl text-sm focus:outline-none focus:border-primary/50 text-white w-64"
            />
          </div>
          <button className="p-2 bg-bg-card-dark border border-border-dark rounded-xl text-text-dim hover:text-white transition-colors">
            <Filter size={18} />
          </button>
          <button className="p-2 bg-primary/20 text-primary border border-primary/30 rounded-xl hover:bg-primary hover:text-white transition-all">
            <RefreshCw size={18} />
          </button>
        </div>
      </header>

      <div className="flex-1 bg-bg-card-dark border border-border-dark rounded-3xl overflow-hidden flex flex-col shadow-2xl">
        <div className="flex-1 overflow-y-auto">
          {logs.length > 0 ? (
            logs.map((log, i) => (
              <LogItem 
                key={log.id || i} 
                type={mapType(log.status)}
                action={log.action}
                details={log.details}
                timestamp={log.timestamp}
              />
            ))
          ) : (
            <div className="p-10 text-center text-text-dim text-sm">No activity logs yet.</div>
          )}
        </div>
        <div className="p-4 bg-black/20 border-t border-border-dark flex justify-between items-center text-[10px] text-text-dim font-bold uppercase tracking-widest">
          <span>Viewing latest 50 activities</span>
          <span className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Update Active
          </span>
        </div>
      </div>
    </div>
  );
};

export default ActivityView;
