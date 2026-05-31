import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CategoriesView from './components/CategoriesView';
import ActivityView from './components/ActivityView';
import SearchView from './components/SearchView';
import DuplicatesView from './components/DuplicatesView';
import SettingsView from './components/SettingsView';
import SetupView from './components/SetupView';
import PrivacyDialog from './components/PrivacyDialog';
import { Loader2 } from 'lucide-react';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isReady, setIsReady] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const status = await window.electronAPI.getSystemStatus();
      if (!status.configured || !status.accessible) {
        setSetupRequired(true);
      } else {
        setSetupRequired(false);
      }
    } catch (e) {
      console.error('Status check failed:', e);
    } finally {
      setIsReady(true);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <Dashboard />;
      case 'categories':
        return <CategoriesView />;
      case 'search':
        return <SearchView />;
      case 'duplicates':
        return <DuplicatesView />;
      case 'activity':
        return <ActivityView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <Dashboard />;
    }
  };

  if (!isReady) {
    return (
      <div className="h-screen bg-bg-dark flex flex-col items-center justify-center gap-4">
        <Loader2 className="text-primary animate-spin" size={40} />
        <p className="text-text-dim text-xs font-bold uppercase tracking-widest text-[9px]">Initializing System...</p>
      </div>
    );
  }

  if (setupRequired) {
    return <SetupView onComplete={checkStatus} />;
  }

  return (
    <div className="flex h-screen bg-bg-dark text-text overflow-hidden">
      <PrivacyDialog />
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 min-w-0">
        {renderContent()}
      </main>
    </div>
  );
}

export default App;
