/* Keep Design Analyser reachable from the existing navigation without replacing other modules. */
(function(){
  function addAnalyserLink(){
    const nav=document.querySelector('.topbar .navlinks');
    if(!nav || nav.querySelector('[data-design-analyser-link]')) return;
    const button=document.createElement('button');
    button.type='button';
    button.dataset.designAnalyserLink='true';
    button.textContent='Design Analyser';
    if(location.hash==='#design-analyser') button.classList.add('active');
    button.addEventListener('click',function(){
      if(typeof window.go==='function') window.go('coach');
      else { const homeCard=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Design Analyser')); if(homeCard)homeCard.click(); }
    });
    nav.appendChild(button);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',addAnalyserLink);
  addAnalyserLink();
  new MutationObserver(addAnalyserLink).observe(document.documentElement,{childList:true,subtree:true});
})();