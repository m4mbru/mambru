<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  let time: string = '';
  let date: string = '';
  let timer: ReturnType<typeof setInterval> | null = null;

  function updateClock() {
    const now = new Date();
    time = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    date = now.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  onMount(() => {
    updateClock();
    timer = setInterval(updateClock, 1000);
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });
</script>

<div class="clock-card">
  <div class="clock-time">{time}</div>
  <div class="clock-date">{date}</div>
  <div class="clock-bar">
    <div class="clock-bar-fill"></div>
  </div>
</div>

<style>
  .clock-card {
    text-align: center;
  }

  .clock-time {
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 28px;
    font-weight: 300;
    color: #00BCD4;
    letter-spacing: 3px;
    text-shadow: 0 0 20px rgba(0, 188, 212, 0.3);
    line-height: 1.2;
  }

  .clock-date {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: rgba(0, 188, 212, 0.6);
    margin-top: 6px;
  }

  .clock-bar {
    margin-top: 12px;
    height: 2px;
    background: rgba(0, 188, 212, 0.1);
    border-radius: 1px;
    overflow: hidden;
  }

  .clock-bar-fill {
    height: 100%;
    width: 40%;
    background: #00BCD4;
    border-radius: 1px;
    animation: barSlide 4s ease-in-out infinite;
    box-shadow: 0 0 8px rgba(0, 188, 212, 0.3);
  }

  @keyframes barSlide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }
</style>
