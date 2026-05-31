import React, { useState, useEffect } from 'react';
import { Search, Filter, Image as ImageIcon, Calendar, Tag, ChevronDown, FolderOpen, Info, Inbox, AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const SearchResultCard = ({ filename, main_category, platform, created_at, organized_path, original_path }) => {
  const [imgError, setImgError] = useState(false);
  const imagePath = organized_path || original_path;
  const imageUrl = imagePath ? `screenshot://${encodeURIComponent(imagePath)}` : '';

  const handleReveal = (e) => {
    e.stopPropagation();
    const revealPath = organized_path || original_path;
    if (revealPath && window.electronAPI.revealScreenshot) {
      window.electronAPI.revealScreenshot(revealPath);
    }
  };

  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="bg-bg-card-dark border border-border-dark rounded-2xl overflow-hidden group cursor-pointer"
      onClick={handleReveal}
    >
      <div className="aspect-video bg-white/5 flex items-center justify-center relative group-hover:bg-white/10 transition-colors overflow-hidden">
        {imageUrl && !imgError ? (
          <img 
            src={imageUrl} 
            alt={filename} 
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-text-dim">
            <ImageIcon size={32} className="opacity-20 mb-1" />
            <span className="text-[9px] opacity-40 uppercase tracking-wider font-bold">No Preview</span>
          </div>
        )}
        <div className="absolute top-2 right-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-md text-[10px] text-white font-bold opacity-0 group-hover:opacity-100 transition-opacity uppercase tracking-wider flex items-center gap-1">
          <FolderOpen size={10} /> Reveal
        </div>
      </div>
      <div className="p-4">
        <h4 className="text-sm font-bold text-white truncate mb-1">{filename}</h4>
        <div className="flex gap-2 mb-3 flex-wrap">
          <span className="text-[9px] px-2 py-0.5 bg-primary/10 text-primary rounded-full font-bold uppercase">{main_category}</span>
          {platform && platform !== 'UNKNOWN' && (
            <span className="text-[9px] px-2 py-0.5 bg-white/5 text-text-dim rounded-full font-bold uppercase">{platform}</span>
          )}
        </div>
        <div className="flex justify-between items-center text-[10px] text-text-dim font-medium">
          <span className="flex items-center gap-1"><Calendar size={10} /> {new Date(created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </motion.div>
  );
};

const SearchView = () => {
  const [activeFilter, setActiveFilter] = useState('All');
  const [platformFilter, setPlatformFilter] = useState('All');
  const [platformOptions, setPlatformOptions] = useState(['All']);
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [searchType, setSearchType] = useState('keyword');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false);

  useEffect(() => {
    const fetchPlatforms = async () => {
      try {
        const platforms = await window.electronAPI.getPlatforms();
        if (platforms && platforms.length > 0) {
          setPlatformOptions(['All', ...platforms]);
        }
      } catch (e) {
        console.error('Failed to fetch platforms:', e);
      }
    };
    fetchPlatforms();
  }, []);

  const handleSearch = async () => {
    const query = {
      searchTerm,
      category: activeFilter,
      platform: platformFilter,
      type: searchType
    };
    try {
      setLoading(true);
      setError(null);
      const data = await window.electronAPI.searchScreenshots(query);
      setResults(data || []);
    } catch (e) {
      console.error('search-screenshots failed', e);
      setError('Search failed. Please try again.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const delayDebounceFn = setTimeout(() => {
      handleSearch();
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, activeFilter, searchType, platformFilter]);

  return (
    <div className="p-8 h-full flex flex-col overflow-hidden">
      <header className="mb-8 flex flex-col gap-6 shrink-0">
        <div>
          <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Search Gallery</h2>
          <p className="text-text-dim text-sm font-medium">Find anything in your screenshot library instantly</p>
        </div>

        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim" size={20} />
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by text, category, or platform..." 
              className="w-full pl-12 pr-4 py-4 bg-bg-card-dark border border-border-dark rounded-2xl text-white focus:outline-none focus:border-primary transition-all shadow-xl shadow-black/20"
            />
          </div>
          <button 
            onClick={() => setSearchType(prev => prev === 'keyword' ? 'semantic' : 'keyword')}
            className={`px-6 rounded-2xl font-bold transition-all flex items-center gap-2 border ${
              searchType === 'semantic' 
                ? 'bg-indigo-600/20 text-indigo-400 border-indigo-500/50' 
                : 'bg-white/5 text-text-dim border-border-dark'
            }`}
          >
            {searchType === 'semantic' ? 'Semantic AI' : 'Standard'}
            <ChevronDown size={16} />
          </button>
        </div>

        {/* Category filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {['All', 'Study', 'Social Media', 'Communication', 'Shopping', 'Finance', 'Entertainment', 'AI Chats', 'Documents', 'Uncategorized'].map(filter => (
            <button 
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all border ${
                activeFilter === filter 
                  ? 'bg-primary/20 text-primary border-primary/50' 
                  : 'bg-bg-card-dark text-text-dim border-border-dark hover:text-white'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Platform filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar items-center">
          <span className="text-[10px] text-text-dim font-bold uppercase tracking-widest mr-2 shrink-0">Platform:</span>
          {platformOptions.map(plat => (
            <button 
              key={plat}
              onClick={() => setPlatformFilter(plat)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all border ${
                platformFilter === plat 
                  ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40' 
                  : 'bg-bg-card-dark text-text-dim border-border-dark hover:text-white'
              }`}
            >
              {plat}
            </button>
          ))}
        </div>
      </header>

      {/* Error State */}
      {error && (
        <div className="mb-4 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center gap-3">
          <AlertCircle size={18} className="text-rose-400 shrink-0" />
          <p className="text-sm text-rose-400">{error}</p>
          <button onClick={handleSearch} className="ml-auto px-3 py-1 bg-rose-500/20 text-rose-400 rounded-lg text-xs font-bold hover:bg-rose-500/30 transition-colors">
            Retry
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={32} className="text-primary animate-spin mb-3" />
            <p className="text-text-dim text-sm">Searching...</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 pb-8">
            {results.length > 0 ? (
              results.map((res) => (
                <SearchResultCard key={res.id} {...res} />
              ))
            ) : (
              <div className="col-span-full flex flex-col items-center justify-center py-20">
                <Inbox size={48} className="text-text-dim opacity-20 mb-4" />
                <h3 className="text-white font-bold text-lg mb-1">No screenshots found</h3>
                <p className="text-text-dim text-sm max-w-xs text-center">
                  {searchTerm 
                    ? `No results matching "${searchTerm}". Try different keywords or filters.`
                    : 'No screenshots in your library yet. Start by adding screenshots to your watched folder.'}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchView;
