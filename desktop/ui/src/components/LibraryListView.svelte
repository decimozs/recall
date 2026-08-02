<script>
  import { createEventDispatcher } from 'svelte';
  import { BookOpen, Clock3, History, Layers3 } from 'lucide-svelte';

  export let kind = 'quizzes';
  export let items = [];

  const dispatch = createEventDispatcher();

  const headings = {
    workspaces: ['All workspaces', 'Choose a workspace to open its learning dashboard.'],
    quizzes: ['All quizzes', 'Every quiz currently available in Recall.'],
    flashcards: ['All flashcards', 'Every flashcard set currently available in Recall.'],
    recents: ['Recent activity', 'Review a previous quiz or flashcard attempt.']
  };

  $: heading = headings[kind] || headings.quizzes;

  function formatDate(value) {
    if (!value) return 'Not completed';
    return new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(value));
  }

  function choose(item) {
    if (kind === 'workspaces') dispatch('workspaceSelect', item.id);
    else if (kind === 'quizzes') dispatch('quizSelect', item.id);
    else if (kind === 'flashcards') dispatch('flashcardSelect', item.id);
    else dispatch('recentSelect', item.attempt_id);
  }
</script>

<section class="library-list-view" aria-labelledby="library-list-title">
  <div class="eyebrow">Recall library</div>
  <h1 id="library-list-title" class="hero-title">{heading[0]}</h1>
  <p class="hero-subtitle">{heading[1]}</p>

  <div class="library-list-panel panel">
    {#if items.length}
      {#each items as item}
        <button class="library-list-row" type="button" on:click={() => choose(item)}>
          <span class="library-list-icon">
            {#if kind === 'workspaces'}<Layers3 size={17} strokeWidth={1.8} />
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
            {#if kind === 'workspaces'}{item.quiz_count || 0}
            {:else if kind === 'quizzes'}{item.question_count || 0} questions
            {:else if kind === 'flashcards'}{item.card_count || 0} cards
            {:else}{item.score ?? 0}%{/if}
          </span>
        </button>
      {/each}
    {:else}
      <div class="empty">No {kind} found.</div>
    {/if}
  </div>
</section>
