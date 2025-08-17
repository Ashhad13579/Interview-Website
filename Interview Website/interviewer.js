// --- Query param & heading ---
function getQueryParam(name){ return new URLSearchParams(window.location.search).get(name); }
const selectedCourse = getQueryParam('course') || 'Web Development';
document.getElementById('courseTitle').textContent = 'Course: ' + selectedCourse;

// --- State ---
let bank = {}, jsonLoaded = false;
let rounds = [], currentRound = 0, totalRounds = 10;
let defaultTime = 60, timerInterval = null, timeLeft = 0, totalTime = 0;
let sessionDecisions = []; // {id, scenario, candidate, decision, reason, auto}
let pendingDecision = null; // for Why box

// --- Stress events (optional) ---
const stressEvents = [
  { type:'speed',   factor:2,   message:'Panel interrupts! 2× faster' },
  { type:'speed',   factor:0.5, message:'Follow-up needed, slower pace' },
  { type:'bonus',   seconds:8,  message:'Extra detail requested: +8s' },
  { type:'penalty', seconds:8,  message:'Time constraint: -8s' }
];

// --- Load interview questions (hard fail if missing) ---
fetch('interviewer-questions.json')
  .then(r=>{
    if(!r.ok) throw new Error('Missing interviewer-questions.json');
    return r.json();
  })
  .then(data=>{
    bank = data;
    jsonLoaded = true;
    // enable difficulty buttons only when correct course exists
    const hasCourse = !!(bank[selectedCourse]);
    document.querySelectorAll('.diff-btn').forEach(b=> b.disabled = !(jsonLoaded && hasCourse));
    if(!hasCourse){
      document.querySelector('.hint').innerHTML = `Course "<code>${selectedCourse}</code>" not found in <code>interviewer-questions.json</code>. Pick another link.`;
    }
  })
  .catch(err=>{
    console.error(err);
    document.querySelector('.hint').innerHTML =
      `⚠️ Couldn’t load <code>interviewer-questions.json</code>. Make sure you opened from the correct folder/link.`;
  });

// --- Start session ---
function startGame(difficulty){
  if(!jsonLoaded){ alert('Questions are still loading…'); return; }
  const courseObj = bank[selectedCourse];
  if(!courseObj){ alert('Course not found in interviewer-questions.json'); return; }

  document.getElementById('difficultySelect').style.display='none';
  document.getElementById('topInfo').textContent = `${selectedCourse} : ${difficulty}`;

  // difficulty → base time
  defaultTime = (difficulty==='easy')?75 : (difficulty==='normal')?60 : 45;

  // accept both old (with difficulty buckets) and flat arrays
  let pool = [];
  if (Array.isArray(courseObj)) {
    pool = courseObj; // flat list
  } else if (courseObj[difficulty]) {
    pool = courseObj[difficulty];
  }

  if(!pool.length){ alert('No interview scenarios found for this course/difficulty.'); location.href='index.html'; return; }

  // choose totalRounds with replacement
  rounds = Array.from({length: totalRounds}, ()=> pool[Math.floor(Math.random()*pool.length)]);

  // inject up to 2 curveballs if available
  const curve = bank.curveball || [];
  for(let i=0;i<2 && curve.length;i++){
    rounds[Math.floor(Math.random()*totalRounds)] = curve[Math.floor(Math.random()*curve.length)];
  }

  currentRound = 0; sessionDecisions = [];
  showRound();
}

// --- Round setup ---
function showRound(){
  document.getElementById('roundDisplay').textContent = `Round: ${currentRound+1} / ${totalRounds}`;
  document.getElementById('scenarioSection').style.display = 'none';

  // reset cards
  ['card1','card2','card3'].forEach(id=>{
    const c = document.getElementById(id);
    c.classList.remove('flipped');
    c.style.pointerEvents='auto';
    c.querySelector('.card-back').textContent=''; // cleared until flipped
  });

  // click to flip
  ['card1','card2','card3'].forEach(id=> document.getElementById(id).onclick = ()=>flipCard(id));

  // reset timer visuals
  const bar = document.getElementById('timerBar');
  bar.style.transition='none'; bar.style.width='100%';
  document.body.classList.remove('low-time');

  // hide Why box if still visible
  document.getElementById('whyBox').style.display='none';
  document.getElementById('whyInput').value = '';
}

// --- Flip card & show scenario+candidate ---
function flipCard(cardId){
  const card = document.getElementById(cardId);
  const item = rounds[currentRound];
  const textScenario = item.scenario || item.question || '(no prompt provided)';

  card.querySelector('.card-back').textContent = textScenario;
  card.classList.add('flipped');

  // disable other cards
  ['card1','card2','card3'].forEach(id=> document.getElementById(id).style.pointerEvents='none');

  // show block
  document.getElementById('scenarioText').textContent = textScenario;
  document.getElementById('candidateAnswer').textContent = item.candidate || '';
  document.getElementById('scenarioSection').style.display='block';

  // start timer
  startTimer(item.time || defaultTime);
}

