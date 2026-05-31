import React, { useState, useEffect } from 'react';
import { Copy, Trash2, CheckCircle2, AlertCircle, Maximize2, Trash, Check, Loader2, Info } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const Thumbnail = ({ path, alt }) => {
  const [error, setError] = useState(false);
  const imageUrl = path ? `screenshot://${encodeURIComponent(path)}` : '';

  if (error || !path) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-white/5 text-text-dim text-[10px] font-bold uppercase italic p-4 text-center">
        <Info size={16} className="mb-2 opacity-20" />
        Preview Missing
      </div>
    );
  }

  return (
    <img 
      src={imageUrl} 
      alt={alt} 
      className="w-full h-full object-cover" 
      onError={() => setError(true)}
    />
  );
};

const DuplicateGroup = ({ original, duplicates, onAction }) => (
  <div className="bg-bg-card-dark border border-border-dark rounded-3xl overflow-hidden p-6 mb-6">
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 bg-primary/20 text-primary rounded-xl flex items-center justify-center">
        <Copy size={20} />
      </div>
      <div>
        <h4 className="text-white font-bold tracking-tight">{original.filename}</h4>
        <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest">Master Screenshot</p>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      {/* Original Image */}
      <div className="space-y-4">
        <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest flex items-center gap-2">
           <CheckCircle2 size={12} /> Original (Keep)
        </p>
        <div className="aspect-video bg-black/40 rounded-2xl flex items-center justify-center border border-emerald-500/20 group relative overflow-hidden">
           <Thumbnail path={original.organized_path || original.original_path} alt="Original" />
        </div>
      </div>

      {/* Duplicate Images */}
      <div className="space-y-6">
        <p className="text-[10px] text-rose-500 font-bold uppercase tracking-widest flex items-center gap-2">
           <AlertCircle size={12} /> Detected Duplicates
        </p>
        <div className="space-y-4">
          {duplicates.map(dup => (
            <div key={dup.id} className="bg-white/5 border border-white/5 p-4 rounded-2xl">
              <div className="flex gap-4 mb-4">
                <div className="w-24 aspect-video bg-black/40 rounded-lg overflow-hidden border border-white/10 shrink-0">
                  <Thumbnail path={dup.organized_path || dup.original_path} alt="Duplicate" />
                </div>
                <div className="flex-1 min-w-0">
                  <h5 className="text-sm font-bold text-white truncate">{dup.filename}</h5>
                  <p className="text-[10px] text-rose-400 font-bold uppercase tracking-widest mt-1">
                    {(dup.similarity_score || 100).toFixed(1)}% Match
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => onAction('keep', dup.id)}
                  className="flex items-center justify-center gap-2 py-2 bg-white/5 hover:bg-white/10 text-white text-[10px] font-bold rounded-xl transition-all border border-white/5"
                >
                  <Check size={14} /> Keep Both
                </button>
                <button 
                  onClick={() => onAction('delete', dup.id)}
                  className="flex items-center justify-center gap-2 py-2 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded-xl transition-all shadow-lg shadow-rose-600/20"
                >
                  <Trash size={14} /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const DuplicatesView = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState([]);
  const [stats, setStats] = useState({ count: 0, sizeMB: '0.0' });

  const loadData = async () => {
    try {
      console.log('Renderer: Fetching duplicate data...');
      setLoading(true);
      const [duplicates, statsData] = await Promise.all([
        window.electronAPI.getDuplicates(),
        window.electronAPI.getDuplicateStats()
      ]);
      
      if (!duplicates) {
        console.error('get-duplicates failed: Backend returned null');
      }
      if (!statsData) {
        console.error('get-duplicate-stats failed: Backend returned null');
      }

      setData(duplicates || []);
      setStats(statsData || { count: 0, sizeMB: '0.0' });
      setError(null);
    } catch (e) {
      console.error('get-duplicates failed', e);
      setError('Unable to load duplicate information. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAction = async (type, id) => {
    if (type === 'delete') {
      const confirmed = window.confirm("Delete duplicate screenshot?\n\nThis will remove only the duplicate copy. The original screenshot will be preserved.");
      if (!confirmed) return;
      await window.electronAPI.deleteDuplicate(id);
    } else {
      await window.electronAPI.keepBothDuplicate(id);
    }
    loadData();
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <Loader2 size={48} className="text-primary animate-spin" />
        <p className="text-text-dim font-bold uppercase tracking-widest text-xs animate-pulse">Loading duplicate analysis...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="w-16 h-16 bg-rose-500/20 text-rose-500 rounded-2xl flex items-center justify-center mb-2">
          <AlertCircle size={32} />
        </div>
        <h3 className="text-white font-bold text-lg">System Error</h3>
        <p className="text-text-dim text-sm max-w-xs">{error}</p>
        <button onClick={loadData} className="mt-4 px-6 py-2 bg-primary text-white rounded-xl font-bold">Try Again</button>
      </div>
    );
  }

  return (
    <div className="p-8 h-full flex flex-col overflow-hidden">
      <header className="mb-8 flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Duplicates Manager</h2>
          <p className="text-text-dim text-sm font-medium">Clean up your storage by removing visually identical screenshots</p>
        </div>
        <AnimatePresence mode="wait">
          {stats.count > 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl gap-6 shadow-2xl shadow-rose-900/10"
            >
              <div className="text-center border-r border-rose-500/20 pr-6">
                <p className="text-2xl font-black text-rose-500">{stats.count}</p>
                <p className="text-[9px] text-rose-400 font-bold uppercase tracking-wider">Duplicates</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-black text-white">{stats.sizeMB}MB</p>
                <p className="text-[9px] text-text-dim font-bold uppercase tracking-wider">Safe to Clean</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <div className="flex-1 overflow-y-auto">
        {data.length > 0 ? (
          data.map((group, i) => (
            <DuplicateGroup 
              key={group.original?.id || i}
              original={group.original}
              duplicates={group.duplicates}
              onAction={handleAction}
            />
          ))
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center h-full gap-6"
          >
            <div className="w-24 h-24 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center text-emerald-500 shadow-2xl shadow-emerald-500/10">
               <CheckCircle2 size={48} />
            </div>
            <div className="text-center">
              <h3 className="text-2xl font-bold text-white mb-2">No Duplicates Found</h3>
              <p className="text-text-dim max-w-xs mx-auto">Your screenshot library is professionally optimized and clean.</p>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default DuplicatesView;
