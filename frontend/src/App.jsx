import { useState, useEffect } from 'react';
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
import DocsTab from './components/tabs/DocsTab';

import CharacterModal from './components/modals/CharacterModal';
import ItemModal from './components/modals/ItemModal';
import BuddyModal from './components/modals/BuddyModal';
import { fetchCharacter } from './api';

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

  // Skill mentions (modals, companion cards) jump to the Skills catalog pre-filtered
  // to that skill. Search keys off the English name (backend-searchable in any UI
  // language); unnamed skills fall back to their 1-based ID.
  const openSkillTab = (skillId, skill) => {
    const name = skill?.nameString?.en?.trim();
    openSourceTab('skills', name || String(skillId || ''));
  };

  // Open a character modal by game-data ID (recode targets / recode material units)
  const openCharacterById = (charId) => {
    fetchCharacter(charId).then(setSelectedCharacter).catch(e => console.error('Error fetching character:', e));
  };

  const handleTabChange = (tab) => {
    setSourceSearch(null);
    setActiveTab(tab);
    // Docs reflect their state in the hash; other tabs clear it so a stale
    // deep link doesn't resurrect the Docs tab on the next reload.
    if (tab !== 'docs') {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  };

  // Deep links: '#/docs/...' (or '#/docs') opens the Docs tab directly, so a
  // URL copied from a doc can be pasted anywhere.
  useEffect(() => {
    const applyHash = () => {
      if (window.location.hash.startsWith('#/docs')) {
        setActiveTab('docs');
      }
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

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
            {activeTab === 'buddies' && <BuddiesTab onSelectBuddy={setSelectedBuddy} initialSearch={sourceSearch?.tab === 'buddies' ? sourceSearch.search : ''} onOpenSkill={openSkillTab} />}
            {activeTab === 'skills' && <SkillsTab onOpenSource={openSourceTab} initialSearch={sourceSearch?.tab === 'skills' ? sourceSearch.search : ''} />}
            {activeTab === 'items' && <ItemsTab onSelectItem={setSelectedItemId} />}
            {activeTab === 'stages' && <StagesTab onSelectItem={setSelectedItemId} onSelectBuddy={setSelectedBuddy} />}
            {activeTab === 'audio' && <AudioTab />}
            {activeTab === 'saveEditor' && <SaveConverterTab />}
            {activeTab === 'docs' && <DocsTab />}
          </div>
        </main>
      </div>

      <FloatingAudioPlayer 
        activeTab={activeTab} 
        onNavigateToAudio={() => setActiveTab('audio')} 
      />

      {selectedCharacter && (
        <CharacterModal
          key={selectedCharacter.ID}
          character={selectedCharacter}
          onClose={() => setSelectedCharacter(null)}
          onOpenItem={(id) => setSelectedItemId(id)}
          onOpenCharacter={openCharacterById}
          onOpenSkill={(id, skill) => { setSelectedCharacter(null); openSkillTab(id, skill); }}
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
          onOpenSkill={(id, skill) => { setSelectedBuddy(null); openSkillTab(id, skill); }}
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

