document.addEventListener('DOMContentLoaded', function(){
  var main_content = document.getElementById('main-content');
  var terminal = document.getElementById('terminal');
  var input = document.getElementById('input');

  input.addEventListener('keyup', function(e) {
    if(e.keyCode != 13) return;
    var s = input.value;
    e.preventDefault();
    if(MELI.readline_callback(s)) input.value = '';
  });
  input.focus();
  input.addEventListener('blur', function(e) {
    input.focus();
  });

  function send_to_terminal(str) {
    var lines = str.split('\n');
    var first = true;
    lines.forEach(function(line) {
      if(first) first = false;
      else terminal.insertBefore(document.createElement('br'), input);
      terminal.insertBefore(document.createTextNode(line), input);
    });
    main_content.scrollTop = main_content.scrollHeight;
  }

  function game_over() {
    main_content.classList.add('game-over');
  }

  var xhr = new XMLHttpRequest();
  xhr.onload = function() {
    if(location.hash === '#scan_missing') {
      MELI.scan_missing(this.responseText, function(id) {
        return (id.indexOf('dun-') === 0 || id.indexOf('obj-') === 0);
      });
    } else {
      MELI.eval(this.responseText, {
        onexit: game_over,
        onprint: send_to_terminal
      });
    }
  };
  xhr.open('get', 'dunnet.el', true);
  xhr.overrideMimeType("text/plain");
  xhr.send();
});
