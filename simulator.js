console.log('SIM: ----- simulator.js file PARSED -----'); // ADD THIS LINE AT THE TOP

document.addEventListener('DOMContentLoaded', () => {
  console.log('SIM: DOMContentLoaded event fired. Initializing script context.'); // ADD THIS LINE
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

  // NEW: Stopping Points Elements
  const simulatorStopPointsList = document.getElementById('simulatorStopPointsList');
  const addStopByClickBtn = document.getElementById('addStopByClickBtn');
  let stoppingPoints; // Declare without initializing immediately

  // Load stopping points via message to background script
  chrome.runtime.sendMessage({ action: 'loadStoppingPoints' }, (response) => {
    if (response && response.stoppingPoints) {
      stoppingPoints = response.stoppingPoints;
    } else {
      stoppingPoints = []; // Initialize empty if no points from storage
    }
    updateSimulatorStopPointsList(); // Update UI with loaded points
  });

  // NEW: State variable for adding stopping points
  let isAddingStopPoint = false;

  // NEW: Scroll Rail Element
  const scrollRail = document.getElementById('scrollRail');
  const scrollHandle = document.getElementById('scrollHandle'); // NEW

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

  // --- 3. Stopping Points Logic ---
  const updateSimulatorStopPointsList = () => {
    console.log('SIM: updateSimulatorStopPointsList called. current stoppingPoints:', JSON.parse(JSON.stringify(stoppingPoints))); // Refined log
    simulatorStopPointsList.innerHTML = ''; // Clear current list
    if (stoppingPoints.length === 0) {
      simulatorStopPointsList.innerHTML = '<p style="font-size: 12px; color: #a3a3a3; text-align: center;">No stopping points added yet.</p>';
      return;
    }

    stoppingPoints.forEach((point, index) => {
      const pointDiv = document.createElement('div');
      pointDiv.style.cssText = `
        display: flex; justify-content: space-between; align-items: center;
        background: #171717; border: 1px solid #404040; border-radius: 6px;
        padding: 6px 8px; margin-bottom: 4px; font-size: 12px;
      `;
      let label = '';
      if (point.type === 'div') {
        label = `ID: #${point.id}`;
      } else if (point.type === 'coords') {
        label = `Y-Coord: ${point.y}`;
      }
      pointDiv.innerHTML = `
        <span>${label} - Delay: ${point.delay}s</span>
        <button data-index="${index}" class="remove-stop-btn" style="
          background: #ef4444; color: white; border: none; padding: 3px 6px;
          border-radius: 4px; cursor: pointer; font-size: 9px;
        ">X</button>
      `;
      simulatorStopPointsList.appendChild(pointDiv);
    });

    // Add event listeners for remove buttons
    document.querySelectorAll('.remove-stop-btn').forEach(button => {
      button.addEventListener('click', (e) => {
        const indexToRemove = parseInt(e.target.dataset.index);
        stoppingPoints.splice(indexToRemove, 1);
        updateSimulatorStopPointsList();
      }); // Closing for addEventListener's callback
    }); // Closing for forEach
    chrome.runtime.sendMessage({ action: 'saveStoppingPoints', data: stoppingPoints });
  };

  addStopByClickBtn.addEventListener('click', () => {
    isAddingStopPoint = !isAddingStopPoint; // Toggle the state
    if (isAddingStopPoint) {
      addStopByClickBtn.textContent = 'Click on Rail to Add...';
      addStopByClickBtn.style.backgroundColor = '#d97706'; // A different color for active state
    } else {
      addStopByClickBtn.textContent = 'Add by Click';
      addStopByClickBtn.style.backgroundColor = '#3b82f6'; // Original color
    }
  });

  // --- 4. Simulator Core Logic ---

  // Handle URL
  const params = new URLSearchParams(window.location.search);
  if (params.get('url')) {
    urlInput.value = params.get('url');
    iframe.src = params.get('url');
    currentFrameUrl = params.get('url');
  }

  // Read stopping points from URL if available
  if (params.get('stops')) {
    try {
      const decodedStops = JSON.parse(decodeURIComponent(params.get('stops')));
      stoppingPoints = decodedStops;
      updateSimulatorStopPointsList();
    } catch (e) {
      console.error('Failed to parse stopping points from URL:', e);
    }
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

    const scrollRailWidth = 20; // Define the width of the scroll rail
    frame.style.width = `${w + scrollRailWidth}px`; // Account for rail width
    frame.style.height = `${h}px`;
    
    const padding = 60; // Extra padding since toolbar floats
    const availableW = canvas.clientWidth - padding;
    const availableH = canvas.clientHeight - padding;
    const scale = Math.min(availableW / (w + scrollRailWidth), availableH / h, 1); // Adjust scale calculation
    
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


  // --- 5. Scroll Control & Syncing ---

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
      stopBtn.style.display = 'none'; // Keep stop hidden in simulator
      miniPlayBtn.style.setProperty('display', 'none', 'important');
      miniStopBtn.style.setProperty('display', 'block', 'important');
    } else {
      startBtn.style.display = 'block';
      stopBtn.style.display = 'none'; // Keep stop hidden in simulator
      miniPlayBtn.style.setProperty('display', 'block', 'important');
      miniStopBtn.style.setProperty('display', 'none', 'important');
    }
  };

  // Listen for messages from content.js (SCROLL_COMPLETE, URL_CHANGED, RECEIVE_IFRAME_SCROLL_HEIGHT)
  chrome.runtime.onMessage.addListener((message, sender) => {
    // Check if the message is from the content script within our current tab
    // We expect frameId to be 0 for the main frame or a non-zero value for an iframe
    // sender.tab.id will be the ID of the simulator tab itself.
    chrome.tabs.getCurrent((currentTab) => {
       if (!currentTab || sender.tab.id !== currentTab.id) return;

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

       // NEW: Handle scrollHeight received from content.js
       if (message.action === 'RECEIVE_IFRAME_SCROLL_HEIGHT') {
         const { scrollHeight, currentScrollY, clickY, railHeight } = message;

         console.log('SIM: ----- Processing Stopping Point -----');
         console.log('SIM: stoppingPoints.length BEFORE limit check:', stoppingPoints.length);

         if (stoppingPoints.length >= 5) {
            alert('You can add a maximum of 5 stopping points.');
            console.log('SIM: Stopping point limit reached. Current length:', stoppingPoints.length);
            return;
         }

         // Calculate the corresponding Y-coordinate in the iframe content
         const iframeVisibleHeight = iframe.offsetHeight;

         const y = (clickY / railHeight) * scrollHeight; // Corrected calculation for absolute Y

         console.log('SIM: Calculated Y-coord (unscaled):', y);
         console.log('SIM: stoppingPoints BEFORE push:', JSON.parse(JSON.stringify(stoppingPoints)));

                  stoppingPoints.push({ type: 'coords', y: Math.round(y), delay: 1 });

                  updateSimulatorStopPointsList();



                  console.log('SIM: stoppingPoints AFTER push:', JSON.parse(JSON.stringify(stoppingPoints)));

         // Dynamically set scrollHandle height based on iframe's visible height and total scrollHeight
         const outerRailHeight = scrollRail.offsetHeight;

         const handleHeight = (iframeVisibleHeight / scrollHeight) * outerRailHeight;
         scrollHandle.style.height = `${Math.max(handleHeight, 20)}px`;
         // console.log('SIM: Calculated handleHeight:', handleHeight); // Removed old log
         // console.log('SIM: Applied scrollHandle.style.height:', scrollHandle.style.height); // Removed old log

         // Set the top position of the scroll handle based on current scroll
         const handleTop = (currentScrollY / scrollHeight) * outerRailHeight;
         scrollHandle.style.top = `${handleTop}px`;
         // console.log('SIM: Applied scrollHandle.style.top:', handleTop); // Removed old log
       }
    });
  });

  // NEW: Scroll Handle click listener // Changed comment
  scrollRail.addEventListener('click', (e) => {
    console.log('SIM: scrollRail click event triggered'); // Added log
    e.stopPropagation(); // Prevent event from bubbling up
    e.preventDefault();  // Prevent any default browser action

    if (isAddingStopPoint) { // Only process if in "add mode"
      if (stoppingPoints.length >= 5) {
        alert('You can add a maximum of 5 stopping points.');
        // Reset state even if limit reached
        isAddingStopPoint = false;
        addStopByClickBtn.textContent = 'Add by Click';
        addStopByClickBtn.style.backgroundColor = '#3b82f6';
        return;
      }
      
      const railRect = scrollRail.getBoundingClientRect();
      const clickY_in_rail = e.clientY - railRect.top;
      const railHeightTotal = scrollRail.offsetHeight;

      // Send message to content.js in the iframe to request scrollHeight
      chrome.tabs.getCurrent((tab) => {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'REQUEST_IFRAME_SCROLL_HEIGHT', 
          frameId: 0,
          clickY: clickY_in_rail,
          railHeight: railHeightTotal
        });
      });

      // Reset state after adding a point
      isAddingStopPoint = false;
      addStopByClickBtn.textContent = 'Add by Click';
      addStopByClickBtn.style.backgroundColor = '#3b82f6';

    } else {
      // If not in adding mode, allow default scroll behavior or do nothing specific.
      // We explicitly prevent default above, so if not in add mode, it's just a prevented click.
      // This is fine for now, user explicitly clicks "Add" button first.
      console.log('SIM: Not in add stopping point mode.');
    }
  });

  const handleStart = () => {
    const config = {
      speed: Number(speedInput.value),
      delay: Number(delayInput.value),
      easing: easingInput.value,
      startId: startIdInput.value,
      endId: endIdInput.value,
      stoppingPoints: stoppingPoints // Pass stopping points to content.js
    };
    
    updateButtonState(true);

    const dispatchStart = () => {
      chrome.tabs.getCurrent((tab) => {
        // Send message to the content script within the iframe
        chrome.tabs.sendMessage(tab.id, { action: 'START', config, frameId: 0 }); // frameId: 0 targets the main frame
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
      chrome.tabs.sendMessage(tab.id, { action: 'STOP', frameId: 0 }); // frameId: 0 targets the main frame
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