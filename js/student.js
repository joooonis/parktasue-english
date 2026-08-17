/* 학생 페이지 — 입장(이름+학교+공통비번) → 지문 목록 → 응시 → 채점/제출 */
(function(){
  "use strict";

  const el = (id) => document.getElementById(id);
  const showNotice = TestEngine.showNotice;
  const escapeHtml = TestEngine.escapeHtml;

  const LS_KEYS = { name:'axis-student-name', school:'axis-student-school', pw:'axis-student-password' };

  let student = null;      // {name, school, pw}
  let passages = [];       // list_passages 결과
  let currentPassage = null;

  function show(screenId){
    ['entry-screen','list-screen','test-screen','result-screen'].forEach(id=>{
      el(id).classList.toggle('hidden', id !== screenId);
    });
  }

  // ---------- 입장 ----------

  el('entryName').value = localStorage.getItem(LS_KEYS.name) || '';
  el('entrySchool').value = localStorage.getItem(LS_KEYS.school) || '';
  el('entryPassword').value = localStorage.getItem(LS_KEYS.pw) || '';

  if(!StorageAPI.available()){
    el('configMissingNote').classList.remove('hidden');
    el('enterBtn').disabled = true;
  }

  async function enter(){
    const name = el('entryName').value.trim();
    const school = el('entrySchool').value.trim();
    const pw = el('entryPassword').value;
    if(!name){ showNotice('이름을 입력해주세요.'); return; }
    if(!school){ showNotice('학교를 입력해주세요.'); return; }
    if(!pw){ showNotice('비밀번호를 입력해주세요.'); return; }

    el('enterBtn').disabled = true;
    try{
      const ok = await StorageAPI.verifyStudentPassword(pw);
      if(!ok){
        showNotice('비밀번호가 올바르지 않습니다.');
        return;
      }
      student = { name, school, pw };
      localStorage.setItem(LS_KEYS.name, name);
      localStorage.setItem(LS_KEYS.school, school);
      localStorage.setItem(LS_KEYS.pw, pw);
      el('listGreeting').textContent = school + ' ' + name + ' 님, 풀 지문을 선택하세요.';
      show('list-screen');
      await refreshList();
    }catch(e){
      showNotice('접속에 실패했습니다. 네트워크를 확인해주세요.');
    }finally{
      el('enterBtn').disabled = false;
    }
  }

  // ---------- 지문 목록 ----------

  function fmtDate(iso){
    if(!iso) return '-';
    const d = new Date(iso);
    return (d.getMonth()+1) + '/' + d.getDate();
  }

  async function refreshList(){
    const listEl = el('passageList');
    listEl.innerHTML = '<div class="lib-empty">불러오는 중…</div>';
    try{
      passages = await StorageAPI.listPassages(student.pw, student.school);
    }catch(e){
      listEl.innerHTML = '<div class="lib-empty">지문을 불러오지 못했습니다. 새로고침을 눌러주세요.</div>';
      return;
    }
    listEl.innerHTML = '';
    if(passages.length === 0){
      listEl.innerHTML = '<div class="lib-empty">아직 등록된 지문이 없습니다. 선생님께 문의해주세요.</div>';
      return;
    }
    passages.forEach(p=>{
      const row = document.createElement('div');
      row.className = 'lib-item';
      row.innerHTML =
        '<div class="lib-badge">' + escapeHtml(p.category || TestEngine.DIFFICULTY_LABELS[p.level] || p.level) + '</div>' +
        '<div class="lib-main">' +
          '<div class="lib-source">' + escapeHtml(p.source || '(출처 미기재)') + '</div>' +
          '<div class="lib-preview">' + escapeHtml((p.passage || '').slice(0, 40).replace(/\s+/g,' ')) + '… · ' +
            (TestEngine.DIFFICULTY_LABELS[p.level] || p.level) + ' · ' + fmtDate(p.created_at) + '</div>' +
        '</div>' +
        '<div class="lib-actions">' +
          '<button class="lib-btn" data-action="start" data-id="' + p.id + '">응시하기</button>' +
        '</div>';
      listEl.appendChild(row);
    });
  }

  el('passageList').addEventListener('click', async (e)=>{
    const btn = e.target.closest('.lib-btn');
    if(!btn || btn.dataset.action !== 'start') return;
    const p = passages.find(x=>x.id === btn.dataset.id);
    if(!p) return;
    currentPassage = p;
    const ok = await TestEngine.build({
      passage: p.passage,
      translation: p.translation || '',
      source: p.source || '',
      student: student.name,
      level: p.level,
      showHint: false
    });
    if(ok) el('list-screen').classList.add('hidden');
  });

  // ---------- 응시 / 채점 ----------

  TestEngine.init({
    onSubmit: async (r)=>{
      try{
        await StorageAPI.submitResult(student.pw, {
          studentName: student.name,
          school: student.school,
          passageId: currentPassage ? currentPassage.id : null,
          passageSource: (currentPassage && currentPassage.source) || '(출처 미기재)',
          level: r.level,
          correctCount: r.correctCount,
          total: r.total,
          pct: r.pct,
          elapsedSeconds: r.elapsedSeconds
        });
        showNotice('제출 완료! 결과가 선생님께 전송되었습니다.');
      }catch(e){
        showNotice('점수 전송에 실패했습니다. 채점 결과는 화면에서 확인할 수 있습니다.');
      }
    }
  });

  el('enterBtn').addEventListener('click', enter);
  el('entryPassword').addEventListener('keydown', (e)=>{ if(e.key === 'Enter') enter(); });
  el('refreshListBtn').addEventListener('click', refreshList);
  el('exitBtn').addEventListener('click', ()=>{ show('entry-screen'); });
  el('submitBtn').addEventListener('click', ()=>{ TestEngine.submit(); });
  el('backToListBtn').addEventListener('click', ()=>{
    TestEngine.stopTimer();
    show('list-screen');
  });
  el('backToListBtn2').addEventListener('click', ()=>{
    show('list-screen');
  });
  el('pdfTestBtn').addEventListener('click', ()=>{
    const source = (currentPassage && currentPassage.source) || '지문';
    const levelLabel = TestEngine.DIFFICULTY_LABELS[(currentPassage && currentPassage.level) || 'basic'];
    TestEngine.printCurrentScreen(source + '_백지테스트_' + levelLabel);
  });
  el('retryBtn').addEventListener('click', ()=>{ TestEngine.retry(); });
})();
