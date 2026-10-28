(() => {
  const initial = { count: 3, capacity: 5, requests: 2, totalRequests: 20, requestsCreated: 2, burstSize: 4, concurrentRequests: false, supply: 82, deliveries: 8, speed: 'normal', race: false };
  const state = { ...initial };
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
    const households = document.querySelector('.consumer'); households.classList.remove('arrival-burst'); void households.offsetWidth; households.classList.add('arrival-burst');
    const timer = setTimeout(() => { households.classList.remove('arrival-burst'); timeouts.delete(timer); }, 1100); timeouts.add(timer);
  }

  function render() {
    syncBufferSlots();
    byId('deliveriesMetric').textContent = String(state.deliveries).padStart(2, '0');
    byId('availableMetric').innerHTML = `${state.count.toString().padStart(2, '0')} <small>/ ${state.capacity.toString().padStart(2, '0')}</small>`;
    byId('waitingMetric').textContent = String(state.requests).padStart(2, '0');
    byId('requestsFoot').textContent = `${state.requestsCreated} of ${state.totalRequests} total requests created`;
    byId('requestAdd').disabled = state.requestsCreated >= state.totalRequests;
    byId('requestAdd').title = state.requestsCreated >= state.totalRequests ? 'All configured requests have been created' : state.concurrentRequests ? `Add up to ${state.burstSize} requests together` : 'Add a household request';
    byId('requestAdd').textContent = state.concurrentRequests ? '⇉ burst' : '+ request';
    byId('requestBurstToggle').checked = state.concurrentRequests;
    renderRequestStream();
    byId('bufferCount').textContent = state.count;
    byId('waterLevel').style.height = `${state.supply}%`;
    byId('tankVolume').innerHTML = `${state.supply}<span>%</span>`;
    byId('tankCaption').textContent = `${state.supply}% capacity`;
    byId('capacityLabel').textContent = state.capacity;
    byId('capacityValue').textContent = state.capacity;
    byId('requestLabel').textContent = `${state.requests} ${state.requests === 1 ? 'request' : 'requests'}`;
    byId('consumerStatus').textContent = state.requests ? `${state.requests} ${state.requests === 1 ? 'household' : 'households'} in queue` : 'No pending requests';
    byId('producerStatus').textContent = state.supply < 8 ? 'City supply too low to fill' : state.count === state.capacity ? 'Buffer at capacity' : 'Ready to fill tankers';
    byId('citySupplyStatus').textContent = state.supply === 0 ? '● EMPTY' : state.supply < 8 ? '● LOW SUPPLY' : '● ONLINE';
    byId('citySupplyStatus').style.color = state.supply < 8 ? '#c17d46' : '';
    slots.forEach((slot, i) => {
      const filled = i < state.count;
      slot.classList.toggle('filled', filled); slot.classList.toggle('empty', !filled);
      slot.innerHTML = filled ? `<div class="mini-truck"><span class="truck-water"></span><span class="wheel left"></span><span class="wheel right"></span></div><span class="slot-number">${String(i + 1).padStart(2,'0')}</span>` : `<span class="slot-number">${String(i + 1).padStart(2,'0')}</span><span class="empty-plus">＋</span>`;
    });

    byId('syncMetric').textContent = state.race ? 'At risk' : 'Synchronized';
    byId('syncFoot').textContent = state.race ? 'Concurrent access is unlocked' : 'No resource conflicts';
    byId('syncDot').style.background = state.race ? '#d5a04e' : '#5db987';
    byId('lockStatus').textContent = state.race ? 'Synchronization disabled · race condition mode' : 'Buffer protected by synchronization';
    document.body.classList.toggle('race-active', state.race);
    document.body.classList.toggle('low-supply', state.supply < 8);
    document.getElementById('systemMap').classList.toggle('run-active', autoRunning);
    byId('autoRunBtn').classList.toggle('running', autoRunning);
    byId('autoRunLabel').textContent = autoRunning ? 'Pause delivery run' : 'Start delivery run';
    byId('autoRunBtn').querySelector('.play-symbol').textContent = autoRunning ? 'Ⅱ' : '▶';
    document.querySelector('.status-value').classList.toggle('risk-value', state.race);
    byId('produceBtn').classList.toggle('blocked', !state.race && (state.count >= state.capacity || state.supply < 8));
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
    const label = isProduce ? 'Produce tanker' : 'Dispatch tanker';
    if (!state.race && busy) { toast('Process waiting', `${label} is queued until the buffer operation finishes.`); return; }
    if (!state.race) busy = true;
    const operationGeneration = generation;
    const startCount = state.count;
    const startRequests = state.requests;
    if (isProduce && startCount >= state.capacity) {
      addEvent('Buffer full', 'City tanks cannot add a tanker until a delivery is dispatched.', 'warning'); toast('Buffer is full', 'Dispatch a tanker before producing another.', true);
      busy = false; render(); return;
    }
    if (isProduce && state.supply < 8) {
      addEvent('City supply too low', 'Increase the city supply in Custom scenario before filling another tanker.', 'warning'); toast('City supply too low', 'Apply a scenario with at least 8% supply to fill a tanker.', true);
      busy = false; render(); return;
    }
    if (!isProduce && (startCount === 0 || startRequests === 0)) {
      if (startCount === 0) { addEvent('Buffer empty', 'No tankers are available for the waiting households.', 'warning'); toast('Buffer is empty', 'Produce a tanker before dispatching a delivery.', true); }
      else toast('No requests waiting', 'Households can request delivery when you are ready.');
      busy = false; render(); return;
    }
    animate(isProduce ? 'produce' : 'consume');
    addEvent(isProduce ? 'Tanker filling started' : 'Tanker dispatched', isProduce ? 'City supply is filling a tanker for the buffer.' : 'A tanker is on its way to a household.', isProduce ? 'produced' : 'consumed');
    if (state.race) {
      // Both processes snapshot shared state before they finish. Parallel operations can overwrite each other's updates.
      await wait(speeds[state.speed]);
      if (operationGeneration !== generation) return;
      if (isProduce) { state.count = Math.min(state.capacity, startCount + 1); state.supply = Math.max(0, state.supply - 8); }
      else { state.count = Math.max(0, startCount - 1); state.requests = Math.max(0, startRequests - 1); state.deliveries++; }
      const concurrentCount = pendingStarts;
      if (concurrentCount > 1) {
        addEvent('Race condition detected', 'Concurrent processes used the same buffer snapshot; one update may have been lost.', 'warning');
        toast('Race condition detected', 'Two processes changed shared buffer state at the same time.', true);
      } else addEvent(isProduce ? 'Tanker ready' : 'Delivery complete', isProduce ? 'A filled tanker is now waiting in the buffer.' : 'Household received water successfully.', isProduce ? 'produced' : 'consumed');
    } else {
      await wait(speeds[state.speed]);
      if (operationGeneration !== generation) { busy = false; return; }
      if (isProduce) { state.count++; state.supply = Math.max(0, state.supply - 8); }
      else { state.count--; state.requests--; state.deliveries++; }
      addEvent(isProduce ? 'Tanker ready' : 'Delivery complete', isProduce ? 'A filled tanker is now waiting in the buffer.' : 'Household received water successfully.', isProduce ? 'produced' : 'consumed');
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
      if (arrivals > 1) { animateArrivals(); addEvent('Concurrent request burst', `${arrivals} households requested water at the same time.`, 'system'); }
      else addEvent('Household request received', `Request ${state.requestsCreated} of ${state.totalRequests} entered the delivery queue.`, 'system');
    }
    if (state.requests === 0 && state.requestsCreated >= state.totalRequests) { autoRunning = false; render(); addEvent('All requests completed', `${state.totalRequests} of ${state.totalRequests} requests have been served.`, 'system'); toast('Simulation complete', `All ${state.totalRequests} configured requests have been served.`); return; }
    if (state.count === 0 && state.supply < 8) { autoRunning = false; render(); addEvent('Delivery run paused', 'City supply is too low to fill another tanker.', 'warning'); toast('Delivery run paused', 'Apply a scenario with more city supply to continue.', true); return; }
    if (state.count < state.capacity) await execute('produce');
    if (!autoRunning) return;
    if (state.count > 0 && state.requests > 0) await execute('consume');
    if (autoRunning) autoTimer = setTimeout(autoCycle, 350);
  }
  byId('autoRunBtn').addEventListener('click', () => {
    autoRunning = !autoRunning;
    render();
    if (autoRunning) { addEvent('Delivery run started', 'The city is filling and dispatching tankers automatically.', 'system'); autoCycle(); }
    else { clearTimeout(autoTimer); addEvent('Delivery run paused', 'Manual controls are ready.', 'system'); }
  });
    byId('produceBtn').addEventListener('click', () => execute('produce'));
  byId('applySetup').addEventListener('click', () => {
    const count = Number(byId('setupCount').value);
    const capacity = Number(byId('setupCapacity').value);
    const requests = Number(byId('setupRequests').value);
    const totalRequests = Number(byId('setupTotalRequests').value);
    const burstSize = Number(byId('setupBurstSize').value);
    const supply = Number(byId('setupSupply').value);
    const valid = Number.isInteger(count) && Number.isInteger(capacity) && Number.isInteger(requests) && Number.isInteger(totalRequests) && Number.isInteger(burstSize) && Number.isInteger(supply) && capacity >= 1 && capacity <= 8 && count >= 0 && count <= capacity && requests >= 0 && requests <= 99 && totalRequests >= requests && totalRequests <= 99 && burstSize >= 1 && burstSize <= 20 && supply >= 0 && supply <= 100;
    if (!valid) { toast('Check your scenario values', 'Use 1–8 buffer slots, tankers up to capacity, waiting requests ≤ total requests ≤ 99, and 0–100% supply.', true); return; }
    autoRunning = false; clearTimeout(autoTimer); generation++; busy = false;
    document.querySelectorAll('.flow-lane').forEach(lane => lane.classList.remove('animating'));
    Object.assign(state, { count, capacity, requests, totalRequests, requestsCreated: requests, burstSize, supply }); render();
    addEvent('Custom scenario applied', `${count} tankers · ${capacity} slots · ${requests} waiting of ${totalRequests} total requests · ${supply}% city supply.`, 'system');
    toast('Scenario updated', 'The buffer and water tank now match your custom data.');
  });
  byId('consumeBtn').addEventListener('click', () => execute('consume'));
  byId('capacityDown').addEventListener('click', () => { if (state.capacity <= 1) return; state.capacity--; if (state.count > state.capacity) state.count = state.capacity; byId('setupCapacity').value = state.capacity; byId('setupCount').value = state.count; render(); addEvent('Buffer capacity updated', `Dispatch capacity reduced to ${state.capacity} tankers.`, 'system'); });
  byId('capacityUp').addEventListener('click', () => { if (state.capacity >= 8) return; state.capacity++; byId('setupCapacity').value = state.capacity; render(); addEvent('Buffer capacity updated', `Dispatch capacity increased to ${state.capacity} tankers.`, 'system'); });
  document.querySelectorAll('.speed-option').forEach(button => button.addEventListener('click', () => { state.speed = button.dataset.speed; document.querySelectorAll('.speed-option').forEach(b => b.classList.toggle('selected', b === button)); }));
  byId('requestBurstToggle').addEventListener('change', event => { state.concurrentRequests = event.target.checked; render(); addEvent(state.concurrentRequests ? 'Concurrent request arrivals enabled' : 'Concurrent request arrivals disabled', state.concurrentRequests ? `Up to ${state.burstSize} household requests will arrive together.` : 'Household requests will arrive one at a time.', 'system'); toast(state.concurrentRequests ? 'Burst arrivals on' : 'Single arrivals on', state.concurrentRequests ? `${state.burstSize} requests can join the queue at once.` : 'Requests now join the queue one at a time.'); });
  byId('raceToggle').addEventListener('change', event => { state.race = event.target.checked; render(); addEvent(state.race ? 'Synchronization disabled' : 'Synchronization enabled', state.race ? 'Concurrent producer and consumer access is now possible.' : 'Buffer updates are protected by mutual exclusion.', state.race ? 'warning' : 'system'); toast(state.race ? 'Race condition mode on' : 'Synchronization restored', state.race ? 'Run producer and consumer close together to expose conflicts.' : 'Buffer operations are now serialized.', state.race); });
  byId('resetBtn').addEventListener('click', () => { generation++; autoRunning = false; clearTimeout(autoTimer); Object.assign(state, initial); byId('setupCount').value = initial.count; byId('setupCapacity').value = initial.capacity; byId('setupRequests').value = initial.requests; byId('setupTotalRequests').value = initial.totalRequests; byId('setupBurstSize').value = initial.burstSize; byId('setupSupply').value = initial.supply; busy = false; pendingStarts = 0; byId('raceToggle').checked = false; byId('requestBurstToggle').checked = false; document.querySelectorAll('.speed-option').forEach(b => b.classList.toggle('selected', b.dataset.speed === 'normal')); timeouts.forEach(clearTimeout); timeouts.clear(); document.querySelectorAll('.flow-lane').forEach(l => l.classList.remove('animating')); activity.innerHTML = ''; eventCount = 0; seedLog(); render(); toast('Simulation reset', 'The system is back to its starting state.'); });
  byId('clearLog').addEventListener('click', () => { activity.innerHTML = ''; });
  byId('requestAdd').addEventListener('click', () => { if (state.requestsCreated >= state.totalRequests) { toast('Request limit reached', 'Increase total requests in Custom scenario to add more.', true); return; } const arrivals = Math.min(state.concurrentRequests ? state.burstSize : 1, state.totalRequests - state.requestsCreated); state.requests += arrivals; state.requestsCreated += arrivals; render(); if (arrivals > 1) { animateArrivals(); addEvent('Concurrent request burst', `${arrivals} households requested water at the same time.`, 'system'); toast('Requests arrived together', `${arrivals} new household requests joined the queue.`); } else addEvent('Household request received', `Request ${state.requestsCreated} of ${state.totalRequests} joined the delivery queue.`, 'system'); });
  const dialog = byId('guideDialog');
  byId('guideBtn').addEventListener('click', () => dialog.showModal());
  byId('closeGuide').addEventListener('click', () => dialog.close());
  byId('gotIt').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.addEventListener('keydown', event => { if (event.target.matches('input,button') || dialog.open) return; if (event.key.toLowerCase() === 'p') execute('produce'); if (event.key.toLowerCase() === 'd') execute('consume'); });
  function seedLog() { addEvent('Tanker dispatched', 'Delivery completed for a household in the north district.', 'consumed'); addEvent('Tanker ready', 'City supply added a filled tanker to the buffer.', 'produced'); addEvent('System synchronized', 'Producer and consumer are sharing the buffer safely.', 'system'); }
  seedLog(); render();
})();
