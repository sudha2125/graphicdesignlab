/* Design Analyser navigation enhancement only. Never substitute heuristic/demo scores when the vision model fails. */
(function(){
  const originalNav = window.nav;
  if (typeof originalNav === 'function') {
    window.nav = function() {
      let html = originalNav();
      const button = '<button data-design-analyser-nav class="' + (window.state && window.state.view === 'coach' ? 'active' : '') + '" onclick="go(\'coach\')">Design Analyser</button>';
      if (!html.includes('data-design-analyser-nav')) html = html.replace('</nav>', button + '</nav>');
      return html;
    };
  }
})();