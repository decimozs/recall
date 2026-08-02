<script>
  import { createEventDispatcher, onMount } from 'svelte';
  import { BookOpen, Clock3, History, LayoutGrid, LayoutList, MoreVertical, Pencil, Pin, Trash2, X } from 'lucide-svelte';
  import { api } from '../lib/api.js';

  export let kind = 'quizzes';
  export let items = [];

  const dispatch = createEventDispatcher();
  let workspaceLayout = 'list';
  let openWorkspaceMenuId = null;
  let dialog = '';
  let editingWorkspace = null;
  let deletingWorkspace = null;
  let editName = '';
  let editEmoji = '';
  let emojiPickerOpen = false;
  let emojiSearch = '';
  let actionError = '';
  let actionLoading = false;
  let actionNotice = '';
  let noticeTimer;

  const emojiGroups = [
    { label: 'Learning', items: [
      { emoji: '📓', label: 'Notebook' }, { emoji: '📚', label: 'Books' }, { emoji: '🧠', label: 'Brain' },
      { emoji: '📝', label: 'Memo' }, { emoji: '💡', label: 'Idea' }, { emoji: '🎯', label: 'Target' },
      { emoji: '🧪', label: 'Experiment' }, { emoji: '🗂️', label: 'Files' }, { emoji: '🔖', label: 'Bookmark' },
      { emoji: '✏️', label: 'Pencil' }, { emoji: '📖', label: 'Open book' }, { emoji: '🧩', label: 'Puzzle' }
    ] },
    { label: 'Objects', items: [
      { emoji: '💻', label: 'Laptop' }, { emoji: '🖥️', label: 'Desktop' }, { emoji: '🔬', label: 'Microscope' },
      { emoji: '🛠️', label: 'Tools' }, { emoji: '🧭', label: 'Compass' }, { emoji: '⚙️', label: 'Gear' },
      { emoji: '📌', label: 'Pushpin' }, { emoji: '🔍', label: 'Search' }, { emoji: '📦', label: 'Package' }
    ] },
    { label: 'Symbols', items: [
      { emoji: '⭐', label: 'Star' }, { emoji: '✨', label: 'Sparkles' }, { emoji: '🔥', label: 'Fire' },
      { emoji: '✅', label: 'Check mark' }, { emoji: '🚀', label: 'Rocket' }, { emoji: '🌱', label: 'Seedling' },
      { emoji: '🌎', label: 'Earth' }, { emoji: '❤️', label: 'Heart' }, { emoji: '🧘', label: 'Meditation' }
    ] }
  ];

  $: visibleEmojiGroups = emojiGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !emojiSearch.trim() || item.label.toLowerCase().includes(emojiSearch.trim().toLowerCase()))
    }))
    .filter((group) => group.items.length);

  const headings = {
    workspaces: ['All workspaces', 'Choose a workspace to open its learning dashboard.'],
    quizzes: ['All quizzes', 'Every quiz currently available in Recall.'],
    flashcards: ['All flashcards', 'Every flashcard set currently available in Recall.'],
    recents: ['Recent activity', 'Review a previous quiz or flashcard attempt.']
  };

  $: heading = headings[kind] || headings.quizzes;

  onMount(() => {
    if (kind !== 'workspaces') return;
    try {
      const savedLayout = localStorage.getItem('recall.workspaces.layout');
      if (savedLayout === 'grid' || savedLayout === 'list') workspaceLayout = savedLayout;
    } catch {
      workspaceLayout = 'list';
    }
    const closeMenuOnOutsideClick = (event) => {
      if (!event.target.closest('.workspace-actions')) openWorkspaceMenuId = null;
    };
    window.addEventListener('pointerdown', closeMenuOnOutsideClick);
    return () => {
      window.removeEventListener('pointerdown', closeMenuOnOutsideClick);
      if (noticeTimer) window.clearTimeout(noticeTimer);
    };
  });

  function setWorkspaceLayout(layout) {
    workspaceLayout = layout;
    try {
      localStorage.setItem('recall.workspaces.layout', layout);
    } catch {
      // Keep the layout for this session if local storage is unavailable.
    }
  }

  function formatDate(value) {
    if (!value) return 'Not completed';
    return new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value));
  }

  function workspaceEmoji(item) {
    return ['◈', '◌', '▣'].includes(item.icon) ? '📓' : item.icon || '📓';
  }

  function choose(item) {
    if (kind === 'workspaces') dispatch('workspaceSelect', item.id);
    else if (kind === 'quizzes') dispatch('quizSelect', item.id);
    else if (kind === 'flashcards') dispatch('flashcardSelect', item.id);
    else dispatch('recentSelect', item.attempt_id);
  }

  function toggleWorkspaceMenu(item) {
    openWorkspaceMenuId = openWorkspaceMenuId === item.id ? null : item.id;
  }

  function openEditDialog(item) {
    openWorkspaceMenuId = null;
    editingWorkspace = item;
    editName = item.name || '';
    editEmoji = workspaceEmoji(item);
    emojiPickerOpen = false;
    emojiSearch = '';
    actionError = '';
    dialog = 'edit';
  }

  function openDeleteDialog(item) {
    openWorkspaceMenuId = null;
    deletingWorkspace = item;
    actionError = '';
    dialog = 'delete';
  }

  function closeDialog() {
    dialog = '';
    editingWorkspace = null;
    deletingWorkspace = null;
    emojiPickerOpen = false;
    emojiSearch = '';
    actionError = '';
  }

  function chooseEmoji(emoji) {
    editEmoji = emoji;
    emojiPickerOpen = false;
    emojiSearch = '';
  }

  function showNotice(message) {
    actionNotice = message;
    if (noticeTimer) window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => (actionNotice = ''), 2600);
  }

  async function saveWorkspace() {
    const name = editName.trim();
    const icon = editEmoji.trim();
    if (!name || !icon) {
      actionError = 'Add a workspace name and emoji.';
      return;
    }
    actionLoading = true;
    actionError = '';
    try {
      await api(`/api/workspaces/${editingWorkspace.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name, icon })
      });
      showNotice('Workspace updated');
      dispatch('workspaceChanged');
      closeDialog();
    } catch (error) {
      actionError = error.message || 'Could not update this workspace.';
    } finally {
      actionLoading = false;
    }
  }

  async function deleteWorkspace() {
    actionLoading = true;
    actionError = '';
    try {
      await api(`/api/workspaces/${deletingWorkspace.id}`, { method: 'DELETE' });
      dispatch('workspaceDeleted', deletingWorkspace.id);
      closeDialog();
    } catch (error) {
      actionError = error.message || 'Could not delete this workspace.';
    } finally {
      actionLoading = false;
    }
  }

  async function toggleWorkspacePin(item) {
    openWorkspaceMenuId = null;
    try {
      await api(`/api/workspaces/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ pinned: !item.pinned })
      });
      showNotice(item.pinned ? 'Workspace unpinned' : 'Workspace pinned');
      dispatch('workspaceChanged');
    } catch (error) {
      actionError = error.message || 'Could not update the pin.';
    }
  }
