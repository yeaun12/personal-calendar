
    (() => {
      'use strict';
      const categories = [
        { id: 'meal', icon: '🍽️', label: '식사', ideas: ['동네 숨은 맛집 탐방', '오늘의 메뉴 룰렛', '각자 최애 음식 하나씩 추천하기', '처음 먹어보는 음식 도전!'] },
        { id: 'cafe', icon: '☕', label: '카페·디저트', ideas: ['케이크 나눠 먹으며 수다', '예쁜 카페 찾아 사진 남기기', '디저트 한 가지씩 골라보기', '조용한 북카페에서 쉬어가기'] },
        { id: 'drinks', icon: '🍻', label: '술자리', ideas: ['안주 맛집에서 한 잔', '무알코올 칵테일도 함께 즐기기', '보드게임 곁들인 편안한 한 잔', '각자 좋아하는 건배사 만들기'] },
        { id: 'culture', icon: '🎬', label: '영화·공연', ideas: ['다 같이 보고 싶은 영화 고르기', '공연이나 전시 보러 가기', '보고 난 뒤 감상 한 줄 나누기', '장르 룰렛으로 작품 정하기'] },
        { id: 'game', icon: '🎲', label: '게임·방탈출', ideas: ['협동 보드게임에 도전하기', '방탈출 테마 룰렛 돌리기', '가벼운 카드게임 한 판', '팀을 나눠 미니 게임 대결'] },
        { id: 'outdoor', icon: '🌿', label: '운동·산책', ideas: ['공원 한 바퀴 산책하기', '가벼운 피크닉 준비하기', '동네 산책 코스 서로 추천하기', '함께 즐기는 초보 운동 클래스'] },
        { id: 'trip', icon: '🧺', label: '나들이', ideas: ['근교 당일치기 떠나기', '계절 꽃 구경하러 가기', '실내 전시·식물원 구경', '가고 싶은 곳 한 군데씩 모으기'] },
        { id: 'study', icon: '📚', label: '공부·회의', ideas: ['집중 타이머 맞추고 같이 공부', '각자 요즘 읽는 것 소개하기', '카페에서 아이디어 브레인스토밍', '끝나고 작은 간식 타임 갖기'] },
        { id: 'etc', icon: '✨', label: '기타', ideas: ['각자 하고 싶은 것 하나씩 제안', '랜덤 주제로 이야기 나누기', '가까운 곳으로 즉흥 나들이', '새로운 취미를 함께 체험하기'] }
      ];
      const $ = id => document.getElementById(id);
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const pad = n => String(n).padStart(2, '0');
      const dateKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
      const prettyDate = key => { const [y, m, d] = key.split('-').map(Number); return `${m}월 ${d}일 (${['일','월','화','수','목','금','토'][new Date(y, m - 1, d).getDay()]})`; };
      const timeLabel = mins => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;
      const escapeAttr = value => String(value).replace(/[&"<>']/g, char => ({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;',"'":'&#39;'}[char]));
      let monthCursor = new Date(today.getFullYear(), today.getMonth(), 1);
      let selectedDates = new Set();
      let selectedCategory = 'meal';
      let poll = null;
      let activeDate = null;
      let pickedSlots = new Set();
      let responses = [];
      let finalSlot = null;
      let toastTimer;
      let lastIdea = '';

      function toast(message) {
        const node = $('toast'); node.textContent = message; node.classList.add('show');
        clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('show'), 2500);
      }
      function renderCategories() {
        $('category-list').innerHTML = categories.map(category => `<button class="category${category.id === selectedCategory ? ' active' : ''}" type="button" data-category="${category.id}" aria-pressed="${category.id === selectedCategory}">${category.icon} ${category.label}</button>`).join('');
        $('category-list').querySelectorAll('[data-category]').forEach(button => button.addEventListener('click', () => {
          selectedCategory = button.dataset.category; renderCategories(); updateIdeaCopy();
        }));
      }
      function updateSelectionSummary() {
        const dates = [...selectedDates].sort();
        $('selection-summary').textContent = dates.length ? `${dates.length}개 날짜 선택됨 · ${dates.slice(0, 3).map(prettyDate).join(', ')}${dates.length > 3 ? ' 외' : ''}` : '날짜를 하나 이상 골라주세요.';
      }
      function renderCalendar() {
        const year = monthCursor.getFullYear(), month = monthCursor.getMonth();
        $('month-label').textContent = `${year}년 ${month + 1}월`;
        $('prev-month').disabled = year === today.getFullYear() && month <= today.getMonth();
        const firstDay = new Date(year, month, 1).getDay(), lastDay = new Date(year, month + 1, 0).getDate();
        const cells = ['일','월','화','수','목','금','토'].map(day => `<div class="weekday">${day}</div>`);
        for (let blank = 0; blank < firstDay; blank++) cells.push('<span aria-hidden="true"></span>');
        for (let day = 1; day <= lastDay; day++) {
          const date = new Date(year, month, day), key = dateKey(date), isPast = key < dateKey(today), isSelected = selectedDates.has(key);
          const classes = ['day']; if (key === dateKey(today)) classes.push('today'); if (isSelected) classes.push('selected');
          cells.push(`<button class="${classes.join(' ')}" type="button" data-date="${key}" ${isPast ? 'disabled' : ''} aria-pressed="${isSelected}" aria-label="${year}년 ${month + 1}월 ${day}일${isSelected ? ', 선택됨' : ''}">${day}</button>`);
        }
        $('calendar-grid').innerHTML = cells.join('');
        $('calendar-grid').querySelectorAll('[data-date]').forEach(button => button.addEventListener('click', () => {
          const key = button.dataset.date; selectedDates.has(key) ? selectedDates.delete(key) : selectedDates.add(key);
          renderCalendar(); updateSelectionSummary();
        }));
        updateSelectionSummary();
      }
      function setupTimeSelects() {
        const start = $('time-start'), end = $('time-end'), startTimes = [], endTimes = [];
        for (let mins = 8 * 60; mins <= 21 * 60 + 30; mins += 30) startTimes.push(mins);
        for (let mins = 8 * 60 + 30; mins <= 22 * 60; mins += 30) endTimes.push(mins);
        start.innerHTML = startTimes.map(mins => `<option value="${mins}">${timeLabel(mins)}</option>`).join('');
        end.innerHTML = endTimes.map(mins => `<option value="${mins}">${timeLabel(mins)}</option>`).join('');
        start.value = '600'; end.value = '1200';
        function syncEnd() {
          const startValue = Number(start.value), previous = Number(end.value);
          [...end.options].forEach(option => { option.disabled = Number(option.value) <= startValue; });
          if (previous <= startValue) end.value = String(startValue + 30);
        }
        start.addEventListener('change', syncEnd);
        end.addEventListener('change', () => { if (Number(end.value) <= Number(start.value)) syncEnd(); });
        syncEnd();
      }
      function slotId(date, mins) { return `${date}|${mins}`; }
      function countFor(id) { return responses.reduce((total, response) => total + (response.slots.has(id) ? 1 : 0), 0); }
      function renderTabs() {
        $('date-tabs').innerHTML = poll.dates.map((date, index) => `<button class="date-tab" id="tab-${index}" type="button" role="tab" data-date="${date}" aria-selected="${date === activeDate}" aria-controls="table-wrap" tabindex="${date === activeDate ? '0' : '-1'}">${prettyDate(date)}</button>`).join('');
      }
      function renderTable() {
        const date = activeDate;
        const rows = poll.times.map(mins => {
          const id = slotId(date, mins), picked = pickedSlots.has(id), count = countFor(id);
          const className = picked ? 'picked' : count ? `count-${Math.min(count, 4)}` : '';
          const text = picked ? '✓ 내가 가능' : count ? `${count}명 가능` : '＋ 가능';
          const label = `${prettyDate(date)} ${timeLabel(mins)}, ${picked ? '내가 선택함' : count ? `가능 ${count}명` : '선택 안 됨'}`;
          return `<tr><th scope="row" class="time-col">${timeLabel(mins)}</th><td><button class="slot ${className}${finalSlot === id ? ' winner' : ''}" type="button" data-slot="${id}" ${poll.status !== "open" ? "disabled" : ""} aria-pressed="${picked}" aria-label="${escapeAttr(label)}">${text}</button></td></tr>`;
        }).join('');
        $('table-wrap').innerHTML = `<table class="availability-table"><thead><tr><th class="time-col" scope="col">시간</th><th scope="col">${prettyDate(date)} 가능 시간</th></tr></thead><tbody>${rows}</tbody></table>`;
      }
      function renderResults() {
        const target = $('results');
        if (!responses.length) {
          target.innerHTML = '<span class="empty-result">아직 응답이 없어요. 첫 번째로 가능한 시간을 골라주세요!</span>';
          $('participants').textContent = ''; return;
        }
        const entries = [];
        poll.dates.forEach(date => poll.times.forEach(mins => {
          const id = slotId(date, mins), count = countFor(id); if (count) entries.push({ id, date, mins, count });
        }));
        entries.sort((a, b) => b.count - a.count || a.date.localeCompare(b.date) || a.mins - b.mins);
        const top = entries.slice(0, 3);
        target.innerHTML = `<span class="result-label">현재 응답 ${responses.length}명</span>${top.length ? top.map((item, index) => `<button class="result-chip${index === 0 ? ' best' : ''}" type="button" data-final="${item.id}">${index === 0 ? '🌟 ' : ''}${prettyDate(item.date)} ${timeLabel(item.mins)} · ${item.count}명</button>`).join('') : '<span class="empty-result">겹치는 시간이 아직 없어요.</span>'}`;
        $('participants').textContent = `참여자: ${responses.map(response => response.name).join(' · ')}`;
      }
      function renderPoll() { renderTabs(); renderTable(); renderResults(); }
      function updateIdeaCopy() {
        const category = categories.find(item => item.id === selectedCategory) || categories[0];
        $('fun-icon').textContent = category.icon;
        $('fun-sub').textContent = `${category.label} 약속에 어울리는 아이디어를 골라드려요. 여러 번 다시 뽑아도 좋아요!`;
      }
      function spinIdea() {
        const category = categories.find(item => item.id === selectedCategory) || categories[0];
        let idea = category.ideas[Math.floor(Math.random() * category.ideas.length)];
        if (category.ideas.length > 1 && idea === lastIdea) idea = category.ideas[(category.ideas.indexOf(idea) + 1) % category.ideas.length];
        lastIdea = idea; const box = $('suggestion'); box.classList.remove('pop'); void box.offsetWidth;
        box.textContent = `${category.icon} ${idea}`; box.classList.add('pop');
      }

      let sb = null, user = null, busy = false, savedPolls = [], loadSequence = 0;
      function message(text, error = false) {
        $('cloud-message').textContent = text;
        $('cloud-message').dataset.error = String(error);
      }
      function readableError(error) {
        const code = error?.code || '';
        if (code === 'over_email_send_rate_limit' || error?.status === 429) return '로그인 메일 요청이 많아요. 잠시 뒤 다시 요청해 주세요.';
        if (code === 'email_address_not_authorized') return '현재 메일 서비스는 허용된 이메일에만 발송할 수 있어요. 운영자의 메일 발송 설정이 필요해요.';
        if (code === 'otp_expired' || code === 'access_denied') return '로그인 링크가 만료됐거나 이미 사용됐어요. 새 링크를 받아 주세요.';
        if (code === '42501') return '저장 권한이 없거나 마감된 투표예요. 로그인과 투표 상태를 확인해 주세요.';
        if (code === '23505') return '같은 이름의 응답이 이미 있어요. 응답을 다시 불러온 뒤 수정해 주세요.';
        if (code === '23514') return '날짜나 시간 입력이 올바르지 않아요. 선택한 값을 다시 확인해 주세요.';
        if (code === 'PGRST116') return '항목을 찾을 수 없어요. 목록을 다시 불러와 주세요.';
        if (/fetch|network|timeout/i.test(error?.message || '')) return '서버에 연결하지 못했어요. 입력은 유지했으니 연결 후 다시 시도해 주세요.';
        return '요청을 완료하지 못했어요. 다시 시도해 주세요.' + (code ? ` (${code})` : '');
      }
      async function run(task) {
        if (busy) return;
        busy = true;
        const controls = [...document.querySelectorAll('button, input, select')];
        const states = controls.map(node => node.disabled);
        controls.forEach(node => node.disabled = true);
        try { await task(); } catch (error) { message(readableError(error), true); }
        finally {
          busy = false;
          controls.forEach((node, i) => { if(node.isConnected) node.disabled = states[i]; });
          syncPollStatus();
        }
      }
      function syncPollStatus() {
        const closed = !poll || poll.status !== 'open';
        $('submit-vote').disabled = closed || busy;
        $('participant-name').disabled = closed || busy;
        $('toggle-poll').disabled = !poll || busy;
        if (!poll) return;
        $('poll-status').textContent = closed ? '● 마감됨' : '● 투표 진행 중';
        $('toggle-poll').textContent = closed ? '투표 다시 열기' : '투표 마감';
        document.querySelectorAll('[data-slot]').forEach(node => node.disabled = closed || busy);
      }
      async function refreshList() {
        if (!user) return;
        const account = user.id;
        const { data, error } = await sb.from('polls').select('*').eq('owner_id', account).order('created_at', { ascending: false });
        if (error) throw error;
        if (user?.id !== account) return;
        savedPolls = data;
        $('saved-polls').replaceChildren();
        if (!data.length) { $('saved-polls').textContent = '저장한 투표가 아직 없어요. 아래에서 첫 투표를 만들어 보세요.'; return; }
        for (const row of data) {
          const button = document.createElement('button');
          button.type = 'button'; button.className = 'saved-poll';
          button.setAttribute('aria-current', String(row.id === poll?.id));
          button.textContent = `${row.title} · ${row.status === 'closed' ? '마감' : '진행 중'} · ${row.dates.length}개 날짜`;
          button.addEventListener('click', () => run(async () => {
            if (pickedSlots.size && !window.confirm('아직 저장하지 않은 시간 선택이 있어요. 다른 투표를 열까요?')) return;
            await loadPoll(row.id); message('서버에서 투표와 응답을 불러왔어요.');
          }));
          $('saved-polls').append(button);
        }
      }
      async function loadPoll(id) {
        const account = user?.id, sequence = ++loadSequence;
        if (!account) return;
        const [{ data: row, error }, { data: votes, error: voteError }] = await Promise.all([
          sb.from('polls').select('*').eq('id', id).eq('owner_id', account).single(),
          sb.from('poll_responses').select('*').eq('poll_id', id).eq('owner_id', account).order('created_at')
        ]);
        if (error) throw error;
        if (voteError) throw voteError;
        if (account !== user?.id || sequence !== loadSequence) return;
        poll = { ...row, category: categories.find(c => c.id === row.category || c.label === row.category) || categories.at(-1), times: [] };
        for (let minute = row.start_minutes; minute < row.end_minutes; minute += 30) poll.times.push(minute);
        const validSlots = new Set(row.dates.flatMap(date => poll.times.map(minute => slotId(date, minute))));
        responses = votes.map(v => ({ id: v.id, name: v.participant_name, slots: new Set((Array.isArray(v.slots) ? v.slots : []).filter(s => validSlots.has(s))) }));
        pickedSlots = new Set(); finalSlot = null; activeDate = poll.dates[0];
        $('participant-name').value = '';
        $('poll-title').textContent = poll.title;
        $('poll-meta').textContent = `${poll.category.icon} ${poll.category.label} · ${poll.dates.map(prettyDate).join(' · ')} · ${timeLabel(row.start_minutes)}–${timeLabel(row.end_minutes)}`;
        $('poll-card').classList.remove('hidden'); renderPoll(); syncPollStatus();
        history.replaceState(null, '', `${location.pathname}?poll=${encodeURIComponent(id)}`);
        document.querySelectorAll('.saved-poll').forEach(node => node.removeAttribute('aria-current'));
        await refreshList();
      }
      async function makePoll() {
        const dates = [...selectedDates].sort(), start = Number($('time-start').value), end = Number($('time-end').value);
        const title = $('event-title').value.trim();
        if (!user) { message('먼저 이메일로 로그인해 주세요.', true); return; }
        if (!title || title.length > 100) { message('약속 이름은 1~100자로 적어 주세요.', true); return; }
        if (!dates.length || dates.length > 31 || dates.some(date => date < dateKey(today))) { message('오늘 이후 날짜를 1~31개 선택해 주세요.', true); return; }
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > 1440 || end <= start || start % 30 || end % 30) { message('시작·종료 시간을 다시 선택해 주세요.', true); return; }
        await run(async () => {
          const { data, error } = await sb.from('polls').insert({ owner_id: user.id, title, category: selectedCategory, dates, start_minutes: start, end_minutes: end }).select().single();
          if (error) throw error;
          await loadPoll(data.id);
          message('새 투표를 서버에 저장했어요. 새로고침해도 다시 볼 수 있어요.');
          $('poll-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      async function submitVote() {
        if (!poll || !user || poll.status !== 'open') return;
        const name = $('participant-name').value.trim();
        if (!name || !pickedSlots.size) { message('참여자 이름과 가능한 시간을 하나 이상 선택해 주세요.', true); return; }
        const existing = responses.find(r => r.name.toLocaleLowerCase('ko-KR') === name.toLocaleLowerCase('ko-KR'));
        if (existing && !window.confirm(`“${existing.name}”님의 기존 응답을 선택한 시간으로 바꿀까요?`)) return;
        await run(async () => {
          const payload = { poll_id: poll.id, owner_id: user.id, participant_name: existing?.name || name, slots: [...pickedSlots].sort(), updated_at: new Date().toISOString() };
          const query = existing ? sb.from('poll_responses').update(payload).eq('id', existing.id).eq('owner_id', user.id) : sb.from('poll_responses').insert(payload);
          const { error } = await query.select().single();
          if (error) throw error;
          await loadPoll(poll.id);
          message(`${name}님의 응답을 서버에 ${existing ? '수정' : '저장'}했어요.`);
        });
      }
      function applyUser(nextUser) {
        if (user?.id === nextUser?.id) return;
        user = nextUser; ++loadSequence;
        poll = null; responses = []; pickedSlots = new Set(); savedPolls = [];
        $('saved-polls').replaceChildren(); $('poll-card').classList.add('hidden');
        $('cloud-content').classList.toggle('hidden', !user);
        $('login-form').classList.toggle('hidden', !!user);
        $('signed-in').classList.toggle('hidden', !user);
        $('account-email').textContent = user?.email || '';
      }
      async function initializeCloud() {
        try {
          if (!window.supabase || !window.MOYEOBOM_CONFIG) throw new Error('config');
          sb = window.supabase.createClient(window.MOYEOBOM_CONFIG.url, window.MOYEOBOM_CONFIG.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });
          $('send-link').disabled = false;
          const { data, error } = await sb.auth.getSession();
          if (error) throw error;
          applyUser(data.session?.user || null);
          if (user) {
            await refreshList();
            const id = new URLSearchParams(location.search).get('poll');
            if (id && /^[0-9a-f-]{36}$/i.test(id)) await loadPoll(id);
            message('로그인됐어요. 내 투표를 저장하고 이어서 확인할 수 있어요.');
          } else {
            const params = new URLSearchParams(location.hash.slice(1));
            const authError = params.get('error_code') || new URLSearchParams(location.search).get('error_code');
            message(authError ? readableError({ code: authError }) : '이메일로 로그인하면 내 투표를 저장할 수 있어요.', !!authError);
            if (authError) history.replaceState(null, '', location.pathname);
          }
          sb.auth.onAuthStateChange((event, session) => {
            const previous = user?.id;
            applyUser(session?.user || null);
            if (user && previous !== user.id) setTimeout(() => refreshList().catch(e => message(readableError(e), true)), 0);
            if (event === 'SIGNED_OUT') { history.replaceState(null, '', location.pathname); message('로그아웃했어요. 저장한 투표는 계정에 남아 있어요.'); }
          });
        } catch (error) { message(readableError(error), true); }
      }
      $('login-form').addEventListener('submit', event => {
        event.preventDefault(); if (!sb) return;
        run(async () => {
          const { error } = await sb.auth.signInWithOtp({ email: $('login-email').value.trim(), options: { emailRedirectTo: `${location.origin}/cloud-polls.html`, shouldCreateUser: true } });
          if (error) throw error;
          message('로그인 링크를 보냈어요. 지금 사용하는 브라우저에서 메일 링크를 열어 주세요. 스팸함도 확인해 주세요.');
        });
      });
      $('sign-out').addEventListener('click', () => run(async () => { const { error } = await sb.auth.signOut(); if (error) throw error; applyUser(null); }));
      $('reload-polls').addEventListener('click', () => run(async () => { await refreshList(); message('저장한 투표 목록을 새로 불러왔어요.'); }));
      $('reload-current').addEventListener('click', () => run(async () => {
        if (!poll) return;
        if (pickedSlots.size && !window.confirm('저장하지 않은 선택을 지우고 다시 불러올까요?')) return;
        await loadPoll(poll.id); message('응답을 다시 불러왔어요.');
      }));
      $('toggle-poll').addEventListener('click', () => run(async () => {
        if (!poll || !user) return;
        const status = poll.status === 'open' ? 'closed' : 'open';
        const { error } = await sb.from('polls').update({ status, updated_at: new Date().toISOString() }).eq('id', poll.id).eq('owner_id', user.id).select().single();
        if (error) throw error;
        await loadPoll(poll.id); message(status === 'closed' ? '투표를 마감했어요. 저장한 응답은 계속 볼 수 있어요.' : '투표를 다시 열었어요.');
      }));

      renderCategories(); renderCalendar(); setupTimeSelects(); updateIdeaCopy();
      initializeCloud();
      $('prev-month').addEventListener('click', () => { monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1); renderCalendar(); });
      $('next-month').addEventListener('click', () => { monthCursor = new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1); renderCalendar(); });
      $('create-poll').addEventListener('click', makePoll);
      $('submit-vote').addEventListener('click', submitVote);
      $('participant-name').addEventListener('keydown', event => { if (event.key === 'Enter') submitVote(); });
      $('spin-button').addEventListener('click', spinIdea);
      $('date-tabs').addEventListener('click', event => {
        const button = event.target.closest('[data-date]'); if (!button || !poll) return;
        activeDate = button.dataset.date; renderPoll();
      });
      $('date-tabs').addEventListener('keydown', event => {
        if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        const tabs = [...$('date-tabs').querySelectorAll('[role="tab"]')], current = tabs.findIndex(tab => tab.dataset.date === activeDate);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
        event.preventDefault(); activeDate = tabs[next].dataset.date; renderPoll(); $('date-tabs').querySelector(`[data-date="${activeDate}"]`).focus();
      });
      $('table-wrap').addEventListener('click', event => {
        const button = event.target.closest('[data-slot]'); if (!button || !poll || poll.status !== 'open' || busy) return;
        const id = button.dataset.slot; pickedSlots.has(id) ? pickedSlots.delete(id) : pickedSlots.add(id); renderTable();
      });
      $('results').addEventListener('click', event => {
        const button = event.target.closest('[data-final]'); if (!button || !poll) return;
        finalSlot = button.dataset.final; activeDate = finalSlot.split('|')[0]; renderPoll();
        toast('이 화면에서 볼 후보로 표시했어요. 확정 일정으로 저장되지는 않아요.');
      });
    })();
  