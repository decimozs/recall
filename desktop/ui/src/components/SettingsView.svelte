<script>
  import { createEventDispatcher } from 'svelte';
  import { Monitor, Moon, Sun } from 'lucide-svelte';

  export let themePreference = 'light';
  const dispatch = createEventDispatcher();

  const themes = [
    { value: 'light', label: 'Light', description: 'Use Recall’s light appearance.', icon: Sun },
    { value: 'dark', label: 'Dark', description: 'Use a minimal dark appearance.', icon: Moon },
    { value: 'system', label: 'System', description: 'Follow your macOS appearance.', icon: Monitor }
  ];
</script>

<section class="settings-view" aria-labelledby="settings-title">
  <div class="eyebrow">Recall</div>
  <h1 id="settings-title" class="hero-title">Settings</h1>
  <p class="hero-subtitle">Personalize how Recall looks and behaves.</p>

  <div class="dashboard-card settings-placeholder">
    <div class="settings-section-heading">
      <div>
        <h2>Appearance</h2>
        <p>Choose how Recall looks on this Mac.</p>
      </div>
      <span class="settings-current-value">{themes.find((theme) => theme.value === themePreference)?.label}</span>
    </div>
    <div class="theme-options" role="radiogroup" aria-label="Theme preference">
      {#each themes as theme}
        <button class:active={themePreference === theme.value} class="theme-option" type="button" role="radio" aria-checked={themePreference === theme.value} on:click={() => dispatch('themeChange', theme.value)}>
          <svelte:component this={theme.icon} size={17} strokeWidth={1.8} />
          <span><strong>{theme.label}</strong><small>{theme.description}</small></span>
        </button>
      {/each}
    </div>
  </div>
</section>
