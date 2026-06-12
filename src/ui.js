// ui.js — DOM HUD: captions, prompts, inventory chips, overlay.
export class UI {
  constructor() {
    this.overlay = document.getElementById('overlay');
    this.caption = document.getElementById('caption');
    this.prompt = document.getElementById('prompt');
    this.crosshair = document.getElementById('crosshair');
    this.inv = document.getElementById('inv');
    this.relicsEl = document.getElementById('relics');
    this.zoneEl = document.getElementById('zone');
    this.fader = document.getElementById('fader');
    this._capTimer = null;
    this._capQueue = [];
    this._capBusy = false;
  }

  hideOverlay() { this.overlay.classList.add('hidden'); }
  showOverlay() { this.overlay.classList.remove('hidden'); }
  fadeIn() { this.fader.classList.add('clear'); }

  say(text, dur = 5200) {
    this._capQueue.push({ text, dur });
    this._pump();
  }
  _pump() {
    if (this._capBusy || !this._capQueue.length) return;
    const { text, dur } = this._capQueue.shift();
    this._capBusy = true;
    this.caption.textContent = text;
    this.caption.classList.add('show');
    this._capTimer = setTimeout(() => {
      this.caption.classList.remove('show');
      setTimeout(() => { this._capBusy = false; this._pump(); }, 1300);
    }, dur);
  }

  setPrompt(text) {
    if (text) {
      this.prompt.textContent = text;
      this.prompt.classList.add('show');
      this.crosshair.classList.add('active');
    } else {
      this.prompt.classList.remove('show');
      this.crosshair.classList.remove('active');
    }
  }

  setInventory(cards, relicCount, colorOf) {
    // cards: array of tier numbers
    [...this.inv.querySelectorAll('.chip')].forEach(e => e.remove());
    for (const t of cards) {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.style.background = '#' + colorOf(t).toString(16).padStart(6, '0');
      this.inv.insertBefore(chip, this.relicsEl);
    }
    this.relicsEl.textContent = relicCount > 0 ? `· ${relicCount} object${relicCount > 1 ? 's' : ''}` : '';
  }

  setZone(label) { this.zoneEl.textContent = label; }
}
