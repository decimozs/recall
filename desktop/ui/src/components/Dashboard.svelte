<script>
  import { createEventDispatcher } from 'svelte';

  export let stats = { total_attempts: 0, accuracy: 0, total_quizzes: 0 };
  export let workspace = null;
  export let quizzes = [];
  export let workspaceOnly = false;
  export let loading = false;

  const dispatch = createEventDispatcher();
</script>

<section class="dashboard">
  <div class="eyebrow">{workspaceOnly ? 'Workspace' : 'Your learning space'}</div>
  <h1 class="hero-title">{workspaceOnly ? workspace?.name || 'Workspace' : 'Make your notes stick.'}</h1>
  <p class="hero-subtitle">{workspaceOnly ? 'Review the quizzes available in this workspace.' : 'Your overall learning status across all workspaces and quizzes.'}</p>
  <hr class="divider" />

  <div class="summary-grid">
    <div class="summary-card"><small>QUIZZES TAKEN</small><strong>{stats.total_attempts || 0}</strong></div>
    <div class="summary-card"><small>OVERALL ACCURACY</small><strong>{stats.accuracy || 0}%</strong></div>
    <div class="summary-card"><small>QUIZZES IN LIBRARY</small><strong>{stats.total_quizzes || 0}</strong></div>
  </div>

  <div class="panel">
    <div class="panel-head"><h2>{workspaceOnly ? 'Quizzes in this workspace' : 'Continue learning'}</h2><span>{quizzes.length} {quizzes.length === 1 ? 'quiz' : 'quizzes'}</span></div>
    {#if loading}
      <div class="empty">Loading your learning space…</div>
    {:else if quizzes.length}
      {#each quizzes as quiz}
        <button class="quiz-row" type="button" on:click={() => dispatch('quizSelect', quiz.id)}>
          <span><span class="quiz-name">{quiz.title}</span><span class="quiz-source">{quiz.source_title}</span></span>
          <span class="row-meta">{quiz.question_count} questions</span>
          <span class="best-score">{quiz.best_score ? `${quiz.best_score}% best` : 'Not started'}</span>
          <span class="row-meta">{quiz.attempt_count || 0} tries</span>
        </button>
      {/each}
    {:else}
      <div class="empty">No quizzes available yet.</div>
    {/if}
  </div>
</section>
