import React, { useState, useEffect } from 'react';
import { 
  FolderSearch, 
  HardDrive, 
  ArrowRight, 
  CheckCircle2, 
  AlertCircle,
  FolderOpen
} from 'lucide-react';
import { motion } from 'framer-motion';

const SetupView = ({ onComplete }) => {
  const [paths, setPaths] = useState({ watchPath: '', organizedPath: '' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log('SetupView: Component mounted');
    console.log('electronAPI exists:', !!window.electronAPI);
    if (window.electronAPI) {
      console.log('electronAPI.selectFolder exists:', !!window.electronAPI.selectFolder);
    }
  }, []);

  const handleSelectWatchPath = async () => {
    console.log('Browse clicked: Source Folder');
    console.log('Calling selectFolder IPC');
    try {
      const path = await window.electronAPI.selectFolder();
      console.log('Returned path:', path);
      if (path) setPaths(prev => ({ ...prev, watchPath: path }));
    } catch (e) {
      console.error('IPC Error in selectFolder:', e);
    }
  };

  const handleSelectOrganizedPath = async () => {
    console.log('Browse clicked: Library Root');
    console.log('Calling selectFolder IPC');
    try {
      const path = await window.electronAPI.selectFolder();
      console.log('Returned path:', path);
      if (path) setPaths(prev => ({ ...prev, organizedPath: path }));
    } catch (e) {
      console.error('IPC Error in selectFolder:', e);
    }
  };

  const handleFinish = async () => {
    if (!paths.watchPath || !paths.organizedPath) {
      setError('Please select both source and output folders.');
      return;
    }

    setLoading(true);
    try {
      const result = await window.electronAPI.setAppPaths(paths);
      if (result.success && result.accessible) {
        onComplete();
      } else {
        setError('One or more selected folders are inaccessible. Please verify permissions.');
      }
    } catch (e) {
      setError('Failed to save settings. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-dark flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl w-full bg-bg-card-dark border border-border-dark rounded-[40px] p-10 shadow-2xl shadow-black/50"
      >
        <header className="text-center mb-10">
          <div className="w-16 h-16 bg-primary/20 text-primary rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-primary/20">
            <FolderSearch size={32} />
          </div>
          <h1 className="text-4xl font-black text-white mb-3 tracking-tight">Initial Setup</h1>
          <p className="text-text-dim font-medium px-10">
            Welcome to Screenshot Organizer. Tell us where to look for screenshots and where to save the organized library.
          </p>
        </header>

        <div className="space-y-6 mb-10">
          {/* Source Path */}
          <div className={`p-6 rounded-3xl border-2 transition-all ${paths.watchPath ? 'bg-primary/5 border-primary/30' : 'bg-white/5 border-white/5'}`}>
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${paths.watchPath ? 'bg-primary text-white' : 'bg-white/10 text-text-dim'}`}>
                <FolderOpen size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">Source Folder</h3>
                <p className="text-[10px] text-text-dim uppercase tracking-widest font-bold">Where screenshots currently land</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1 bg-black/40 p-3 rounded-xl border border-white/5 text-xs text-white truncate h-10 flex items-center">
                {paths.watchPath || <span className="opacity-30">No folder selected</span>}
              </div>
              <button 
                type="button"
                onClick={(e) => {
                  console.log('DOM Level: Browse button clicked');
                  handleSelectWatchPath();
                }}
                className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold text-xs transition-all border border-white/10 pointer-events-auto relative z-20"
              >
                Browse
              </button>
            </div>
          </div>

          {/* Output Path */}
          <div className={`p-6 rounded-3xl border-2 transition-all ${paths.organizedPath ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-white/5 border-white/5'}`}>
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${paths.organizedPath ? 'bg-emerald-500 text-white' : 'bg-white/10 text-text-dim'}`}>
                <HardDrive size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">Library Root</h3>
                <p className="text-[10px] text-text-dim uppercase tracking-widest font-bold">Where themed folders will be created</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1 bg-black/40 p-3 rounded-xl border border-white/5 text-xs text-white truncate h-10 flex items-center">
                {paths.organizedPath || <span className="opacity-30">No folder selected</span>}
              </div>
              <button 
                type="button"
                onClick={(e) => {
                  console.log('DOM Level: Browse button clicked');
                  handleSelectOrganizedPath();
                }}
                className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold text-xs transition-all border border-white/10 pointer-events-auto relative z-20"
              >
                Browse
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3 animate-shake">
            <AlertCircle className="text-rose-500" size={18} />
            <p className="text-sm text-rose-500 font-bold">{error}</p>
          </div>
        )}

        <button 
          onClick={handleFinish}
          disabled={loading || !paths.watchPath || !paths.organizedPath}
          className={`w-full py-5 rounded-[24px] font-black text-lg tracking-tight shadow-2xl transition-all flex items-center justify-center gap-3 ${
            paths.watchPath && paths.organizedPath
              ? 'bg-primary text-white shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]'
              : 'bg-white/10 text-white/30 cursor-not-allowed'
          }`}
        >
          {loading ? 'Validating...' : (
            <>Complete Setup <ArrowRight size={22} /></>
          )}
        </button>

        <p className="text-[10px] text-text-dim text-center mt-8 uppercase tracking-widest font-bold opacity-40">
          Your data remains 100% private and offline.
        </p>
      </motion.div>
    </div>
  );
};

export default SetupView;
