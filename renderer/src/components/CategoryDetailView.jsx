import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft,
  FolderOpen, 
  Image as ImageIcon,
  Calendar,
  Tag,
  Inbox,
  Loader2,
  AlertCircle,
  BarChart3,
  Info
} from 'lucide-react';
import { motion } from 'framer-motion';

const Thumbnail = ({ path: imgPath, alt }) => {
  const [error, setError] = useState(false);
  const imageUrl = imgPath ? `screenshot://${encodeURIComponent(imgPath)}` : '';

  if (error || !imgPath) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-white/5 text-text-dim text-[9px] font-bold uppercase">
        <ImageIcon size={16} className="opacity-20 mb-1" />
        No Preview
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

const ClusterCard = ({ name, count, color }) => (
  <motion.div
    whileHover={{ y: -3, scale: 1.02 }}
    className="bg-bg-card-dark border border-border-dark p-5 rounded-2xl flex items-center gap-4 group transition-all"
  >
    <div className={`w-3 h-10 rounded-full ${color}`} />
    <div className="flex-1 min-w-0">
      <h4 className="text-sm font-bold text-white truncate">{name || 'Unknown'}</h4>
      <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest">{count} Screenshots</p>
    </div>
    <div className="text-2xl font-black text-white/20 group-hover:text-white/40 transition-colors">{count}</div>
  </motion.div>
);

const RecentScreenshotCard = ({ screenshot }) => {
  const handleReveal = () => {
    const path = screenshot.organized_path || screenshot.original_path;
    if (path && window.electronAPI.revealScreenshot) {
      window.electronAPI.revealScreenshot(path);
    }
  };

  return (
    <motion.div
      whileHover={{ y: -4 }}
      onClick={handleReveal}
      className="bg-bg-card-dark border border-border-dark rounded-2xl overflow-hidden cursor-pointer group flex flex-col"
    >
      <div className="aspect-video bg-white/5 overflow-hidden relative">
        <Thumbnail path={screenshot.organized_path || screenshot.original_path} alt={screenshot.filename} />
        <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-md text-[10px] text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wider flex items-center gap-1">
          <FolderOpen size={10} /> Reveal
        </div>
        {screenshot.final_confidence > 0 && (
          <div className="absolute left-2 bottom-2 px-2 py-0.5 bg-black/40 backdrop-blur-md rounded-md text-[8px] text-primary font-black uppercase tracking-tighter">
            {Math.round(screenshot.final_confidence * 100)}% Conf
          </div>
        )}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h4 className="text-sm font-bold text-white truncate mb-2">{screenshot.filename}</h4>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {screenshot.platform && screenshot.platform !== 'UNKNOWN' && (
            <span className="text-[8px] px-1.5 py-0.5 bg-white/5 text-text-dim border border-white/10 rounded font-black uppercase">{screenshot.platform}</span>
          )}
          {screenshot.subcategory && screenshot.subcategory !== 'NONE' && (
            <span className="text-[8px] px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded font-black uppercase">{screenshot.subcategory}</span>
          )}
          {screenshot.study_group_name && screenshot.study_group_name !== 'NONE' && (
            <span className="text-[8px] px-1.5 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded font-black uppercase">{screenshot.study_group_name}</span>
          )}
        </div>
        <div className="mt-auto flex items-center gap-1 text-[9px] text-text-dim font-bold uppercase tracking-tighter opacity-60">
          <Calendar size={10} />
          {screenshot.created_at ? new Date(screenshot.created_at).toLocaleDateString() : 'Unknown'}
        </div>
      </div>
    </motion.div>
  );
};

const CategoryDetailView = ({ category, categoryLabel, onBack }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [recent, setRecent] = useState([]);

  const CLUSTER_COLORS = [
    'bg-primary', 'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 
    'bg-rose-500', 'bg-indigo-500', 'bg-cyan-500', 'bg-orange-500',
    'bg-violet-500', 'bg-pink-500'
  ];

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await window.electronAPI.getCategoryDetails(category);
        
        if (!data) {
          throw new Error('No category data returned');
        }

        setClusters(data.clusters || []);
        setRecent(data.recent || []);
      } catch (e) {
        console.error('Failed to load category details:', e);
        setError('Failed to load category details. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchDetails();
  }, [category]);

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <Loader2 size={48} className="text-primary animate-spin" />
        <p className="text-text-dim font-bold uppercase tracking-widest text-xs animate-pulse">Loading {categoryLabel}...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center p-8">
        <div className="w-16 h-16 bg-rose-500/20 text-rose-500 rounded-2xl flex items-center justify-center mb-2">
          <AlertCircle size={32} />
        </div>
        <h3 className="text-white font-bold text-lg">Error Loading Category</h3>
        <p className="text-text-dim text-sm max-w-xs">{error}</p>
        <button onClick={onBack} className="mt-4 px-6 py-2 bg-primary text-white rounded-xl font-bold">Back</button>
      </div>
    );
  }

  const totalInCategory = clusters.reduce((acc, c) => acc + c.count, 0) || recent.length;

  return (
    <div className="p-8 h-full overflow-y-auto">
      {/* Header */}
      <header className="mb-8">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-text-dim hover:text-white transition-colors mb-4 text-sm font-medium"
        >
          <ArrowLeft size={18} /> Back to Categories
        </button>
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">{categoryLabel}</h2>
            <p className="text-text-dim text-sm font-medium">{totalInCategory} screenshots in this category</p>
          </div>
          <button
            onClick={async () => {
              const paths = await window.electronAPI.getAppPaths();
              if (paths && paths.organizedPath) {
                window.electronAPI.openFolder(`${paths.organizedPath}/${category}`);
              }
            }}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-border-dark rounded-xl font-bold text-xs text-white transition-all flex items-center gap-2"
          >
            <FolderOpen size={14} /> Open Folder
          </button>
        </div>
      </header>

      {/* Cluster Breakdown */}
      {clusters.length > 0 && (
        <section className="mb-10">
          <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
            <BarChart3 size={20} className="text-primary" />
            {category === 'STUDY' ? 'Study Groups' : 'Platform Breakdown'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clusters.map((cluster, i) => (
              <ClusterCard
                key={cluster.name}
                name={cluster.name}
                count={cluster.count}
                color={CLUSTER_COLORS[i % CLUSTER_COLORS.length]}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recent Screenshots */}
      <section>
        <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
          <ImageIcon size={20} className="text-primary" />
          Recent Screenshots
        </h3>
        {recent.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-8">
            {recent.map((screenshot) => (
              <RecentScreenshotCard key={screenshot.id} screenshot={screenshot} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Inbox size={48} className="text-text-dim opacity-20 mb-4" />
            <h3 className="text-white font-bold text-lg mb-1">No screenshots in this category</h3>
            <p className="text-text-dim text-sm max-w-xs">
              Screenshots will appear here as they are categorized by the AI engine.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};

export default CategoryDetailView;
