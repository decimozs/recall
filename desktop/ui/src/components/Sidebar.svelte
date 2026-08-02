<script>
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { BookOpen, Clock3, Layers3, Search, Settings, WalletCards, X } from 'lucide-svelte';

  export let workspaces = [];
  export let quizzes = [];
  export let flashcardSets = [];
  export let recentAttempts = [];
  export let selectedRecentId = null;
  export let sidebarCollapsed = false;
  export let currentView = 'dashboard';
  export let libraryKind = 'quizzes';

  const dispatch = createEventDispatcher();
  let commandSearch = '';
  let commandSearchOpen = false;
  let commandInput;

  $: query = commandSearch.trim().toLowerCase();
  $: searchWorkspaces = workspaces.filter((workspace) => workspace.name.toLowerCase().includes(query));
  $: searchQuizzes = quizzes.filter((quiz) => `${quiz.title} ${quiz.source_title}`.toLowerCase().includes(query));
  $: searchFlashcards = flashcardSets.filter((set) => `${set.title} ${set.source_title}`.toLowerCase().includes(query));
  $: searchRecents = recentAttempts.filter((attempt) => `${attempt.quiz_title} ${attempt.source_title}`.toLowerCase().includes(query));
  $: hasSearchResults = searchWorkspaces.length || searchQuizzes.length || searchFlashcards.length || searchRecents.length;

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

  function seeMore(kind) {
    dispatch('seeMore', kind);
  }

  function openSettings() {
    dispatch('settings');
  }

  function formatDate(value) {
    if (!value) return 'Not completed';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
  }

  async function openCommandSearch() {
    commandSearchOpen = true;
    await tick();
    commandInput?.focus();
  }

  function closeCommandSearch() {
    commandSearchOpen = false;
    commandSearch = '';
  }

  function chooseCommand(kind, id) {
    closeCommandSearch();
    if (kind === 'workspace') chooseWorkspace(id);
    else if (kind === 'quiz') chooseQuiz(id);
    else if (kind === 'flashcards') chooseFlashcardSet(id);
    else chooseRecent(id);
  }

  function handleKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      if (commandSearchOpen) closeCommandSearch();
      else openCommandSearch();
    } else if (event.key === 'Escape' && commandSearchOpen) {
      event.preventDefault();
      closeCommandSearch();
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

<aside class:collapsed={sidebarCollapsed} class:command-open={commandSearchOpen} class="sidebar">
  {#if !sidebarCollapsed}
    <div class="brand">
      <a class="brand-link" href="#/" on:click|preventDefault={() => dispatch('home')}>Recall</a>
      <button class="sidebar-search-button" type="button" aria-label="Search Recall" title="Search Recall (⌘K)" on:click={openCommandSearch}>
        <Search size={16} strokeWidth={1.8} />
      </button>
    </div>

    <nav class="sidebar-navigation" aria-label="Recall library">
      <button class:active={currentView === 'library-list' && libraryKind === 'workspaces'} class="sidebar-nav-item" type="button" on:click={() => seeMore('workspaces')}>
        <Layers3 class="sidebar-nav-icon" size={16} strokeWidth={1.8} />
        <span>Workspaces</span>
        <small>{workspaces.length}</small>
      </button>
      <button class:active={currentView === 'library-list' && libraryKind === 'quizzes'} class="sidebar-nav-item" type="button" on:click={() => seeMore('quizzes')}>
        <BookOpen class="sidebar-nav-icon" size={16} strokeWidth={1.8} />
        <span>Quizzes</span>
        <small>{quizzes.length}</small>
      </button>
      <button class:active={currentView === 'library-list' && libraryKind === 'flashcards'} class="sidebar-nav-item" type="button" on:click={() => seeMore('flashcards')}>
        <WalletCards class="sidebar-nav-icon" size={16} strokeWidth={1.8} />
        <span>Flashcards</span>
        <small>{flashcardSets.length}</small>
      </button>
    </nav>

    <section class="sidebar-section recent-sidebar-section" aria-labelledby="recents-title">
      <div class="sidebar-section-heading">
        <div id="recents-title" class="workspace-label">Recents</div>
      </div>
      {#if recentAttempts.length}
        <div class="recent-list">
          {#each recentAttempts as recent}
            <button class:active={currentView === 'attempt' && recent.attempt_id === selectedRecentId} class="recent-item" type="button" on:click={() => chooseRecent(recent.attempt_id)}>
              <span class="recent-item-copy">
                <span class="recent-title-row"><strong>{recent.quiz_title}</strong><time>{formatDate(recent.completed_at)}</time></span>
                <small class="recent-score"><span class="recent-mode-badge">{recent.content_mode === 'flashcards' ? 'Flashcards' : 'Quiz'}</span><span>{recent.score ?? 0}%</span></small>
              </span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="empty sidebar-empty">No recent activity</div>
      {/if}
    </section>

    <div class="sidebar-footer">
      <button class:active={currentView === 'settings'} class="sidebar-nav-item" type="button" on:click={openSettings}>
        <Settings class="sidebar-nav-icon" size={16} strokeWidth={1.8} />
        <span>Settings</span>
      </button>
    </div>
  {/if}

  {#if commandSearchOpen}
    <div class="command-search-backdrop" role="presentation" on:click={(event) => event.currentTarget === event.target && closeCommandSearch()}>
      <div class="command-search-dialog" role="dialog" aria-modal="true" aria-labelledby="command-search-title">
        <div class="command-search-heading">
          <div>
            <div class="eyebrow">Recall search</div>
            <h2 id="command-search-title">Find something to recall</h2>
          </div>
          <button class="command-search-close" type="button" aria-label="Close search" title="Close search" on:click={closeCommandSearch}><X size={18} strokeWidth={1.8} /></button>
        </div>
        <label class="command-search-input-wrap" aria-label="Search workspaces, quizzes, flashcards, and recents">
          <Search size={17} strokeWidth={1.8} />
          <input bind:this={commandInput} bind:value={commandSearch} type="search" placeholder="Search workspaces, quizzes, flashcards…" />
          {#if commandSearch}<button type="button" aria-label="Clear search" on:click={() => { commandSearch = ''; commandInput?.focus(); }}><X size={15} strokeWidth={1.8} /></button>{/if}
          <kbd>Esc</kbd>
        </label>

        <div class="command-search-results">
          {#if !query}
            <div class="command-search-hint">Search across your workspaces, quizzes, flashcards, and recent attempts.</div>
          {:else if !hasSearchResults}
            <div class="empty command-search-empty">No results found</div>
          {:else}
            {#if searchWorkspaces.length}
              <div class="command-search-group"><div class="command-search-group-label">Workspaces</div>{#each searchWorkspaces as item}<button class="command-search-result" type="button" on:click={() => chooseCommand('workspace', item.id)}><Layers3 size={16} strokeWidth={1.8} /><span><strong>{item.name}</strong><small>{item.quiz_count || 0} quizzes</small></span></button>{/each}</div>
            {/if}
            {#if searchQuizzes.length}
              <div class="command-search-group"><div class="command-search-group-label">Quizzes</div>{#each searchQuizzes as item}<button class="command-search-result" type="button" on:click={() => chooseCommand('quiz', item.id)}><BookOpen size={16} strokeWidth={1.8} /><span><strong>{item.title.split(' · ')[0]}</strong><small>{item.source_title || 'Quiz'}</small></span></button>{/each}</div>
            {/if}
            {#if searchFlashcards.length}
              <div class="command-search-group"><div class="command-search-group-label">Flashcards</div>{#each searchFlashcards as item}<button class="command-search-result" type="button" on:click={() => chooseCommand('flashcards', item.id)}><WalletCards size={16} strokeWidth={1.8} /><span><strong>{item.title}</strong><small>{item.source_title || 'Flashcards'}</small></span></button>{/each}</div>
            {/if}
            {#if searchRecents.length}
              <div class="command-search-group"><div class="command-search-group-label">Recents</div>{#each searchRecents as item}<button class="command-search-result" type="button" on:click={() => chooseCommand('recent', item.attempt_id)}><Clock3 size={16} strokeWidth={1.8} /><span><strong>{item.quiz_title}</strong><small>{item.score ?? 0}% · {formatDate(item.completed_at)}</small></span></button>{/each}</div>
            {/if}
          {/if}
        </div>
        <div class="command-search-footer"><span>Search everything in Recall</span><span><kbd>⌘</kbd><kbd>K</kbd> to toggle</span></div>
      </div>
    </div>
  {/if}
</aside>
