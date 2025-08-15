// --- Query param & heading ---
function getQueryParam(name){ return new URLSearchParams(window.location.search).get(name); }
const selectedCourse = getQueryParam('course') || 'Web Development';
document.getElementById('courseTitle').textContent = 'Course: ' + selectedCourse;

// --- State ---
let bank = {}, jsonLoaded = false;
let rounds = [], currentRound = 0, totalRounds = 10;
let defaultTime = 60, timerInterval = null, timeLeft = 0, totalTime = 0;
let sessionDecisions = []; // {id, scenario, candidate, decision}

// --- Stress events (optional) ---
const stressEvents = [
  { type:'speed',   factor:2,   message:'Panel interrupts! 2× faster' },
  { type:'speed',   factor:0.5, message:'Follow-up needed, slower pace' },
  { type:'bonus',   seconds:8,  message:'Extra detail requested: +8s' },
  { type:'penalty', seconds:8,  message:'Time constraint: -8s' }
];

// --- Load interview questions ---
fetch('interview-questions.json')
  .then(r=>r.json())
  .then(data=>{
    bank = data;
    jsonLoaded = true;
    document.querySelectorAll('.diff-btn').forEach(b=>b.disabled=false);
  })
  .catch(err=>console.error('Error loading interview-questions.json', err));

// --- Start session ---
function startGame(difficulty){
  if(!jsonLoaded){ alert('Questions are still loading…'); return; }
  document.getElementById('difficultySelect').style.display='none';
  document.getElementById('topInfo').textContent = `${selectedCourse} : ${difficulty}`;

  // difficulty → base time
  defaultTime = (difficulty==='easy')?75 : (difficulty==='normal')?60 : 45;

  const pool = (bank[selectedCourse] && bank[selectedCourse][difficulty]) || [];
  if(!pool.length){ alert('No interview scenarios found for this course/difficulty.'); return; }

  // choose 10 with replacement (simple)
  rounds = Array.from({length: totalRounds}, ()=> pool[Math.floor(Math.random()*pool.length)]);

  // inject 2 curveballs if available
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
    c.querySelector('.card-back').textContent='';
  });

  // click to flip
  ['card1','card2','card3'].forEach(id=> document.getElementById(id).onclick = ()=>flipCard(id));

  // reset timer visuals
  const bar = document.getElementById('timerBar');
  bar.style.transition='none'; bar.style.width='100%';
  document.body.classList.remove('low-time');
}

// --- Flip card & show scenario+candidate ---
function flipCard(cardId){
  const card = document.getElementById(cardId);
  const item = rounds[currentRound];

  card.querySelector('.card-back').textContent = item.scenario;
  card.classList.add('flipped');

  // disable other cards
  ['card1','card2','card3'].forEach(id=> document.getElementById(id).style.pointerEvents='none');

  // show block
  document.getElementById('scenarioText').textContent = item.scenario;
  document.getElementById('candidateAnswer').textContent = item.candidate;
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
      // no decision → auto 'Maybe' (or change to Reject if you prefer)
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
    // compress remaining time by factor (faster drain)
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

// --- Decision ---
function choose(decision, auto=false){
  clearInterval(timerInterval);
  const item = rounds[currentRound];

  // store decision
  sessionDecisions.push({
    id: item.id, scenario: item.scenario, candidate: item.candidate,
    decision, auto
  });

  // log
  const log = document.getElementById('decisionLog');
  const p = document.createElement('p');
  const tag = auto ? ' (auto)' : '';
  p.innerHTML = `<strong>Q${currentRound+1}:</strong> <span class="muted">${decision}${tag}</span>`;
  log.prepend(p);

  currentRound++;
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
      <span class="muted">Your decision:</span> <strong>${d.decision}${d.auto?' (auto)':''}</strong>
    `;
    summary.appendChild(el);
  });

  // Later, send sessionDecisions to your AI and display feedback here.
  // fetch('/api/evaluate', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ decisions: sessionDecisions })})
  //   .then(r=>r.json()).then(feedback => { /* render feedback */ });

  document.getElementById('results').style.display='grid';
}
