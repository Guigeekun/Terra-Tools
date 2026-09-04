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
import AssetsTab from './components/tabs/AssetsTab';

import CharacterModal from './components/modals/CharacterModal';
import ItemModal from './components/modals/ItemModal';
import BuddyModal from './components/modals/BuddyModal';

function AppContent() {
  const { loading } = useGameData();
  const [activeTab, setActiveTab] = useState('dashboard');
  
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedBuddy, setSelectedBuddy] = useState(null);

  return (
    <>
      {loading && <LoadingOverlay />}
      <div className="app-container">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
        <main className="app-main">
          <Header activeTab={activeTab} />
          <div className="content-container">
            {activeTab === 'dashboard' && <DashboardTab onTabChange={setActiveTab} />}
            {activeTab === 'storybook' && <StorybookTab />}
            {activeTab === 'characters' && <CharactersTab onSelectCharacter={setSelectedCharacter} />}
            {activeTab === 'buddies' && <BuddiesTab onSelectBuddy={setSelectedBuddy} />}
            {activeTab === 'skills' && <SkillsTab />}
            {activeTab === 'items' && <ItemsTab onSelectItem={setSelectedItemId} />}
            {activeTab === 'stages' && <StagesTab onSelectItem={setSelectedItemId} onSelectBuddy={setSelectedBuddy} />}
            {activeTab === 'audio' && <AudioTab />}
            {activeTab === 'assets' && <AssetsTab />}
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

