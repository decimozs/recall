<script>
  import { createEventDispatcher } from 'svelte';
  import { BookOpen, CircleCheck, Clock3, History, Layers3, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-svelte';

  export let workspaces = [];
  export let quizzes = [];
  export let flashcardSets = [];
  export let recentAttempts = [];
  export let activeWorkspace = null;
  export let workspaceLabel = 'Library';
  export let selectedQuizId = null;
  export let selectedFlashcardSetId = null;
  export let selectedRecentId = null;
  export let stats = { accuracy: 0 };

  const dispatch = createEventDispatcher();
  let collapsed = false;
  let search = '';

  $: query = search.trim().toLowerCase();
  $: visibleWorkspaces = workspaces.filter((workspace) => workspace.name.toLowerCase().includes(query));
  $: visibleQuizzes = quizzes.filter((quiz) => `${quiz.title} ${quiz.source_title}`.toLowerCase().includes(query));
  $: visibleFlashcardSets = flashcardSets.filter((set) => `${set.title} ${set.source_title}`.toLowerCase().includes(query));
  $: visibleRecentAttempts = recentAttempts.filter((attempt) => `${attempt.quiz_title} ${attempt.source_title}`.toLowerCase().includes(query));
  $: hasSearchResults = visibleWorkspaces.length || visibleQuizzes.length || visibleFlashcardSets.length || visibleRecentAttempts.length;

  function chooseWorkspace(id) {
    dispatch('workspaceSelect', id);
  }

  function chooseQuiz(id) {
    dispatch('quizSelect', id);
  }

  function chooseFlashcardSet(id) {
    dispatch('flashcardSelect', id);
  }

  function chooseRecent(id) {
    dispatch('recentSelect', id);
  }

  function formatDate(value) {
    if (!value) return 'Not completed';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
  }
</script>

<aside class:collapsed class="sidebar">
  <div class="brand">
    <a class="brand-link" href="#/" on:click|preventDefault={() => dispatch('home')}>Recall</a>
    <button class="sidebar-toggle" type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} on:click={() => (collapsed = !collapsed)}>
      {#if collapsed}<PanelLeftOpen size={15} strokeWidth={1.8} />{:else}<PanelLeftClose size={15} strokeWidth={1.8} />{/if}
    </button>
  </div>

  {#if !collapsed}
    <label class="global-search" aria-label="Search workspace or quiz">
      <Search size={15} strokeWidth={1.8} aria-hidden="true" />
      <input bind:value={search} type="search" placeholder="Search workspace or quiz" />
      {#if search}<button type="button" aria-label="Clear search" on:click={() => (search = '')}><X size={15} strokeWidth={1.8} /></button>{/if}
    </label>
  {/if}

  {#if !collapsed}
    {#if visibleWorkspaces.length}
      <div class="workspace-label">WORKSPACES</div>
      <div class="workspace-list">
        {#each visibleWorkspaces as workspace}
          <button class:active={workspace.id === activeWorkspace?.id} class="workspace" type="button" title={workspace.name} on:click={() => chooseWorkspace(workspace.id)}>
            <Layers3 class="workspace-icon" size={16} strokeWidth={1.8} aria-hidden="true" />
            <span>{workspace.name}</span>
            <span class="workspace-count">{workspace.quiz_count || 0}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if visibleQuizzes.length}
      <div class="sidebar-section">
        <div class="workspace-label">QUIZZES</div>
        <div class="tree-group">
          <div class="tree-source"><BookOpen size={13} strokeWidth={1.8} aria-hidden="true" /> {activeWorkspace?.name || workspaceLabel}</div>
          {#each visibleQuizzes as quiz}
            <button class:active={quiz.id === selectedQuizId} class="tree-item" type="button" title={quiz.title} on:click={() => chooseQuiz(quiz.id)}>
              {#if quiz.attempt_count}<CircleCheck class="tree-status-icon" size={13} strokeWidth={1.8} aria-hidden="true" />{:else}<i class="tree-status"></i>{/if}
              <span>{quiz.title.split(' · ')[0]}</span>
              {#if quiz.best_score}<span class="tree-score">{quiz.best_score}%</span>{/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if visibleFlashcardSets.length}
      <div class="sidebar-section flashcard-sidebar-section">
        <div class="workspace-label">FLASHCARDS</div>
        <div class="tree-group">
          {#each visibleFlashcardSets as set}
            <button class:active={set.id === selectedFlashcardSetId} class="tree-item flashcard-tree-item" type="button" title={set.title} on:click={() => chooseFlashcardSet(set.id)}>
              <BookOpen class="tree-status-icon" size={13} strokeWidth={1.8} aria-hidden="true" />
              <span>{set.title}</span>
              {#if set.review_count}<span class="tree-score">{set.best_score}%</span>{/if}
            </button>
          {/each}
        </div>
      </div>
    {/if}

    {#if visibleRecentAttempts.length}
      <div class="sidebar-section recent-sidebar-section">
        <div class="workspace-label">RECENTS</div>
        <div class="recent-list">
          {#each visibleRecentAttempts as recent}
            <button class:active={recent.attempt_id === selectedRecentId} class="recent-item" type="button" title="View this attempt" on:click={() => chooseRecent(recent.attempt_id)}>
              {#if recent.content_mode === 'flashcards'}<History class="recent-icon" size={13} strokeWidth={1.8} aria-hidden="true" />{:else}<Clock3 class="recent-icon" size={13} strokeWidth={1.8} aria-hidden="true" />{/if}
              <span class="recent-item-copy">
                <span class="recent-title-row"><strong>{recent.quiz_title}</strong><time>{formatDate(recent.completed_at)}</time></span>
                <small class="recent-score">{recent.score ?? 0}%</small>
              </span>
            </button>
          {/each}
        </div>
      </div>
    {:else if query && !hasSearchResults}
      <div class="empty search-empty">No results found</div>
    {/if}
  {:else}
    {#each visibleWorkspaces as workspace}
      <button class:active={workspace.id === activeWorkspace?.id} class="workspace" type="button" title={workspace.name} aria-label={workspace.name} on:click={() => chooseWorkspace(workspace.id)}>
        <Layers3 class="workspace-icon" size={16} strokeWidth={1.8} aria-hidden="true" />
      </button>
    {/each}
  {/if}

  <div class="sidebar-bottom">
    <div class="stats-mini"><span>YOUR PROGRESS</span><strong>{stats.accuracy || 0}% accuracy</strong></div>
  </div>
</aside>
