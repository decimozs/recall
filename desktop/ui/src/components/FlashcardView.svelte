<script>
  import { createEventDispatcher } from 'svelte';
  import { AlertTriangle, Check, ChevronRight, RotateCcw } from 'lucide-svelte';
  import { api } from '../lib/api.js';

  export let set;
  export let autoStart = false;
  const dispatch = createEventDispatcher();
  let cards = [];
  let index = 0;
  let flipped = false;
  let review = null;
  let started = false;
  let busy = false;
  let starting = false;
  let showStartDialog = false;
  let showSubmitDialog = false;
  let pendingKnown = null;
  let error = '';
  let loadedSetId = null;

  $: currentCard = cards[index];
  $: if (set && set.id !== loadedSetId) {
    loadedSetId = set.id;
    cards = set.cards || [];
    index = 0;
    flipped = false;
    review = null;
    started = false;
    busy = false;
    starting = false;
    showStartDialog = !autoStart;
    showSubmitDialog = false;
    pendingKnown = null;
    error = '';
    if (autoStart) begin();
  }

  async function begin() {
    starting = true;
    error = '';
    try {
      review = await api(`/api/flashcard-sets/${set.id}/reviews`, { method: 'POST' });
      started = true;
      showStartDialog = false;
    } catch (err) {
      error = err.message || 'Could not start flashcards';
    } finally {
      starting = false;
    }
  }

  async function mark(isKnown) {
    if (!review || !currentCard || busy) return;
    if (index + 1 >= cards.length) {
      pendingKnown = isKnown;
      showSubmitDialog = true;
      return;
    }
    await saveCard(isKnown);
  }

  async function saveCard(isKnown) {
    busy = true;
    error = '';
    try {
      await api(`/api/flashcard-reviews/${review.id}/card`, {
        method: 'PATCH',
        body: JSON.stringify({ card_id: currentCard.id, is_known: isKnown })
      });
      index += 1;
      flipped = false;
    } catch (err) {
      error = err.message || 'Could not save this review';
    } finally {
      busy = false;
    }
  }

  async function finishReview() {
    if (!review || busy || pendingKnown === null) return;
    busy = true;
    error = '';
    try {
      await api(`/api/flashcard-reviews/${review.id}/card`, {
        method: 'PATCH',
        body: JSON.stringify({ card_id: currentCard.id, is_known: pendingKnown })
      });
      const result = await api(`/api/flashcard-reviews/${review.id}/complete`, { method: 'POST' });
      showSubmitDialog = false;
      dispatch('complete', result);
    } catch (err) {
      error = err.message || 'Could not submit this review';
    } finally {
      busy = false;
    }
  }
</script>

<section class="flashcard-view">
  <div class="eyebrow">Flashcards / {set.source_title}</div>
  <h1 class="quiz-title">{set.title}</h1>
  <p class="hero-subtitle">{cards.length} cards for a focused memory review.</p>

  {#if !started}
    <div class="panel start-card">
      <h2>Ready to review?</h2>
      <p class="hero-subtitle">Flip each card, recall the answer, then mark whether you knew it.</p>
      <div class="flashcard-notice"><RotateCcw size={15} strokeWidth={1.8} /> Reviews are saved as a separate flashcard attempt.</div>
      <button class="btn primary" type="button" on:click={() => (showStartDialog = true)}>Review instructions</button>
    </div>
  {:else if currentCard}
    <div class="flashcard-review-heading">
      <div class="flashcard-progress">Card {index + 1} of {cards.length}</div>
      <div class="flashcard-progress-bar"><i style={`width:${((index + 1) / cards.length) * 100}%`}></i></div>
    </div>
    <button class:is-flipped={flipped} class="flashcard-card" type="button" on:click={() => (flipped = !flipped)} aria-label={flipped ? 'Show front of card' : 'Show answer'}>
      <span class="flashcard-inner">
        <span class="flashcard-face flashcard-front"><small>Recall</small><strong>{currentCard.front}</strong><em>Click to reveal</em></span>
        <span class="flashcard-face flashcard-back"><small>Answer</small><strong>{currentCard.back}</strong>{#if currentCard.hint}<em>{currentCard.hint}</em>{/if}</span>
      </span>
    </button>
    <p class="flashcard-help">Flip the card before choosing how well you remembered it.</p>
    <div class="flashcard-actions">
      <button class="btn" type="button" disabled={!flipped || busy} on:click={() => mark(false)}>Needs review</button>
      <button class="btn primary" type="button" disabled={!flipped || busy} on:click={() => mark(true)}><Check size={14} strokeWidth={1.8} /> {index + 1 === cards.length ? 'Finish review' : 'I knew this'} <ChevronRight size={14} strokeWidth={1.8} /></button>
    </div>
  {:else}
    <div class="empty">This flashcard set has no cards yet.</div>
  {/if}
  {#if showStartDialog}
    <div class="modal-backdrop open" role="presentation">
      <div class="modal start-exam-modal" role="dialog" aria-modal="true" aria-labelledby="flashcard-start-title">
        <div class="modal-icon"><AlertTriangle size={20} strokeWidth={1.8} /></div>
        <h2 id="flashcard-start-title">Start this review?</h2>
        <p class="modal-copy">Review each card honestly from memory. Do not use notes or outside help before revealing the answer.</p>
        <div class="start-exam-notice"><AlertTriangle size={17} strokeWidth={1.8} /> Your review starts when you continue and opens in Zen mode.</div>
        <div class="modal-actions"><button class="btn" type="button" on:click={() => dispatch('back')}>Cancel</button><button class="btn primary" type="button" disabled={starting} on:click={begin}>{starting ? 'Starting…' : 'Start review'}</button></div>
      </div>
    </div>
  {/if}
  {#if showSubmitDialog}
    <div class="modal-backdrop open" role="presentation">
      <div class="modal submit-modal" role="dialog" aria-modal="true" aria-labelledby="flashcard-submit-title">
        <h2 id="flashcard-submit-title">Finish this review?</h2>
        <p class="modal-copy">You are on the last card. Confirm to save this flashcard attempt and see your summary.</p>
        <div class="submit-checklist"><span>{cards.length} cards</span><span>{pendingKnown ? 'Marked known' : 'Marked needs review'}</span></div>
        <div class="modal-actions"><button class="btn" type="button" on:click={() => (showSubmitDialog = false)}>Keep reviewing</button><button class="btn primary" type="button" disabled={busy} on:click={finishReview}>{busy ? 'Submitting…' : 'Confirm finish'}</button></div>
      </div>
    </div>
  {/if}
  {#if error}<div class="feedback">{error}</div>{/if}
</section>
