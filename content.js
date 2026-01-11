// --- Physics & State ---
let animationFrameId = null;
let isScrolling = false;

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


// --- Core Logic ---

function stopScroll() {
  if (animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
  isScrolling = false;
}

function jumpTo(id) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'auto', block: 'start' });
    return true;
  }
  return false;
}

function startScroll(config) {
  stopScroll(); // Reset
  isScrolling = true;

  // 1. Handle Start Target
  if (config.startId) {
    jumpTo(config.startId);
  }

  // 2. Handle Delay
  // We wait for the delay, THEN we calculate height and start scrolling.
  if (config.delay > 0) {
    setTimeout(() => {
      if (isScrolling) runPhysics(config);
    }, config.delay * 1000);
  } else {
    runPhysics(config);
  }
}

function runPhysics(config) {
  // This runs AFTER the delay, so it captures the height at the moment scrolling begins.
  const docHeight = document.body.scrollHeight;
  const winHeight = window.innerHeight;
  const startY = window.scrollY;
  
  // Default behavior: Scroll to bottom + buffer
  let endY = (docHeight - winHeight) + 100;

  // Handle End Target
  if (config.endId) {
    const el = document.getElementById(config.endId);
    if (el) {
      // Clamp so we don't try to scroll past document bounds
      endY = Math.min(el.offsetTop, docHeight - winHeight);
    }
  }

  const distance = endY - startY;

  // If we are already there (or close enough), check for completion
  if (distance <= 0) {
    stopScroll();
    chrome.runtime.sendMessage({ action: "SCROLL_COMPLETE" });
    return;
  }

  // Calculate Duration based on Speed (1-50)
  const durationMs = Math.max(Math.abs(distance / (config.speed * 0.06)), 200);
  const startTime = performance.now();
  const easingFunc = EASING[config.easing] || EASING['Linear'];

  function loop(now) {
    if (!isScrolling) return;

    const elapsed = now - startTime;
    const rawT = Math.min(elapsed / durationMs, 1);
    const easedT = easingFunc(rawT);

    const currentY = startY + (distance * easedT);
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
  if (request.action === "START") {
    startScroll(request.config);
  } else if (request.action === "STOP") {
    stopScroll();
  } else if (request.action === "JUMP") {
    jumpTo(request.targetId);
  } else if (request.action === "CAPTURE_FRAME") {
    console.log("content.js: Received CAPTURE_FRAME request.");
    if (typeof html2canvas === 'undefined') {
      console.error("content.js: html2canvas is not defined!");
      sendResponse({ error: "html2canvas not loaded in iframe." });
      return;
    }
    console.log("content.js: Calling html2canvas...");
    html2canvas(document.body, {
      allowTaint: true,
      useCORS: true,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    }).then(canvas => {
      console.log("content.js: html2canvas promise resolved.");
      console.log("content.js: canvas dimensions:", canvas.width, canvas.height);
      if (canvas.width === 0 || canvas.height === 0) {
        console.warn("content.js: html2canvas produced a canvas with zero dimensions.");
        sendResponse({ error: "html2canvas produced an empty canvas." });
        return;
      }
      const imageData = canvas.toDataURL('image/webp', 1.0);
      console.log("content.js: Sending response with imageData.");
      sendResponse({ imageData: imageData });
    }).catch(error => {
      console.error("content.js: html2canvas promise rejected:", error);
      sendResponse({ error: error.message });
    });
    return true; // Indicate that sendResponse will be called asynchronously
  }
});