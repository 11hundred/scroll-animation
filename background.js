chrome.action.onClicked.addListener((tab) => {
  // Open simulator.html and pass the current tab's URL
  const targetUrl = tab.url || '';
  chrome.tabs.create({ 
    url: `simulator.html?url=${encodeURIComponent(targetUrl)}` 
  });
});