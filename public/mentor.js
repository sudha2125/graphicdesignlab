(function(){
  let currentConversationId = null;
  let attachedReviewId = null;
  let messages = [];
  let sending = false;
  const prompts = [
    "What is visual hierarchy?",
    "Explain typography for beginners",
    "How do I choose colors for a poster?",
    "What fonts work well for restaurant posters?",
    "Give me a graphic design practice task",
    "What should I learn after color theory?"
  ];
  const escapeHtml = value => String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const formatMessage = value => escapeHtml(value).replace(/\n/g,'<br>');
  const originalNav = window.nav;
  if (typeof originalNav === 'function') {
    window.nav = function() {
      let html = originalNav();
      if (!html.includes('data-mentor-nav')) {
        const button = "<button data-mentor-nav class=\"" + (state.view === 'mentor' ? 'active' : '') + "\" onclick=\"go('mentor')\">Design Mentor AI</button>";
        html = html.replace('</nav>', button + '</nav>');
      }
      return html;
    };
  }
  const originalRender = window.render;
  if (typeof originalRender === 'function') {
    window.render = async function() {
      if (state.view === 'mentor') {
        await session();
        if (!state.user) { location.href = '/login?next=/'; return; }
        try { Object.assign(state, await api('/content')); } catch (e) {}
        await mentorPage();
        return;
      }
      return originalRender();
    };
  }
  const originalAnalysis = window.renderDesignAnalysis;
  if (typeof originalAnalysis === 'function') {
    window.renderDesignAnalysis = function(analysis, imageUrl) {
      originalAnalysis(analysis, imageUrl);
      if (designReview && designReview.analysisId) {
        const root = document.querySelector('#analysis-results .analysis-result');
        if (root && !root.querySelector('.ask-mentor-review')) {
          root.insertAdjacentHTML('beforeend', '<section class="ask-mentor-review"><div><span class="eyebrow">KEEP LEARNING</span><h2>Want to understand these results?</h2><p>Ask the mentor about the actual scores and recommendations from this review.</p></div><button class="primary" onclick="openMentorAboutDesign()">Ask Design Mentor AI about this design</button></section>');
        }
      }
    };
  }

  function getPinnedMentorConversations() {
    try { return JSON.parse(localStorage.getItem('mentorPinnedConversations') || '[]'); } catch (e) { return []; }
  }
  function renderMentorHistory(list) {
    const pins = getPinnedMentorConversations();
    const sorted = (list || []).slice().sort((a,b) => Number(pins.includes(b.id)) - Number(pins.includes(a.id)));
    if (!sorted.length) return '<p class="mentor-history-empty">Your conversations will appear here.</p>';
    return sorted.map(c => {
      const id = escapeHtml(c.id);
      const pinned = pins.includes(c.id);
      return `<div class="mentor-history-row ${pinned ? 'pinned' : ''}"><button class="mentor-history-item ${c.id === currentConversationId ? 'active' : ''}" data-open-conversation="${id}"><span class="mentor-history-icon">${pinned ? '📌' : '↗'}</span><span class="mentor-history-title">${escapeHtml(c.title || 'Design conversation')}</span></button><button class="mentor-conversation-menu-trigger" type="button" data-menu-toggle="${id}" aria-label="Conversation options">⋯</button><div class="mentor-conversation-menu" data-menu-for="${id}" hidden><button type="button" data-pin-conversation="${id}">${pinned ? 'Unpin conversation' : 'Pin conversation'}</button><button type="button" class="danger" data-clear-conversation="${id}">Clear conversation</button></div></div>`;
    }).join('');
  }
  document.addEventListener('click', function(event) {
    const fresh = event.target.closest('[data-new-conversation]');
    if (fresh) { event.preventDefault(); window.newMentorConversation(); return; }
    const open = event.target.closest('[data-open-conversation]');
    const toggle = event.target.closest('[data-menu-toggle]');
    const pin = event.target.closest('[data-pin-conversation]');
    const clear = event.target.closest('[data-clear-conversation]');
    if (toggle) {
      event.stopPropagation();
      const id = toggle.getAttribute('data-menu-toggle');
      document.querySelectorAll('.mentor-conversation-menu').forEach(menu => menu.hidden = menu.dataset.menuFor !== id || !menu.hidden);
      return;
    }
    if (pin) { event.stopPropagation(); window.toggleMentorPin(pin.getAttribute('data-pin-conversation')); return; }
    if (clear) { event.stopPropagation(); window.clearSpecificMentorConversation(clear.getAttribute('data-clear-conversation')); return; }
    if (open) { window.loadMentorConversation(open.getAttribute('data-open-conversation')); return; }
    document.querySelectorAll('.mentor-conversation-menu').forEach(menu => menu.hidden = true);
  });
  window.toggleMentorPin = function(id) {
    const pins = getPinnedMentorConversations();
    const isPinned = pins.includes(id);
    localStorage.setItem('mentorPinnedConversations', JSON.stringify(isPinned ? pins.filter(x => x !== id) : pins.concat(id)));
    refreshMentorSidebar();
    if (typeof window.showToast === 'function') window.showToast(isPinned ? 'Unpinned' : 'Pinned');
  };
  window.clearSpecificMentorConversation = async function(id) {
    if (sending) return;
    try { await api('/chat', {method:'DELETE', body:JSON.stringify({conversation_id:id})}); }
    catch (e) { if (typeof window.showToast === 'function') window.showToast('Could not clear conversation. Please try again.', 'error'); return; }
    if (currentConversationId === id) { currentConversationId = null; attachedReviewId = null; messages = []; renderMentorMessages(); }
    await refreshMentorSidebar();
    if (typeof window.showToast === 'function') window.showToast('Cleared');
  };

  async function mentorPage() {
    let list = [];
    try { const data = await api('/chat'); list = data.conversations || []; } catch (e) {}
    const sidebar = renderMentorHistory(list);
    const reviewBanner = attachedReviewId ? '<div class="mentor-context"><span>✦</span><div><b>Design analysis attached</b><small>Your mentor can refer to the specific scores, observations and recommendations from your review.</small></div><button onclick="detachMentorReview()" aria-label="Remove design context">×</button></div>' : '';
    const empty = messages.length ? '' : '<div class="mentor-welcome"><div class="mentor-avatar large">✳</div><span class="eyebrow">YOUR CREATIVE COACH</span><h1>Let’s make your next design stronger.</h1><p>Ask a question, explore a design principle, or get a practical exercise tailored to your skill level.</p><div class="mentor-prompt-grid">' + prompts.map(p => '<button onclick="useMentorPrompt(\'' + escapeHtml(p) + '\')"><span>↗</span>' + escapeHtml(p) + '</button>').join('') + '</div></div>';
    shell('<div class="container mentor-layout"><aside class="mentor-sidebar"><div class="mentor-sidebar-head"><div><span class="eyebrow">YOUR WORKSPACE</span><h2>Conversations</h2></div><button class="mentor-icon-button" data-new-conversation title="New conversation" aria-label="New conversation">＋</button></div><button class="mentor-new-button" onclick="newMentorConversation()">＋ New conversation</button><div class="mentor-history">' + sidebar + '</div><div class="mentor-sidebar-note"><span>✳</span><p>Learn the principle.<br><b>Then put it into practice.</b></p></div></aside><section class="mentor-main"><div class="mentor-heading"><div class="mentor-avatar">✳</div><div><h1>Design Mentor AI</h1><p><span class="mentor-status-dot"></span> Your personal graphic design tutor</p></div><div class="mentor-top-actions"><button class="mentor-mobile-new" onclick="newMentorConversation()" aria-label="New conversation">＋</button></div></div>' + reviewBanner + '<div id="mentor-chat-scroll" class="mentor-chat-scroll"><div id="mentor-messages" class="mentor-messages">' + empty + '</div><div id="mentor-thinking" class="mentor-thinking" style="display:none"><span class="mentor-avatar">✳</span><div><b>Design Mentor is thinking...</b><div class="mentor-dots"><i></i><i></i><i></i></div></div></div></div><form class="mentor-composer" onsubmit="event.preventDefault();sendMentorMessage()"><textarea id="mentor-input" rows="1" maxlength="4000" placeholder="Ask anything about graphic design..." onkeydown="mentorInputKeydown(event)"></textarea><div class="mentor-composer-foot"><span>Clear questions lead to stronger designs.</span><button id="mentor-send" class="primary" type="submit"><span>Send</span><b>↑</b></button></div></form><p class="mentor-disclaimer">Design Mentor AI can make mistakes. Use its guidance as a starting point for your own design decisions.</p></section></div>');
    renderMentorMessages();
    if (attachedReviewId) {
      const context = document.querySelector('.mentor-context');
      if (context) context.scrollIntoView({block:'nearest'});
    }
  }

  function renderMentorMessages() {
    const root = document.getElementById('mentor-messages');
    if (!root) return;
    if (!messages.length) {
      root.innerHTML = '<div class="mentor-welcome"><div class="mentor-avatar large">✳</div><span class="eyebrow">YOUR CREATIVE COACH</span><h1>Let’s make your next design stronger.</h1><p>Ask a question, explore a design principle, or get a practical exercise tailored to your skill level.</p><div class="mentor-prompt-grid">' + prompts.map(p => '<button onclick="useMentorPrompt(\'' + escapeHtml(p) + '\')"><span>↗</span>' + escapeHtml(p) + '</button>').join('') + '</div></div>';
      return;
    }
    root.innerHTML = messages.map((m, i) => {
      const user = m.role === 'user';
      return '<article class="mentor-message ' + (user ? 'user' : 'assistant') + '"><div class="mentor-message-avatar">' + (user ? 'You' : '✳') + '</div><div class="mentor-message-body"><div class="mentor-message-label">' + (user ? 'You' : 'Design Mentor') + '</div><div class="mentor-bubble">' + formatMessage(m.message || m.content || '') + '</div>' + (!user && i === messages.length - 1 ? '<div class="mentor-response-actions"><button onclick="mentorFollowUp(\'Explain that more simply\')">Explain simpler</button><button onclick="mentorFollowUp(\'Give me a practical example\')">Give an example</button><button onclick="mentorFollowUp(\'Give me a practice task for this\')">Practice task</button><button onclick="mentorFollowUp(\'Recommend a related lesson from the learning hub\')">Recommend a lesson</button></div>' : '') + '</div></article>';
    }).join('');
    const scroller = document.getElementById('mentor-chat-scroll');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
  }

  async function refreshMentorSidebar() {
    try {
      const data = await api('/chat');
      const root = document.querySelector('.mentor-history');
      if (!root) return;
      root.innerHTML = renderMentorHistory(data.conversations || []);
    } catch (e) {}
  }

  window.useMentorPrompt = function(prompt) {
    const input = document.getElementById('mentor-input');
    if (input) { input.value = prompt; input.focus(); }
    window.sendMentorMessage();
  };
  window.mentorInputKeydown = function(event) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); window.sendMentorMessage(); }
  };
  window.sendMentorMessage = async function(value) {
    if (sending) return;
    const input = document.getElementById('mentor-input');
    const message = String(value || (input && input.value) || '').trim();
    if (!message) return;
    if (!state.user) { location.href = '/login?next=/'; return; }
    sending = true;
    messages.push({role:'user', message});
    if (input) input.value = '';
    renderMentorMessages();
    const send = document.getElementById('mentor-send');
    const thinking = document.getElementById('mentor-thinking');
    if (send) { send.disabled = true; send.innerHTML = '<span>Sending</span><b>…</b>'; }
    if (thinking) thinking.style.display = 'flex';
    try {
      const result = await api('/chat', {method:'POST', body:JSON.stringify({message, conversation_id:currentConversationId, design_review_id:attachedReviewId})});
      currentConversationId = result.conversation_id;
      attachedReviewId = null;
      messages.push({role:'assistant', message:result.answer});
      await refreshMentorSidebar();
    } catch (e) {
      messages.pop();
      messages.push({role:'assistant', message:'Something went wrong. Please try again.'});
      if (input) input.value = message;
    } finally {
      sending = false;
      if (send) { send.disabled = false; send.innerHTML = '<span>Send</span><b>↑</b>'; }
      if (thinking) thinking.style.display = 'none';
      renderMentorMessages();
    }
  };
  window.newMentorConversation = function() {
    currentConversationId = null; attachedReviewId = null; messages = [];
    if (state.view !== 'mentor') state.view = 'mentor';
    window.render();
  };
  window.clearMentorConversation = async function() {
    if (sending) return;
    if (currentConversationId) {
      try { await api('/chat', {method:'DELETE', body:JSON.stringify({conversation_id:currentConversationId})}); }
      catch (e) { alert('Something went wrong. Please try again.'); return; }
    }
    messages = [];
    renderMentorMessages();
    await refreshMentorSidebar();
  };
  window.loadMentorConversation = async function(id) {
    if (sending) return;
    try {
      const data = await api('/chat?conversation_id=' + encodeURIComponent(id));
      currentConversationId = data.conversation.id;
      attachedReviewId = data.conversation.design_review_id || null;
      messages = (data.messages || []).map(m => ({role:m.role, message:m.message}));
      state.view = 'mentor';
      await window.render();
    } catch (e) { alert('Could not load this conversation. Please try again.'); }
  };
  window.mentorFollowUp = function(prompt) { window.sendMentorMessage(prompt); };
  window.detachMentorReview = function() { attachedReviewId = null; window.render(); };
  window.openMentorAboutDesign = function() {
    if (!designReview || !designReview.analysisId) { alert('Please complete the design analysis first.'); return; }
    currentConversationId = null; messages = []; attachedReviewId = designReview.analysisId;
    state.view = 'mentor';
    window.render();
  };
})();