</script>

<section class="library-list-view" aria-labelledby="library-list-title">
  <div class="library-title-row">
    <h1 id="library-list-title" class="hero-title">{heading[0]}</h1>
    {#if kind === 'workspaces'}
      <div class="layout-toggle" role="group" aria-label="Workspace layout">
        <button class:active={workspaceLayout === 'list'} type="button" aria-label="List view" aria-pressed={workspaceLayout === 'list'} title="List view" on:click={() => setWorkspaceLayout('list')}>
          <LayoutList size={16} strokeWidth={1.8} />
        </button>
        <button class:active={workspaceLayout === 'grid'} type="button" aria-label="Grid view" aria-pressed={workspaceLayout === 'grid'} title="Grid view" on:click={() => setWorkspaceLayout('grid')}>
          <LayoutGrid size={16} strokeWidth={1.8} />
        </button>
      </div>
    {/if}
  </div>
  <p class="hero-subtitle">{heading[1]}</p>

  <div class:workspace-grid={kind === 'workspaces' && workspaceLayout === 'grid'} class:workspace-list={kind === 'workspaces' && workspaceLayout === 'list'} class:flashcard-list={kind === 'flashcards'} class="library-list-panel panel">
    {#if items.length}
      {#if kind === 'workspaces' && workspaceLayout === 'grid'}
        <div class="workspace-notebook-grid">
          {#each items as item}
            <article class="workspace-notebook-card">
              <button class="workspace-notebook-open" type="button" on:click={() => choose(item)}>
                <span class="workspace-notebook-cover" aria-hidden="true">{workspaceEmoji(item)}</span>
                <span class="workspace-notebook-copy">
                  <strong title={item.name}>{item.name}</strong>
                  <small>{formatDate(item.created_at)} · {item.quiz_count || 0} quizzes</small>
                </span>
              </button>
              <div class="workspace-actions">
                <button class:active={openWorkspaceMenuId === item.id} class="workspace-notebook-menu-button" type="button" aria-label={`Actions for ${item.name}`} aria-expanded={openWorkspaceMenuId === item.id} title="Workspace actions" on:click|stopPropagation={() => toggleWorkspaceMenu(item)}>
                  <MoreVertical size={18} strokeWidth={1.8} />
                </button>
                {#if openWorkspaceMenuId === item.id}
                  <div class="workspace-menu" role="menu" tabindex="-1">
                    <button type="button" role="menuitem" on:click={() => openEditDialog(item)}><Pencil size={15} strokeWidth={1.8} /> Edit</button>
                    <button type="button" role="menuitem" on:click={() => toggleWorkspacePin(item)}><Pin size={15} strokeWidth={1.8} /> {item.pinned ? 'Unpin workspace' : 'Pin workspace'}</button>
                    <button class="danger" type="button" role="menuitem" on:click={() => openDeleteDialog(item)}><Trash2 size={15} strokeWidth={1.8} /> Delete</button>
                  </div>
                {/if}
              </div>
            </article>
          {/each}
        </div>
      {:else}
        {#each items as item}
          <div class:workspace-list-row-shell={kind === 'workspaces'}>
            <button class="library-list-row" class:workspace-list-row={kind === 'workspaces'} type="button" on:click={() => choose(item)}>
              <span class="library-list-icon">
                {#if kind === 'workspaces'}<span class="workspace-list-emoji" aria-hidden="true">{workspaceEmoji(item)}</span>
                {:else if kind === 'quizzes'}<BookOpen size={17} strokeWidth={1.8} />
                {:else if kind === 'flashcards'}<BookOpen size={17} strokeWidth={1.8} />
                {:else if item.content_mode === 'flashcards'}<History size={17} strokeWidth={1.8} />
                {:else}<Clock3 size={17} strokeWidth={1.8} />{/if}
              </span>
              <span class="library-list-copy">
                <strong title={kind === 'recents' ? item.quiz_title : kind === 'workspaces' ? item.name : item.title}>{kind === 'recents' ? item.quiz_title : kind === 'workspaces' ? item.name : item.title}</strong>
                <small>
                  {#if kind === 'workspaces'}{item.quiz_count || 0} quizzes
                  {:else if kind === 'quizzes'}{item.source_title || 'Quiz'}
                  {:else if kind === 'flashcards'}{item.source_title || 'Flashcards'}
                  {:else}{formatDate(item.completed_at)}{/if}
                </small>
              </span>
              <span class="library-list-meta">
                {#if kind === 'quizzes'}{item.question_count || 0} questions
                {:else if kind === 'flashcards'}{item.card_count || 0} cards
                {:else if kind === 'recents'}{item.score ?? 0}%{/if}
              </span>
            </button>
            {#if kind === 'workspaces'}
              <div class="workspace-actions workspace-list-actions">
                <button class:active={openWorkspaceMenuId === item.id} class="workspace-notebook-menu-button" type="button" aria-label={`Actions for ${item.name}`} aria-expanded={openWorkspaceMenuId === item.id} title="Workspace actions" on:click|stopPropagation={() => toggleWorkspaceMenu(item)}>
                  <MoreVertical size={18} strokeWidth={1.8} />
                </button>
                {#if openWorkspaceMenuId === item.id}
                  <div class="workspace-menu" role="menu" tabindex="-1">
                    <button type="button" role="menuitem" on:click={() => openEditDialog(item)}><Pencil size={15} strokeWidth={1.8} /> Edit</button>
                    <button type="button" role="menuitem" on:click={() => toggleWorkspacePin(item)}><Pin size={15} strokeWidth={1.8} /> {item.pinned ? 'Unpin workspace' : 'Pin workspace'}</button>
                    <button class="danger" type="button" role="menuitem" on:click={() => openDeleteDialog(item)}><Trash2 size={15} strokeWidth={1.8} /> Delete</button>
                  </div>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      {/if}
    {:else}
      <div class="empty">No {kind} found.</div>
    {/if}
  </div>

  {#if dialog === 'delete' && deletingWorkspace}
    <div class="modal-backdrop open" role="presentation" on:click={(event) => event.currentTarget === event.target && closeDialog()}>
      <div class="modal workspace-action-modal" role="dialog" aria-modal="true" aria-labelledby="delete-workspace-title">
        <button class="modal-close" type="button" aria-label="Close" on:click={closeDialog}><X size={18} strokeWidth={1.8} /></button>
        <h2 id="delete-workspace-title">Delete workspace?</h2>
        <p class="modal-copy">This will remove <strong>{deletingWorkspace.name}</strong> and its quizzes, flashcards, and attempts from this local Recall library.</p>
        {#if actionError}<div class="modal-status error">{actionError}</div>{/if}
        <div class="modal-actions"><button class="btn" type="button" disabled={actionLoading} on:click={closeDialog}>Cancel</button><button class="btn danger-button" type="button" disabled={actionLoading} on:click={deleteWorkspace}>{actionLoading ? 'Deleting…' : 'Delete workspace'}</button></div>
      </div>
    </div>
  {/if}

  {#if dialog === 'edit' && editingWorkspace}
    <div class="modal-backdrop open" role="presentation" on:click={(event) => event.currentTarget === event.target && closeDialog()}>
      <div class="modal workspace-action-modal" role="dialog" aria-modal="true" aria-labelledby="edit-workspace-title">
        <button class="modal-close" type="button" aria-label="Close" on:click={closeDialog}><X size={18} strokeWidth={1.8} /></button>
        <h2 id="edit-workspace-title">Edit workspace</h2>
        <p class="modal-copy">Update the name and emoji used for this workspace.</p>
        <div class="workspace-edit-fields">
          <div class="workspace-edit-field">
            <label class="modal-label" for="workspace-name">Name</label>
            <input id="workspace-name" class="modal-input" bind:value={editName} maxlength="120" />
          </div>
          <div class="workspace-edit-field workspace-edit-emoji-field">
            <label class="modal-label" for="workspace-emoji-trigger">Emoji</label>
            <div class="workspace-emoji-control">
              <button id="workspace-emoji-trigger" class="workspace-emoji-trigger" class:active={emojiPickerOpen} type="button" aria-haspopup="dialog" aria-expanded={emojiPickerOpen} aria-label="Choose workspace emoji" on:click={() => (emojiPickerOpen = !emojiPickerOpen)}>
                <span class="workspace-emoji-trigger-icon" aria-hidden="true">{editEmoji || '🙂'}</span>
              </button>
              {#if emojiPickerOpen}
                <div class="workspace-emoji-picker" role="dialog" aria-label="Choose workspace emoji">
                  <input class="modal-input workspace-emoji-search" bind:value={emojiSearch} placeholder="Search emoji" aria-label="Search emoji" />
                  <div class="workspace-emoji-groups">
                    {#each visibleEmojiGroups as group}
                      <section>
                        <h3>{group.label}</h3>
                        <div class="workspace-emoji-choices">
                          {#each group.items as item}
                            <button class:active={editEmoji === item.emoji} type="button" aria-label={`Use ${item.label}`} title={item.label} on:click={() => chooseEmoji(item.emoji)}>{item.emoji}</button>
                          {/each}
                        </div>
                      </section>
                    {:else}
                      <p class="workspace-emoji-empty">No matching emoji.</p>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </div>
        {#if actionError}<div class="modal-status error">{actionError}</div>{/if}
        <div class="modal-actions"><button class="btn" type="button" disabled={actionLoading} on:click={closeDialog}>Cancel</button><button class="btn primary" type="button" disabled={actionLoading} on:click={saveWorkspace}>{actionLoading ? 'Saving…' : 'Save changes'}</button></div>
      </div>
    </div>
  {/if}

  {#if actionNotice}
    <div class="workspace-action-toast" role="status">{actionNotice}</div>
  {/if}
</section>
