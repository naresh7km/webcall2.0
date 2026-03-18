// Configuration - update this for your deployment
window.WEBCALL_CONFIG = {
  // Backend server URL (no trailing slash)
  API_URL: window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : window.location.origin.replace('-admin', '-server'),
};
