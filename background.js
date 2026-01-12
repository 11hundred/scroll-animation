chrome.action.onClicked.addListener((tab) => {
  // Open simulator.html and pass the current tab's URL
  const targetUrl = tab.url || '';
  chrome.tabs.create({ 
    url: `simulator.html?url=${encodeURIComponent(targetUrl)}` 
  });
});

// NEW: Message listener for handling stopping points
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveStoppingPoints') {
    chrome.storage.local.set({ stoppingPoints: request.data }, () => {
      sendResponse({ status: 'success' });
    });
    return true; // Indicates an asynchronous response
  } else if (request.action === 'loadStoppingPoints') {
    chrome.storage.local.get(['stoppingPoints'], (result) => {
      sendResponse({ stoppingPoints: result.stoppingPoints || [] });
    });
    return true; // Indicates an asynchronous response
  }
});