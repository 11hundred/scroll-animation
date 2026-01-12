// --- Physics & State ---
let animationFrameId = null;
let isScrolling = false;
let stoppingPoints = [];
let currentStopPointIndex = -1;
let isPausedForStop = false;
let currentScrollConfig = null; // Store the config for resuming

// Easing Functions
const EASING = {
  'Linear': t => t,
  'Ease In (Quad)': t => t * t,
  'Ease Out (Quad)': t => t * (2 - t),
  'Ease In Out (Quad)': t => t < .5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  'Ease In Out (Sine)': t => -(Math.cos(Math.PI * t) - 1) / 2
};

// --- URL Tracking ---
function notifyUrl() {
  // Check if we are in an iframe (simulator context)
  // We send the message regardless, but the simulator filters by tab ID
  chrome.runtime.sendMessage({ 
    action: "URL_CHANGED", 
    url: window.location.href 
  });
}

// Notify on initial load
notifyUrl();

// Notify on in-page navigation (SPA / Anchor links)
window.addEventListener('popstate', notifyUrl);
window.addEventListener('hashchange', notifyUrl);

// Helper to get element's y position, including inside shadow DOMs
function getElementY(id) {
  let element = document.getElementById(id);
  if (!element) {
    // Try to find in shadow DOMs
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (el.shadowRoot) {
        const shadowEl = el.shadowRoot.getElementById(id);
        if (shadowEl) {
          element = shadowEl;
          break;
        }
      }
    }
  }

  if (element) {
    return element.getBoundingClientRect().top + window.scrollY;
  }
  return null;
}

// --- Core Logic ---

function stopScroll() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
  isScrolling = false;
  isPausedForStop = false;
  currentStopPointIndex = -1;
}

function jumpTo(id) {
  const elY = getElementY(id);
  if (elY !== null) {
    window.scrollTo({ top: elY, behavior: 'auto' });
    return true;
  }
  return false;
}

function startScroll(config) {
  stopScroll(); // Reset all states
  isScrolling = true;
  currentScrollConfig = config; // Store config for potential resume

  stoppingPoints = (config.stoppingPoints || []).map(point => {
    // Pre-calculate Y for div types
    if (point.type === 'div') {
      point.y = getElementY(point.id);
    }
    return point;
  }).filter(point => point.y !== null) // Filter out div points that couldn't be found
    .sort((a, b) => a.y - b.y); // Sort by Y position

  // Calculate final target Y once
  const docHeight = document.body.scrollHeight;
  const winHeight = window.innerHeight;
  let finalTargetY = (docHeight - winHeight) + 100; // Default to bottom + buffer

  if (config.endId) {
    const elY = getElementY(config.endId);
    if (elY !== null) {
      finalTargetY = Math.min(elY, docHeight - winHeight); // Clamp
    }
  }

  // 1. Handle Start Target
  if (config.startId) {
    jumpTo(config.startId);
  }

  // 2. Handle Delay
  // We wait for the initial delay, THEN we calculate height and start scrolling.
  if (config.delay > 0) {
    setTimeout(() => {
      if (isScrolling) runPhysics(currentScrollConfig, window.scrollY, finalTargetY, performance.now());
    }, config.delay * 1000);
  } else {
    runPhysics(currentScrollConfig, window.scrollY, finalTargetY, performance.now());
  }
}

