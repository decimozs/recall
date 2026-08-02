<script>
  import { createEventDispatcher } from 'svelte';
  import { CircleCheck, CircleX } from 'lucide-svelte';
  import { api } from '../lib/api.js';

  export let attemptId;
  const dispatch = createEventDispatcher();
  let attempt = null;
  let error = '';
  let loadedAttemptId = null;

  $: if (attemptId && attemptId !== loadedAttemptId) {
    loadedAttemptId = attemptId;
    loadAttempt();
  }

  async function loadAttempt() {
    attempt = null;
    error = '';
    try {
      attempt = await api(`/api/attempts/${attemptId}`);
    } catch (err) {
      error = err.message || 'Could not load this attempt';
    }
  }

  function formatDate(value) {
    return value ? new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value)) : 'Not completed';
  }
</script>

<section class="attempt-view">
  {#if error}
    <div class="eyebrow">Attempt review</div><h1 class="hero-title">Could not load this attempt.</h1><p class="hero-subtitle">{error}</p>
  {:else if !attempt}
    <div class="loading">Loading attempt…</div>
  {:else}
    <div class="eyebrow">{attempt.content_mode === 'flashcards' ? 'Flashcard review' : 'Quiz review'}</div>
    <h1 class="hero-title">{attempt.quiz_title || attempt.flashcard_title}</h1>
    <p class="hero-subtitle">{attempt.source_title} · {formatDate(attempt.completed_at)}</p>
    <div class="summary-grid attempt-summary-grid">
      <div class="summary-card"><small>Current score</small><strong>{attempt.score ?? 0}%</strong></div>
      <div class="summary-card"><small>Time duration</small><strong>{attempt.duration_display}</strong></div>
      <div class="summary-card"><small>Questions</small><strong>{attempt.total_questions}</strong></div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>What you remembered</h2><span>{attempt.content_mode === 'flashcards' ? attempt.flashcard_answers?.length || 0 : attempt.answers?.length || 0} responses</span></div>
      {#if attempt.content_mode === 'flashcards'}
        <div class="answer-review-list">
          {#each attempt.flashcard_answers || [] as answer}
            <article class="answer-review-item">
              <div class="answer-status">{answer.is_known ? 'Known' : 'Needs review'}</div>
              <div class="answer-prompt">{answer.front}</div>
              <div class="answer-line"><strong>Answer</strong><span>{answer.back}</span></div>
            </article>
          {:else}<div class="empty">No card responses recorded.</div>{/each}
        </div>
      {:else}
        <div class="answer-review-list">
          {#each attempt.answers || [] as answer}
            <article class:incorrect={!answer.is_correct} class="answer-review-item">
              <div class="answer-status">{#if answer.is_correct}<CircleCheck size={13} strokeWidth={1.8} /> Correct{:else}<CircleX size={13} strokeWidth={1.8} /> Incorrect{/if}</div>
              <div class="answer-prompt">{answer.position}. {answer.prompt}</div>
              <div class="answer-line"><strong>Your answer</strong><span>{answer.given_answer || 'No answer'}</span></div>
              {#if !answer.is_correct}<div class="answer-line"><strong>Correct answer</strong><span>{answer.correct_answer}</span></div><div class="answer-explanation">{answer.explanation || 'Review this concept from the source material.'}</div>{/if}
            </article>
          {:else}<div class="empty">No answers recorded.</div>{/each}
        </div>
      {/if}
    </div>
  {/if}
</section>