// --- Smooth timer with optional random event ---
function startTimer(seconds){
  clearInterval(timerInterval);
  timeLeft = seconds; totalTime = seconds;
  const bar = document.getElementById('timerBar');
  const timerText = document.getElementById('timerDisplay');

  bar.style.transition='none'; bar.style.width='100%';
  timerText.textContent = `${Math.ceil(timeLeft)}s`;
  const t0 = performance.now();

  // maybe trigger one stress event
  if(Math.random()<0.5 && seconds>3){
    const delay = Math.random() * (seconds*1000 - 3000);
    setTimeout(()=>triggerRandomEvent(3000), delay);
  }

  timerInterval = setInterval(()=>{
    const elapsed = (performance.now() - t0)/1000;
    timeLeft = Math.max(0, seconds - elapsed);

    if(timeLeft <= Math.max(5, totalTime*0.2)){
      document.body.classList.add('low-time');
    }

    timerText.textContent = `${Math.ceil(timeLeft)}s`;
    bar.style.width = `${(timeLeft/totalTime)*100}%`;

    if(timeLeft<=0){
      clearInterval(timerInterval);
      showTimeUpVisual();
      // time out → auto 'Maybe', no Why box
      setTimeout(()=> choose('Maybe', true), 350);
    }
  }, 20);
}

// --- Stress event ---
function triggerRandomEvent(duration=3000){
  const ev = stressEvents[Math.floor(Math.random()*stressEvents.length)];
  const cards = document.querySelector('.cards');

  const overlay = document.createElement('div');
  overlay.className='stress-overlay';
  overlay.textContent = ev.message;
  cards.appendChild(overlay);
  cards.classList.add('shake');

  if(ev.type==='speed'){
    timeLeft = timeLeft / ev.factor;
    totalTime = Math.max(timeLeft, 1);
  }else if(ev.type==='bonus'){
    timeLeft += ev.seconds;
    totalTime = Math.max(totalTime, timeLeft);
  }else if(ev.type==='penalty'){
    timeLeft = Math.max(0, timeLeft - ev.seconds);
  }

  document.getElementById('timerBar').style.width = `${(timeLeft/totalTime)*100}%`;

  setTimeout(()=>{
    overlay.remove();
    cards.classList.remove('shake');
  }, duration);
}

// --- Time-up visual ---
function showTimeUpVisual(){
  const cards = document.querySelector('.cards');
  cards.classList.add('time-up');
  setTimeout(()=>cards.classList.remove('time-up'), 650);
}

// --- Decision flow (with Why box) ---
function promptWhy(decision){
  // stop timer; store pending decision; show why box
  clearInterval(timerInterval);
  pendingDecision = decision;
  document.getElementById('whyBox').style.display='block';
  document.getElementById('whyInput').value = '';
}

function submitDecision(){
  const reason = (document.getElementById('whyInput').value || '').trim();
  choose(pendingDecision || 'Maybe', false, reason);
}

function choose(decision, auto=false, reason=''){
  clearInterval(timerInterval);
  const item = rounds[currentRound];
  const textScenario = item.scenario || item.question || '(no prompt provided)';

  // if this was an auto timeout, bypass why box
  if(auto){
    reason = '';
    document.getElementById('whyBox').style.display='none';
  }

  // store decision
  sessionDecisions.push({
    id: item.id,
    scenario: textScenario,
    candidate: item.candidate || '',
    decision,
    reason,
    auto
  });

  // log
  const log = document.getElementById('decisionLog');
  const p = document.createElement('p');
  const tag = auto ? ' (auto)' : '';
  p.innerHTML = `<strong>Q${currentRound+1}:</strong> 
    <span class="muted">${decision}${tag}</span>
    ${reason ? ` — <em>${reason.replace(/</g,'&lt;')}</em>` : ''}`;
  log.prepend(p);

  // next
  currentRound++;
  pendingDecision = null;
  if(currentRound >= totalRounds) showResults();
  else showRound();
}

// --- Results ---
function showResults(){
  document.querySelector('.wrap').style.display='none';
  document.getElementById('topInfoContainer').style.display='none';
  const summary = document.getElementById('summary');
  summary.innerHTML = '';

  sessionDecisions.forEach((d,i)=>{
    const el = document.createElement('p');
    el.innerHTML = `
      <strong>Q${i+1}:</strong> ${d.scenario}<br>
      <span class="muted">Candidate:</span> ${d.candidate}<br>
      <span class="muted">Your decision:</span> <strong>${d.decision}${d.auto?' (auto)':''}</strong><br>
      <span class="muted">Reason:</span> ${d.reason ? d.reason.replace(/</g,'&lt;') : '(none)'}
    `;
    summary.appendChild(el);
  });

  // Example payload you can POST later:
  // fetch('/api/evaluate', {
  //   method:'POST',
  //   headers:{'Content-Type':'application/json'},
  //   body: JSON.stringify({ course: selectedCourse, decisions: sessionDecisions })
  // });

  document.getElementById('results').style.display='grid';
}