function runPhysics(config, startY, finalTargetY, startTime) { // Added finalTargetY
  if (!isScrolling) return;

  // Use finalTargetY directly
  const distance = finalTargetY - startY;

  // If we are already there (or close enough), check for completion
  if (distance <= 0) {
    stopScroll();
    chrome.runtime.sendMessage({ action: "SCROLL_COMPLETE" });
    return;
  }

  // Calculate Duration based on Speed (1-50)
  // These are still needed for clamping but not for final endY calculation
  const docHeight = document.body.scrollHeight; 
  const winHeight = window.innerHeight; 

  const durationMs = Math.max(Math.abs(distance / (config.speed * 0.06)), 200);
  const easingFunc = EASING[config.easing] || EASING['Linear'];

  function loop(now) {
    if (!isScrolling || isPausedForStop) return;

    const elapsed = now - startTime;
    const rawT = Math.min(elapsed / durationMs, 1);
    const easedT = easingFunc(rawT);

    const currentY = startY + (distance * easedT);

    // --- Stopping Point Logic ---
    for (let i = currentStopPointIndex + 1; i < stoppingPoints.length; i++) {
      const point = stoppingPoints[i];
      const stopPointY = point.y; // Already pre-calculated for divs, direct for coords

      // Check if current scroll position has passed or reached the stopping point
      // And if the target scroll destination is beyond this stopping point
      const hasPassedStop = (distance > 0 && currentY >= stopPointY) || (distance < 0 && currentY <= stopPointY);
      const targetIsBeyondStop = (distance > 0 && finalTargetY > stopPointY) || (distance < 0 && finalTargetY < stopPointY);

      // Define a "hit zone" just before the actual stop point for better trigger
      // Consider hitting if currentY is near the stopPointY, adjusting for scroll direction
      const hitZoneThreshold = 50; // pixels before the stop point to trigger pause
      const isNearStop = (distance > 0 && currentY >= (stopPointY - hitZoneThreshold) && currentY < stopPointY + 50) || 
                         (distance < 0 && currentY <= (stopPointY + hitZoneThreshold) && currentY > stopPointY - 50);


      if ((hasPassedStop || isNearStop) && targetIsBeyondStop) {
        stopScroll(); // Stop current animation frame loop
        isPausedForStop = true;
        currentStopPointIndex = i; // Mark this stop point as handled

        window.scrollTo(0, stopPointY); // Snap to the exact stop point

        setTimeout(() => {
          if (!isScrolling) return; // Ensure we weren't fully stopped by user
          isPausedForStop = false;
          // Resume scrolling from where we paused (stopPointY)
          runPhysics(config, window.scrollY, finalTargetY, performance.now()); // Pass finalTargetY
        }, point.delay * 1000);

        return; // Exit loop, wait for timeout to resume
      }
    }
    // --- End Stopping Point Logic ---

    window.scrollTo(0, currentY);

    if (rawT < 1) {
      animationFrameId = requestAnimationFrame(loop);
    } else {
      stopScroll();
      chrome.runtime.sendMessage({ action: "SCROLL_COMPLETE" });
    }
  }

  animationFrameId = requestAnimationFrame(loop);
}

// --- Message Listener ---
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Ensure message is from the simulator's main frame
  // sender.frameId === 0 for the main frame in the current tab
  // If no sender.frameId, it's likely from the extension popup to the main page
  // For messages *to* this content script, check sender.frameId to ensure it's from the main frame (0)
  // or a message from the background script (no sender.frameId)
  if (sender.frameId !== undefined && sender.frameId !== 0) {
    return;
  }

  if (request.action === "START") {
    startScroll(request.config);
  } else if (request.action === "STOP") {
    stopScroll();
  } else if (request.action === "JUMP") {
    jumpTo(request.targetId);
  } else if (request.action === "REQUEST_IFRAME_SCROLL_HEIGHT") {
    console.log('CONTENT: Received REQUEST_IFRAME_SCROLL_HEIGHT message.');
    
    const totalScrollableHeight = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    const visibleViewportHeight = window.innerHeight;
    const currentScrollY = window.scrollY;

    console.log('CONTENT: document.body.scrollHeight (raw):', document.body.scrollHeight);
    console.log('CONTENT: document.documentElement.scrollHeight (raw):', document.documentElement.scrollHeight);
    console.log('CONTENT: totalScrollableHeight (calculated):', totalScrollableHeight);
    console.log('CONTENT: visibleViewportHeight:', visibleViewportHeight);
    console.log('CONTENT: currentScrollY:', currentScrollY);
    console.log('CONTENT: clickY received from SIM:', request.clickY);
    console.log('CONTENT: railHeight received from SIM:', request.railHeight);

    chrome.runtime.sendMessage({ 
      action: 'RECEIVE_IFRAME_SCROLL_HEIGHT', 
      totalScrollableHeight: totalScrollableHeight,
      visibleViewportHeight: visibleViewportHeight,
      currentScrollY: currentScrollY,
      clickY: request.clickY,
      railHeight: request.railHeight
    });
  }
});