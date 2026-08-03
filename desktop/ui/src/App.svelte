<script>
  import { onMount, tick } from 'svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Dashboard from './components/Dashboard.svelte';
  import QuizView from './components/QuizView.svelte';
  import FlashcardView from './components/FlashcardView.svelte';
  import AttemptView from './components/AttemptView.svelte';
  import SummaryView from './components/SummaryView.svelte';
  import LibraryListView from './components/LibraryListView.svelte';
  import SettingsView from './components/SettingsView.svelte';
  import { AlertTriangle, ArrowLeft, CircleCheck, Minus, PanelLeft, PanelRight, Square, X } from 'lucide-svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { api, apiBase } from './lib/api.js';

  const appWindow = getCurrentWindow();

  let workspaces = [];
  let workspace = null;
  let quizzes = [];
  let flashcardSets = [];
  let recentAttempts = [];
  let activity = [];
  let stats = { total_attempts: 0, accuracy: 0, total_quizzes: 0 };
  let selectedQuizId = null;
  let selectedFlashcardSetId = null;
  let selectedRecentId = null;
  let quiz = null;
  let flashcardSet = null;
  let attemptId = null;
  let summary = null;
  let summaryTitle = '';
  let summaryMode = 'quiz';
  let view = 'dashboard';
  let libraryKind = 'quizzes';
  let workspaceOnly = false;
  let loading = true;
  let error = '';
  let pendingStudy = null;
  let launching = false;
  let refreshInFlight = null;
  let refreshQueued = false;
  let mainElement;
  let windowMaximized = false;
  let sidebarCollapsed = false;
  let quizView;
  let flashcardView;
  let quizSubmitReady = false;
  let flashcardSubmitReady = false;
  let showStudyExitDialog = false;
  let themePreference = 'light';
  let systemThemeIsDark = false;
  let themeMediaQuery;

  function applyTheme() {
    const dark = themePreference === 'dark' || (themePreference === 'system' && systemThemeIsDark);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  }

  function setThemePreference(event) {
    const preference = event.detail;
    if (!['light', 'dark', 'system'].includes(preference)) return;
    themePreference = preference;
    try {
      localStorage.setItem('recall.theme', preference);
    } catch {
      // Keep the preference for this session if local storage is unavailable.
    }
    applyTheme();
  }

  function loadThemePreference() {
    try {
      const saved = localStorage.getItem('recall.theme');
      if (['light', 'dark', 'system'].includes(saved)) themePreference = saved;
    } catch {
      themePreference = 'light';
    }
    themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    systemThemeIsDark = themeMediaQuery.matches;
    applyTheme();
  }

  function handleSystemThemeChange(event) {
    systemThemeIsDark = event.matches;
    if (themePreference === 'system') applyTheme();
  }

  async function syncWindowState() {
    try {
      windowMaximized = await appWindow.isMaximized();
    } catch {
      windowMaximized = false;
    }
  }

  function startWindowDrag(event) {
    if (event.button !== 0) return;
    appWindow.startDragging().catch(() => {});
  }

  function minimizeWindow() {
    appWindow.minimize().catch(() => {});
  }

  async function toggleMaximizeWindow() {
    await appWindow.toggleMaximize().catch(() => {});
    await syncWindowState();
  }

  function closeWindow() {
    appWindow.close().catch(() => {});
  }

  function toggleSidebar() {
    sidebarCollapsed = !sidebarCollapsed;
  }

  async function resetPageScroll() {
    await tick();
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      mainElement?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.querySelector('.content')?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
  }

  $: navigationKey = [
    view,
    workspaceOnly ? 'workspace' : 'library',
    workspace?.id || '',
    selectedQuizId || '',
    selectedFlashcardSetId || '',
    selectedRecentId || '',
    summaryTitle,
    libraryKind
  ].join(':');

  $: if (navigationKey) resetPageScroll();

  async function loadWorkspace(id = workspace?.id) {
    if (!id) return;
    workspace = workspaces.find((item) => item.id === Number(id)) || workspace;
    const [quizResponse, flashcardResponse] = await Promise.all([
      api(`/api/workspaces/${id}/quizzes`),
      api(`/api/workspaces/${id}/flashcard-sets`)
    ]);
    quizzes = quizResponse.data || [];
    flashcardSets = flashcardResponse.data || [];
  }

  async function loadAllQuizzes() {
    const responses = await Promise.all(workspaces.map((item) => api(`/api/workspaces/${item.id}/quizzes`)));
    quizzes = responses.flatMap((response) => response.data || []);
  }

  async function loadAllFlashcards() {
    const responses = await Promise.all(workspaces.map((item) => api(`/api/workspaces/${item.id}/flashcard-sets`)));
    flashcardSets = responses.flatMap((response) => response.data || []);
  }

  async function loadRecentAttempts() {
    const response = await api('/api/recent-attempts?limit=50');
    recentAttempts = response.data || [];
  }

  async function refreshLibraryData() {
      const previousWorkspaceId = workspace?.id;
      const [workspaceResponse, statsResponse, activityResponse] = await Promise.all([api('/api/workspaces'), api('/api/stats'), api('/api/activity?days=365')]);
      workspaces = workspaceResponse.data || [];
      stats = statsResponse || stats;
      activity = activityResponse?.days || [];

      if (!workspaces.length) {
        workspace = null;
        quizzes = [];
        flashcardSets = [];
        await loadRecentAttempts();
        return;
      }

      workspace = workspaces.find((item) => item.id === Number(previousWorkspaceId)) || workspace || workspaces[0];
      if (workspaceOnly && workspace?.id) {
        await loadWorkspace(workspace.id);
      } else {
        await Promise.all([loadAllQuizzes(), loadAllFlashcards()]);
      }
      await loadRecentAttempts();
  }

  function refreshLibrary() {
    refreshQueued = true;
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
      do {
        refreshQueued = false;
        await refreshLibraryData();
      } while (refreshQueued);
    })().finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  async function load() {
    loading = true;
    error = '';
    try {
      workspace = workspaces[0] || null;
      await refreshLibrary();
    } catch (err) {
      error = err.message || 'Could not connect to Recall';
    } finally {
      loading = false;
    }
  }

  function subscribeToUpdates() {
    if (typeof EventSource === 'undefined') return () => {};
    let source = null;
    let retryTimer = null;
    let stopped = false;

    const connect = () => {
      if (stopped) return;
      source = new EventSource(`${apiBase}/api/events`);
      source.addEventListener('content.updated', () => {
        refreshLibrary().catch(() => {});
      });
      source.onerror = () => {
        source?.close();
        if (!stopped) retryTimer = window.setTimeout(connect, 2000);
      };
    };

    connect();
    return () => {
      stopped = true;
      source?.close();
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }

  async function selectWorkspace(event) {
    selectedQuizId = null;
    selectedFlashcardSetId = null;
    selectedRecentId = null;
    quiz = null;
    flashcardSet = null;
    attemptId = null;
    summary = null;
    view = 'dashboard';
    workspaceOnly = true;
    await loadWorkspace(event.detail);
  }

  function requestQuiz(event) {
    const item = quizzes.find((candidate) => candidate.id === Number(event.detail));
    pendingStudy = { kind: 'quiz', id: Number(event.detail), title: item?.title || 'Quiz' };
  }

  function requestFlashcardSet(event) {
    const item = flashcardSets.find((candidate) => candidate.id === Number(event.detail));
    pendingStudy = { kind: 'flashcards', id: Number(event.detail), title: item?.title || 'Flashcards' };
  }

  function openLibraryList(event) {
    libraryKind = event.detail;
    view = 'library-list';
    pendingStudy = null;
  }

  function openSettings() {
    view = 'settings';
    workspaceOnly = false;
    selectedRecentId = null;
    pendingStudy = null;
  }

  $: libraryItems = libraryKind === 'workspaces'
    ? workspaces
    : libraryKind === 'quizzes'
      ? quizzes
      : libraryKind === 'flashcards'
        ? flashcardSets
        : recentAttempts;

  async function selectQuiz(id) {
    quizSubmitReady = false;
    flashcardSubmitReady = false;
    selectedQuizId = Number(id);
    selectedFlashcardSetId = null;
    selectedRecentId = null;
    flashcardSet = null;
    attemptId = null;
    summary = null;
    pendingStudy = null;
    quiz = await api(`/api/quizzes/${selectedQuizId}`);
    view = 'quiz';
  }

  async function selectFlashcardSet(id) {
    quizSubmitReady = false;
    flashcardSubmitReady = false;
    selectedFlashcardSetId = Number(id);
    selectedQuizId = null;
    selectedRecentId = null;
    quiz = null;
    attemptId = null;
    summary = null;
    pendingStudy = null;
    flashcardSet = await api(`/api/flashcard-sets/${selectedFlashcardSetId}`);
    view = 'flashcards';
  }

  function exitStudy() {
    showStudyExitDialog = false;
    quizSubmitReady = false;
    flashcardSubmitReady = false;
    view = 'dashboard';
    quiz = null;
    flashcardSet = null;
    attemptId = null;
    summary = null;
    selectedQuizId = null;
    selectedFlashcardSetId = null;
    selectedRecentId = null;
    pendingStudy = null;
  }

  function requestStudyExit() {
    showStudyExitDialog = true;
  }

  function handleWindowBack() {
    if (view === 'quiz' || view === 'flashcards') {
      requestStudyExit();
    } else if (view === 'attempt') {
      exitStudy();
    } else {
      goHome();
    }
  }

  async function confirmStudy() {
    if (!pendingStudy || launching) return;
    const next = pendingStudy;
    launching = true;
    error = '';
    try {
      pendingStudy = null;
      if (next.kind === 'quiz') await selectQuiz(next.id);
      else await selectFlashcardSet(next.id);
    } catch (err) {
      pendingStudy = next;
      error = err.message || 'Could not open this study set';
    } finally {
      launching = false;
    }
  }

  function selectRecent(event) {
    selectedRecentId = Number(event.detail);
    selectedQuizId = null;
    selectedFlashcardSetId = null;
    quiz = null;
    flashcardSet = null;
    attemptId = selectedRecentId;
    view = 'attempt';
  }

  async function completeActivity(event) {
    summary = event.detail;
    summaryTitle = quiz?.title || flashcardSet?.title || 'Recall review';
    summaryMode = flashcardSet ? 'flashcards' : 'quiz';
    view = 'summary';
    quiz = null;
    flashcardSet = null;
    attemptId = null;
    selectedQuizId = null;
    selectedFlashcardSetId = null;
    selectedRecentId = null;
    [stats] = await Promise.all([api('/api/stats'), loadRecentAttempts()]);
    if (workspaceOnly) await loadWorkspace();
    else await Promise.all([loadAllQuizzes(), loadAllFlashcards()]);
  }

  async function goHome() {
    quizSubmitReady = false;
    flashcardSubmitReady = false;
    view = 'dashboard';
    workspaceOnly = false;
    selectedQuizId = null;
    selectedFlashcardSetId = null;
    selectedRecentId = null;
    quiz = null;
    flashcardSet = null;
    attemptId = null;
    summary = null;
    pendingStudy = null;
    await Promise.all([loadAllQuizzes(), loadAllFlashcards(), loadRecentAttempts()]);
  }

  onMount(() => {
    loadThemePreference();
    themeMediaQuery?.addEventListener?.('change', handleSystemThemeChange);
    const stopUpdates = subscribeToUpdates();
    load();
    syncWindowState();
    const unlistenResize = appWindow.onResized(() => syncWindowState());
    return () => {
      stopUpdates();
      themeMediaQuery?.removeEventListener?.('change', handleSystemThemeChange);
      unlistenResize.then((dispose) => dispose()).catch(() => {});
    };
  });
</script>

<header class="window-chrome" aria-label="Recall window controls">
  <div class="window-leading-controls">
    <div class="window-controls">
      <button class="window-control close" type="button" aria-label="Close Recall" title="Close" on:click={closeWindow}>
        <X size={13} strokeWidth={2.4} />
      </button>
      <button class="window-control minimize" type="button" aria-label="Minimize Recall" title="Minimize" on:click={minimizeWindow}>
        <Minus size={13} strokeWidth={2.4} />
      </button>
      <button class:active={windowMaximized} class="window-control maximize" type="button" aria-label="Toggle full size" title="Toggle full size" on:click={toggleMaximizeWindow}>
        <Square size={11} strokeWidth={2.4} />
      </button>
    </div>
    <div class="window-study-controls">
      <button class="study-window-back" type="button" disabled={view === 'dashboard' && !workspaceOnly} aria-label="Back to dashboard" title={view === 'dashboard' && !workspaceOnly ? 'Already on dashboard' : 'Back to dashboard'} on:click={handleWindowBack}>
        <ArrowLeft size={15} strokeWidth={1.8} />
      </button>
      <button class="sidebar-window-toggle" type="button" disabled={view === 'quiz' || view === 'flashcards'} aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={view === 'quiz' || view === 'flashcards' ? 'Sidebar disabled in Zen mode' : sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} on:click={toggleSidebar}>
        {#if sidebarCollapsed}<PanelRight size={15} strokeWidth={1.8} />{:else}<PanelLeft size={15} strokeWidth={1.8} />{/if}
      </button>
    </div>
  </div>
  <div class="window-drag-region" role="presentation" data-tauri-drag-region on:mousedown={startWindowDrag}></div>
  <div class="window-chrome-spacer">
    {#if view === 'quiz' && quizSubmitReady}
      <button class="window-submit-button" type="button" aria-label="Submit quiz" title="Submit quiz" on:click={() => quizView?.openSubmitDialog()}>
        <CircleCheck size={15} strokeWidth={1.9} />
        <span>Submit quiz</span>
      </button>
    {:else if view === 'flashcards' && flashcardSubmitReady}
      <button class="window-submit-button" type="button" aria-label="Submit flashcard review" title="Submit flashcard review" on:click={() => flashcardView?.openSubmitDialog()}>
        <CircleCheck size={15} strokeWidth={1.9} />
        <span>Submit review</span>
      </button>
    {/if}
  </div>
</header>

<div class:zen-mode={view === 'quiz' || view === 'flashcards'} class="app-shell">
  <Sidebar {workspaces} {quizzes} {flashcardSets} {recentAttempts} {sidebarCollapsed} currentView={view} {libraryKind} {selectedRecentId} on:workspaceSelect={selectWorkspace} on:quizSelect={requestQuiz} on:flashcardSelect={requestFlashcardSet} on:recentSelect={selectRecent} on:seeMore={openLibraryList} on:settings={openSettings} on:home={goHome} />
  <main bind:this={mainElement} class="main">
    <header class="topbar"><div class="crumbs"><span>Recall</span><span>›</span><span>{view === 'quiz' ? quiz?.title || 'Quiz' : workspace?.name || 'Overview'}</span></div></header>
    <div class="content">
      {#if loading}
        <div class="loading">Loading Recall…</div>
      {:else if error}
        <div class="eyebrow">Getting started</div><h1 class="hero-title">Recall is waiting for data.</h1><p class="hero-subtitle">{error}</p>
      {:else if view === 'quiz' && quiz}
        <QuizView bind:this={quizView} {quiz} autoStart={true} on:back={requestStudyExit} on:complete={completeActivity} on:submitReady={(event) => (quizSubmitReady = event.detail)} />
      {:else if view === 'flashcards' && flashcardSet}
        <FlashcardView bind:this={flashcardView} set={flashcardSet} autoStart={true} on:back={requestStudyExit} on:complete={completeActivity} on:submitReady={(event) => (flashcardSubmitReady = event.detail)} />
      {:else if view === 'library-list'}
        <LibraryListView kind={libraryKind} items={libraryItems} on:back={goHome} on:workspaceSelect={selectWorkspace} on:workspaceChanged={() => refreshLibrary()} on:workspaceDeleted={() => refreshLibrary()} on:quizSelect={requestQuiz} on:flashcardSelect={requestFlashcardSet} on:recentSelect={selectRecent} />
      {:else if view === 'attempt' && attemptId}
        <AttemptView attemptId={attemptId} on:back={exitStudy} />
      {:else if view === 'summary' && summary}
        <SummaryView result={summary} title={summaryTitle} mode={summaryMode} on:back={goHome} />
      {:else if view === 'settings'}
        <SettingsView {themePreference} on:themeChange={setThemePreference} />
      {:else}
        <Dashboard {stats} {workspace} {workspaces} {quizzes} {flashcardSets} {recentAttempts} {activity} {loading} {workspaceOnly} on:quizSelect={requestQuiz} on:flashcardSelect={requestFlashcardSet} on:recentSelect={selectRecent} />
      {/if}
    </div>
  </main>
  {#if pendingStudy}
    <div class="modal-backdrop open" role="presentation">
      <div class="modal start-exam-modal" role="dialog" aria-modal="true" aria-labelledby="study-launch-title">
        <div class="modal-icon"><AlertTriangle size={20} strokeWidth={1.8} /></div>
        <h2 id="study-launch-title">Start {pendingStudy.kind === 'flashcards' ? 'this flashcard review' : 'this quiz'}?</h2>
        <p class="modal-copy"><strong>{pendingStudy.title}</strong> will open in Zen mode. Recall the material honestly from memory without notes, search, or outside help.</p>
        <div class="start-exam-notice"><AlertTriangle size={17} strokeWidth={1.8} /> Your attempt starts after you continue.</div>
        <div class="modal-actions"><button class="btn" type="button" on:click={() => (pendingStudy = null)}>Cancel</button><button class="btn primary" type="button" disabled={launching} on:click={confirmStudy}>{launching ? 'Opening…' : pendingStudy.kind === 'flashcards' ? 'Start flashcards' : 'Start quiz'}</button></div>
      </div>
    </div>
  {/if}
  {#if showStudyExitDialog}
    <div class="modal-backdrop open" role="presentation">
      <div class="modal study-exit-modal" role="dialog" aria-modal="true" aria-labelledby="study-exit-title">
        <div class="modal-icon"><AlertTriangle size={20} strokeWidth={1.8} /></div>
        <h2 id="study-exit-title">Leave this review?</h2>
        <p class="modal-copy">Your current answers and progress will not be submitted. You can return to the dashboard and start the review again later.</p>
        <div class="modal-actions"><button class="btn" type="button" on:click={() => (showStudyExitDialog = false)}>Keep reviewing</button><button class="btn primary" type="button" on:click={exitStudy}>Back to dashboard</button></div>
      </div>
    </div>
  {/if}
</div>
