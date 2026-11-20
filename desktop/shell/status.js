window.setSofaStatus = function ({ state, message }) {
  document.getElementById('message').textContent = message;
  document.getElementById('retry').hidden = state !== 'error';
  document.querySelector('.loader').hidden = state === 'error' || state === 'stopped';
  document.documentElement.dataset.state = state;
};
