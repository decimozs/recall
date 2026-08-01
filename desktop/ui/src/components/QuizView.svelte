<script>
  import { createEventDispatcher } from 'svelte';
  import { tick } from 'svelte';
  import { AlertTriangle, ChevronLeft, ChevronRight, CircleCheck } from 'lucide-svelte';
  import { api, shuffle } from '../lib/api.js';

  export let quiz;
  export let autoStart = false;
  const dispatch = createEventDispatcher();
  let questions = [];
  let page = 0;
  let selectedAnswers = {};
  let attempt = null;
  let started = false;
  let starting = false;
  let submitting = false;
  let showStartDialog = false;
  let showSubmitDialog = false;
  let error = '';
  const pageSize = 10;
  let loadedQuizId = null;
  let focusedQuestionIndex = 0;

  $: totalPages = Math.max(1, Math.ceil(questions.length / pageSize));
  $: pageQuestions = questions.slice(page * pageSize, (page + 1) * pageSize);
  $: answered = Object.keys(selectedAnswers).length;
  $: unanswered = Math.max(questions.length - answered, 0);

  $: if (quiz && quiz.id !== loadedQuizId) {
    loadedQuizId = quiz.id;
    questions = shuffle(quiz.questions || []);
    page = 0;
    focusedQuestionIndex = 0;
    selectedAnswers = {};
    attempt = null;
    started = false;
    starting = false;
    submitting = false;
    showStartDialog = !autoStart;
    showSubmitDialog = false;
    error = '';
    if (autoStart) begin();
  }

  function choose(questionId, answer) {
    selectedAnswers = { ...selectedAnswers, [questionId]: answer };
  }

  async function goToQuestion(questionIndex) {
    const question = questions[questionIndex];
    if (!question) return;
    focusedQuestionIndex = questionIndex;
    page = Math.floor(questionIndex / pageSize);
    await tick();
    document.getElementById(`question-${question.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function begin() {
    starting = true;
    error = '';
    try {
      attempt = await api(`/api/quizzes/${quiz.id}/attempts`, { method: 'POST' });
      started = true;
      showStartDialog = false;
    } catch (err) {
      error = err.message || 'Could not start the quiz';
    } finally {
      starting = false;
    }
  }

  async function submit() {
    if (!attempt || submitting) return;
    submitting = true;
    error = '';
    try {
      for (const question of questions) {
        await api(`/api/attempts/${attempt.id}/answer`, {
          method: 'PATCH',
          body: JSON.stringify({ question_id: question.id, given_answer: selectedAnswers[question.id] || '' })
        });
      }
      const result = await api(`/api/attempts/${attempt.id}/complete`, { method: 'POST', body: JSON.stringify({ mode: 'zen' }) });
      showSubmitDialog = false;
      dispatch('complete', result);
    } catch (err) {
      error = err.message || 'Could not submit the quiz';
    } finally {
      submitting = false;
    }
  }
</script>

<section class="quiz-view">
  <button class="quiz-zen-back-icon" type="button" on:click={() => dispatch('back')} aria-label="Back to dashboard" title="Back to dashboard"><ChevronLeft size={18} strokeWidth={1.8} /></button>
  <div class="zen-study-nav">
    {#if started}
      <div class="question-tracker" aria-label="Question tracker">
        {#each questions as question, questionIndex}
          <button
            class:current={focusedQuestionIndex === questionIndex}
            class:answered={selectedAnswers[question.id] !== undefined}
            class="tracker-dot"
            type="button"
            title={`Question ${questionIndex + 1}${selectedAnswers[question.id] !== undefined ? ' answered' : ''}`}
            aria-label={`Go to question ${questionIndex + 1}`}
            on:click={() => goToQuestion(questionIndex)}
          >{questionIndex + 1}</button>
        {/each}
      </div>
    {/if}
  </div>
  <div class="eyebrow">{quiz.workspace_name} / {quiz.source_title}</div>
  <h1 class="quiz-title">{quiz.title}</h1>
  <div class="quiz-meta">{questions.length} questions · Page {page + 1} of {totalPages}</div>

  {#if !started}
    <div class="panel start-card">
      <h2>Before you begin</h2>
      <p class="hero-subtitle">This quiz opens in Zen mode. Answer from memory and submit when you finish.</p>
      <button class="btn primary" type="button" on:click={() => (showStartDialog = true)}>Review instructions</button>
    </div>
  {:else}
    <div class="progress-wrap"><div class="progress-label"><span>Progress</span><span>{answered} of {questions.length}</span></div><div class="progress"><i style={`width:${questions.length ? (answered / questions.length) * 100 : 0}%`}></i></div></div>
    <div class="quiz-page">
      {#each pageQuestions as question, index}
        {@const trueFalse = question.type === 'true_false'}
        {@const choices = trueFalse ? ['True', 'False'] : question.choices || []}
        <article id={`question-${question.id}`} class="question-block page-question">
          <div class="question-number">QUESTION {String(page * pageSize + index + 1).padStart(2, '0')}</div>
          <div class="question-type-label">{trueFalse ? 'True or false' : 'Multiple choice'}</div>
          <div class="question-text">{question.prompt}</div>
          <div class:true-false-choices={trueFalse} class="choices">
            {#each choices as choice, choiceIndex}
              <button class:selected={selectedAnswers[question.id] === choice} class="choice" type="button" on:click={() => choose(question.id, choice)}>
                {#if !trueFalse}<span class="choice-key">{String.fromCharCode(65 + choiceIndex)}</span>{/if}
                <span>{choice}</span>
              </button>
            {/each}
          </div>
        </article>
      {/each}
    </div>
    <div class="question-actions page-actions">
      {#if page > 0}<button class="btn" type="button" on:click={() => (page -= 1)}><ChevronLeft size={14} strokeWidth={1.8} /> Previous</button>{:else}<span></span>{/if}
      {#if page + 1 < totalPages}
        <button class="btn primary" type="button" on:click={() => (page += 1)}>Next page <ChevronRight size={14} strokeWidth={1.8} /></button>
      {:else}
        <div class="submit-action">
          {#if questions.length > 0 && answered === questions.length}<span class="submit-ready-message" aria-live="polite">All questions answered. Ready to submit.</span>{/if}
          <button class="btn primary" type="button" disabled={submitting} on:click={() => (showSubmitDialog = true)}><CircleCheck size={14} strokeWidth={1.8} /> {answered === questions.length ? 'Submit quiz' : 'Review & submit'}</button>
        </div>
      {/if}
    </div>
  {/if}

  {#if showStartDialog}
    <div class="modal-backdrop open" role="presentation">
      <div class="modal start-exam-modal" role="dialog" aria-modal="true" aria-labelledby="quiz-start-title">
        <div class="modal-icon"><AlertTriangle size={20} strokeWidth={1.8} /></div>
        <h2 id="quiz-start-title">Start this quiz?</h2>
        <p class="modal-copy">Take this quiz honestly from your own memory. Do not use notes, search, or outside help while recalling.</p>
        <div class="start-exam-notice"><AlertTriangle size={17} strokeWidth={1.8} /> Your attempt starts when you continue and will open in Zen mode.</div>
        <div class="modal-actions"><button class="btn" type="button" on:click={() => dispatch('back')}>Cancel</button><button class="btn primary" type="button" disabled={starting} on:click={begin}>{starting ? 'Starting…' : 'Start quiz'}</button></div>
      </div>
    </div>
  {/if}

  {#if showSubmitDialog}
    <div class="modal-backdrop open" role="presentation">
      <div class="modal submit-modal" role="dialog" aria-modal="true" aria-labelledby="quiz-submit-title">
        <h2 id="quiz-submit-title">Submit your quiz?</h2>
        <p class="modal-copy">Review your answers before finishing. You can still go back and complete any unanswered questions.</p>
        <div class="submit-checklist"><span>{answered} answered</span><span>{unanswered} unanswered</span><span>{questions.length} total</span></div>
        <div class="modal-actions"><button class="btn" type="button" on:click={() => (showSubmitDialog = false)}>Keep reviewing</button><button class="btn primary" type="button" disabled={submitting} on:click={submit}>{submitting ? 'Submitting…' : 'Confirm submit'}</button></div>
      </div>
    </div>
  {/if}

  {#if error}<div class="feedback">{error}</div>{/if}
</section>
