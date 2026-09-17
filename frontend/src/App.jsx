import { useState } from 'react';
import { GameDataProvider, useGameData } from './contexts/GameDataContext';
import { AudioProvider } from './contexts/AudioContext';
import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import LoadingOverlay from './components/layout/LoadingOverlay';
import FloatingAudioPlayer from './components/shared/FloatingAudioPlayer';

import DashboardTab from './components/tabs/DashboardTab';
import StorybookTab from './components/tabs/StorybookTab';
import CharactersTab from './components/tabs/CharactersTab';
import BuddiesTab from './components/tabs/BuddiesTab';
import SkillsTab from './components/tabs/SkillsTab';
import ItemsTab from './components/tabs/ItemsTab';
import StagesTab from './components/tabs/StagesTab';
import AudioTab from './components/tabs/AudioTab';
import SaveConverterTab from './components/tabs/SaveConverterTab';

import CharacterModal from './components/modals/CharacterModal';
import ItemModal from './components/modals/ItemModal';
import BuddyModal from './components/modals/BuddyModal';

function AppContent() {
  const { loading } = useGameData();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedBuddy, setSelectedBuddy] = useState(null);

  // Cross-tab navigation from source chips: { tab, search } consumed as the target tab's initial search
  const [sourceSearch, setSourceSearch] = useState(null);

  const openSourceTab = (tab, search) => {
    setSourceSearch({ tab, search });
    setActiveTab(tab);
  };

  const handleTabChange = (tab) => {
    setSourceSearch(null);
    setActiveTab(tab);
  };

  return (
    <>
      {loading && <LoadingOverlay />}
      <div className="app-container">
        {mobileSidebarOpen && (
          <div 
            className="sidebar-backdrop active" 
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
        )}
        <Sidebar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          isOpen={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
        />
        <main className="app-main">
          <Header 
            activeTab={activeTab} 
            onToggleSidebar={() => setMobileSidebarOpen(prev => !prev)}
          />
          <div className="content-container">
            {activeTab === 'dashboard' && <DashboardTab onTabChange={handleTabChange} />}
            {activeTab === 'storybook' && <StorybookTab />}
            {activeTab === 'characters' && <CharactersTab onSelectCharacter={setSelectedCharacter} initialSearch={sourceSearch?.tab === 'characters' ? sourceSearch.search : ''} />}
            {activeTab === 'buddies' && <BuddiesTab onSelectBuddy={setSelectedBuddy} initialSearch={sourceSearch?.tab === 'buddies' ? sourceSearch.search : ''} />}
            {activeTab === 'skills' && <SkillsTab onOpenSource={openSourceTab} />}
            {activeTab === 'items' && <ItemsTab onSelectItem={setSelectedItemId} />}
            {activeTab === 'stages' && <StagesTab onSelectItem={setSelectedItemId} onSelectBuddy={setSelectedBuddy} />}
            {activeTab === 'audio' && <AudioTab />}
            {activeTab === 'saveConverter' && <SaveConverterTab />}
          </div>
        </main>
      </div>

      <FloatingAudioPlayer 
        activeTab={activeTab} 
        onNavigateToAudio={() => setActiveTab('audio')} 
      />

      {selectedCharacter && (
        <CharacterModal 
          character={selectedCharacter} 
          onClose={() => setSelectedCharacter(null)} 
          onOpenItem={(id) => setSelectedItemId(id)}
        />
      )}
      {selectedItemId && (
        <ItemModal 
          itemId={selectedItemId} 
          onClose={() => setSelectedItemId(null)} 
        />
      )}
      {selectedBuddy && (
        <BuddyModal 
          buddy={typeof selectedBuddy === 'object' ? selectedBuddy : null}
          buddyId={typeof selectedBuddy === 'number' || typeof selectedBuddy === 'string' ? selectedBuddy : (selectedBuddy?.ID || selectedBuddy?.id)}
          onClose={() => setSelectedBuddy(null)}
          onSelectBuddy={setSelectedBuddy}
        />
      )}
    </>
  );
}

export default function App() {
  return (
    <GameDataProvider>
      <AudioProvider>
        <AppContent />
      </AudioProvider>
    </GameDataProvider>
  );
}

