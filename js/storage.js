/* Supabase 어댑터 — 화면 코드가 서버와 통신하는 유일한 계층.
   학생은 공통 비밀번호를 검증하는 RPC만, 교사는 Auth 세션 + 테이블 직접 접근(RLS). */
(function(){
  "use strict";

  const cfg = window.APP_CONFIG || {};
  const configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const client = configured
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;

  function requireClient(){
    if(!client) throw new Error('config-missing');
  }

  async function rpc(name, args){
    requireClient();
    const { data, error } = await client.rpc(name, args);
    if(error) throw error;
    return data;
  }

  // ---------- 학생 (공통 비밀번호 기반 RPC) ----------

  async function verifyStudentPassword(pw){
    return (await rpc('verify_student_password', { p_password: pw })) === true;
  }

  async function listPassages(pw, school){
    return await rpc('list_passages', { p_password: pw, p_school: school }) || [];
  }

  async function submitResult(pw, r){
    await rpc('submit_result', {
      p_password: pw,
      p_student_name: r.studentName,
      p_school: r.school,
      p_passage_id: r.passageId || null,
      p_passage_source: r.passageSource || '(출처 미기재)',
      p_level: r.level,
      p_correct: r.correctCount,
      p_total: r.total,
      p_pct: r.pct,
      p_elapsed_seconds: r.elapsedSeconds || 0
    });
  }

  // ---------- 교사 (Auth + 테이블 직접 접근) ----------

  async function signIn(email, password){
    requireClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if(error) throw error;
    return data.session;
  }

  async function signOut(){
    requireClient();
    await client.auth.signOut();
  }

  async function getSession(){
    if(!client) return null;
    const { data } = await client.auth.getSession();
    return data.session || null;
  }

  async function listAllPassages(){
    requireClient();
    const { data, error } = await client.from('passages')
      .select('*').order('created_at', { ascending: false });
    if(error) throw error;
    return data || [];
  }

  async function savePassage(row){
    requireClient();
    const { data, error } = await client.from('passages').insert(row).select().single();
    if(error) throw error;
    return data;
  }

  async function updatePassage(id, row){
    requireClient();
    const { error } = await client.from('passages').update(row).eq('id', id);
    if(error) throw error;
  }

  async function deletePassage(id){
    requireClient();
    const { error } = await client.from('passages').delete().eq('id', id);
    if(error) throw error;
  }

  async function listSubmissions(){
    requireClient();
    const { data, error } = await client.from('submissions')
      .select('*').order('submitted_at', { ascending: false });
    if(error) throw error;
    return data || [];
  }

  async function deleteSubmission(id){
    requireClient();
    const { error } = await client.from('submissions').delete().eq('id', id);
    if(error) throw error;
  }

  async function setStudentPassword(newPw){
    await rpc('set_student_password', { p_new_password: newPw });
  }

  window.StorageAPI = {
    available: () => configured,
    verifyStudentPassword, listPassages, submitResult,
    signIn, signOut, getSession,
    listAllPassages, savePassage, updatePassage, deletePassage,
    listSubmissions, deleteSubmission,
    setStudentPassword
  };
})();
