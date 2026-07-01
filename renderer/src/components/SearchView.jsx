import React, { useState, useEffect, useRef } from 'react';
import { Search, Image as ImageIcon, Calendar, Tag, ChevronDown, FolderOpen, Info, Loader2, TrendingUp, CheckCircle2, History, X, Sparkles, User, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Components ───────────────────────────────────────────────────────────────

const MetaBadge = ({ value, color = 'default' }) => {
  if (!value || value === 'NONE' || value === 'UNKNOWN') return null;

  const colors = {
    primary: 'bg-primary/20 text-primary border-primary/30',
    green: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    violet: 'bg-violet-500/20 text-violet-400 border-violet-500/30',
    rose: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    default: 'bg-white/5 text-text-dim border-white/10'
  };

  return (
    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${colors[color] || colors.default}`}>
      {value}
    </span>
  );
};

// ── SearchResultCard ──────────────────────────────────────────────────────────
const SearchResultCard = ({
  id, filename, original_path, organized_path,
  main_category, subcategory, platform,
  created_at,
  retrieval_type, similarity_score,
  onFindSimilar
}) => {
  const [imgError, setImgError] = useState(false);
  const imagePath = organized_path || original_path;
  const imageUrl = imagePath ? `screenshot://${encodeURIComponent(imagePath)}` : '';

  const handleReveal = (e) => {
    e.stopPropagation();
    const p = organized_path || original_path;
    if (p && window.electronAPI?.revealScreenshot) window.electronAPI.revealScreenshot(p);
  };

  const displayLabel = (type) => {
    const mapping = {
      'EXACT_OCR': 'EXACT OCR',
      'KEYWORD': 'KEYWORD MATCH',
      'SEMANTIC': 'SEMANTIC MATCH',
      'FACE_MATCH': 'FACE MATCH',
      'VISUAL_SIMILARITY': 'VISUAL MATCH'
    };
    return mapping[type] || type.replace('_', ' ');
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -4 }}
      className="bg-[#1c1d25] border border-white/5 rounded-2xl overflow-hidden group cursor-pointer h-full flex flex-col hover:border-primary/30 transition-all shadow-lg hover:shadow-primary/5"
      onClick={handleReveal}
    >
      <div className="aspect-video bg-white/5 flex items-center justify-center relative overflow-hidden">
        {imageUrl && !imgError ? (
          <img
            src={imageUrl} alt={filename}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-text-dim">
            <ImageIcon size={32} className="opacity-20 mb-1" />
            <span className="text-[9px] opacity-40 uppercase tracking-wider font-bold">Preview Unavailable</span>
          </div>
        )}

        {/* Type Badge */}
        {retrieval_type && (
          <div className={`absolute top-2 left-2 px-2 py-0.5 rounded-md text-[7px] font-black uppercase tracking-widest border backdrop-blur-md
            ${retrieval_type.includes('EXACT') ? 'bg-emerald-500/80 border-emerald-400 text-white' :
              retrieval_type.includes('FACE') ? 'bg-rose-500/80 border-rose-400 text-white' :
                'bg-primary/80 border-primary text-white'}`}
          >
            {displayLabel(retrieval_type)}
          </div>
        )}

        {/* Global Action Overlay */}
        <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-[#1c1d25] to-transparent flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onFindSimilar(id); }}
            className="flex-1 bg-white/10 hover:bg-white/20 backdrop-blur-md px-2 py-1.5 rounded-lg text-[9px] font-black uppercase text-white flex items-center justify-center gap-1.5 transition-all"
          >
            <Sparkles size={10} /> Find Similar
          </button>
          <button
            onClick={handleReveal}
            className="w-10 bg-primary hover:bg-primary-hover px-2 py-1.5 rounded-lg text-white flex items-center justify-center transition-all"
          >
            <FolderOpen size={12} />
          </button>
        </div>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-3">
        <div>
          <h4 className="text-xs font-bold text-white truncate mb-1">{filename}</h4>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-dim flex items-center gap-1">
              <Database size={10} /> {platform || 'General'}
            </span>
            <span className="text-[10px] text-text-dim flex items-center gap-1">
              <Calendar size={10} /> {new Date(created_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          <MetaBadge value={main_category} color="primary" />
          <MetaBadge value={subcategory} color="green" />
        </div>

        {/* Only show confidence bar for non-deterministic AI matches */}
        {similarity_score > 0 && !['EXACT_OCR', 'KEYWORD'].includes(retrieval_type) && (
          <div className="mt-auto pt-3 border-t border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <TrendingUp size={12} className="text-emerald-400" />
              <div className="h-1 w-20 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${Math.round(similarity_score * 100)}%` }}
                />
              </div>
            </div>
            <span className="text-[10px] font-black text-emerald-400">
              {Math.round(similarity_score * 100)}%
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ── Universal Search View ───────────────────────────────────────────────────

const SearchView = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [queryImage, setQueryImage] = useState(null);
  const [copiedCount, setCopiedCount] = useState(0);

  const performSearch = async () => {
    if (!query.trim() && !queryImage) return;

    setLoading(true);
    setError(null);
    try {
      const type = queryImage ? 'image' : 'text';
      // universal-search now returns { results, copiedCount }
      const res = await window.electronAPI.universalSearch({
        type,
        query,
        imagePath: queryImage
      });

      setResults(res?.results || []);
      setCopiedCount(res?.copiedCount || 0);
    } catch (e) {
      console.error('Universal Search failed', e);
      setError('Retrieval engine error. Please check backend.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') performSearch();
  };

  // Immediate search for image still allowed as it's a one-off upload
  useEffect(() => {
    if (queryImage) performSearch();
  }, [queryImage]);

  const handleFindSimilar = async (id) => {
    try {
      setLoading(true);
      const res = await window.electronAPI.findSimilar(id);
      // find-similar also returns { results, copiedCount }
      setResults(res?.results || []);
      setCopiedCount(res?.copiedCount || 0);
      setQueryImage(null);
      setQuery('');
    } catch (e) {
      console.error('Similar search failed', e);
    } finally {
      setLoading(false);
    }
  };

  const onImageSelect = async () => {
    try {
      const path = await window.electronAPI.selectImage();
      if (path) {
        setQueryImage(path);
        setQuery('');
        setResults([]);
      }
    } catch (e) {
      console.error('Image selection failed', e);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0f1015]">
      {/* ── Dynamic Header ── */}
      <section className="p-8 pt-10 border-b border-white/5 bg-[#16171d]/50 backdrop-blur-xl shrink-0">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h2 className="text-2xl font-black text-white flex items-center gap-3">
                <Sparkles className="text-primary" size={24} />
                Universal Retrieval
              </h2>
              <p className="text-text-dim text-xs font-bold uppercase tracking-[0.2em] mt-1 ml-9">
                Intelligence Engine v2.0
              </p>
            </div>

            {results.length > 0 && !loading && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-emerald-500/10 border border-emerald-500/20 px-4 py-2 rounded-xl flex items-center gap-3"
              >
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none">
                  Organized {copiedCount} / {results.length} results in SearchResults/
                </span>
              </motion.div>
            )}
          </div>

          {/* Unified Search Input */}
          <div className="relative group">
            <div className="absolute inset-0 bg-primary/20 blur-2xl rounded-full opacity-0 group-focus-within:opacity-100 transition-opacity" />
            <div className="relative flex gap-3 p-2 bg-[#1c1d25] border border-white/10 rounded-2xl shadow-2xl transition-all group-focus-within:border-primary/50">
              <div className="p-3 bg-white/5 rounded-xl text-text-dim">
                <Search size={22} />
              </div>

              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search anything: 'Sony', 'dashboard', 'abc-defg-hij', 'blue website'..."
                className="flex-1 bg-transparent border-none text-white font-bold placeholder:text-text-dim/50 focus:outline-none text-lg"
              />

              <div className="flex items-center gap-2">
                <AnimatePresence>
                  {(query || queryImage) && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      onClick={() => { setQuery(''); setQueryImage(null); setResults([]); }}
                      className="p-3 hover:bg-white/5 rounded-xl text-text-dim hover:text-white transition-all"
                    >
                      <X size={20} />
                    </motion.button>
                  )}
                </AnimatePresence>

                <div className="w-[1px] h-8 bg-white/10 mx-1" />

                <button
                  onClick={onImageSelect}
                  className={`px-4 h-12 flex items-center gap-2 rounded-xl border transition-all font-black text-[10px] uppercase tracking-widest
                     ${queryImage ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20' : 'bg-white/5 text-text-dim border-white/10 hover:text-white hover:bg-white/10'}`}
                >
                  <ImageIcon size={18} />
                  {queryImage ? 'Image Loaded' : 'Add Image'}
                </button>

                <button
                  onClick={performSearch}
                  disabled={loading || (!query.trim() && !queryImage)}
                  className="px-6 h-12 bg-primary hover:bg-primary-hover disabled:opacity-30 disabled:cursor-not-allowed rounded-xl text-white font-black text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-primary/20"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : 'Execute Search'}
                </button>
              </div>
            </div>
          </div>

          {/* Prompt Suggestions */}
          {!query && !queryImage && (
            <div className="flex gap-2 mt-6 overflow-x-auto no-scrollbar pb-2">
              {[
                { label: 'Meeting IDs', icon: <History size={14} /> },
                { label: 'Company Logos', icon: <Sparkles size={14} /> },
                { label: 'Person Search', icon: <User size={14} /> },
                { label: 'UI/Dashboards', icon: <Database size={14} /> }
              ].map(term => (
                <button
                  key={term.label}
                  onClick={() => setQuery(term.label)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-[10px] font-bold text-text-dim hover:text-white transition-all flex items-center gap-2 whitespace-nowrap"
                >
                  {term.icon}
                  {term.label}
                </button>
              ))}
            </div>
          )}

          {/* Active Image Query */}
          {queryImage && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="mt-6 flex items-center gap-4 p-3 bg-primary/5 border border-primary/20 rounded-2xl"
            >
              <img src={`screenshot://${encodeURIComponent(queryImage)}`} className="w-16 h-10 object-cover rounded-lg border border-primary/30" />
              <div>
                <p className="text-[10px] font-black text-primary uppercase tracking-widest">Active Visual Query</p>
                <p className="text-[10px] text-text-dim font-bold truncate max-w-md">{queryImage}</p>
              </div>
            </motion.div>
          )}
        </div>
      </section>

      {/* ── Results Canvas ── */}
      <section className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-6xl mx-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-40">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/30 blur-2xl animate-pulse" />
                <Loader2 size={48} className="text-primary animate-spin relative" />
              </div>
              <p className="mt-6 text-[10px] font-black text-white/50 uppercase tracking-[0.3em]">Neural Scanning in Progress...</p>
            </div>
          ) : results.length > 0 ? (
            <AnimatePresence mode="popLayout">
              <motion.div
                layout
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              >
                {results.map((res) => (
                  <SearchResultCard
                    key={res.id}
                    {...res}
                    onFindSimilar={handleFindSimilar}
                  />
                ))}
              </motion.div>
            </AnimatePresence>
          ) : !query && !queryImage ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-30 select-none">
              <Database size={80} className="text-white mb-6" />
              <h3 className="text-2xl font-black text-white mb-2">Knowledge Base Idle</h3>
              <p className="text-sm font-bold text-text-dim text-center max-w-xs uppercase tracking-widest text-[9px]">
                Upload a logo or enter a meeting ID to begin visual deep-scan.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-20 h-20 bg-rose-500/10 rounded-full flex items-center justify-center mb-6">
                <X size={40} className="text-rose-500" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Zero Correspondence</h3>
              <p className="text-sm text-text-dim font-medium max-w-xs text-center">
                The retrieval engine could not find any screenshots matching this specific query.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default SearchView;