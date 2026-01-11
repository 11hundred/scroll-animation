document.addEventListener('DOMContentLoaded', () => {
  const frame = document.getElementById('frame');
  const iframe = document.getElementById('viewer');
  const urlInput = document.getElementById('urlInput');
  const presetSelect = document.getElementById('preset');
  const canvas = document.getElementById('canvas');
  const scaleBadge = document.getElementById('scaleBadge');
  
  // Custom Dimension Inputs
  const widthInput = document.getElementById('customWidth');
  const heightInput = document.getElementById('customHeight');
  const aspectButtons = document.querySelectorAll('.btn-aspect');

  // Toolbar Elements
  const toolbar = document.getElementById('toolbar');
  const dragHandle = document.getElementById('dragHandle');
  const collapseBtn = document.getElementById('collapseBtn');
  
  // Main Buttons
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  
  // Mini Buttons (Header)
  const miniPlayBtn = document.getElementById('miniPlayBtn');
  const miniStopBtn = document.getElementById('miniStopBtn');
  
  // Inputs
  const speedInput = document.getElementById('speed');
  const delayInput = document.getElementById('delay');
  const easingInput = document.getElementById('easing');
  const startIdInput = document.getElementById('startId');
  const endIdInput = document.getElementById('endId');

  // State Tracking
  let currentFrameUrl = '';

  // --- 1. Drag Logic ---
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  dragHandle.addEventListener('mousedown', (e) => {
    // Prevent dragging if clicking buttons inside header
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;
    
    isDragging = true;
    dragOffset.x = e.clientX - toolbar.offsetLeft;
    dragOffset.y = e.clientY - toolbar.offsetTop;
    toolbar.style.transition = 'none'; // Disable transition during drag
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    // Bounds check to keep toolbar on screen
    const newX = Math.max(0, Math.min(window.innerWidth - toolbar.offsetWidth, e.clientX - dragOffset.x));
    const newY = Math.max(0, Math.min(window.innerHeight - toolbar.offsetHeight, e.clientY - dragOffset.y));
    
    toolbar.style.left = `${newX}px`;
    toolbar.style.top = `${newY}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      toolbar.style.transition = 'height 0.3s ease'; // Re-enable transition
    }
  });

  // --- 2. Collapse Logic ---
  collapseBtn.addEventListener('click', () => {
    toolbar.classList.toggle('collapsed');
  });


  // --- 3. Simulator Core Logic ---

  // Handle URL
  const params = new URLSearchParams(window.location.search);
  if (params.get('url')) {
    urlInput.value = params.get('url');
    iframe.src = params.get('url');
    currentFrameUrl = params.get('url');
  }

  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      let url = urlInput.value;
      if (!url.startsWith('http')) url = 'https://' + url;
      iframe.src = url;
      currentFrameUrl = url;
    }
  });

  // Handle Resizing
  function updateDimensions() {
    // Read from Custom Inputs instead of Preset directly
    const w = parseInt(widthInput.value) || 1280;
    const h = parseInt(heightInput.value) || 800;

    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    
    const padding = 60; // Extra padding since toolbar floats
    const availableW = canvas.clientWidth - padding;
    const availableH = canvas.clientHeight - padding;
    const scale = Math.min(availableW / w, availableH / h, 1);
    
    frame.style.transform = `scale(${scale})`;
    scaleBadge.textContent = `Scale: ${(scale * 100).toFixed(0)}% • ${w}x${h}`;
  }

  // Preset Change -> Fills inputs -> Triggers updateDimensions via input event logic (or explicit call)
  presetSelect.addEventListener('change', () => {
    const [w, h] = presetSelect.value.split('x').map(Number);
    widthInput.value = w;
    heightInput.value = h;
    updateDimensions();
  });

  // Input Changes -> Direct Update
  widthInput.addEventListener('input', updateDimensions);
  heightInput.addEventListener('input', updateDimensions);
  
  // Aspect Ratio Buttons
  aspectButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const ratio = parseFloat(btn.dataset.ratio);
      const w = parseInt(widthInput.value) || 1280;
      // Calculate height based on width. h = w / ratio.
      const h = Math.round(w / ratio);
      
      heightInput.value = h;
      updateDimensions();
    });
  });

  window.addEventListener('resize', updateDimensions);
  
  // Initialize inputs from default preset
  {
      const [w, h] = presetSelect.value.split('x').map(Number);
      widthInput.value = w;
      heightInput.value = h;
      updateDimensions();
  }


  // --- 4. Scroll Control & Syncing ---

  const setPlayingState = (isPlaying) => {
    // Main Body Buttons
    startBtn.style.display = isPlaying ? 'none' : 'block';
    stopBtn.style.display = isPlaying ? 'block' : 'none';

    // Mini Header Buttons
    if (toolbar.classList.contains('collapsed')) {
       miniPlayBtn.style.display = isPlaying ? 'none' : 'block';
       miniStopBtn.style.display = isPlaying ? 'block' : 'none';
    } else {
       miniPlayBtn.style.display = ''; 
       miniStopBtn.style.display = '';
    }
  };
  
  const updateButtonState = (isPlaying) => {
    if (isPlaying) {
      startBtn.style.display = 'none';
      stopBtn.style.display = 'block';
      miniPlayBtn.style.setProperty('display', 'none', 'important');
      miniStopBtn.style.setProperty('display', 'block', 'important');
    } else {
      startBtn.style.display = 'block';
      stopBtn.style.display = 'none';
      miniPlayBtn.style.setProperty('display', 'block', 'important');
      miniStopBtn.style.setProperty('display', 'none', 'important');
    }
  };

  // Listen for messages from content.js (SCROLL_COMPLETE, URL_CHANGED)
  chrome.runtime.onMessage.addListener((message, sender) => {
    chrome.tabs.getCurrent((currentTab) => {
       // Ensure the message is from our current tab context
       if (!sender.tab || sender.tab.id !== currentTab.id) return;

       if (message.action === "SCROLL_COMPLETE") {
          updateButtonState(false);
       }
       
       if (message.action === "URL_CHANGED") {
          currentFrameUrl = message.url; // Track the actual URL

          // Update the input field if the user isn't actively typing in it
          if (document.activeElement !== urlInput) {
             urlInput.value = message.url;
          }
          
          // Update the Browser Address Bar so reloads work
          const currentUrl = new URL(window.location.href);
          if (currentUrl.searchParams.get('url') !== message.url) {
             currentUrl.searchParams.set('url', message.url);
             window.history.replaceState(null, '', currentUrl.toString());
          }
       }
    });
  });

  const handleStart = () => {
    const config = {
      speed: Number(speedInput.value),
      delay: Number(delayInput.value),
      easing: easingInput.value,
      startId: startIdInput.value,
      endId: endIdInput.value
    };
    
    updateButtonState(true);

    const dispatchStart = () => {
      chrome.tabs.getCurrent((tab) => {
        chrome.tabs.sendMessage(tab.id, { action: 'START', config });
      });
    };

    // Refresh Logic: Use the currentFrameUrl to ensure we reload the CURRENT page
    // (preserving navigation state) rather than the original src
    if (currentFrameUrl && currentFrameUrl !== 'about:blank') {
       iframe.addEventListener('load', dispatchStart, { once: true });
       // Force update even if string matches to ensure reload
       iframe.src = currentFrameUrl; 
    } else {
       // Fallback if URL is missing or blank
       dispatchStart();
    }
  };

  const handleStop = () => {
    updateButtonState(false);
    chrome.tabs.getCurrent((tab) => {
      chrome.tabs.sendMessage(tab.id, { action: 'STOP' });
    });
  };

  // Bind Events
  startBtn.addEventListener('click', handleStart);
  miniPlayBtn.addEventListener('click', handleStart);
  
  stopBtn.addEventListener('click', handleStop);
  miniStopBtn.addEventListener('click', handleStop);

  // Initialize button state
  updateButtonState(false);
});