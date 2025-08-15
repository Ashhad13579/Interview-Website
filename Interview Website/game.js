// --- Query param ---
function getQueryParam(name){ return new URLSearchParams(window.location.search).get(name); }
const selectedCourse = getQueryParam('course') || 'HTML';
document.getElementById('courseTitle').textContent = 'Course: ' + selectedCourse;

// --- State ---
let questions = {}, jsonLoaded = false;
let selectedRounds = [], currentRound = 0, totalRounds = 10;
let defaultTime = 30, timerInterval = null, timeLeft = 0, totalTime = 0;
let userAnswers = [];
let lowTimeApplied = false;

// --- Stress events (messages now match effect) ---
const stressEvents = [
  { type:'speed',   factor:2,   message:'Time pressure! 2× faster' },  // faster drain
  { type:'speed',   factor:0.5, message:'Breather! 2× slower' },       // slower drain
  { type:'bonus',   seconds:5,  message:'Lucky! +5s added' },
  { type:'penalty', seconds:5,  message:'Oops! -5s lost' }
];

// --- Load questions ---
fetch('questions.json')
  .then(r=>r.json())
  .then(data=>{
    questions = data;
    jsonLoaded = true;
    document.querySelectorAll('.diff-btn').forEach(b=>b.disabled=false);
  })
  .catch(e=>console.error('Error loading questions.json', e));

// --- Start game ---
function startGame(difficulty){
  if(!jsonLoaded){ alert('Questions are still loading…'); return; }
  document.getElementById('difficultySelect').style.display='none';
  document.getElementById('topInfo').textContent = `${selectedCourse} : ${difficulty}`;

  defaultTime = (difficulty==='easy')?25 : (difficulty==='normal')?35 : 45;

  const pool = (questions[selectedCourse] && questions[selectedCourse][difficulty]) || [];
  if(!pool.length){ alert('No questions found for this course/difficulty.'); return; }

  // Pick 10 with replacement (simple). You can swap to unique draw later if needed.
  selectedRounds = Array.from({length: totalRounds}, ()=> pool[Math.floor(Math.random()*pool.length)]);

  // Inject 2 curveballs
  const curve = questions.curveball || [];
  for(let i=0;i<2 && curve.length;i++){
    selectedRounds[Math.floor(Math.random()*totalRounds)] = curve[Math.floor(Math.random()*curve.length)];
  }

  currentRound = 0; userAnswers = [];
  showRound();
}

// --- Round setup ---
function showRound(){
  document.getElementById('roundDisplay').textContent = `Round: ${currentRound+1} / ${totalRounds}`;
  document.getElementById('questionSection').style.display='none';

  // reset cards
  ['card1','card2','card3'].forEach(id=>{
    const card = document.getElementById(id);
    card.classList.remove('flipped');
    card.style.pointerEvents='auto';
    card.querySelector('.card-back').textContent='';
  });

  // attach handlers
  ['card1','card2','card3'].forEach(id=> document.getElementById(id).onclick = ()=>flipCard(id));

  // reset timer visuals
  const bar = document.getElementById('timerBar');
  bar.style.transition='none'; bar.style.width='100%';
  document.body.classList.remove('low-time');
  lowTimeApplied = false;
}

// --- Flip card and show question ---
function flipCard(cardId){
  const card = document.getElementById(cardId);
  const qObj = selectedRounds[currentRound];

  card.querySelector('.card-back').textContent = qObj.question;
  card.classList.add('flipped');

  // disable other cards
  ['card1','card2','card3'].forEach(id=> document.getElementById(id).style.pointerEvents='none');

  // show QA
  document.getElementById('questionText').textContent = qObj.question;
  document.getElementById('userAnswer').value = '';
  document.getElementById('questionSection').style.display='block';

  // start timer (question-specific or default)
  startTimer(qObj.time || defaultTime);
}

