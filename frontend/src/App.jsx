import { useEffect, useRef, useState } from 'react';
import { GameDataProvider, useGameData } from './contexts/GameDataContext';
import { AudioProvider } from './contexts/AudioContext';
import { navigate, tabHash, useHashRoute } from './router';
import { TAB_KEYS } from './utils/constants';
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
  const route = useHashRoute();
  const activeTab = TAB_KEYS.includes(route.tab) ? route.tab : 'dashboard';
  const params = route.params;
  // Modal ids arrive as strings in the URL; the modals' fetch paths want numbers.
  const numericParam = (value) =>
    value != null && /^\d+$/.test(value) ? Number(value) : (value ?? null);
  const charParam = params.char;
  const itemParam = numericParam(params.item);
  const buddyParam = numericParam(params.buddy);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Tab navigation is a push: the back button walks back through visited tabs.
  const handleTabChange = (tab) => navigate(tabHash(tab));

  // Cross-tab navigation from skill/source chips: '?q=' pre-fills the target
  // tab's search. Search keys off the English name (backend-searchable in any
  // UI language); unnamed skills fall back to their 1-based ID.
  const openSourceTab = (tab, search) => navigate(tabHash(tab, search ? { q: search } : {}));
  const openSkillTab = (skillId, skill) => {
    const name = skill?.nameString?.en?.trim();
    openSourceTab('skills', name || String(skillId || ''));
  };

  // Modal selection lives in the URL as ?char= / ?item= / ?buddy= on the
  // active tab, so opening one pushes a history entry: Back closes the
  // topmost modal (and walks chained modals step by step), and a copied URL
  // restores the exact view, modals included.
  const pushedModalRef = useRef(false);
  const openModal = (extra) => {
    pushedModalRef.current = true;
    navigate(tabHash(activeTab, { ...params, ...extra }));
  };
  const closeModal = (key) => {
    if (pushedModalRef.current) {
      window.history.back(); // the hashchange updates the route
    } else {
      // Modal reached via a pasted URL (nothing of ours to go back to):
      // rewrite the current entry without it.
      const rest = { ...params };
      delete rest[key];
      navigate(tabHash(activeTab, rest), { replace: true });
    }
  };
  // The flag only tracks "we pushed this modal"; once no modal is on screen
  // (closed via Back, or navigated away) the next open must push again.
  useEffect(() => {
    if (charParam == null && itemParam == null && buddyParam == null) pushedModalRef.current = false;
  }, [charParam, itemParam, buddyParam]);

  // Character modals need the full character object: list clicks seed the
  // cache, anything else (deep links, recode chains) is fetched by ID.
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const characterCacheRef = useRef(new Map());

  useEffect(() => {
    if (charParam == null) {
      setSelectedCharacter(null);
      return;
    }
    const cached = characterCacheRef.current.get(charParam);
    if (cached) {
      setSelectedCharacter(cached);
      return;
    }
    let cancelled = false;
    fetchCharacter(charParam)
      .then(character => {
        if (cancelled) return;
        characterCacheRef.current.set(charParam, character);
        setSelectedCharacter(character);
      })
      .catch(e => console.error('Error fetching character:', e));
    return () => { cancelled = true; };
  }, [charParam]);

  const openCharacterById = (charId) => openModal({ char: String(charId) });
  // List clicks already hold the full object — cache it so the modal renders
  // without waiting for the by-ID fetch that deep links need.
  const openCharacter = (character) => {
    if (character?.ID != null) characterCacheRef.current.set(String(character.ID), character);
    openCharacterById(character?.ID ?? character);
  };

  const openItem = (itemId) => openModal({ item: String(itemId) });

  const openBuddy = (buddy) => {
    const id = typeof buddy === 'object' ? (buddy?.ID ?? buddy?.id) : buddy;
    if (id == null) return;
    openModal({ buddy: String(id) });
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
            {activeTab === 'characters' && <CharactersTab onSelectCharacter={openCharacter} initialSearch={params.q ?? ''} />}
            {activeTab === 'buddies' && <BuddiesTab onSelectBuddy={openBuddy} initialSearch={params.q ?? ''} onOpenSkill={openSkillTab} />}
            {activeTab === 'skills' && <SkillsTab onOpenSource={openSourceTab} initialSearch={params.q ?? ''} />}
            {activeTab === 'items' && <ItemsTab onSelectItem={openItem} />}
            {activeTab === 'stages' && <StagesTab onSelectItem={openItem} onSelectBuddy={openBuddy} />}
            {activeTab === 'audio' && <AudioTab />}
            {activeTab === 'saveEditor' && <SaveConverterTab />}
            {activeTab === 'docs' && <DocsTab />}
          </div>
        </main>
      </div>

      <FloatingAudioPlayer
        activeTab={activeTab}
        onNavigateToAudio={() => handleTabChange('audio')}
      />

      {selectedCharacter && (
        <CharacterModal
          key={selectedCharacter.ID}
          character={selectedCharacter}
          onClose={() => closeModal('char')}
          onOpenItem={openItem}
          onOpenCharacter={openCharacterById}
          onOpenSkill={openSkillTab}
        />
      )}
      {itemParam != null && (
        <ItemModal
          itemId={itemParam}
          onClose={() => closeModal('item')}
        />
      )}
      {buddyParam != null && (
        <BuddyModal
          buddyId={buddyParam}
          onClose={() => closeModal('buddy')}
          onSelectBuddy={openBuddy}
          onOpenSkill={openSkillTab}
        />
      )}
    </>
  );
}

export default function App() {
  // Make the default view addressable so the URL is always a shareable state
  // snapshot (a bare '/' becomes '#/dashboard' without a history entry).
  useEffect(() => {
    if (!window.location.hash) navigate('#/dashboard', { replace: true });
  }, []);

  return (
    <GameDataProvider>
      <AudioProvider>
        <AppContent />
      </AudioProvider>
    </GameDataProvider>
  );
}
