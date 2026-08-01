<script>
  import { onMount } from 'svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Dashboard from './components/Dashboard.svelte';
  import QuizView from './components/QuizView.svelte';
  import FlashcardView from './components/FlashcardView.svelte';
  import AttemptView from './components/AttemptView.svelte';
  import SummaryView from './components/SummaryView.svelte';
  import { AlertTriangle } from 'lucide-svelte';
  import { api } from './lib/api.js';

  let workspaces = [];
  let workspace = null;
  let quizzes = [];
  let flashcardSets = [];
  let recentAttempts = [];
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
  let workspaceOnly = false;
  let loading = true;
  let error = '';
  let pendingStudy = null;
  let launching = false;

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
    const response = await api('/api/recent-attempts?limit=8');
    recentAttempts = response.data || [];
  }

  async function load() {
    loading = true;
    error = '';
    try {
      const [workspaceResponse, statsResponse] = await Promise.all([api('/api/workspaces'), api('/api/stats')]);
      workspaces = workspaceResponse.data || [];
      stats = statsResponse || stats;
      workspace = workspaces[0] || null;
      if (workspace) await Promise.all([loadAllQuizzes(), loadAllFlashcards(), loadRecentAttempts()]);
    } catch (err) {
      error = err.message || 'Could not connect to Recall';
    } finally {
      loading = false;
    }
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

  async function selectQuiz(id) {
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

  onMount(load);
</script>

<div class:zen-mode={view === 'quiz' || view === 'flashcards'} class="app-shell">
  <Sidebar {workspaces} {quizzes} {flashcardSets} {recentAttempts} activeWorkspace={workspaceOnly ? workspace : null} workspaceLabel={workspace?.name || 'Library'} {stats} {selectedQuizId} {selectedFlashcardSetId} {selectedRecentId} on:workspaceSelect={selectWorkspace} on:quizSelect={requestQuiz} on:flashcardSelect={requestFlashcardSet} on:recentSelect={selectRecent} on:home={goHome} />
  <main class="main">
    <header class="topbar"><div class="crumbs"><span>Recall</span><span>›</span><span>{view === 'quiz' ? quiz?.title || 'Quiz' : workspace?.name || 'Overview'}</span></div></header>
    <div class="content">
      {#if loading}
        <div class="loading">Loading Recall…</div>
      {:else if error}
        <div class="eyebrow">Getting started</div><h1 class="hero-title">Recall is waiting for data.</h1><p class="hero-subtitle">{error}</p>
      {:else if view === 'quiz' && quiz}
        <QuizView {quiz} autoStart={true} on:back={exitStudy} on:complete={completeActivity} />
      {:else if view === 'flashcards' && flashcardSet}
        <FlashcardView set={flashcardSet} autoStart={true} on:back={exitStudy} on:complete={completeActivity} />
      {:else if view === 'attempt' && attemptId}
        <AttemptView attemptId={attemptId} on:back={exitStudy} />
      {:else if view === 'summary' && summary}
        <SummaryView result={summary} title={summaryTitle} mode={summaryMode} on:back={goHome} />
      {:else}
        <Dashboard {stats} {workspace} {quizzes} {loading} {workspaceOnly} on:quizSelect={requestQuiz} />
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
</div>
