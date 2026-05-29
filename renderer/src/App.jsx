import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import CategoriesView from './components/CategoriesView';
import ActivityView from './components/ActivityView';
import SearchView from './components/SearchView';
import DuplicatesView from './components/DuplicatesView';
import SettingsView from './components/SettingsView';
import PrivacyDialog from './components/PrivacyDialog';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

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
