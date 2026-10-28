(() => {
  const initial = { count: 3, capacity: 5, requests: 2, totalRequests: 20, requestsCreated: 2, burstSize: 4, concurrentRequests: false, deliveries: 8, speed: 'normal', race: false };
  const state = { ...initial };
  const sampleMessages = ['Hey! Are we still meeting at 3?', 'I shared the project files with you.', 'On my way — see you soon!', 'Thanks! That works for me.', 'Can you review the latest update?'];
  const makeInitialQueue = count => Array.from({ length: count }, (_, i) => sampleMessages[i % sampleMessages.length]);
  let messageQueue = makeInitialQueue(initial.count);
  let nextMessage = initial.count;
  let slots = [...document.querySelectorAll('.buffer-slot')];
  const activity = document.getElementById('activityList');
  const speeds = { slow: 1250, normal: 780, fast: 430 };
  let busy = false;
  let generation = 0;
  let eventCount = 0;
  let autoRunning = false;
  let autoTimer = null;
  const timeouts = new Set();
  const byId = id => document.getElementById(id);
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const timeLabel = () => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date());

  function addEvent(title, detail, type = 'produced') {
    const item = document.createElement('div');
    item.className = 'activity-item';
    const symbol = type === 'consumed' ? '↗' : type === 'warning' ? '!' : type === 'system' ? '⌁' : '+';
    item.innerHTML = `<span class="activity-icon ${type}">${symbol}</span><div class="activity-text"><strong></strong><span></span></div><time class="activity-time"></time>`;
    item.querySelector('.activity-text strong').textContent = title;
    item.querySelector('.activity-text span').textContent = detail;
    item.querySelector('time').textContent = timeLabel();
    activity.prepend(item);
    while (activity.children.length > 12) activity.lastElementChild.remove();
    eventCount++;
  }

  function toast(title, detail, warning = false) {
    const el = document.createElement('div');
    el.className = `toast${warning ? ' warning-toast' : ''}`;
    const strong = document.createElement('b'); strong.textContent = title;
    const small = document.createElement('small'); small.textContent = detail;
    el.append(strong, small); byId('toastRegion').append(el);
    const timer = setTimeout(() => { el.remove(); timeouts.delete(timer); }, 3600); timeouts.add(timer);
  }

  function syncBufferSlots() {
    const track = document.querySelector('.buffer-track');
    while (track.children.length > state.capacity) track.lastElementChild.remove();
    while (track.children.length < state.capacity) {
      const slot = document.createElement('div'); slot.className = 'buffer-slot empty';
      const number = document.createElement('span'); number.className = 'slot-number';
      const plus = document.createElement('span'); plus.className = 'empty-plus'; plus.textContent = '＋';
      slot.append(number, plus); track.append(slot);
    }
    track.style.setProperty('--slot-count', state.capacity);
    slots = [...track.children];
  }

  function renderRequestStream() {
    const stream = byId('requestStream'); stream.replaceChildren();
    const shown = Math.min(state.requests, 5);
    for (let i = 0; i < shown; i++) { const dot = document.createElement('i'); dot.className = 'request-token'; dot.textContent = '•'; dot.title = `Waiting request ${i + 1}`; stream.append(dot); }
    if (state.requests > shown) { const more = document.createElement('b'); more.textContent = `+${state.requests - shown}`; stream.append(more); }
  }

  function animateArrivals() {
    const recipients = document.querySelector('.consumer'); recipients.classList.remove('arrival-burst'); void recipients.offsetWidth; recipients.classList.add('arrival-burst');
    const timer = setTimeout(() => { recipients.classList.remove('arrival-burst'); timeouts.delete(timer); }, 1100); timeouts.add(timer);
  }

  function updateMessagePreview(text, status, sender) {
    byId('previewText').textContent = text;
    byId('previewStatus').textContent = status;
    byId('previewSender').textContent = sender;
    byId('messagePreview').classList.remove('message-pop'); void byId('messagePreview').offsetWidth; byId('messagePreview').classList.add('message-pop');
  }

  function render() {
    syncBufferSlots();
    byId('deliveriesMetric').textContent = String(state.deliveries).padStart(2, '0');
    byId('availableMetric').innerHTML = `${state.count.toString().padStart(2, '0')} <small>/ ${state.capacity.toString().padStart(2, '0')}</small>`;
    byId('waitingMetric').textContent = String(state.requests).padStart(2, '0');
    byId('requestsFoot').textContent = `${state.requestsCreated} of ${state.totalRequests} recipient requests`;
    byId('requestAdd').disabled = state.requestsCreated >= state.totalRequests;
    byId('requestAdd').title = state.requestsCreated >= state.totalRequests ? 'All configured recipient requests have been created' : state.concurrentRequests ? `Add up to ${state.burstSize} recipient requests together` : 'Add a recipient request';
    byId('requestAdd').textContent = state.concurrentRequests ? '⇉ burst' : '+ request';
    byId('requestBurstToggle').checked = state.concurrentRequests;
    renderRequestStream();
    byId('bufferCount').textContent = state.count;
    const queueLoad = Math.round(state.count / state.capacity * 100);
    byId('queueLevel').style.width = `${queueLoad}%`;
    byId('queueLoad').innerHTML = `${queueLoad}%<span> loaded</span>`;
    byId('queueCaption').textContent = `${state.count} / ${state.capacity} slots used`;
    byId('sidebarStatus').textContent = state.race ? 'Synchronization is disabled' : 'Mutual exclusion is active';
    byId('capacityLabel').textContent = state.capacity;
    byId('capacityValue').textContent = state.capacity;
    byId('requestLabel').textContent = `${state.requests} ${state.requests === 1 ? 'recipient' : 'recipients'}`;
    byId('consumerStatus').textContent = state.requests ? `${state.requests} ${state.requests === 1 ? 'recipient' : 'recipients'} in queue` : 'No recipients waiting';
    byId('producerStatus').innerHTML = `<span class="online-dot"></span> ${state.count === state.capacity ? 'Queue full · producer waiting' : 'Ready to accept messages'}`;
    byId('sidebarServerStatus').textContent = state.race ? 'Sync disabled · race risk' : state.count === 0 ? 'Connected · queue empty' : state.count === state.capacity ? 'Connected · queue full' : 'Connected · queue ready';
    slots.forEach((slot, i) => {
      const filled = i < state.count;
      slot.classList.toggle('filled', filled); slot.classList.toggle('empty', !filled);
      slot.innerHTML = filled ? `<div class="queue-message"><span class="queue-envelope">✉</span><span class="queue-message-copy"></span></div><span class="slot-number">${String(i + 1).padStart(2,'0')}</span>` : `<span class="slot-number">${String(i + 1).padStart(2,'0')}</span><span class="empty-plus">＋</span>`;
      if (filled) slot.querySelector('.queue-message-copy').textContent = messageQueue[i] || sampleMessages[i % sampleMessages.length];
    });

    byId('syncMetric').textContent = state.race ? 'At risk' : 'Synchronized';
    byId('syncFoot').textContent = state.race ? 'Concurrent queue access is unlocked' : 'No queue conflicts';
    byId('syncDot').style.background = state.race ? '#d5485c' : '#52b98d';
    byId('lockStatus').textContent = state.race ? '⚠ synchronization off · race condition mode' : '♙ mutual exclusion is active';
    byId('sidebarStatus').textContent = state.race ? 'Race condition mode enabled' : 'Mutual exclusion is active';
    document.body.classList.toggle('race-active', state.race);

    document.getElementById('systemMap').classList.toggle('run-active', autoRunning);
    byId('autoRunBtn').classList.toggle('running', autoRunning);
    byId('autoRunLabel').textContent = autoRunning ? 'Pause message flow' : 'Start message flow';
    byId('autoRunBtn').querySelector('.play-symbol').textContent = autoRunning ? 'Ⅱ' : '▶';
    document.querySelector('.status-value').classList.toggle('risk-value', state.race);
    byId('produceBtn').classList.toggle('blocked', !state.race && state.count >= state.capacity);
    byId('consumeBtn').classList.toggle('blocked', !state.race && (state.count === 0 || state.requests === 0));
  }

  function animate(direction) {
    const lane = document.querySelector(direction === 'produce' ? '.flow-lane:not(.reverse)' : '.flow-lane.reverse');
    const target = direction === 'produce' ? state.count : state.count - 1;
    if (slots[Math.max(0, target)]) slots[Math.max(0, target)].classList.add('pop');
    lane.classList.remove('animating'); void lane.offsetWidth; lane.classList.add('animating');
    const timer = setTimeout(() => { lane.classList.remove('animating'); lane.querySelector('.buffer-slot')?.classList.remove('pop'); slots.forEach(s => s.classList.remove('pop')); timeouts.delete(timer); }, speeds[state.speed] + 100); timeouts.add(timer);
  }

  async function operation(kind) {
    const isProduce = kind === 'produce';
    const label = isProduce ? 'Send message' : 'Deliver message';
    if (!state.race && busy) { toast('Process waiting', `${label} is queued until the queue operation finishes.`); return; }
    if (!state.race) busy = true;
    const operationGeneration = generation;
    const startCount = state.count;
    const startRequests = state.requests;
    const queueSnapshot = [...messageQueue];
    if (isProduce && startCount >= state.capacity) {
      addEvent('Message queue full', 'The sender must wait until a recipient reads a message.', 'warning'); toast('Message queue is full', 'Deliver a message before sending another.', true);
      busy = false; render(); return;
    }
    if (!isProduce && (startCount === 0 || startRequests === 0)) {
      if (startCount === 0) { addEvent('Message queue empty', 'There are no messages for waiting recipients.', 'warning'); toast('Message queue is empty', 'Send a message before delivering one.', true); }
      else toast('No recipients waiting', 'Add recipient requests to continue.');
      busy = false; render(); return;
    }
    const draftedMessage = byId('customMessage').value.trim();
    const messageText = isProduce ? (draftedMessage || sampleMessages[nextMessage++ % sampleMessages.length]) : (queueSnapshot[0] || sampleMessages[nextMessage++ % sampleMessages.length]);
    if (isProduce) updateMessagePreview(messageText, 'SENDING', 'Alex → # project-group');
    else updateMessagePreview(messageText, 'DELIVERING', 'Project group → recipient');
    animate(isProduce ? 'produce' : 'consume');
    addEvent(isProduce ? 'Message send started' : 'Message delivered', isProduce ? 'A sender is publishing a message to the queue.' : 'A message is on its way to a recipient.', isProduce ? 'produced' : 'consumed');
    if (state.race) {
      // Both processes snapshot shared state before they finish. Parallel operations can overwrite each other's updates.
      await wait(speeds[state.speed]);
      if (operationGeneration !== generation) return;
      if (isProduce) { state.count = Math.min(state.capacity, startCount + 1); messageQueue = [...queueSnapshot, messageText]; }
      else { state.count = Math.max(0, startCount - 1); messageQueue = queueSnapshot.slice(1); state.requests = Math.max(0, startRequests - 1); state.deliveries++; }
      const concurrentCount = pendingStarts;
      if (concurrentCount > 1) {
        updateMessagePreview(messageText, 'RACE CONFLICT', 'Shared queue update overlapped');
        addEvent('Race condition detected', 'Concurrent processes used the same buffer snapshot; one update may have been lost.', 'warning');
        toast('Race condition detected', 'Two processes changed shared buffer state at the same time.', true);
      } else { updateMessagePreview(messageText, isProduce ? 'IN QUEUE' : 'DELIVERED', isProduce ? 'Alex → Project group' : 'Delivered to # project-group'); addEvent(isProduce ? 'Message queued' : 'Message received', `“${messageText}” · ${isProduce ? 'waiting in server queue' : 'delivered to recipient'}.`, isProduce ? 'produced' : 'consumed'); }
    } else {
      await wait(speeds[state.speed]);
      if (operationGeneration !== generation) { busy = false; return; }
      if (isProduce) { state.count++; messageQueue.push(messageText); }
      else { state.count--; state.requests--; state.deliveries++; messageQueue.shift(); }
      updateMessagePreview(messageText, isProduce ? 'IN QUEUE' : 'DELIVERED', isProduce ? 'Alex → Project group' : 'Delivered to # project-group');
      addEvent(isProduce ? 'Message queued' : 'Message received', `“${messageText}” · ${isProduce ? 'waiting in server queue' : 'delivered to recipient'}.`, isProduce ? 'produced' : 'consumed');
      busy = false;
    }
    render();
  }

  // Track in-flight operations to make unsynchronized overlap observable.
  let pendingStarts = 0;
  let syncQueue = Promise.resolve();
  const execute = async kind => {
    if (!state.race) {
      syncQueue = syncQueue.then(() => operation(kind));
      return syncQueue;
    }
    pendingStarts++;
    try { await operation(kind); } finally { pendingStarts = Math.max(0, pendingStarts - 1); }
  };
  async function autoCycle() {
    if (!autoRunning) return;
    if (state.requests === 0 && state.requestsCreated < state.totalRequests) {
      const arrivals = Math.min(state.concurrentRequests ? state.burstSize : 1, state.totalRequests - state.requestsCreated);
      state.requests += arrivals; state.requestsCreated += arrivals; render();
      if (arrivals > 1) { animateArrivals(); addEvent('Concurrent recipient burst', `${arrivals} recipients requested messages at the same time.`, 'system'); }
      else addEvent('Recipient request received', `Recipient request ${state.requestsCreated} of ${state.totalRequests} entered the message queue.`, 'system');
    }
    if (state.requests === 0 && state.requestsCreated >= state.totalRequests) { autoRunning = false; render(); addEvent('All recipient requests completed', `${state.totalRequests} of ${state.totalRequests} recipient requests have been served.`, 'system'); toast('Message simulation complete', `All ${state.totalRequests} configured recipient requests have been served.`); return; }
    if (state.count < state.capacity) await execute('produce');
    if (!autoRunning) return;
    if (state.count > 0 && state.requests > 0) await execute('consume');
    if (autoRunning) autoTimer = setTimeout(autoCycle, 350);
  }
  byId('autoRunBtn').addEventListener('click', () => {
    autoRunning = !autoRunning;
    render();
    if (autoRunning) { addEvent('Message flow started', 'Senders and recipients are moving messages through the server queue.', 'system'); autoCycle(); }
    else { clearTimeout(autoTimer); addEvent('Message flow paused', 'Manual controls are ready.', 'system'); }
  });
    byId('produceBtn').addEventListener('click', () => execute('produce'));
  byId('applySetup').addEventListener('click', () => {
    const count = Number(byId('setupCount').value);
    const capacity = Number(byId('setupCapacity').value);
    const requests = Number(byId('setupRequests').value);
    const totalRequests = Number(byId('setupTotalRequests').value);
    const burstSize = Number(byId('setupBurstSize').value);
    const valid = Number.isInteger(count) && Number.isInteger(capacity) && Number.isInteger(requests) && Number.isInteger(totalRequests) && Number.isInteger(burstSize) && capacity >= 1 && capacity <= 8 && count >= 0 && count <= capacity && requests >= 0 && requests <= 99 && totalRequests >= requests && totalRequests <= 99 && burstSize >= 1 && burstSize <= 20;
    if (!valid) { toast('Check your scenario values', 'Use 1–8 buffer slots, messages up to capacity, waiting recipients ≤ total recipient requests ≤ 99.', true); return; }
    autoRunning = false; clearTimeout(autoTimer); generation++; busy = false;
    document.querySelectorAll('.flow-lane').forEach(lane => lane.classList.remove('animating'));
    Object.assign(state, { count, capacity, requests, totalRequests, requestsCreated: requests, burstSize });
    messageQueue = makeInitialQueue(count); nextMessage = count;
    updateMessagePreview(messageQueue[0] || 'No message is waiting in the queue.', messageQueue.length ? 'IN QUEUE' : 'QUEUE EMPTY', `Server starts with ${count} messages`); render();
    addEvent('Custom scenario applied', `${count} messages · ${capacity} queue slots · ${requests} recipients waiting · ${totalRequests} total recipient requests.`, 'system');
    toast('Scenario updated', 'The message queue now matches your custom data.');
  });
  byId('consumeBtn').addEventListener('click', () => execute('consume'));
  byId('capacityDown').addEventListener('click', () => { if (state.capacity <= 1) return; state.capacity--; if (state.count > state.capacity) state.count = state.capacity; byId('setupCapacity').value = state.capacity; byId('setupCount').value = state.count; render(); addEvent('Queue capacity updated', `Queue capacity reduced to ${state.capacity} messages.`, 'system'); });
  byId('capacityUp').addEventListener('click', () => { if (state.capacity >= 8) return; state.capacity++; byId('setupCapacity').value = state.capacity; render(); addEvent('Queue capacity updated', `Queue capacity increased to ${state.capacity} messages.`, 'system'); });
  document.querySelectorAll('.speed-option').forEach(button => button.addEventListener('click', () => { state.speed = button.dataset.speed; document.querySelectorAll('.speed-option').forEach(b => b.classList.toggle('selected', b === button)); }));
  byId('requestBurstToggle').addEventListener('change', event => { state.concurrentRequests = event.target.checked; render(); addEvent(state.concurrentRequests ? 'Concurrent recipient arrivals enabled' : 'Concurrent recipient arrivals disabled', state.concurrentRequests ? `Up to ${state.burstSize} recipient requests will arrive together.` : 'Recipient requests will arrive one at a time.', 'system'); toast(state.concurrentRequests ? 'Burst arrivals on' : 'Single arrivals on', state.concurrentRequests ? `${state.burstSize} recipient requests can join at once.` : 'Recipient requests now join one at a time.'); });
  byId('raceToggle').addEventListener('change', event => { state.race = event.target.checked; render(); addEvent(state.race ? 'Synchronization disabled' : 'Synchronization enabled', state.race ? 'Concurrent sender and recipient access is now possible.' : 'Buffer updates are protected by mutual exclusion.', state.race ? 'warning' : 'system'); toast(state.race ? 'Race condition mode on' : 'Synchronization restored', state.race ? 'Run producer and consumer close together to expose conflicts.' : 'Buffer operations are now serialized.', state.race); });
  byId('resetBtn').addEventListener('click', () => { generation++; autoRunning = false; clearTimeout(autoTimer); Object.assign(state, initial); messageQueue = makeInitialQueue(initial.count); nextMessage = initial.count; byId('customMessage').value = ''; updateMessagePreview(messageQueue[0], 'IN QUEUE', 'Jordan → Project group'); byId('setupCount').value = initial.count; byId('setupCapacity').value = initial.capacity; byId('setupRequests').value = initial.requests; byId('setupTotalRequests').value = initial.totalRequests; byId('setupBurstSize').value = initial.burstSize; busy = false; pendingStarts = 0; byId('raceToggle').checked = false; byId('requestBurstToggle').checked = false; document.querySelectorAll('.speed-option').forEach(b => b.classList.toggle('selected', b.dataset.speed === 'normal')); timeouts.forEach(clearTimeout); timeouts.clear(); document.querySelectorAll('.flow-lane').forEach(l => l.classList.remove('animating')); activity.innerHTML = ''; eventCount = 0; seedLog(); render(); toast('Simulation reset', 'The system is back to its starting state.'); });
  byId('clearLog').addEventListener('click', () => { activity.innerHTML = ''; });
  byId('requestAdd').addEventListener('click', () => { if (state.requestsCreated >= state.totalRequests) { toast('Request limit reached', 'Increase total recipient requests in Custom scenario to add more.', true); return; } const arrivals = Math.min(state.concurrentRequests ? state.burstSize : 1, state.totalRequests - state.requestsCreated); state.requests += arrivals; state.requestsCreated += arrivals; render(); if (arrivals > 1) { animateArrivals(); addEvent('Concurrent recipient burst', `${arrivals} recipients requested messages at the same time.`, 'system'); toast('Recipient requests arrived together', `${arrivals} recipient requests joined the message queue.`); } else addEvent('Recipient request received', `Recipient request ${state.requestsCreated} of ${state.totalRequests} joined the queue.`, 'system'); });
  const dialog = byId('guideDialog');
  byId('guideBtn').addEventListener('click', () => dialog.showModal());
  byId('closeGuide').addEventListener('click', () => dialog.close());
  byId('gotIt').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.addEventListener('keydown', event => { if (event.target.matches('input,button') || dialog.open) return; if (event.key.toLowerCase() === 'p') execute('produce'); if (event.key.toLowerCase() === 'd') execute('consume'); });
  function seedLog() { addEvent('Message delivered', '“On my way — see you soon!” delivered to a recipient.', 'consumed'); addEvent('Message queued', '“I shared the project files with you.” added to the server queue.', 'produced'); addEvent('System synchronized', 'Senders and recipients are sharing the message queue safely.', 'system'); }
  seedLog(); render();
})();
