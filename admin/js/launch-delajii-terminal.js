(function() {
  var launchButton = document.getElementById('launch-delajii-terminal');

  if (!launchButton) return;

  launchButton.addEventListener('click', function() {
    var gameWindow = window.open('about:blank', 'delajii-terminal-game-admin');

    launchButton.disabled = true;
    fetch('/api/launch-delajii-terminal', { method: 'POST' })
      .then(function(response) {
        return response.json().then(function(payload) {
          if (!response.ok) throw new Error(payload.error || 'Unable to launch deLajii Terminal');
          return payload;
        });
      })
      .then(function(payload) {
        if (gameWindow) gameWindow.location.replace(payload.url);
      })
      .catch(function(error) {
        if (gameWindow) gameWindow.close();
        window.alert(error.message);
      })
      .finally(function() {
        launchButton.disabled = false;
      });
  });
}());
