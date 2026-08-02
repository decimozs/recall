<script>
  import { createEventDispatcher } from 'svelte';
  import { BookOpen, Clock3, Flame, History, Layers3, Target } from 'lucide-svelte';

  export let stats = { total_attempts: 0, accuracy: 0, total_quizzes: 0 };
  export let workspace = null;
  export let workspaces = [];
  export let quizzes = [];
  export let flashcardSets = [];
  export let recentAttempts = [];
  export let activity = [];
  export let workspaceOnly = false;
  export let loading = false;

  const dispatch = createEventDispatcher();

  const scoreFor = (item) => item?.best_score == null ? 0 : Number(item.best_score);
  const countFor = (item) => Number(item?.attempt_count || 0);
  const formatDate = (value) => {
    if (!value) return 'No date yet';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };
  const formatTitle = (value) => String(value || '').split(' · ')[0];
  const formatDuration = (value) => value || 'Not timed';
  const selectStudy = (item) => {
    if (item?.kind === 'flashcards') dispatch('flashcardSelect', item.id);
    else dispatch('quizSelect', item?.id);
  };

  $: visibleWorkspaces = workspaceOnly && workspace ? [workspace] : workspaces;
  $: weakAreas = quizzes
    .filter((quiz) => countFor(quiz) > 0 && scoreFor(quiz) < 80)
    .sort((a, b) => scoreFor(a) - scoreFor(b))
    .slice(0, 4);
  $: unreviewedQuiz = quizzes.find((quiz) => countFor(quiz) === 0);
  $: dueFlashcard = flashcardSets
    .filter((set) => Number(set.review_count || 0) === 0 || scoreFor(set) < 100)
    .sort((a, b) => scoreFor(a) - scoreFor(b))[0];
  $: nextReview = weakAreas[0]
    ? { ...weakAreas[0], kind: 'quiz', reason: `Your current best score is ${scoreFor(weakAreas[0])}%.` }
    : unreviewedQuiz
      ? { ...unreviewedQuiz, kind: 'quiz', reason: 'You have not reviewed this quiz yet.' }
      : dueFlashcard
        ? { ...dueFlashcard, kind: 'flashcards', reason: Number(dueFlashcard.review_count || 0) === 0 ? 'This set has not been reviewed yet.' : `Your current best score is ${scoreFor(dueFlashcard)}%.` }
        : null;
  $: flashcardsDue = flashcardSets
    .filter((set) => Number(set.review_count || 0) === 0 || scoreFor(set) < 100)
    .slice(0, 3);
  $: weeklySessions = activity.slice(-7).reduce((total, day) => total + Number(day.quiz_count || 0), 0);
  $: weeklyQuestions = activity.slice(-7).reduce((total, day) => total + Number(day.question_count || 0), 0);
  $: maxActivity = Math.max(1, ...activity.map((day) => Number(day.quiz_count || 0)));
  $: currentStreak = (() => {
    const activeDays = new Set(activity.filter((day) => Number(day.quiz_count || 0) > 0).map((day) => String(day.day)));
    const key = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    if (!activeDays.has(key(cursor))) cursor.setDate(cursor.getDate() - 1);
    let streak = 0;
    while (activeDays.has(key(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  })();
</script>

<section class="dashboard">
  {#if !workspaceOnly}<div class="eyebrow">Hello 👋</div>{/if}
  <h1 class:dashboard-workspace-title={workspaceOnly} class="hero-title">
    {#if workspaceOnly}
      <span>{workspace?.name || 'Workspace'}</span> <span class="workspace-title-accent">Workspace</span>
    {:else}
      Make your recall experience more interactive.
    {/if}
  </h1>
  <p class="hero-subtitle">{workspaceOnly ? 'Review the quizzes and flashcards available in this workspace.' : 'Turn every review into a more interactive way to remember what matters.'}</p>

  {#if loading}
    <div class="dashboard-card dashboard-loading">Loading your learning space…</div>
  {:else}
    <div class="dashboard-summary-grid">
      <div class="summary-card"><small>Quizzes taken</small><strong>{stats.total_attempts || 0}</strong><span class="summary-caption">Completed reviews</span></div>
      <div class="summary-card"><small>Overall accuracy</small><strong>{stats.accuracy || 0}%</strong><span class="summary-caption">Across all attempts</span></div>
      <div class="summary-card"><small>Quizzes in library</small><strong>{stats.total_quizzes || 0}</strong><span class="summary-caption">Ready to review</span></div>
      <div class="summary-card"><small>Flashcard sets</small><strong>{flashcardSets.length}</strong><span class="summary-caption">Memory reviews</span></div>
    </div>

    <div class="dashboard-overview-grid">
      <section class="dashboard-card next-review-card">
        <div class="dashboard-card-heading"><span><Target size={16} /> Next review</span><small>Recommended</small></div>
        {#if nextReview}
          <div class="dashboard-card-title">{formatTitle(nextReview.title)}</div>
          <p class="dashboard-card-copy">{nextReview.reason}</p>
          <div class="dashboard-card-meta">{nextReview.kind === 'flashcards' ? `${nextReview.card_count || 0} cards` : `${nextReview.question_count || 0} questions`} · {nextReview.source_title || 'Learning material'}</div>
          <button class="dashboard-action" type="button" on:click={() => selectStudy(nextReview)}>Start review</button>
        {:else}
          <div class="dashboard-card-empty">Everything is reviewed. Choose any item below when you are ready for another pass.</div>
        {/if}
      </section>

      <section class="dashboard-card momentum-card">
        <div class="dashboard-card-heading"><span><Flame size={16} /> Your momentum</span><small>Last 7 days</small></div>
        <div class="momentum-value">{currentStreak} <span>day {currentStreak === 1 ? 'streak' : 'streak'}</span></div>
        <div class="momentum-stats"><span><strong>{weeklySessions}</strong> reviews</span><span><strong>{weeklyQuestions}</strong> questions</span></div>
        <div class="activity-strip" aria-label="Quiz activity for the last seven days">
          {#each activity.slice(-7) as day}
            <div class="activity-day" title={`${day.day}: ${day.quiz_count || 0} reviews`}>
              <div class="activity-bar" style={`height: ${Math.max(8, (Number(day.quiz_count || 0) / maxActivity) * 100)}%`}></div>
              <small>{String(day.day || '').slice(-2)}</small>
            </div>
          {/each}
        </div>
      </section>
    </div>

    <div class="dashboard-content-grid">
      <section class="dashboard-card">
        <div class="dashboard-card-heading"><span><Target size={16} /> Focus areas</span><small>{weakAreas.length ? 'Needs a revisit' : 'Looking good'}</small></div>
        {#if weakAreas.length}
          <div class="dashboard-list">
            {#each weakAreas as quiz}
              <button class="dashboard-list-item" type="button" on:click={() => selectStudy({ ...quiz, kind: 'quiz' })}>
                <span class="dashboard-list-copy"><strong>{formatTitle(quiz.title)}</strong><small>{quiz.source_title || 'Quiz'}</small></span>
                <span class="dashboard-list-score">{scoreFor(quiz)}%</span>
              </button>
            {/each}
          </div>
        {:else}
          <div class="dashboard-card-empty">No weak areas yet. Keep reviewing to maintain your progress.</div>
        {/if}
      </section>

      <section class="dashboard-card">
        <div class="dashboard-card-heading"><span><Layers3 size={16} /> Flashcards to review</span><small>{flashcardSets.length} sets</small></div>
        {#if flashcardsDue.length}
          <div class="dashboard-list">
            {#each flashcardsDue as set}
              <button class="dashboard-list-item" type="button" on:click={() => selectStudy({ ...set, kind: 'flashcards' })}>
                <span class="dashboard-list-copy"><strong>{formatTitle(set.title)}</strong><small>{set.card_count || 0} cards · {set.source_title || 'Learning material'}</small></span>
                <span class="dashboard-list-score">{Number(set.review_count || 0) ? `${scoreFor(set)}%` : 'New'}</span>
              </button>
            {/each}
          </div>
        {:else}
          <div class="dashboard-card-empty">No flashcards need review right now.</div>
        {/if}
      </section>
    </div>

    <section class="dashboard-card workspace-progress-card">
      <div class="dashboard-card-heading"><span><BookOpen size={16} /> Workspace progress</span><small>{visibleWorkspaces.length} {visibleWorkspaces.length === 1 ? 'workspace' : 'workspaces'}</small></div>
      {#if visibleWorkspaces.length}
        <div class="workspace-progress-list">
          {#each visibleWorkspaces.slice(0, 4) as item}
            <div class="workspace-progress-row">
              <div class="workspace-progress-copy"><strong>{item.name}</strong><small>{item.quiz_count || 0} quizzes</small></div>
              <div class="workspace-progress-track"><span style={`width: ${Math.min(100, Math.max(0, Number(item.average_score || 0)))}%`}></span></div>
              <strong class="workspace-progress-score">{item.average_score == null ? '—' : `${Math.round(Number(item.average_score))}%`}</strong>
            </div>
          {/each}
        </div>
      {:else}
        <div class="dashboard-card-empty">No workspaces are connected yet.</div>
      {/if}
    </section>

    <section class="dashboard-card recent-activity-card">
      <div class="dashboard-card-heading"><span><History size={16} /> Recent activity</span><small>{recentAttempts.length ? `${recentAttempts.length} latest` : 'No attempts yet'}</small></div>
      {#if recentAttempts.length}
        <div class="dashboard-list">
          {#each recentAttempts.slice(0, 5) as attempt}
            <button class="dashboard-list-item" type="button" on:click={() => dispatch('recentSelect', attempt)}>
              <span class="dashboard-list-copy"><strong>{formatTitle(attempt.quiz_title)}</strong><small>{formatDate(attempt.completed_at)} · {formatDuration(attempt.duration_display)}</small></span>
              <span class="dashboard-list-score">{attempt.score == null ? '—' : `${attempt.score}%`}</span>
            </button>
          {/each}
        </div>
      {:else}
        <div class="dashboard-card-empty">Your completed reviews will appear here.</div>
      {/if}
    </section>

    <section class="dashboard-card roadmap-card">
      <div class="dashboard-card-heading"><span><Clock3 size={16} /> Learning roadmap</span><small>Notion sync</small></div>
      <div class="dashboard-card-empty">Roadmap progress will appear here when a learning roadmap is synced from Notion.</div>
    </section>

    <div class="panel dashboard-learning-card">
      <div class="panel-head"><h2>{workspaceOnly ? 'Quizzes in this workspace' : 'Continue learning'}</h2><span>{quizzes.length} {quizzes.length === 1 ? 'quiz' : 'quizzes'}</span></div>
      {#if quizzes.length}
        {#each quizzes as quiz}
          <button class="quiz-row" type="button" on:click={() => selectStudy({ ...quiz, kind: 'quiz' })}>
            <span><span class="quiz-name">{formatTitle(quiz.title)}</span><span class="quiz-source">{quiz.source_title}</span></span>
            <span class="row-meta">{quiz.question_count} questions</span>
            <span class="best-score">{quiz.best_score != null ? `${quiz.best_score}% best` : 'Not started'}</span>
            <span class="row-meta">{quiz.attempt_count || 0} tries</span>
          </button>
        {/each}
      {:else}
        <div class="empty">No quizzes available yet.</div>
      {/if}
    </div>
  {/if}
</section>