// --- Smooth timer ---
function startTimer(seconds){
  clearInterval(timerInterval);
  timeLeft = seconds; totalTime = seconds;
  const bar = document.getElementById('timerBar');
  const timerText = document.getElementById('timerDisplay');

  bar.style.transition='none'; bar.style.width='100%';
  timerText.textContent = `${Math.ceil(timeLeft)}s`;
  const t0 = performance.now();

  // maybe schedule a stress event (3s min headroom)
  if(Math.random()<0.5 && seconds>3){
    const delay = Math.random() * (seconds*1000 - 3000);
    setTimeout(()=>triggerRandomEvent(3000), delay);
  }

  timerInterval = setInterval(()=>{
    const elapsed = (performance.now() - t0) / 1000;
    timeLeft = Math.max(0, seconds - elapsed);

    // low time UI
    if(!lowTimeApplied && timeLeft <= Math.max(5, totalTime*0.2)){
      document.body.classList.add('low-time');
      lowTimeApplied = true;
    }

    timerText.textContent = `${Math.ceil(timeLeft)}s`;
    bar.style.width = `${(timeLeft/totalTime)*100}%`;

    if(timeLeft<=0){
      clearInterval(timerInterval);
      showTimeUpVisual();
      setTimeout(()=> saveAnswer(document.getElementById('userAnswer').value), 350);
    }
  }, 20);
}

// --- Time up pulse ---
function showTimeUpVisual(){
  const cards = document.querySelector('.cards');
  cards.classList.add('time-up');
  setTimeout(()=>cards.classList.remove('time-up'), 650);
}

// --- Stress event (3s default) ---
function triggerRandomEvent(duration=3000){
  const ev = stressEvents[Math.floor(Math.random()*stressEvents.length)];
  const cards = document.querySelector('.cards');

  // overlay message
  const overlay = document.createElement('div');
  overlay.className = 'stress-overlay';
  overlay.textContent = ev.message;
  cards.appendChild(overlay);
  cards.classList.add('shake');

  // apply effect
  if(ev.type==='speed'){
    // We treat factor as how much faster the countdown drains from now.
    // To simulate instantly, compress the remaining time by factor.
    timeLeft = timeLeft / ev.factor;
    totalTime = Math.max(timeLeft, 1); // keep denominator sane for bar
  }else if(ev.type==='bonus'){
    timeLeft += ev.seconds;
    totalTime = Math.max(totalTime, timeLeft);
  }else if(ev.type==='penalty'){
    timeLeft = Math.max(0, timeLeft - ev.seconds);
  }

  // reflect immediately
  const bar = document.getElementById('timerBar');
  bar.style.width = `${(timeLeft/totalTime)*100}%`;

  setTimeout(()=>{
    overlay.remove();
    cards.classList.remove('shake');
  }, duration);
}

// --- Save answer / next ---
document.getElementById('nextBtn').onclick = ()=> saveAnswer(document.getElementById('userAnswer').value);

function saveAnswer(ans){
  clearInterval(timerInterval);
  const qObj = selectedRounds[currentRound];
  userAnswers.push({ questionId:qObj.id, question:qObj.question, answer: ans });

  const log = document.getElementById('answerLog');
  const p = document.createElement('p');
  p.textContent = `Q${currentRound+1}: ${ans || '[No Answer]'}`;
  log.prepend(p);

  currentRound++;
  if(currentRound>=totalRounds) showResults();
  else showRound();
}

// --- Results ---
function showResults(){
  document.querySelector('.wrap').style.display='none';
  document.getElementById('topInfoContainer').style.display='none';
  const summary = document.getElementById('summary');
  summary.innerHTML = '';
  userAnswers.forEach((ua,i)=>{
    const el = document.createElement('p');
    el.innerHTML = `<strong>Q${i+1}:</strong> ${ua.question}<br><span class="muted">Your answer:</span> ${ua.answer || '[No Answer]'}`;
    summary.appendChild(el);
  });
  document.getElementById('results').style.display='grid';
}
