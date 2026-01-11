const PRESETS = [
  { name: 'iPhone SE', w: 375, h: 667 },
  { name: 'iPhone 14 Pro', w: 393, h: 852 },
  { name: 'iPad Mini', w: 768, h: 1024 },
  { name: 'Laptop (13")', w: 1280, h: 800 },
  { name: 'Desktop (1080p)', w: 1920, h: 1080 },
];

document.addEventListener('DOMContentLoaded', () => {
  // --- Viewport Sizing Logic ---
  const presetSelect = document.getElementById('preset');
  const widthInput = document.getElementById('width');
  const heightInput = document.getElementById('height');
  const resizeBtn = document.getElementById('resizeBtn');

  // NEW: Button to open Simulator Page
  // We inject this button dynamically at the top of the popup
  const openSimBtn = document.createElement('button');
  openSimBtn.textContent = "Open in Simulator Tab";
  openSimBtn.className = "btn-primary";
  openSimBtn.style.width = "100%";
  openSimBtn.style.marginBottom = "16px";
  openSimBtn.style.background = "#059669"; // Green to distinguish it
  
  // Insert at the very top of the body, before the first label
  document.body.insertBefore(openSimBtn, document.querySelector('label'));

  openSimBtn.addEventListener('click', () => {
    // Get the current active tab's URL to pass it to the simulator
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const url = tabs[0]?.url || '';
      // Open the simulator.html (which must be in the extension folder)
      chrome.tabs.create({ url: `simulator.html?url=${encodeURIComponent(url)}` });
    });
  });

  // Populate Presets dropdown
  PRESETS.forEach(p => {
    const option = document.createElement('option');
    option.value = `${p.w}x${p.h}`;
    option.textContent = `${p.name} (${p.w}x${p.h})`;
    presetSelect.appendChild(option);
  });

  // Handle Preset Selection (Auto-fill inputs)
  presetSelect.addEventListener('change', (e) => {
    if (e.target.value) {
      const [w, h] = e.target.value.split('x');
      widthInput.value = w;
      heightInput.value = h;
    }
  });

  // Handle Window Resize (for the current browser window)
  resizeBtn.addEventListener('click', () => {
    const w = parseInt(widthInput.value);
    const h = parseInt(heightInput.value);

    if (w && h) {
      chrome.windows.getCurrent((win) => {
        chrome.windows.update(win.id, {
          width: w,
          height: h,
          state: 'normal' // 'normal' allows resizing if previously maximized
        });
      });
    }
  });


  // --- Scroll Logic (Communicates with content.js) ---
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');

  // Helper to send message to the active tab's content script
  function sendMessage(action, payload = {}) {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action, ...payload });
      }
    });
  }

  startBtn.addEventListener('click', () => {
    const config = {
      delay: Number(document.getElementById('delay').value),
      speed: Number(document.getElementById('speed').value),
      easing: document.getElementById('easing').value,
      startId: document.getElementById('startId').value,
      endId: document.getElementById('endId').value
    };

    sendMessage('START', { config });
    
    // Toggle UI state
    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';
  });

  stopBtn.addEventListener('click', () => {
    sendMessage('STOP');
    
    // Toggle UI state
    startBtn.style.display = 'block';
    stopBtn.style.display = 'none';
  });

  // Jump Button Listeners
  document.getElementById('jumpStart').addEventListener('click', () => {
    sendMessage('JUMP', { targetId: document.getElementById('startId').value });
  });

  document.getElementById('jumpEnd').addEventListener('click', () => {
    sendMessage('JUMP', { targetId: document.getElementById('endId').value });
  });
});