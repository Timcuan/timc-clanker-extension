export default defineBackground(() => {
  chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });
  chrome.alarms.onAlarm.addListener((_alarm) => { /* keepalive */ });
});
