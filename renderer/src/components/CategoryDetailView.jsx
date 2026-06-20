// CategoryDetailView.jsx — COMPLETE REWRITE (v3)
//
// Fixes in this version:
//  Issue 10 — document_type now displayed on RecentScreenshotCard.
//  Issue 11 — study_group_name displayed consistently on all cards.
//  Issue 12 — RecentScreenshotCard now shows: platform, subcategory,
//             study_group_name, document_type, editor, code_language,
//             and tags (parsed from content_types JSON { labels, tags }).
//             All metadata fields that are 'NONE', 'Unknown', or empty
//             are hidden so the card stays clean.

import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, FolderOpen, Image as ImageIcon,
  Calendar, Inbox, Loader2, AlertCircle, BarChart3, Tag
} from 'lucide-react';
import { motion } from 'framer-motion';

// ── Thumbnail ─────────────────────────────────────────────────────────────────
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
      src={imageUrl} alt={alt}
      className="w-full h-full object-cover"
      onError={() => setError(true)}
    />
  );
};

// ── MetaBadge — single reusable metadata pill ─────────────────────────────────
const MetaBadge = ({ value, color = 'default' }) => {
  if (!value || value === 'NONE' || value === 'Unknown' || value === 'UNKNOWN') return null;

  const styles = {
    default: 'bg-white/5 text-text-dim border-white/10',
    primary: 'bg-primary/10 text-primary border-primary/20',
    green: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    violet: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
    rose: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  };

  return (
    <span className={`text-[8px] px-1.5 py-0.5 border rounded font-black uppercase ${styles[color] || styles.default}`}>
      {value}
    </span>
  );
};

// ── Parse tags from content_types field ───────────────────────────────────────
// content_types is stored as JSON: { labels: [...], tags: [...] }
// or as a plain JSON array (legacy format from older pipeline versions).
function parseTags(contentTypesRaw) {
  if (!contentTypesRaw) return [];
  try {
    const parsed = JSON.parse(contentTypesRaw);
    // New format: { labels: [], tags: [] }
    if (parsed && Array.isArray(parsed.tags)) return parsed.tags;
    // Legacy format: plain array of CLIP labels — no tags
    return [];
  } catch {
    return [];
  }
}

// ── RecentScreenshotCard ──────────────────────────────────────────────────────
const RecentScreenshotCard = ({ screenshot }) => {
  const handleReveal = () => {
    const p = screenshot.organized_path || screenshot.original_path;
    if (p && window.electronAPI?.revealScreenshot) window.electronAPI.revealScreenshot(p);
  };

  // Parse derived tags from content_types
  const tags = parseTags(screenshot.content_types);

  return (
    <motion.div
      whileHover={{ y: -4 }}
      onClick={handleReveal}
      className="bg-bg-card-dark border border-border-dark rounded-2xl overflow-hidden cursor-pointer group flex flex-col"
    >
      {/* Thumbnail */}
      <div className="aspect-video bg-white/5 overflow-hidden relative">
        <Thumbnail
          path={screenshot.organized_path || screenshot.original_path}
          alt={screenshot.filename}
        />
        <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-md text-[10px] text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wider flex items-center gap-1">
          <FolderOpen size={10} /> Reveal
        </div>
        {screenshot.final_confidence > 0 && (
          <div className="absolute left-2 bottom-2 px-2 py-0.5 bg-black/40 backdrop-blur-md rounded-md text-[8px] text-primary font-black uppercase tracking-tighter">
            {Math.round(screenshot.final_confidence * 100)}% Conf
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col gap-2">
        <h4 className="text-sm font-bold text-white truncate">{screenshot.filename}</h4>

        {/* ── Row 1: Platform + Subcategory ── */}
        <div className="flex flex-wrap gap-1">
          <MetaBadge value={screenshot.platform} color="default" />
          <MetaBadge value={screenshot.subcategory} color="green" />
        </div>

        {/* ── Row 2: Study cluster + Document type ── */}
        <div className="flex flex-wrap gap-1">
          {/* FIX Issue 11 */}
          <MetaBadge value={screenshot.study_group_name} color="blue" />
          {/* FIX Issue 10 */}
          <MetaBadge value={screenshot.document_type !== 'NONE' ? screenshot.document_type : null} color="amber" />
        </div>

        {/* ── Row 3: Code language + Editor ── */}
        {screenshot.is_code === 1 && (
          <div className="flex flex-wrap gap-1">
            <MetaBadge value={screenshot.code_language} color="violet" />
            <MetaBadge value={screenshot.editor} color="violet" />
          </div>
        )}

        {/* ── Row 4: Tags (Diagram, QRCode, Code, Terminal) ── */}
        {/* FIX Issues 6, 8 */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1 items-center">
            <Tag size={9} className="text-text-dim opacity-50" />
            {tags.map(tag => (
              <MetaBadge key={tag} value={tag} color="rose" />
            ))}
          </div>
        )}

        {/* ── Footer: date ── */}
        <div className="mt-auto flex items-center gap-1 text-[9px] text-text-dim font-bold uppercase tracking-tighter opacity-60">
          <Calendar size={10} />
          {screenshot.created_at
            ? new Date(screenshot.created_at).toLocaleDateString()
            : 'Unknown'}
        </div>
      </div>
    </motion.div>
  );
};

// ── ClusterCard ───────────────────────────────────────────────────────────────
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

// ── CategoryDetailView ────────────────────────────────────────────────────────
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
        if (!data) throw new Error('No category data returned');
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
        <p className="text-text-dim font-bold uppercase tracking-widest text-xs animate-pulse">
          Loading {categoryLabel}...
        </p>
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
        <button onClick={onBack} className="mt-4 px-6 py-2 bg-primary text-white rounded-xl font-bold">
          Back
        </button>
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
              if (paths?.organizedPath) {
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
            {recent.map(ss => (
              <RecentScreenshotCard key={ss.id} screenshot={ss} />
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