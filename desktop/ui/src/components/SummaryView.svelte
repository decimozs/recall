<script>
  import { Check, RotateCcw } from 'lucide-svelte';

  export let result;
  export let title = 'Recall review';
  export let mode = 'quiz';

  $: score = Number(result?.score || 0);
  $: total = Number(result?.total_questions || 0);
  $: correct = mode === 'flashcards' ? Number(result?.known_cards || 0) : Number(result?.correct_count || 0);
  $: message = score >= 90 ? 'Excellent recall. Keep the momentum going.' : score >= 80 ? 'Solid work. A quick revisit of the weaker areas will strengthen it.' : 'This is a good signal to revisit the source notes and try again soon.';
</script>

<section class="submission-summary">
  <h1 class="hero-title">Your {mode === 'flashcards' ? 'flashcard' : 'quiz'} summary</h1>
  <p class="hero-subtitle">{title}</p>
  <div class="summary-score">{score}%</div>
  <p class="summary-note">{message}</p>
  <div class="summary-grid">
    <div class="summary-card"><small>Score</small><strong>{score}%</strong></div>
    <div class="summary-card"><small>{mode === 'flashcards' ? 'KNOWN CARDS' : 'CORRECT ANSWERS'}</small><strong>{correct} / {total}</strong></div>
    <div class="summary-card"><small>Duration</small><strong>{result?.duration_display || '—'}</strong></div>
  </div>
  <div class="panel summary-guidance">
    <div class="panel-head"><h2>Next step</h2><Check size={16} strokeWidth={1.8} /></div>
    <p>{score < 80 ? 'Focus your next review on the questions or cards you missed, then take this material again while it is fresh.' : 'Keep this set in your rotation. Spaced repetition will help move this knowledge into long-term memory.'}</p>
  </div>
  <div class="summary-actions">
    <span class="summary-mode"><RotateCcw size={13} strokeWidth={1.8} /> {mode === 'flashcards' ? 'Flashcard review saved' : 'Quiz attempt saved'}</span>
  </div>
</section>
