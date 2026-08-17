/* 교사 페이지 — 로그인 → 지문 등록/보관함 → 제출 현황 → 설정 */
(function(){
  "use strict";

  const el = (id) => document.getElementById(id);
  const showNotice = TestEngine.showNotice;
  const escapeHtml = TestEngine.escapeHtml;

  let currentDifficulty = 'basic';
  let editingId = null;       // 보관함에서 불러온 지문의 id (수정 저장용)
  let allPassages = [];
  let allSubmissions = [];

  const SCREENS = ['login-screen','setup-screen','dashboard-screen','settings-screen','test-screen','result-screen'];
  function show(screenId){
    SCREENS.forEach(id=> el(id).classList.toggle('hidden', id !== screenId));
    el('adminTabs').classList.toggle('hidden', screenId === 'login-screen');
    document.querySelectorAll('.tab-btn').forEach(b=>{
      b.classList.toggle('active', b.dataset.tab === screenId);
    });
  }

  // ---------- 로그인 ----------

  if(!StorageAPI.available()){
    el('configMissingNote').classList.remove('hidden');
    el('loginBtn').disabled = true;
  }

  async function login(){
    const email = el('loginEmail').value.trim();
    const password = el('loginPassword').value;
    if(!email || !password){ showNotice('이메일과 비밀번호를 입력해주세요.'); return; }
    el('loginBtn').disabled = true;
    try{
      await StorageAPI.signIn(email, password);
      await enterAdmin();
    }catch(e){
      showNotice('로그인에 실패했습니다. 이메일/비밀번호를 확인해주세요.');
    }finally{
      el('loginBtn').disabled = false;
    }
  }

  async function enterAdmin(){
    show('setup-screen');
    await renderSavedList();
  }

  // 세션이 남아 있으면 자동 로그인
  (async function(){
    if(!StorageAPI.available()) return;
    try{
      const session = await StorageAPI.getSession();
      if(session) await enterAdmin();
    }catch(e){ /* 로그인 화면 유지 */ }
  })();

  // ---------- 탭 ----------

  document.querySelectorAll('.tab-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const tab = btn.dataset.tab;
      show(tab);
      if(tab === 'setup-screen') await renderSavedList();
      if(tab === 'dashboard-screen') await refreshDashboard();
    });
  });

  // ---------- 난이도 pill ----------

  document.querySelectorAll('#difficultyPills .pill').forEach(p=>{
    p.addEventListener('click', ()=>{
      document.querySelectorAll('#difficultyPills .pill').forEach(x=>x.classList.remove('active'));
      p.classList.add('active');
      currentDifficulty = p.dataset.level;
    });
  });

  function setDifficulty(level){
    currentDifficulty = level || 'basic';
    document.querySelectorAll('#difficultyPills .pill').forEach(p=>{
      p.classList.toggle('active', p.dataset.level === currentDifficulty);
    });
  }

  // ---------- 지문 폼 ----------

  function readForm(){
    return {
      school: el('schoolInput').value.trim(),
      category: el('categoryInput').value.trim() || null,
      source: el('sourceInput').value.trim() || null,
      passage: el('passageInput').value.trim(),
      translation: el('translationInput').value || null,
      level: currentDifficulty
    };
  }

  function clearForm(){
    editingId = null;
    el('schoolInput').value = '';
    el('categoryInput').value = '';
    el('sourceInput').value = '';
    el('passageInput').value = '';
    el('translationInput').value = '';
    setDifficulty('basic');
    el('savePassageBtn').textContent = '＋ 지문 저장';
  }

  async function savePassage(){
    const row = readForm();
    if(!row.school){ showNotice('대상 학교를 입력해주세요.'); return; }
    if(!row.passage){ showNotice('영어 지문을 입력해주세요.'); return; }
    el('savePassageBtn').disabled = true;
    try{
      if(editingId){
        await StorageAPI.updatePassage(editingId, row);
        showNotice('지문을 수정했습니다.');
      }else{
        await StorageAPI.savePassage(row);
        showNotice('지문을 저장했습니다.');
      }
      clearForm();
      await renderSavedList();
    }catch(e){
      showNotice('저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }finally{
      el('savePassageBtn').disabled = false;
    }
  }

  // ---------- 보관함 ----------

  function refreshFilterOptions(){
    const schools = Array.from(new Set(allPassages.map(p=>p.school))).sort();
    const categories = Array.from(new Set(allPassages.map(p=>p.category).filter(Boolean))).sort();

    el('schoolDatalist').innerHTML = schools.map(s=>'<option value="'+escapeHtml(s)+'"></option>').join('');
    el('categoryDatalist').innerHTML = categories.map(c=>'<option value="'+escapeHtml(c)+'"></option>').join('');

    [['schoolFilter','전체 학교',schools],['categoryFilter','전체 카테고리',categories]].forEach(([id,label,values])=>{
      const sel = el(id);
      const prev = sel.value || '__all__';
      sel.innerHTML = '<option value="__all__">'+label+'</option>' +
        values.map(v=>'<option value="'+escapeHtml(v)+'">'+escapeHtml(v)+'</option>').join('');
      sel.value = (values.includes(prev) || prev === '__all__') ? prev : '__all__';
    });
  }

  async function renderSavedList(){
    const listEl = el('savedList');
    try{
      allPassages = await StorageAPI.listAllPassages();
    }catch(e){
      listEl.innerHTML = '<div class="lib-empty">보관함을 불러오지 못했습니다.</div>';
      return;
    }
    refreshFilterOptions();
    const schoolVal = el('schoolFilter').value;
    const catVal = el('categoryFilter').value;
    const filtered = allPassages
      .filter(p => schoolVal === '__all__' || p.school === schoolVal)
      .filter(p => catVal === '__all__' || p.category === catVal);

    listEl.innerHTML = '';
    if(filtered.length === 0){
      listEl.innerHTML = '<div class="lib-empty">저장된 지문이 없습니다.</div>';
      return;
    }
    filtered.forEach(p=>{
      const row = document.createElement('div');
      row.className = 'lib-item';
      row.innerHTML =
        '<div class="lib-badge">' + escapeHtml(p.school) + (p.category ? ' · ' + escapeHtml(p.category) : '') + '</div>' +
        '<div class="lib-main">' +
          '<div class="lib-source">' + escapeHtml(p.source || '(출처 미기재)') + '</div>' +
          '<div class="lib-preview">' + escapeHtml((p.passage || '').slice(0, 40).replace(/\s+/g,' ')) + '… · ' +
            (TestEngine.DIFFICULTY_LABELS[p.level] || p.level) + '</div>' +
        '</div>' +
        '<div class="lib-actions">' +
          '<button class="lib-btn" data-action="load" data-id="' + p.id + '">불러오기</button>' +
          '<button class="lib-btn danger" data-action="delete" data-id="' + p.id + '">삭제</button>' +
        '</div>';
      listEl.appendChild(row);
    });
  }

  function loadToForm(p){
    editingId = p.id;
    el('schoolInput').value = p.school || '';
    el('categoryInput').value = p.category || '';
    el('sourceInput').value = p.source || '';
    el('passageInput').value = p.passage || '';
    el('translationInput').value = p.translation || '';
    setDifficulty(p.level);
    el('savePassageBtn').textContent = '✓ 수정 저장';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showNotice('지문을 폼에 불러왔습니다. 수정 후 "수정 저장"을 누르세요.');
  }

  el('savedList').addEventListener('click', async (e)=>{
    const btn = e.target.closest('.lib-btn');
    if(!btn) return;
    const id = btn.dataset.id;
    if(btn.dataset.action === 'load'){
      const p = allPassages.find(x=>x.id === id);
      if(p) loadToForm(p);
      return;
    }
    if(btn.dataset.action === 'delete'){
      if(btn.dataset.confirming === '1'){
        try{
          await StorageAPI.deletePassage(id);
          if(editingId === id) clearForm();
          await renderSavedList();
          showNotice('삭제했습니다.');
        }catch(err){
          showNotice('삭제에 실패했습니다.');
        }
      } else {
        btn.dataset.confirming = '1';
        btn.textContent = '정말 삭제?';
        btn.style.borderColor = 'var(--error)';
        btn.style.color = 'var(--error)';
        clearTimeout(btn._resetTimer);
        btn._resetTimer = setTimeout(()=>{
          btn.dataset.confirming = '';
          btn.textContent = '삭제';
          btn.style.borderColor = '';
          btn.style.color = '';
        }, 3000);
      }
    }
  });

  el('schoolFilter').addEventListener('change', renderSavedList);
  el('categoryFilter').addEventListener('change', renderSavedList);

  // ---------- 미리보기 ----------

  TestEngine.init({ onSubmit: null }); // 미리보기 채점은 서버 제출 없음

  async function preview(){
    const row = readForm();
    const ok = await TestEngine.build({
      passage: row.passage,
      translation: row.translation || '',
      source: row.source || '',
      student: '',
      level: row.level,
      showHint: el('hintToggle').checked
    });
    if(ok){
      el('setup-screen').classList.add('hidden');
      document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    }
  }

  el('previewBtn').addEventListener('click', preview);
  el('savePassageBtn').addEventListener('click', savePassage);
  el('clearFormBtn').addEventListener('click', ()=>{ clearForm(); showNotice('새 지문 작성 상태로 초기화했습니다.'); });
  el('submitBtn').addEventListener('click', ()=>{ TestEngine.submit(); });
  el('backToSetupBtn').addEventListener('click', ()=>{
    TestEngine.stopTimer();
    show('setup-screen');
  });
  el('backToSetupBtn2').addEventListener('click', ()=>{ show('setup-screen'); });
  el('pdfTestBtn').addEventListener('click', ()=>{
    const source = el('sourceInput').value.trim() || '지문';
    TestEngine.printCurrentScreen(source + '_백지테스트_' + TestEngine.DIFFICULTY_LABELS[currentDifficulty]);
  });
  el('retryBtn').addEventListener('click', ()=>{ TestEngine.retry(); });

  // ---------- 대시보드 ----------

  function refreshDashFilters(){
    const schools = Array.from(new Set(allSubmissions.map(s=>s.school))).sort();
    const sources = Array.from(new Set(allSubmissions.map(s=>s.passage_source || '(출처 미기재)'))).sort();
    [['dashSchoolFilter',schools],['dashSourceFilter',sources]].forEach(([id,values])=>{
      const sel = el(id);
      const prev = sel.value || '__all__';
      sel.innerHTML = '<option value="__all__">전체</option>' +
        values.map(v=>'<option value="'+escapeHtml(v)+'">'+escapeHtml(v)+'</option>').join('');
      sel.value = (values.includes(prev) || prev === '__all__') ? prev : '__all__';
    });
  }

  async function refreshDashboard(){
    const listEl = el('dashboardList');
    try{
      allSubmissions = await StorageAPI.listSubmissions();
    }catch(e){
      listEl.innerHTML = '<div class="lib-empty">제출 현황을 불러오지 못했습니다.</div>';
      return;
    }
    refreshDashFilters();
    const schoolVal = el('dashSchoolFilter').value;
    const sourceVal = el('dashSourceFilter').value;
    const filtered = allSubmissions
      .filter(s => schoolVal === '__all__' || s.school === schoolVal)
      .filter(s => sourceVal === '__all__' || (s.passage_source || '(출처 미기재)') === sourceVal);

    const summaryEl = el('dashboardSummary');
    if(filtered.length === 0){
      summaryEl.innerHTML = '';
    } else {
      const avgPct = Math.round(filtered.reduce((sum,s)=>sum+Number(s.pct),0) / filtered.length);
      const best = filtered.reduce((m,s)=> Number(s.pct)>Number(m.pct) ? s : m, filtered[0]);
      summaryEl.innerHTML =
        '<div class="dash-stat"><div class="dash-stat-num">' + filtered.length + '</div><div class="dash-stat-label">제출 수</div></div>' +
        '<div class="dash-stat"><div class="dash-stat-num">' + avgPct + '%</div><div class="dash-stat-label">평균 정답률</div></div>' +
        '<div class="dash-stat"><div class="dash-stat-num">' + Math.round(Number(best.pct)) + '%</div><div class="dash-stat-label">최고 정답률 (' + escapeHtml(best.student_name) + ')</div></div>';
    }

    listEl.innerHTML = '';
    if(filtered.length === 0){
      listEl.innerHTML = '<div class="lib-empty">아직 제출된 결과가 없습니다.</div>';
      return;
    }
    filtered.forEach(s=>{
      const pct = Number(s.pct);
      const scoreClass = pct>=80 ? 'good' : (pct>=50 ? 'mid' : 'low');
      const dt = s.submitted_at ? new Date(s.submitted_at) : null;
      const dtLabel = dt ? (dt.getMonth()+1)+'/'+dt.getDate()+' '+String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0') : '-';
      const row = document.createElement('div');
      row.className = 'dash-row';
      row.innerHTML =
        '<div class="dash-name">' + escapeHtml(s.student_name) + ' <span style="font-weight:400;color:var(--muted);font-size:11px;">' + escapeHtml(s.school) + '</span></div>' +
        '<div class="dash-source">' + escapeHtml(s.passage_source || '(출처 미기재)') + '</div>' +
        '<div class="dash-level">' + (TestEngine.DIFFICULTY_LABELS[s.level] || s.level || '-') + '</div>' +
        '<div class="dash-score ' + scoreClass + '">' + s.correct_count + '/' + s.total + '</div>' +
        '<div class="dash-time">' + dtLabel + '</div>' +
        '<button class="dash-del" data-id="' + s.id + '">삭제</button>';
      listEl.appendChild(row);
    });
  }

  el('refreshDashboardBtn').addEventListener('click', refreshDashboard);
  el('dashSchoolFilter').addEventListener('change', refreshDashboard);
  el('dashSourceFilter').addEventListener('change', refreshDashboard);
  el('dashboardList').addEventListener('click', async (e)=>{
    const btn = e.target.closest('.dash-del');
    if(!btn) return;
    if(btn.dataset.confirming === '1'){
      try{
        await StorageAPI.deleteSubmission(btn.dataset.id);
        await refreshDashboard();
        showNotice('삭제했습니다.');
      }catch(err){
        showNotice('삭제에 실패했습니다.');
      }
    } else {
      btn.dataset.confirming = '1';
      btn.textContent = '정말?';
      btn.style.borderColor = 'var(--error)';
      btn.style.color = 'var(--error)';
      clearTimeout(btn._resetTimer);
      btn._resetTimer = setTimeout(()=>{
        btn.dataset.confirming = '';
        btn.textContent = '삭제';
        btn.style.borderColor = '';
        btn.style.color = '';
      }, 3000);
    }
  });

  // ---------- 설정 ----------

  el('changePasswordBtn').addEventListener('click', async ()=>{
    const pw = el('newStudentPassword').value.trim();
    if(pw.length < 4){ showNotice('비밀번호는 4자 이상으로 입력해주세요.'); return; }
    el('changePasswordBtn').disabled = true;
    try{
      await StorageAPI.setStudentPassword(pw);
      el('newStudentPassword').value = '';
      showNotice('학생 공통 비밀번호를 변경했습니다.');
    }catch(e){
      showNotice('변경에 실패했습니다. 잠시 후 다시 시도해주세요.');
    }finally{
      el('changePasswordBtn').disabled = false;
    }
  });

  el('logoutBtn').addEventListener('click', async ()=>{
    try{ await StorageAPI.signOut(); }catch(e){ /* ignore */ }
    show('login-screen');
    showNotice('로그아웃했습니다.');
  });

  el('loginBtn').addEventListener('click', login);
  el('loginPassword').addEventListener('keydown', (e)=>{ if(e.key === 'Enter') login(); });
})();
