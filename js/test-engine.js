/* 시험 엔진 — 빈칸 생성·응시·채점·인쇄. 학생/교사 페이지 공용.
   기존 단일 파일 버전에서 로직 무변경 이동, 단 build()는 DOM 입력 대신
   데이터 객체 {passage, translation, source, student, level, showHint}를 받는다.
   필요한 DOM: #test-screen, #result-screen, #passageBox, #hintNote, #axisTrack,
   #axisFill, #axisTotalLabel, #timerDisplay, #metaSource, #metaStudent,
   #scoreNum, #scoreSub, #reviewList, #reviewListLabel, print header 요소들. */
(function(){
  "use strict";

  const STOPWORDS = new Set(["a","an","the","is","are","was","were","be","been","being","of","to","in","on","at","for","and","but","or","nor","so","yet","with","as","by","from","that","this","these","those","it","its","he","she","they","we","you","i","his","her","their","our","your","not","no","do","does","did","have","has","had","will","would","can","could","may","might","should","must","than","then","there","here","when","while","which","who","whom","whose","what","if","because","about","into","over","under","between","through","during","before","after","above","below","up","down","out","off","again","further","own","same","too","very","just","also","such","only","other","some","any","each","more","most","much","many","few"]);

  const DIFFICULTY_RANGES = {
    basic:    [0.15, 0.20],
    advanced: [0.38, 0.42],
    full:     [0.60, 0.75] // unused when full-mode uses stopword-exclusion logic below
  };

  const DIFFICULTY_LABELS = { basic:'기본', advanced:'심화', full:'통암기' };

  const el = (id) => document.getElementById(id);

  function showNotice(msg){
    let n = document.getElementById('appNotice');
    if(!n){
      n = document.createElement('div');
      n.id = 'appNotice';
      n.style.cssText = 'position:fixed; left:50%; bottom:24px; transform:translateX(-50%); background:#13294B; color:#fff; padding:11px 18px; border-radius:10px; font-size:13.5px; font-weight:600; box-shadow:0 8px 24px rgba(0,0,0,0.28); z-index:9999; max-width:88vw; text-align:center; transition:opacity .25s ease; opacity:0;';
      document.body.appendChild(n);
    }
    n.textContent = msg;
    requestAnimationFrame(()=>{ n.style.opacity = '1'; });
    clearTimeout(showNotice._t);
    showNotice._t = setTimeout(()=>{ n.style.opacity = '0'; }, 2600);
  }

  function escapeHtml(str){
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  let currentBlanks = [];   // {input, correct}
  let currentLevel = 'basic';
  let currentMeta = { source:'', student:'' };
  let timerInterval = null;
  let elapsedSeconds = 0;
  let lastGenerationState = null; // to allow "retry same passage"
  let onSubmitCb = null;

  function init(opts){
    onSubmitCb = (opts && opts.onSubmit) || null;
  }

  function tokenize(text){
    const regex = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
    let tokens = [];
    let lastIndex = 0;
    let m;
    while((m = regex.exec(text)) !== null){
      if(m.index > lastIndex) tokens.push({type:'text', value:text.slice(lastIndex, m.index)});
      tokens.push({type:'word', value:m[0]});
      lastIndex = regex.lastIndex;
    }
    if(lastIndex < text.length) tokens.push({type:'text', value:text.slice(lastIndex)});
    return tokens;
  }

  function pickBlankIndices(wordTokens, level){
    if(level === 'full'){
      // 통암기: blank every content word, excluding articles/prepositions/etc. (STOPWORDS)
      const chosen = [];
      wordTokens.forEach((tok, i)=>{
        const w = tok.value.toLowerCase();
        if(!STOPWORDS.has(w)) chosen.push(i);
      });
      return new Set(chosen);
    }

    const range = DIFFICULTY_RANGES[level];
    const pct = range[0] + Math.random() * (range[1] - range[0]);
    const targetCount = Math.max(1, Math.round(wordTokens.length * pct));

    const priority0 = []; // strong content words
    const priority1 = []; // everything else
    wordTokens.forEach((tok, i)=>{
      const w = tok.value.toLowerCase();
      if(w.length >= 4 && !STOPWORDS.has(w)) priority0.push(i);
      else priority1.push(i);
    });

    shuffle(priority0);
    shuffle(priority1);
    const chosen = priority0.concat(priority1).slice(0, targetCount);
    chosen.sort((a,b)=>a-b);
    return new Set(chosen);
  }

  function shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
  }

  function splitSentences(text){
    // Split into paragraphs first (blank line = paragraph break), then sentences within each.
    const paras = text.split(/\n\s*\n/).map(p=>p.trim()).filter(p=>p.length>0);
    const flatParas = paras.length ? paras : [text.trim()];
    let sentences = [];
    flatParas.forEach((para, pi)=>{
      const cleaned = para.replace(/\n+/g, ' ').trim();
      const matches = cleaned.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [cleaned];
      matches.map(s=>s.trim()).filter(s=>s.length>0).forEach(s=>sentences.push(s));
    });
    return sentences;
  }

  async function build(data){
    if(document.fonts && document.fonts.ready){
      try{ await document.fonts.ready; }catch(e){ /* ignore */ }
    }
    const passage = (data.passage || '').trim();
    if(!passage){
      showNotice('영어 지문을 먼저 입력해주세요.');
      return false;
    }
    const sentences = splitSentences(passage);
    if(sentences.length === 0){
      showNotice('지문에서 문장을 인식하지 못했습니다. 마침표로 끝나는 문장인지 확인해주세요.');
      return false;
    }
    const translations = (data.translation || '').split('\n').map(s=>s.trim()).filter(s=>s.length>0);

    const sentenceTokens = sentences.map(s=>tokenize(s));
    const combinedWordTokens = [];
    sentenceTokens.forEach(toks=>{
      toks.filter(t=>t.type==='word').forEach(t=>combinedWordTokens.push(t));
    });
    if(combinedWordTokens.length < 5){
      showNotice('지문이 너무 짧습니다. 조금 더 긴 지문을 붙여넣어 주세요.');
      return false;
    }
    currentLevel = data.level || 'basic';
    const blankIdxSet = pickBlankIndices(combinedWordTokens, currentLevel);
    const showHint = !!data.showHint;

    // render
    const testScreen = el('test-screen');
    const box = el('passageBox');
    testScreen.insertBefore(box, el('hintNote'));
    box.innerHTML = '';
    currentBlanks = [];
    let wordCounter = -1;

    sentenceTokens.forEach((toks, sIdx)=>{
      const sentenceBlock = document.createElement('div');
      sentenceBlock.className = 'sentence-block';
      const engLine = document.createElement('div');
      engLine.className = 'eng-line';

      toks.forEach(tok=>{
        if(tok.type === 'text'){
          engLine.appendChild(document.createTextNode(tok.value));
        } else {
          wordCounter++;
          if(blankIdxSet.has(wordCounter)){
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'blank-input';
            input.autocomplete = 'off';
            input.spellcheck = false;
            input.dataset.correctWord = tok.value;
            if(showHint) input.placeholder = tok.value[0];
            engLine.appendChild(input);
            currentBlanks.push({input, correct: tok.value});
            autosizeBlank(input);
          } else {
            engLine.appendChild(document.createTextNode(tok.value));
          }
        }
      });

      sentenceBlock.appendChild(engLine);

      if(translations[sIdx]){
        const korLine = document.createElement('div');
        korLine.className = 'kor-line';
        korLine.textContent = translations[sIdx];
        sentenceBlock.appendChild(korLine);
      }

      box.appendChild(sentenceBlock);
    });

    // axis progress bar
    const total = currentBlanks.length;
    el('axisTotalLabel').textContent = total;
    const track = el('axisTrack');
    track.querySelectorAll('.axis-node').forEach(n=>n.remove());
    currentBlanks.forEach((b, i)=>{
      const node = document.createElement('div');
      node.className = 'axis-node';
      node.style.left = (total<=1 ? 100 : (i/(total-1))*100) + '%';
      node.dataset.idx = i;
      track.appendChild(node);
    });
    updateAxisProgress();

    currentBlanks.forEach(b=>{
      b.input.addEventListener('input', ()=>{
        autosizeBlank(b.input);
        updateAxisProgress();
      });
    });

    // meta
    currentMeta = { source: (data.source || '').trim(), student: (data.student || '').trim() };
    el('metaSource').textContent = currentMeta.source || '미기재';
    el('metaStudent').textContent = currentMeta.student || '미기재';
    fillPrintHeader('Test');

    lastGenerationState = Object.assign({}, data);

    el('result-screen').classList.add('hidden');
    testScreen.classList.remove('hidden');

    startTimer();
    if(currentBlanks[0]) currentBlanks[0].input.focus();
    return true;
  }

  let _measureCanvas = null;
  function getBlankFont(){
    return "600 15px 'Noto Sans KR', 'Malgun Gothic', sans-serif";
  }
  function measureTextWidth(text){
    if(!_measureCanvas) _measureCanvas = document.createElement('canvas');
    const ctx = _measureCanvas.getContext('2d');
    ctx.font = getBlankFont();
    return ctx.measureText(text || '').width;
  }
  function autosizeBlank(input){
    const current = input.value || '';
    const correct = input.dataset.correctWord || '';
    const measured = Math.max(measureTextWidth(current), measureTextWidth(correct), 26);
    const widthPx = measured * 1.15 + 40;
    input.style.width = widthPx + 'px';
  }

  function updateAxisProgress(){
    const total = currentBlanks.length;
    const filled = currentBlanks.filter(b=>b.input.value.trim().length>0).length;
    const pct = total===0 ? 0 : (filled/total)*100;
    el('axisFill').style.width = pct + '%';
    document.querySelectorAll('.axis-node').forEach((node)=>{
      const idx = Number(node.dataset.idx);
      const filled_ = currentBlanks[idx] && currentBlanks[idx].input.value.trim().length>0;
      node.classList.toggle('filled', !!filled_);
    });
  }

  function startTimer(){
    stopTimer();
    elapsedSeconds = 0;
    el('timerDisplay').textContent = '00:00';
    timerInterval = setInterval(()=>{
      elapsedSeconds++;
      const mm = String(Math.floor(elapsedSeconds/60)).padStart(2,'0');
      const ss = String(elapsedSeconds%60).padStart(2,'0');
      el('timerDisplay').textContent = mm + ':' + ss;
    }, 1000);
  }
  function stopTimer(){
    if(timerInterval) clearInterval(timerInterval);
    timerInterval = null;
  }

  function normalize(s){
    return s.trim().toLowerCase().replace(/[.,!?;:"'’]/g,'');
  }

  function submit(){
    stopTimer();
    let correctCount = 0;
    const reviewList = el('reviewList');
    reviewList.innerHTML = '';

    currentBlanks.forEach((b, i)=>{
      const userVal = b.input.value;
      const isCorrect = normalize(userVal) === normalize(b.correct);
      b.input.disabled = true;
      b.input.classList.add(isCorrect ? 'correct' : 'incorrect');
      if(isCorrect) correctCount++;

      const row = document.createElement('div');
      row.className = 'review-item ' + (isCorrect ? 'ok' : 'no');
      row.innerHTML =
        '<div class="review-badge">' + (isCorrect ? '✓' : '✕') + '</div>' +
        '<div class="review-num">' + (i+1) + '.</div>' +
        '<div class="review-word"><b>' + escapeHtml(b.correct) + '</b>' +
        (isCorrect ? '' :
          '<span class="strike">' + escapeHtml(userVal || '(공백)') + '</span>' +
          '<span class="ans">→ ' + escapeHtml(b.correct) + '</span>') +
        '</div>';
      reviewList.appendChild(row);
    });

    const total = currentBlanks.length;
    const pct = total ? Math.round((correctCount/total)*100) : 0;
    el('scoreNum').innerHTML = correctCount + '<span>/ ' + total + '</span>';
    const mm = String(Math.floor(elapsedSeconds/60)).padStart(2,'0');
    const ss = String(elapsedSeconds%60).padStart(2,'0');
    el('scoreSub').textContent = '정답률 ' + pct + '% · 소요 시간 ' + mm + ':' + ss;

    el('test-screen').classList.add('hidden');
    const resultScreen = el('result-screen');
    resultScreen.classList.remove('hidden');
    resultScreen.insertBefore(el('passageBox'), el('reviewListLabel'));
    fillPrintHeader('Result');

    const payload = {
      correctCount, total, pct, elapsedSeconds,
      level: currentLevel, source: currentMeta.source, student: currentMeta.student
    };
    if(onSubmitCb) onSubmitCb(payload);
    return payload;
  }

  function retry(){
    if(!lastGenerationState) return;
    el('result-screen').classList.add('hidden');
    // rebuild using same passage & difficulty (new random blank selection)
    build(lastGenerationState);
  }

  function todayStr(){
    const d = new Date();
    return d.getFullYear() + '.' + String(d.getMonth()+1).padStart(2,'0') + '.' + String(d.getDate()).padStart(2,'0');
  }

  function fillPrintHeader(prefix){
    const source = currentMeta.source || '미기재';
    const student = currentMeta.student;
    const level = DIFFICULTY_LABELS[currentLevel] || currentLevel;
    el('phSource' + prefix).textContent = source;
    el('phLevel' + prefix).textContent = level;
    const studentEl = el('phStudent' + prefix);
    studentEl.textContent = student ? student : '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';
    el('phDate' + prefix).textContent = todayStr();
  }

  function printCurrentScreen(filenameHint){
    const prevTitle = document.title;
    document.title = filenameHint;
    window.print();
    setTimeout(()=>{ document.title = prevTitle; }, 500);
  }

  window.TestEngine = {
    init, build, submit, retry, stopTimer, printCurrentScreen,
    showNotice, escapeHtml, DIFFICULTY_LABELS
  };
})();
