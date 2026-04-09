    window.addEventListener('load', function() {
      // --- CONFIGURAÇÃO DO SUPABASE ---
      const SUPABASE_URL = 'https://jljufumckmhfohnanaot.supabase.co';
      const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpsanVmdW1ja21oZm9obmFuYW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE4MDg3MTUsImV4cCI6MjA4NzM4NDcxNX0.2Vod5MSgHIZToDVKmE1Pk1tE9itn2VRaqOHezDjl5Z4';
      
      let supabase;
      try {
        if (!window.supabase || !window.Chart || !window.Sortable) throw new Error('Uma ou mais bibliotecas externas (Supabase, Chart.js) não foram carregadas.');
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      } catch (err) {
        document.body.innerHTML = `<div style="color:#e74c3c;text-align:center;padding:40px;font-family:sans-serif"><h3>Erro Crítico de Conexão</h3><p>${err.message}</p><p>Verifique sua conexão com a internet, desative bloqueadores de anúncio e recarregue a página.</p><button onclick="location.reload()" style="padding:10px 20px;cursor:pointer">Recarregar</button></div>`;
        console.error('Falha crítica ao iniciar:', err);
        return; // Para a execução do script
      }

    // --- CONFIGURAÇÃO DO ADMIN ---
    const ADMIN_EMAIL = atob('d3JsaW5rbHVhbmFkbWluQGdtYWlsLmNvbQ=='); 

    let currentUserEmail = '';
    
    const APP_VERSION = '1.2'; // Mude este número quando atualizar o site

    // --- App state (agora com dailyRecords)
    let state = { platforms: {}, platformOrder: [], brandLogo: null, appTitle: 'Painel Financeiro', gastoProxy:0, gastoNumeros:0, gastoBot:0, selectedPlatform: null, dailyRecords: {}, notas: [], fintechAccounts: [], fintechAccounts10: [], pendingNotes: [], smsApiKey: null, smsActivations: [], favoriteSmsServices: [], smsHistory: [], chinaSmsToken: null, currentSmsProvider: 'sms24h', autoCopySms: false, autoMarkCpf: false, soundEnabled: true, monthlyGoal: 5000, lastSmsService: null };
    let saveTimer = null;

    // --- Utils
    function money(v){
      return Number(v || 0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    }

    function parseDecimal(value) {
      if (typeof value === 'number') return value;
      if (typeof value !== 'string') return 0;
      return Number(value.replace(',', '.')) || 0;
    }

    function formatDateKey(year, month, day){
      // month is 1-12, pad to 2
      const mm = String(month).padStart(2,'0');
      const dd = String(day).padStart(2,'0');
      return `${year}-${mm}-${dd}`;
    }

    // --- Load / Save
    async function loadData(){
      try {
      // Verifica sessão no Supabase
      const { data: { session } } = await supabase.auth.getSession();
      
      if(!session) {
        window.location.href = 'login.html';
        return;
      }

      currentUserEmail = session.user.email;
      const displayUser = currentUserEmail.split('@')[0]; // Mostra só o nome antes do @
      const logoutBtn = document.getElementById('logoutBtn');
      if(logoutBtn) {
        logoutBtn.innerHTML = '🚪 Sair ';
        const small = document.createElement('small');
        small.style.opacity = '0.7';
        small.textContent = '(' + displayUser + ')';
        logoutBtn.appendChild(small);
      }

      // Busca dados da nuvem
      const { data, error } = await supabase
        .from('user_data')
        .select('content')
        .eq('user_id', session.user.id)
        .single();

      if(data && data.content){
        state = data.content;
      } else {
        // É um usuário novo, cria um registro pendente zerado.
        state = { 
            platforms: {}, 
            platformOrder: [], 
            brandLogo: null, 
            appTitle: 'Painel Financeiro', 
            gastoProxy:0, 
            gastoNumeros:0, 
            gastoBot:0, 
            gastoChinaSms:0,
            selectedPlatform: null, 
            dailyRecords: {}, 
            notas: [], 
            fintechAccounts: [], 
            fintechAccounts10: [],
            pendingNotes: [],
            smsApiKey: null, 
            smsActivations: [],
            favoriteSmsServices: [],
            chinaSmsToken: null,
            smsHistory: [],
            currentSmsProvider: 'sms24h',
            autoMarkCpf: false,
            soundEnabled: true,
            autoCopySms: false,
            monthlyGoal: 5000,
            status: 'pending' // Novos usuários começam como pendentes
        };
        await saveData(); // Salva imediatamente para aparecer no Admin
      }

      if (state.brandLogo && !state.brandLogo.startsWith('file://')) {
        const logoEl = document.getElementById('brandLogo');
        if (logoEl) logoEl.src = state.brandLogo;
      }

      if (!state.appTitle) state.appTitle = 'Painel Financeiro';
      const titleEl = document.getElementById('appTitleDisplay');
      if(titleEl) titleEl.textContent = state.appTitle;

      // Se for o admin, mostra a aba Admin
      if(currentUserEmail.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        document.getElementById('navAdmin').style.display = 'flex';
      }
      
      // --- VERIFICAÇÃO DE APROVAÇÃO ---
      if (state.status === 'pending' && currentUserEmail.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        document.getElementById('initialLoader').style.display = 'none';
        document.getElementById('pendingAccessOverlay').style.display = 'flex';
        document.getElementById('checkAccessBtn').onclick = () => location.reload();
        document.getElementById('pendingLogoutBtn').onclick = async () => {
            await supabase.auth.signOut();
            window.location.href = 'login.html';
        };
        return; // Para a execução aqui, não carrega o resto do painel
      }

      document.getElementById('initialLoader').style.display = 'none';
      document.querySelector('.layout').style.display = 'flex';

      // ensure dailyRecords exists
      if(!state.dailyRecords) state.dailyRecords = {};
      if(!state.notas) state.notas = [];
      if(!state.fintechAccounts) state.fintechAccounts = [];
      if(!state.fintechAccounts10) state.fintechAccounts10 = [];
      if(!state.smsApiKey) state.smsApiKey = null;
      if(!state.smsActivations) state.smsActivations = [];
      if(!state.favoriteSmsServices) state.favoriteSmsServices = [];
      if(!state.chinaSmsToken) state.chinaSmsToken = null;
      if(!state.currentSmsProvider) state.currentSmsProvider = 'sms24h';
      if(state.autoCopySms === undefined) state.autoCopySms = false;
      if(state.autoMarkCpf === undefined) state.autoMarkCpf = false;
      if(state.soundEnabled === undefined) state.soundEnabled = true;
      if(!state.smsHistory) state.smsHistory = [];
      if(!state.monthlyGoal) state.monthlyGoal = 5000;
      if(!state.lastSmsService) state.lastSmsService = null;
      if(!state.pendingNotes) state.pendingNotes = [];
      if(!state.platformOrder || state.platformOrder.length !== Object.keys(state.platforms).length) {
        // Rebuild order if it's missing or out of sync
        state.platformOrder = Object.keys(state.platforms);
        scheduleSave();
      }

      // Update version display
      const vDisplay = document.getElementById('appVersionDisplay');
      if(vDisplay) vDisplay.textContent = APP_VERSION;
      
      try {
        updateUI();
        // Restaura a última aba visitada (persistida no localStorage)
        let restored = false;
        try {
          const saved = JSON.parse(localStorage.getItem('lastView_v1') || 'null');
          if (saved && saved.view) {
            const validViews = ['dashboard','gastos','plataformas','plataformaDetalhe','dados','fintech','notasPendentes','sms','proxys'];
            if (validViews.includes(saved.view)) {
              if (saved.view === 'plataformaDetalhe' && saved.platform && state.platforms[saved.platform]) {
                selectPlatform(saved.platform);
              } else if (saved.view !== 'plataformaDetalhe') {
                selectView(saved.view);
              } else {
                selectView('plataformas');
              }
              restored = true;
            }
          }
        } catch(e2) {}
        if (!restored) selectView('dashboard');
      } catch(e) {
        console.error('Erro ao renderizar UI:', e);
        selectView('dashboard');
      }

      // Inicializa badge de proxys na sidebar
      setTimeout(() => {
        try {
          const proxyList = JSON.parse(localStorage.getItem('proxys_data_v1') || '[]');
          const unusedQty = proxyList.filter(p => !p.used).length;
          const badge = document.getElementById('navProxyBadge');
          if(badge){ badge.textContent = unusedQty; badge.style.display = unusedQty > 0 ? 'inline-block' : 'none'; }
        } catch(e){}
      }, 100);

      // Verifica SMS expirados e reinicia polls ao carregar (setTimeout garante que as funções já foram definidas)
      setTimeout(() => { checkExpiredSmsOnLoad(); restartSmsPolls(); }, 0);

      // ── SUPABASE REALTIME ─────────────────────────────────
      // Escuta alterações no banco feitas por outras sessões/abas
      setTimeout(async () => {
        try {
          const { data: { session: rtSession } } = await supabase.auth.getSession();
          if (!rtSession) return;
          const rtUserId = rtSession.user.id;

          supabase.channel('realtime-userdata')
            .on('postgres_changes', {
              event: 'UPDATE',
              schema: 'public',
              table: 'user_data',
              filter: `user_id=eq.${rtUserId}`
            }, (payload) => {
              const incoming = payload.new?.content;
              if (!incoming || !incoming._savedAt) return;
              // Só aplica se for mais recente E não gerado por esta sessão
              if (incoming._savedAt > (state._savedAt || 0) && incoming.savedBy !== (state.savedBy)) {
                state = incoming;
                updateUI();
                showToast('🔄 Dados sincronizados em tempo real', 'info');
              }
            })
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') setSaveStatus('synced', 'Sincronizado • Realtime ativo');
            });
        } catch(e) { console.warn('Realtime não disponível:', e); }
      }, 1500);

      // Verifica conflito de dados a cada 30s
      setTimeout(() => checkForConflict(), 15000);
      setInterval(() => checkForConflict(), 30000);

      // Backup semanal automático
      setTimeout(() => checkWeeklyBackup(), 5000);

      // Tour de onboarding para novos usuários
      setTimeout(() => showOnboardingTour(), 1200);

      // Service Worker para modo offline e push
      registerServiceWorker();

      // Revela os cards reais com animação staggered após o skeleton
      const skelEl = document.getElementById('cardsContainer');
      const realEl = document.getElementById('realCards');
      if(skelEl && realEl){
        setTimeout(() => {
          skelEl.style.display = 'none';
          realEl.style.display = 'flex';
          Array.from(realEl.children).forEach((card, i) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(10px)';
            card.style.transition = `opacity 0.3s ${i * 0.07}s ease, transform 0.3s ${i * 0.07}s ease`;
            setTimeout(() => { card.style.opacity = '1'; card.style.transform = 'translateY(0)'; }, 10);
          });
        }, 600);
      }
      } catch(err) {
        console.error('Erro crítico em loadData:', err);
        // Garante que o loader suma mesmo com erro
        const loader = document.getElementById('initialLoader');
        if(loader) loader.style.display = 'none';
        const layout = document.querySelector('.layout');
        if(layout) layout.style.display = 'flex';
      }
    } // fim loadData

    // ── UNDO SYSTEM ──────────────────────────────────────────
    let undoTimers = {};
    function showUndoToast(title, subtitle, onUndo, duration = 5000) {
      const container = document.getElementById('toastContainer');
      if(!container) return;
      const id = Date.now();
      const wrap = document.createElement('div');
      wrap.id = 'undo-' + id;
      wrap.className = 'undo-toast';
      wrap.innerHTML = `
        <div style="width:20px;height:20px;border-radius:50%;background:rgba(255,77,79,0.12);color:var(--danger);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">✕</div>
        <div class="undo-toast-body">
          <div class="undo-toast-title">${title}</div>
          <div class="undo-toast-sub">${subtitle}</div>
          <div class="undo-toast-bar" style="width:100%"></div>
        </div>
        <button class="undo-btn">↩ Desfazer</button>
      `;
      container.appendChild(wrap);

      // Animate bar
      const bar = wrap.querySelector('.undo-toast-bar');
      requestAnimationFrame(() => {
        bar.style.transition = `width ${duration}ms linear`;
        bar.style.width = '0%';
      });

      const removeToast = () => {
        wrap.style.opacity = '0';
        wrap.style.transform = 'translateX(110%)';
        wrap.style.transition = 'all 0.3s ease';
        setTimeout(() => wrap.remove(), 300);
      };

      undoTimers[id] = setTimeout(removeToast, duration);

      wrap.querySelector('.undo-btn').addEventListener('click', () => {
        clearTimeout(undoTimers[id]);
        removeToast();
        onUndo();
      });
    }

    // ── VALIDATED IMPORT ────────────────────────────────────
    window.importData = (raw) => {
      // Limite de tamanho: 5MB
      if(raw && raw.length > 5 * 1024 * 1024) {
        showToast('Arquivo muito grande (máx 5MB). Verifique se é o arquivo correto.', 'error');
        return;
      }
      let parsed;
      const checks = [];
      try {
        parsed = JSON.parse(raw);
        checks.push({ ok: true, label: 'Estrutura JSON válida' });
      } catch(e) {
        showConfirmImport([{ ok: false, label: 'JSON inválido — arquivo corrompido ou incorreto' }], null);
        return;
      }

      const hasPlatforms = parsed && typeof parsed.platforms === 'object';
      const hasDailyRecords = parsed && typeof parsed.dailyRecords === 'object';
      const hasNotas = parsed && Array.isArray(parsed.notas);
      const platformCount = hasPlatforms ? Object.keys(parsed.platforms).length : 0;
      const accountCount = hasPlatforms ? Object.values(parsed.platforms).reduce((s,p) => s + (p.accounts ? p.accounts.length : 0), 0) : 0;

      checks.push({ ok: hasPlatforms, label: hasPlatforms ? `Campo "platforms" presente (${platformCount} plataformas, ${accountCount} contas)` : 'Campo "platforms" ausente — dados de plataformas perdidos' });
      checks.push({ ok: hasDailyRecords, label: hasDailyRecords ? 'Campo "dailyRecords" presente' : 'Campo "dailyRecords" ausente' });
      checks.push({ ok: hasNotas, warn: !hasNotas, label: hasNotas ? 'Campo "notas" (CPFs) presente' : 'Campo "notas" ausente — CPFs não encontrados' });

      const allOk = checks.every(c => c.ok);
      showConfirmImport(checks, allOk ? parsed : parsed, allOk);
    };

    function showConfirmImport(checks, parsed, allOk) {
      const checksHtml = checks.map(c => `
        <div class="import-check">
          <div class="import-check-icon ${c.ok ? 'ok' : c.warn ? 'warn' : 'fail'}">${c.ok ? '✓' : c.warn ? '!' : '✕'}</div>
          <span style="font-size:12px">${c.label}</span>
        </div>
      `).join('');

      const msg = `
        <div style="background:rgba(30,50,80,0.03);border-radius:8px;padding:10px 12px;margin-bottom:12px">
          ${checksHtml}
        </div>
        ${allOk ? '<div style="font-size:12px;color:var(--success)">✓ Arquivo válido. Pronto para importar.</div>' : '<div style="font-size:12px;color:var(--danger)">⚠ Problemas encontrados. Deseja importar mesmo assim?</div>'}
      `;

      showConfirm(msg, () => {
        try {
          state = { ...state, ...parsed };
          scheduleSave(); updateUI();
          showToast('Dados importados com sucesso!', 'success');
        } catch(e) {
          showToast('Erro ao aplicar dados importados', 'error');
        }
      }, { title: allOk ? 'Importar dados' : 'Importar mesmo assim?', okText: 'Importar', isDanger: !allOk });
    }

    // ── SMS EXPIRY CHECK ON LOAD ─────────────────────────────
    function checkExpiredSmsOnLoad() {
      if (!state.smsActivations || state.smsActivations.length === 0) return;
      const now = new Date();
      const expired = state.smsActivations.filter(act => {
        if (act.status === 'received') return false;
        const elapsed = (now - new Date(act.startTime)) / 1000;
        return elapsed > 1380;
      });
      if (expired.length === 0) return;
      expired.forEach(act => {
        state.smsActivations = state.smsActivations.filter(a => a.id !== act.id);
      });
      scheduleSave();
      showToast(`${expired.length} ativação(ões) SMS expirada(s) removida(s) automaticamente`, 'info');
    }

    // ── CONFLICT DETECTION ──────────────────────────────────
    let lastSavedTimestamp = Date.now();
    async function checkForConflict() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data } = await supabase.from('user_data').select('content').eq('user_id', session.user.id).single();
        if (!data || !data.content) return;
        const serverTs = data.content._savedAt || 0;
        const localTs = state._savedAt || 0;
        if (serverTs > localTs + 5000) {
          showConflictBanner(data.content);
        }
      } catch(e) { /* silently ignore */ }
    }

    function showConflictBanner(serverState) {
      const existing = document.getElementById('conflictBanner');
      if (existing) return;
      const banner = document.createElement('div');
      banner.id = 'conflictBanner';
      banner.className = 'conflict-banner';
      banner.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9998;max-width:480px;width:90%;box-shadow:0 4px 16px rgba(0,0,0,0.12)';
      banner.innerHTML = `
        <span style="font-size:18px;flex-shrink:0">⚠️</span>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:500;color:var(--text);margin-bottom:4px">Conflito de dados detectado</div>
          <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Outra aba ou dispositivo salvou dados mais recentes. Qual versão deseja manter?</div>
          <div style="display:flex;gap:8px">
            <button class="btn ghost" style="flex:1;font-size:12px" id="keepLocalBtn">💾 Meus dados</button>
            <button class="btn primary" style="flex:1;font-size:12px" id="useServerBtn">☁ Servidor</button>
          </div>
        </div>
      `;
      document.body.appendChild(banner);
      document.getElementById('keepLocalBtn').onclick = () => { banner.remove(); saveDataImmediate(); };
      document.getElementById('useServerBtn').onclick = () => { state = serverState; updateUI(); scheduleSave(); banner.remove(); showToast('Dados do servidor carregados', 'success'); };
    }

    // ── SEGURANÇA: sanitização de HTML ──────────────────────
    function escapeHtml(str) {
      if(str == null) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    }

    // ── BACKUP SEMANAL AUTOMÁTICO ─────────────────────────────
    function checkWeeklyBackup() {
      const lastBackup = parseInt(localStorage.getItem('lastAutoBackup') || '0');
      const now = Date.now();
      const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
      if(now - lastBackup > ONE_WEEK) {
        // Faz o backup silenciosamente
        try {
          const a = document.createElement('a');
          const dateStr = new Date().toISOString().slice(0,10);
          a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state));
          a.download = `painel_backup_auto_${dateStr}.json`;
          a.click();
          localStorage.setItem('lastAutoBackup', String(now));
          showToast('Backup semanal automático realizado!', 'success');
        } catch(e) { console.warn('Backup automático falhou:', e); }
      }
    }

    // ── CPF PAGINAÇÃO ─────────────────────────────────────────
    const CPF_PAGE_SIZE = 50;
    let cpfPage = 0;

    function getCpfTotalPages(filtered) {
      return Math.max(1, Math.ceil(filtered.length / CPF_PAGE_SIZE));
    }

    function renderCpfPagination(filtered) {
      const existing = document.getElementById('cpfPagination');
      if(existing) existing.remove();
      const totalPages = getCpfTotalPages(filtered);
      if(totalPages <= 1) return;

      const wrap = document.createElement('div');
      wrap.id = 'cpfPagination';
      wrap.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;margin-top:14px;flex-wrap:wrap';

      const info = document.createElement('span');
      info.style.cssText = 'font-size:12px;color:var(--muted)';
      info.textContent = `Página ${cpfPage + 1} de ${totalPages} (${filtered.length} CPFs)`;

      const prev = document.createElement('button');
      prev.className = 'btn ghost';
      prev.style.cssText = 'padding:5px 12px;font-size:12px';
      prev.textContent = '‹ Anterior';
      prev.disabled = cpfPage === 0;
      prev.onclick = () => { cpfPage--; renderNotas(); };

      const next = document.createElement('button');
      next.className = 'btn ghost';
      next.style.cssText = 'padding:5px 12px;font-size:12px';
      next.textContent = 'Próximo ›';
      next.disabled = cpfPage >= totalPages - 1;
      next.onclick = () => { cpfPage++; renderNotas(); };

      wrap.appendChild(prev);
      wrap.appendChild(info);
      wrap.appendChild(next);

      const container = document.getElementById('notasList');
      if(container && container.parentNode) {
        container.parentNode.insertBefore(wrap, container.nextSibling);
      }
    }

    // ── TOUR DE ONBOARDING ────────────────────────────────────
    function shouldShowTour() {
      return !localStorage.getItem('tourDone') && Object.keys(state.platforms).length === 0;
    }

    function showOnboardingTour() {
      if(!shouldShowTour()) return;

      const steps = [
        { title: 'Bem-vindo ao Painel! 👋', text: 'Este é o seu painel financeiro. Vamos te mostrar como começar em 4 passos rápidos.', target: null },
        { title: '1. Crie uma plataforma', text: 'Na barra lateral, digite o nome de uma plataforma (ex: "Nubank") e clique em + para criar.', target: '#newPlatformName' },
        { title: '2. Adicione contas', text: 'Selecione a plataforma e clique em "+ Adicionar Conta" para registrar depósitos e saques.', target: '#addContaBtn' },
        { title: '3. Feche o dia', text: 'No final do dia, clique em "Fechar Dia" para salvar o resultado diário no histórico.', target: '#fecharDiaBtn' },
        { title: 'Tudo pronto! 🎉', text: 'Seu painel salva tudo automaticamente na nuvem. Bom trabalho!', target: null },
      ];

      let stepIdx = 0;
      const overlay = document.createElement('div');
      overlay.id = 'tourOverlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';

      function renderStep() {
        const step = steps[stepIdx];
        overlay.innerHTML = `
          <div style="background:var(--card);border-radius:16px;padding:28px 28px 22px;max-width:380px;width:100%;box-shadow:0 8px 32px rgba(0,0,0,0.3);text-align:center">
            <div style="display:flex;justify-content:center;gap:6px;margin-bottom:18px">
              ${steps.map((_,i) => `<div style="width:${i===stepIdx?'22':'8'}px;height:8px;border-radius:4px;background:${i===stepIdx?'var(--accent)':'rgba(30,50,80,0.15)'};transition:all 0.3s"></div>`).join('')}
            </div>
            <div style="font-size:20px;font-weight:600;color:var(--text);margin-bottom:10px">${step.title}</div>
            <div style="font-size:14px;color:var(--muted);line-height:1.6;margin-bottom:22px">${step.text}</div>
            <div style="display:flex;gap:10px;justify-content:center">
              <button id="tourSkip" style="padding:8px 16px;border-radius:8px;border:0.5px solid rgba(30,50,80,0.15);background:transparent;color:var(--muted);font-size:13px;cursor:pointer;font-family:inherit">Pular</button>
              <button id="tourNext" style="padding:8px 20px;border-radius:8px;border:none;background:var(--accent);color:white;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit">${stepIdx === steps.length - 1 ? 'Começar!' : 'Próximo →'}</button>
            </div>
          </div>
        `;
        overlay.querySelector('#tourSkip').onclick = endTour;
        overlay.querySelector('#tourNext').onclick = () => {
          if(stepIdx === steps.length - 1) { endTour(); return; }
          stepIdx++;
          renderStep();
          // Highlight target
          const nextStep = steps[stepIdx];
          if(nextStep.target) {
            const el = document.querySelector(nextStep.target);
            if(el) { el.scrollIntoView({behavior:'smooth',block:'center'}); el.focus(); }
          }
        };
      }

      function endTour() {
        overlay.remove();
        localStorage.setItem('tourDone', '1');
      }

      renderStep();
      document.body.appendChild(overlay);
    }

    // ── SERVICE WORKER (MODO OFFLINE) ─────────────────────────
    function registerServiceWorker() {
      if(!('serviceWorker' in navigator)) return;
      // Cria o SW inline como Blob para não precisar de arquivo externo
      const swCode = `
        const CACHE = 'painel-v1';
        const ASSETS = [location.href];
        self.addEventListener('install', e => {
          e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
          self.skipWaiting();
        });
        self.addEventListener('activate', e => {
          e.waitUntil(clients.claim());
        });
        self.addEventListener('fetch', e => {
          if(e.request.method !== 'GET') return;
          e.respondWith(
            fetch(e.request).catch(() => caches.match(e.request))
          );
        });
        self.addEventListener('push', e => {
          const data = e.data ? e.data.json() : {};
          e.waitUntil(self.registration.showNotification(data.title || 'SMS Recebido!', {
            body: data.body || 'Um novo código chegou.',
            icon: data.icon || '',
            badge: data.badge || '',
            tag: 'sms-notification',
            renotify: true,
            vibrate: [200, 100, 200]
          }));
        });
        self.addEventListener('notificationclick', e => {
          e.notification.close();
          e.waitUntil(clients.matchAll({type:'window'}).then(cls => {
            if(cls.length) { cls[0].focus(); } else { clients.openWindow('/'); }
          }));
        });
      `;
      const blob = new Blob([swCode], {type:'application/javascript'});
      const swUrl = URL.createObjectURL(blob);
      navigator.serviceWorker.register(swUrl).then(reg => {
        console.log('Service Worker registrado:', reg.scope);
      }).catch(err => console.warn('SW não pôde ser registrado:', err));
    }

    // ── NOTIFICAÇÃO PUSH SMS ──────────────────────────────────
    window.requestPushPermission = async function() {
      if(!('Notification' in window)) {
        showToast('Este browser não suporta notificações.', 'error');
        return;
      }
      if(Notification.permission === 'denied') {
        showToast('Notificações bloqueadas no browser. Clique no cadeado na barra de endereço e permita notificações.', 'error');
        return;
      }
      const permission = await Notification.requestPermission();
      if(permission === 'granted') {
        showToast('Notificações ativadas! Você será avisado quando um SMS chegar.', 'success');
        document.getElementById('btnEnablePush').textContent = '🔔 Push Ativo';
        document.getElementById('btnEnablePush').disabled = true;
        new Notification('Painel Financeiro', {
          body: 'Notificações de SMS ativadas com sucesso!',
          tag: 'test-notif'
        });
      } else {
        showToast('Permissão de notificação negada pelo browser.', 'error');
      }
    }

    function sendSmsNotification(serviceName, code) {
      if(Notification.permission !== 'granted') return;
      new Notification(`SMS Recebido — ${serviceName}`, {
        body: `Código: ${code}`,
        tag: 'sms-' + Date.now(),
        renotify: true,
        vibrate: [200, 100, 200]
      });
    }

    function setSaveStatus(statusType, text) {
      const dot = document.getElementById('saveDot');
      const txt = document.getElementById('saveText');
      if(dot) { dot.className = 'save-dot ' + statusType; }
      if(txt) txt.textContent = text;
    }

    async function saveData(){
      setSaveStatus('saving', 'Salvando...');
      state._savedAt = Date.now();
      lastSavedTimestamp = state._savedAt;

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if(session) {
            state.savedBy = session.user.email;
            await supabase.from('user_data').upsert({ 
                user_id: session.user.id, 
                content: state 
            });
        }
        setSaveStatus('synced', 'Sincronizado');
        setTimeout(() => setSaveStatus('synced', 'Sincronizado'), 2000);
      } catch(e) {
        console.error('Erro ao salvar:', e);
        setSaveStatus('error', 'Erro ao salvar!');
      }
    }

    function saveDataImmediate(){
      if(saveTimer) clearTimeout(saveTimer);
      saveData();
    }

    function scheduleSave(){
      if(saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(()=>{ saveData(); }, 2000);
    }

    // --- UI Renderers
    function renderPlatformsList(){
      const container = document.getElementById('platformsList');
      container.innerHTML='';
      const searchTerm = document.getElementById('searchPlatforms').value.toLowerCase();

      const platformOrder = state.platformOrder || Object.keys(state.platforms);

      const filteredOrder = platformOrder.filter(pName =>
        state.platforms[pName] && state.platforms[pName].name.toLowerCase().includes(searchTerm)
      );

      // Avatar palette
      const avatarPalettes = [
        'linear-gradient(135deg,#2b7be4,#1e9fc8)',
        'linear-gradient(135deg,#7c3aed,#c026d3)',
        'linear-gradient(135deg,#f59e0b,#ef4444)',
        'linear-gradient(135deg,#17b169,#0ea5e9)',
        'linear-gradient(135deg,#ec4899,#f43f5e)',
        'linear-gradient(135deg,#14b8a6,#2b7be4)',
      ];

      filteredOrder.forEach((pName, idx) => {
        const p = state.platforms[pName];
        if (!p) return;

        const lucroPlat = p.accounts.reduce((s,a)=>
          s + (((a.saque||0)+(a.bau||0)) - ((a.deposito||0)+(a.redeposito||0))), 0);
        const avatarBg = avatarPalettes[idx % avatarPalettes.length];
        const initial = (p.name || '?').charAt(0).toUpperCase();
        const lucroFmt = (lucroPlat >= 0 ? '+' : '') + 'R$' + money(Math.abs(lucroPlat));

        const el = document.createElement('div');
        el.className = 'sb-plat-card' + (p.name === state.selectedPlatform ? ' selected' : '');
        el.dataset.platformName = p.name;

        el.innerHTML = `
          <div class="sb-plat-avatar" style="background:${avatarBg}">${initial}</div>
          <div class="sb-plat-info">
            <div class="sb-plat-name"></div>
            <div class="sb-plat-sub">${p.accounts.length} conta${p.accounts.length!==1?'s':''}</div>
          </div>
          <div class="sb-plat-profit ${lucroPlat>=0?'pos':'neg'}">${lucroFmt}</div>
          <div class="sb-plat-actions">
            <button class="sb-plat-btn btn-edit-plat" title="Renomear">✏️</button>
            <button class="sb-plat-btn btn-delete" title="Remover">🗑️</button>
          </div>
        `;
        el.querySelector('.sb-plat-name').textContent = p.name;
        
        el.onclick = (e) => {
          if (e.target.closest('button')) return;
          selectPlatform(p.name);
        };
        el.querySelector('.btn-edit-plat').onclick = (e) => {
            e.stopPropagation();
            const oldName = pName; // Use the key from the loop, which is stable.
            
            showPrompt('Novo nome para a plataforma:', (newName) => {
                if(newName && newName.trim() !== '' && newName !== oldName) {
                    if(state.platforms[newName]) return showToast('Já existe uma plataforma com este nome.', 'error');
                    
                    // Correctly rename by re-assigning the object and deleting the old key
                    const platformData = state.platforms[oldName];
                    platformData.name = newName;
                    
                    state.platforms[newName] = platformData;
                    delete state.platforms[oldName];
                    
                    const idx = state.platformOrder.indexOf(oldName);
                    if(idx !== -1) state.platformOrder[idx] = newName;
                    
                    if(state.selectedPlatform === oldName) {
                        state.selectedPlatform = newName;
                    }
                    
                    saveDataImmediate();
                    updateUI();
                }
            }, oldName);
        };
        el.querySelector('.btn-delete').onclick = () => {
          showConfirm(`Tem certeza que deseja remover a plataforma <strong>"${escapeHtml(p.name)}"</strong> e todas as suas contas? <br><br>Esta ação não pode ser desfeita.`, () => {
              delete state.platforms[p.name];
              const index = state.platformOrder.indexOf(p.name);
              if (index > -1) {
                state.platformOrder.splice(index, 1);
              }
              if(state.selectedPlatform === p.name) {
                state.selectedPlatform = state.platformOrder[0] || null;
                if (!state.selectedPlatform) { selectView('dashboard'); }
              }
              saveDataImmediate();
              updateUI();
          }, { isDanger: true, title: 'Remover Plataforma' });
        };
        container.appendChild(el);
      });
      // Sincroniza o grid do painel principal se estiver visível
      if (typeof renderPlatGrid === 'function') {
        const gridPanel = document.getElementById('platGridPanel');
        if (gridPanel && gridPanel.style.display !== 'none') renderPlatGrid();
      }
    }

    function renderSummary(){
      const tbody = document.querySelector('#summaryTable tbody'); tbody.innerHTML='';
      let totalAccounts=0, totalLucro=0;
      
        const sortBy = document.getElementById('sortPlatforms')?.value || 'name';
  
        const platformsData = Object.values(state.platforms).map(p => {
        const lucroPlat = p.accounts.reduce((s,a)=>
        s + (((a.saque||0) + (a.bau||0)) - ((a.deposito||0)+(a.redeposito||0))), 0);
        return {
        platform: p,
        name: p.name,
      lucro: lucroPlat,
createdAt: p.createdAt || new Date().toISOString()
      };
      });

      // Empty state
      if(platformsData.length === 0){
        tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state"><div class="empty-state-icon">🖥️</div><div class="empty-state-title">Nenhuma plataforma ainda</div><div class="empty-state-sub">Crie sua primeira plataforma na barra lateral para começar</div></div></td></tr>`;
      }
        
          if(sortBy === 'name') {
          platformsData.sort((a, b) => a.name.localeCompare(b.name));
        } else if(sortBy === 'profit') {
        platformsData.sort((a, b) => b.lucro - a.lucro);
      } else if(sortBy === 'date') {
platformsData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      
platformsData.forEach(data => {
      const p = data.platform;
      const lucroPlat = data.lucro;
      totalAccounts += p.accounts.length;
      totalLucro += lucroPlat;
      const tr = document.createElement('tr');
      tr.className = 'summary-row-clickable';
      tr.title = `Abrir ${escapeHtml(p.name)}`;
      tr.onclick = () => selectPlatform(p.name);
      const lucroChipClass = lucroPlat >= 0 ? 'pos' : 'neg';
      const lucroSign = lucroPlat >= 0 ? '+' : '';
      // Avatar colors cycling
      const avatarPalettes = [
        'linear-gradient(135deg,#2b7be4,#1e9fc8)',
        'linear-gradient(135deg,#7c3aed,#c026d3)',
        'linear-gradient(135deg,#f59e0b,#ef4444)',
        'linear-gradient(135deg,#17b169,#0ea5e9)',
        'linear-gradient(135deg,#ec4899,#f43f5e)',
        'linear-gradient(135deg,#14b8a6,#2b7be4)',
      ];
      const avatarIdx = Object.keys(state.platforms).indexOf(p.name) % avatarPalettes.length;
      const avatarBg = avatarPalettes[Math.max(0, avatarIdx)];
      const initial = (p.name || '?').charAt(0).toUpperCase();
      tr.innerHTML = `
        <td><div class="plat-avatar-cell">
          <div class="plat-tbl-avatar" style="background:${avatarBg}">${initial}</div>
          <div>
            <div class="plat-tbl-name">${escapeHtml(p.name)}</div>
            <div class="plat-tbl-sub">${p.accounts.length} conta${p.accounts.length !== 1 ? 's' : ''}</div>
          </div>
        </div></td>
        <td style="font-size:13px;font-weight:600">${p.accounts.length}</td>
        <td><span class="lucro-chip ${lucroChipClass}">${lucroSign}R$ ${money(lucroPlat)}</span></td>
        <td class="summary-bar-wrap">
          <div class="part-mini-bar"><div class="part-mini-fill" data-lucro="${lucroPlat}" style="width:0%;background:${lucroPlat>=0?'var(--success)':'var(--danger)'}"></div></div>
        </td>
      `;
      tbody.appendChild(tr);
      });

      // Fill participation bars relative to max lucro
      const maxLucro = Math.max(...platformsData.map(d => Math.abs(d.lucro)), 1);
      tbody.querySelectorAll('.part-mini-fill').forEach(bar => {
        const val = Math.abs(parseFloat(bar.dataset.lucro) || 0);
        setTimeout(() => { bar.style.width = Math.round((val / maxLucro) * 100) + '%'; }, 50);
      });

      let totalFintech = 0;
      if(state.fintechAccounts){
        state.fintechAccounts.forEach(acc => {
          const saque = Number(acc.saque) || 0;
          totalFintech += saque * 0.75;
        });
      }
      totalLucro += totalFintech;
      
      document.getElementById('totalContas').textContent = totalAccounts;
      
        const lucroBrutoEl = document.getElementById('lucroBruto');
        const lucroBrutoClass = totalLucro >= 0 ? 'lucro' : 'negative';
        lucroBrutoEl.textContent = money(totalLucro);
      lucroBrutoEl.className = lucroBrutoClass;

      const gastos = Number(state.gastoProxy||0) + Number(state.gastoNumeros||0) + Number(state.gastoBot||0) + Number(state.gastoChinaSms||0);
      const gastosTotalEl = document.getElementById('gastosTotal');
      gastosTotalEl.textContent = money(gastos);
      gastosTotalEl.className = 'negative';
        
      const lucroFinal = totalLucro - gastos;
    const lucroTotalDisplayEl = document.getElementById('lucroTotalDisplay');
    const lucroFinalClass = lucroFinal >= 0 ? 'lucro' : 'negative';
    lucroTotalDisplayEl.textContent = `R$ ${money(lucroFinal)}`;
    lucroTotalDisplayEl.className = lucroFinalClass;

    let somaDias = 0;
    const filteredRecords = getFilteredRecords();
    Object.values(filteredRecords || {}).forEach(r => { somaDias += Number(r && r.lucroLiquido ? r.lucroLiquido : 0); });
    const lucroTotalDiasEl = document.getElementById('lucroTotalDias');
    if(lucroTotalDiasEl) {
    const somaDiasClass = somaDias >= 0 ? 'lucro' : 'negative';
    lucroTotalDiasEl.textContent = `R$ ${money(somaDias)}`;
    lucroTotalDiasEl.className = somaDiasClass;
    }
    
    const cpfsDisponiveis = state.notas.filter(n => !n.used).length;
    const cpfsDisponiveisEl = document.getElementById('cpfsDisponiveis');
    if(cpfsDisponiveisEl) {
    cpfsDisponiveisEl.textContent = cpfsDisponiveis;
    }
    }

    function updatePlatformTotals() {
        const platform = state.selectedPlatform;
        if(!platform || !state.platforms[platform]) return;
        
        const accounts = state.platforms[platform].accounts;
        const searchTerm = document.getElementById('searchAccounts') ? document.getElementById('searchAccounts').value.toLowerCase() : '';
        
        let totalDep = 0, totalRedep = 0, totalSaque = 0, totalBau = 0, totalLucro = 0;
        let visibleCount = 0, positiveCount = 0;
        
        accounts.forEach(acc => {
            if(searchTerm && !acc.name.toLowerCase().includes(searchTerm)) return;
            visibleCount++;
            const lucro = ((acc.saque||0) + (acc.bau||0)) - ((acc.deposito||0) + (acc.redeposito||0));
            if(lucro > 0) positiveCount++;
            totalDep += Number(acc.deposito)||0;
            totalRedep += Number(acc.redeposito)||0;
            totalSaque += Number(acc.saque)||0;
            totalBau += Number(acc.bau)||0;
            totalLucro += lucro;
        });

        const successRate = visibleCount > 0 ? Math.round((positiveCount / visibleCount) * 100) : 0;

        // Update Summary grid
        const gridEl = document.getElementById('platStatGrid');
        if(gridEl) {
            const lucroClass = totalLucro >= 0 ? 'green' : 'red';
            const investTotal = totalDep + totalRedep;
            const retornoTotal = totalSaque + totalBau;
            const roi = investTotal > 0 ? ((retornoTotal - investTotal) / investTotal * 100) : 0;
            const roiSign = roi >= 0 ? '+' : '';
            const roiChip = `<span class="plat-stat-chip ${roi>=0?'up':'down'}">${roiSign}${roi.toFixed(0)}% ROI</span>`;
            const successChip = `<span class="plat-stat-chip ${successRate>=50?'up':'down'}">${successRate}% pos.</span>`;
            gridEl.innerHTML = `
              <div class="plat-stat-card red">
                <div class="plat-stat-top"><div class="plat-stat-icon red">💸</div><span class="plat-stat-chip neu">invest.</span></div>
                <div class="plat-stat-label">Investimento</div>
                <div class="plat-stat-val red">R$ ${money(investTotal)}</div>
                <div class="plat-stat-bar"><div class="plat-stat-bar-fill" style="width:80%;background:var(--danger)"></div></div>
              </div>
              <div class="plat-stat-card green">
                <div class="plat-stat-top"><div class="plat-stat-icon green">📈</div>${roiChip}</div>
                <div class="plat-stat-label">Retorno</div>
                <div class="plat-stat-val green">R$ ${money(retornoTotal)}</div>
                <div class="plat-stat-bar"><div class="plat-stat-bar-fill" style="width:100%;background:var(--success)"></div></div>
              </div>
              <div class="plat-stat-card purple">
                <div class="plat-stat-top"><div class="plat-stat-icon purple">💰</div><span class="plat-stat-chip ${lucroClass==='green'?'up':'down'}">${lucroClass==='green'?'lucro':'prejuízo'}</span></div>
                <div class="plat-stat-label">Lucro Líquido</div>
                <div class="plat-stat-val ${lucroClass}">R$ ${money(totalLucro)}</div>
                <div class="plat-stat-bar"><div class="plat-stat-bar-fill" style="width:${Math.min(100,Math.abs(roi))}%;background:#7c3aed"></div></div>
              </div>
              <div class="plat-stat-card blue">
                <div class="plat-stat-top"><div class="plat-stat-icon blue">🖥️</div>${successChip}</div>
                <div class="plat-stat-label">Contas</div>
                <div class="plat-stat-val" style="color:var(--accent)">${visibleCount}</div>
                <div class="plat-stat-bar"><div class="plat-stat-bar-fill" style="width:${successRate}%;background:var(--accent)"></div></div>
              </div>
            `;
        }

        // Update success rate bar
        const rateWrap = document.getElementById('platRateWrap');
        const ratePct = document.getElementById('platRatePct');
        const rateFill = document.getElementById('platRateFill');
        const rateLabel = document.getElementById('platRateLabel');
        if(rateWrap && visibleCount > 0) {
            rateWrap.style.display = 'block';
            if(ratePct) ratePct.textContent = successRate + '%';
            if(rateFill) rateFill.style.width = successRate + '%';
            if(rateLabel) rateLabel.textContent = `${positiveCount} de ${visibleCount} contas lucrativas`;
        } else if(rateWrap) {
            rateWrap.style.display = 'none';
        }

        // Update Footer
        const tfoot = document.querySelector('#contasTable tfoot');
        if(tfoot) {
            tfoot.innerHTML = '';
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="8" style="padding:0">
              <div class="tfoot-totals">
                <div class="tfoot-cell"><div class="tfoot-cell-label">Depósito</div><div class="tfoot-cell-val" style="color:var(--danger)">R$ ${money(totalDep)}</div></div>
                <div class="tfoot-cell"><div class="tfoot-cell-label">Re-depósito</div><div class="tfoot-cell-val" style="color:var(--danger)">R$ ${money(totalRedep)}</div></div>
                <div class="tfoot-cell"><div class="tfoot-cell-label">Saque</div><div class="tfoot-cell-val" style="color:var(--success)">R$ ${money(totalSaque)}</div></div>
                <div class="tfoot-cell"><div class="tfoot-cell-label">Baú</div><div class="tfoot-cell-val" style="color:var(--success)">R$ ${money(totalBau)}</div></div>
                <div class="tfoot-cell"><div class="tfoot-cell-label">Lucro total</div><div class="tfoot-cell-val" style="color:${totalLucro>=0?'var(--success)':'var(--danger)'}">R$ ${money(totalLucro)}</div></div>
              </div>
            </td>`;
            tfoot.appendChild(tr);
        }
    }

    function renderContas(){
      const tbody = document.querySelector('#contasTable tbody'); 
      const tfoot = document.querySelector('#contasTable tfoot');
      tbody.innerHTML='';
      if(tfoot) tfoot.innerHTML = '';

      const platform = state.selectedPlatform;
      if(!platform || !state.platforms[platform]) {
          document.getElementById('platformSummary').style.display = 'none';
          return;
      }
      
      document.getElementById('platformSummary').style.display = 'block';
      const accounts = state.platforms[platform].accounts;
      const searchTerm = document.getElementById('searchAccounts') ? document.getElementById('searchAccounts').value.toLowerCase() : '';

      if(accounts.length === 0){
        tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-title">Nenhuma conta nesta plataforma</div><div class="empty-state-sub">Clique em "+ Adicionar Conta" para registrar a primeira</div></div></td></tr>`;
        return;
      }

      accounts.forEach((acc,i)=>{
        if(!acc.name) acc.name = '';
        if(searchTerm && !acc.name.toLowerCase().includes(searchTerm)) return; // Filtro de busca
        
        const notesCount = acc.notes ? acc.notes.length : 0;

        const tr = document.createElement('tr');
        const lucro = ((acc.saque||0) + (acc.bau||0)) - ((acc.deposito||0) + (acc.redeposito||0));
        tr.className = lucro > 0 ? 'row-pos' : lucro < 0 ? 'row-neg' : 'row-zero';
        const lucroChipClass = lucro >= 0 ? 'pos' : 'neg';
        const lucroSign = lucro >= 0 ? '+' : '';
        tr.innerHTML = `
          <td style="color:var(--muted);font-size:12px">${i+1}</td>
          <td><input type="text" class="inp inp-name" value="${acc.name||''}" placeholder="Nome da conta" style="width:150px;padding:7px 9px;border-radius:6px;border:0.5px solid rgba(30,50,80,0.15);background:var(--bg);font-family:inherit" /></td>
          <td><input type="text" inputmode="decimal" class="inp deposito" value="${String(acc.deposito||0).replace('.',',')}" style="width:90px;padding:7px 9px;font-size:13px;text-align:right;border-radius:6px;border:0.5px solid rgba(30,50,80,0.15);background:var(--bg);font-family:inherit" /></td>
          <td><input type="text" inputmode="decimal" class="inp redeposito" value="${String(acc.redeposito||0).replace('.',',')}" style="width:90px;padding:7px 9px;font-size:13px;text-align:right;border-radius:6px;border:0.5px solid rgba(30,50,80,0.15);background:var(--bg);font-family:inherit" /></td>
          <td><input type="text" inputmode="decimal" class="inp saque" value="${String(acc.saque||0).replace('.',',')}" style="width:90px;padding:7px 9px;font-size:13px;text-align:right;border-radius:6px;border:0.5px solid rgba(30,50,80,0.15);background:var(--bg);font-family:inherit" /></td>
          <td><input type="text" inputmode="decimal" class="inp bau" value="${String(acc.bau||0).replace('.',',')}" style="width:90px;padding:7px 9px;font-size:13px;text-align:right;border-radius:6px;border:0.5px solid rgba(30,50,80,0.15);background:var(--bg);font-family:inherit" /></td>
          <td><span class="lucro-chip ${lucroChipClass} lucro-cell">${lucroSign}R$ ${money(lucro)}</span></td>
          <td class="actions" style="display:flex;gap:4px;justify-content:flex-end">
            <div class="btn-notes-container">
              <button class="btn ghost btn-notes">📝</button>
              ${notesCount > 0 ? `<span class="notes-badge">${notesCount}</span>` : ''}
            </div>
            <button class="btn ghost del">X</button>
          </td>
        `;
        const lucroCell = tr.querySelector('.lucro-cell');

        tr.querySelector('.inp-name').addEventListener('input', (e)=>{
          state.platforms[platform].accounts[i].name = e.target.value;
          scheduleSave();
        });

        tr.querySelectorAll('.inp:not(.inp-name)').forEach((input)=>{
        input.addEventListener('input', (e)=>{
            const rowIdx = i;
            const row = state.platforms[platform].accounts[rowIdx];
            row.deposito = parseDecimal(tr.querySelector('.deposito').value);
            row.redeposito = parseDecimal(tr.querySelector('.redeposito').value);
            row.saque = parseDecimal(tr.querySelector('.saque').value);
            row.bau = parseDecimal(tr.querySelector('.bau').value);
            const newLucro = ((row.saque||0) + (row.bau||0)) - ((row.deposito||0) + (row.redeposito||0));
            const newSign = newLucro >= 0 ? '+' : '';
            lucroCell.textContent = `${newSign}R$ ${money(newLucro)}`;
            lucroCell.className = `lucro-chip ${newLucro >= 0 ? 'pos' : 'neg'} lucro-cell`;
            tr.className = newLucro > 0 ? 'row-pos' : newLucro < 0 ? 'row-neg' : 'row-zero';
            scheduleSave();
            updatePlatformTotals();
        });
        input.addEventListener('blur', ()=>{
            renderSummary();
            renderDiasTabela();
        });
        input.addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.target.blur(); } });
    });
        
        tr.querySelector('.btn-notes').onclick = () => { openNotesModal(platform, i); };
        tr.querySelector('.del').onclick = ()=>{
          const accBackup = JSON.parse(JSON.stringify(state.platforms[platform].accounts[i]));
          const accIdx = i;
          state.platforms[platform].accounts.splice(i, 1);
          scheduleSave(); renderContas(); renderPlatformsList(); renderSummary(); renderDiasTabela();
          showUndoToast(
            `Conta removida`,
            accBackup.name ? accBackup.name + ' · ' + platform : platform,
            () => {
              state.platforms[platform].accounts.splice(accIdx, 0, accBackup);
              scheduleSave(); renderContas(); renderPlatformsList(); renderSummary(); renderDiasTabela();
              showToast('Conta restaurada!', 'success');
            }
          );
        };

        tbody.appendChild(tr);
      });

      updatePlatformTotals();

      // Habilita arrastar para reordenar contas
      if(window.Sortable) {
        const tbody2 = document.querySelector('#contasTable tbody');
        if(tbody2) {
          new Sortable(tbody2, {
            animation: 150,
            handle: 'td:first-child',
            ghostClass: 'sortable-ghost',
            onEnd: (evt) => {
              const plat = state.selectedPlatform;
              if(!plat || !state.platforms[plat]) return;
              const accs = state.platforms[plat].accounts;
              const moved = accs.splice(evt.oldIndex, 1)[0];
              accs.splice(evt.newIndex, 0, moved);
              scheduleSave();
              renderContas();
            }
          });
        }
      }
    } // fim renderContas

    function renderDiasTabela(){
      const tbody = document.querySelector("#tabelaDias tbody");
      if(!tbody) return;
      tbody.innerHTML = "";

      const records = getFilteredRecords();
      const keys = Object.keys(records).sort((a,b)=> b.localeCompare(a));
      keys.forEach(dateKey=>{
        const r = records[dateKey];
        // Format date to DD/MM/YYYY
        const [year, month, day] = dateKey.split('-');
        const formattedDate = `${day}/${month}/${year}`;

        const tr = document.createElement("tr");
        const lucroBrutoClass = r.lucroBruto >= 0 ? 'lucro' : 'negative';
        const lucroLiquidoClass = r.lucroLiquido >= 0 ? 'lucro' : 'negative';
        
        tr.innerHTML = `
          <td style="font-weight:500">${formattedDate}</td>
          <td class="${lucroBrutoClass}">R$ ${money(r.lucroBruto)}</td>
          <td class="negative">R$ ${money(r.gastos)}</td>
          <td class="${lucroLiquidoClass}">R$ ${money(r.lucroLiquido)}</td>
          <td class="actions" style="display:flex;gap:4px;justify-content:flex-end">
            <button class="btn ghost edit-day" style="padding:4px 8px;font-size:12px" title="Editar">✏️</button>
            <button class="btn ghost del-day" style="padding:4px 8px;font-size:12px" title="Remover">✖</button>
          </td>
        `;

        // Inline edit row
        const editTr = document.createElement('tr');
        editTr.className = 'hist-edit-tr';
        editTr.style.display = 'none';
        editTr.innerHTML = `
          <td colspan="5">
            <div class="hist-edit-inline" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <label style="font-size:11px;color:var(--muted)">Lucro Bruto (R$)
                <input type="text" class="edit-lucro-bruto" value="${String(r.lucroBruto||0).replace('.',',')}" style="width:100px;padding:6px 8px;border:0.5px solid rgba(43,123,228,0.3);border-radius:6px;font-size:12px;font-family:inherit;background:var(--card);color:var(--text);text-align:right;display:block;margin-top:3px">
              </label>
              <label style="font-size:11px;color:var(--muted)">Gastos (R$)
                <input type="text" class="edit-gastos" value="${String(r.gastos||0).replace('.',',')}" style="width:100px;padding:6px 8px;border:0.5px solid rgba(43,123,228,0.3);border-radius:6px;font-size:12px;font-family:inherit;background:var(--card);color:var(--text);text-align:right;display:block;margin-top:3px">
              </label>
              <button class="btn success save-day-edit" style="padding:6px 14px;font-size:12px">✓ Salvar</button>
              <button class="btn ghost cancel-day-edit" style="padding:6px 14px;font-size:12px">Cancelar</button>
            </div>
          </td>
        `;

        tr.querySelector('.edit-day').addEventListener('click', () => {
          const isOpen = editTr.style.display !== 'none';
          editTr.style.display = isOpen ? 'none' : 'table-row';
          editTr.querySelector('.hist-edit-inline').style.display = isOpen ? 'none' : 'flex';
          tr.classList.toggle('editing-row', !isOpen);
        });

        editTr.querySelector('.cancel-day-edit').addEventListener('click', () => {
          editTr.style.display = 'none';
          tr.classList.remove('editing-row');
        });

        editTr.querySelector('.save-day-edit').addEventListener('click', () => {
          const newBruto = parseDecimal(editTr.querySelector('.edit-lucro-bruto').value);
          const newGastos = parseDecimal(editTr.querySelector('.edit-gastos').value);
          const newLiquido = newBruto - newGastos;
          state.dailyRecords[dateKey] = { lucroBruto: newBruto, gastos: newGastos, lucroLiquido: newLiquido };
          saveDataImmediate();
          renderDiasTabela(); renderSummary(); renderKPIs(); renderDailyProfitChart();
          showToast('Registro atualizado!', 'success');
        });

        tr.querySelector('.del-day').addEventListener('click', () => {
          const backup = JSON.parse(JSON.stringify(state.dailyRecords[dateKey]));
          delete state.dailyRecords[dateKey];
          saveDataImmediate(); renderDiasTabela(); renderSummary(); renderKPIs(); renderDailyProfitChart();
          showUndoToast(
            `Dia ${formattedDate} removido`,
            `Líquido: R$ ${money(r.lucroLiquido)}`,
            () => {
              state.dailyRecords[dateKey] = backup;
              saveDataImmediate(); renderDiasTabela(); renderSummary(); renderKPIs(); renderDailyProfitChart();
              showToast('Registro restaurado!', 'success');
            }
          );
        });

        tbody.appendChild(tr);
        tbody.appendChild(editTr);
      });

      // ── RODAPÉ DE TOTAIS ──────────────────────────────────
      const tfoot = document.getElementById('tabelaDiasTfoot');
      if(tfoot) tfoot.innerHTML = ''; // Limpa antes de renderizar
      if(tfoot && keys.length > 0) {
        let totBruto = 0, totGastos = 0, totLiquido = 0;
        keys.forEach(k => {
          const r = records[k];
          totBruto  += Number(r.lucroBruto  || 0);
          totGastos += Number(r.gastos      || 0);
          totLiquido+= Number(r.lucroLiquido|| 0);
        });
        const avg = totLiquido / keys.length;
        const tr = document.createElement('tr');
        tr.innerHTML = `<td colspan="5" style="padding:0">
          <div class="hist-totals-row">
            <div class="hist-total-cell"><div class="hist-total-label">Total bruto</div><div class="hist-total-val" style="color:var(--accent)">R$ ${money(totBruto)}</div></div>
            <div class="hist-total-cell"><div class="hist-total-label">Total gastos</div><div class="hist-total-val" style="color:var(--danger)">R$ ${money(totGastos)}</div></div>
            <div class="hist-total-cell"><div class="hist-total-label">Lucro líquido</div><div class="hist-total-val" style="color:${totLiquido>=0?'var(--success)':'var(--danger)'}">R$ ${money(totLiquido)}</div></div>
            <div class="hist-total-cell"><div class="hist-total-label">Média/dia</div><div class="hist-total-val">R$ ${money(avg)}</div></div>
            <div class="hist-total-cell"><div class="hist-total-label">Dias</div><div class="hist-total-val">${keys.length}</div></div>
          </div>
        </td>`;
        tfoot.appendChild(tr);
      }

      // ── STREAK E RECORDES ─────────────────────────────────
      renderStreakSection(records);
    }

    function renderStreakSection(records) {
      const sec = document.getElementById('streakSection');
      if(!sec) return;

      const allRecords = state.dailyRecords;
      const sortedAllKeys = Object.keys(allRecords).sort();
      if(sortedAllKeys.length === 0) { sec.style.display = 'none'; return; }

      // Current streak (from today backwards)
      let currentStreak = 0;
      const today = new Date().toISOString().slice(0,10);
      for(let i = sortedAllKeys.length - 1; i >= 0; i--) {
        const key = sortedAllKeys[i];
        if(key > today) continue;
        if((allRecords[key].lucroLiquido || 0) > 0) currentStreak++;
        else break;
      }

      // Best streak ever
      let bestStreak = 0, tempStreak = 0;
      let bestStreakStart = '', bestStreakEnd = '';
      let tempStart = '';
      sortedAllKeys.forEach(key => {
        if((allRecords[key].lucroLiquido || 0) > 0) {
          if(tempStreak === 0) tempStart = key;
          tempStreak++;
          if(tempStreak > bestStreak) {
            bestStreak = tempStreak;
            bestStreakStart = tempStart;
            bestStreakEnd = key;
          }
        } else { tempStreak = 0; }
      });

      // Record day
      let recordVal = -Infinity, recordKey = '';
      sortedAllKeys.forEach(key => {
        const v = allRecords[key].lucroLiquido || 0;
        if(v > recordVal) { recordVal = v; recordKey = key; }
      });
      const [ry, rm, rd] = recordKey.split('-');
      const recordDate = recordKey ? `${rd}/${rm}/${ry}` : '-';

      // Positive days count in filtered period
      const filtKeys = Object.keys(records);
      const positiveDays = filtKeys.filter(k => (records[k].lucroLiquido || 0) > 0).length;

      sec.style.display = 'block';
      sec.innerHTML = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:12px 0 4px">
          ${currentStreak >= 2 ? `<span class="streak-badge">🔥 ${currentStreak} dias positivos seguidos</span>` : ''}
          ${recordVal > 0 ? `<span class="record-badge">🏆 Recorde: R$ ${money(recordVal)} em ${recordDate}</span>` : ''}
          <span style="font-size:12px;color:var(--muted)">${positiveDays} de ${filtKeys.length} dias positivos no período</span>
          ${bestStreak > 0 && bestStreak !== currentStreak ? `<span style="font-size:12px;color:var(--muted)">· Melhor sequência: ${bestStreak} dias</span>` : ''}
        </div>
      `;
    }

    function renderKPIs(){
      const records = Object.values(getFilteredRecords() || {});

      if(records.length === 0){
        document.getElementById('kpiMediaDiaria').textContent = 'R$ 0,00';
        document.getElementById('kpiMelhorDia').textContent = '-';
        document.getElementById('kpiMelhorDiaValor').textContent = 'R$ 0,00';
        document.getElementById('kpiPiorDia').textContent = '-';
        document.getElementById('kpiPiorDiaValor').textContent = 'R$ 0,00';
        document.getElementById('kpiTotalDias').textContent = '0';
        document.getElementById('kpiTaxaSucesso').textContent = '0%';
        document.getElementById('kpiLucroMedioConta').textContent = 'R$ 0,00';
        return;
      }

      const totalLucro = records.reduce((sum, r) => sum + (r.lucroLiquido || 0), 0);
      const mediaDiaria = totalLucro / records.length;

      let melhorDia = null;
      let piorDia = null;
      let melhorValor = -Infinity;
      let piorValor = Infinity;

      const diasPositivos = records.filter(r => (r.lucroLiquido || 0) > 0).length;
      const taxaSucesso = (diasPositivos / records.length) * 100;

      const filtered = getFilteredRecords();
      Object.keys(filtered).forEach(dateKey => {
        const r = filtered[dateKey];
        const lucro = r.lucroLiquido || 0;

        if(lucro > melhorValor){
          melhorValor = lucro;
          melhorDia = dateKey;
        }

        if(lucro < piorValor){
          piorValor = lucro;
          piorDia = dateKey;
        }
      });

      let totalContas = 0;
      Object.values(state.platforms).forEach(p => {
        totalContas += p.accounts.length;
      });
      const lucroMedioConta = totalContas > 0 ? totalLucro / totalContas : 0;

      document.getElementById('kpiMediaDiaria').textContent = `R$ ${money(mediaDiaria)}`;
      document.getElementById('kpiMelhorDia').textContent = melhorDia || '—';
      document.getElementById('kpiMelhorDiaValor').textContent = `R$ ${money(melhorValor === -Infinity ? 0 : melhorValor)}`;
      document.getElementById('kpiPiorDia').textContent = piorDia || '—';
      document.getElementById('kpiPiorDiaValor').textContent = `R$ ${money(piorValor === Infinity ? 0 : piorValor)}`;
      document.getElementById('kpiTotalDias').textContent = records.length;
      document.getElementById('kpiTaxaSucesso').textContent = `${Math.round(taxaSucesso)}%`;
      document.getElementById('kpiLucroMedioConta').textContent = `R$ ${money(lucroMedioConta)}`;

      // Taxa de sucesso — chip com % e barra
      const taxaEl = document.getElementById('kpiTaxaDelta');
      if(taxaEl){ taxaEl.textContent = `${diasPositivos}/${records.length} dias`; taxaEl.className = 'kpi-v2-chip ' + (taxaSucesso >= 70 ? 'up' : taxaSucesso >= 40 ? 'neutral' : 'down'); }
      const taxaBar = document.getElementById('kpiTaxaBar');
      if(taxaBar) setTimeout(() => { taxaBar.style.width = Math.round(taxaSucesso) + '%'; }, 60);

      // Média diária — chip de tendência
      const mediaDelta = document.getElementById('kpiMediaDiariaDelta');
      if(mediaDelta) {
        if(records.length >= 7) {
          const lastWeek = records.slice(-7);
          const prevWeek = records.slice(-14, -7);
          if(prevWeek.length > 0) {
            const lastAvg = lastWeek.reduce((s,r)=>s+(r.lucroLiquido||0),0)/lastWeek.length;
            const prevAvg = prevWeek.reduce((s,r)=>s+(r.lucroLiquido||0),0)/prevWeek.length;
            const diff = lastAvg - prevAvg;
            const pct = prevAvg !== 0 ? Math.round(Math.abs(diff/prevAvg)*100) : 0;
            mediaDelta.textContent = (diff >= 0 ? '↑ +' : '↓ -') + pct + '% 7d';
            mediaDelta.className = 'kpi-v2-chip ' + (diff >= 0 ? 'up' : 'down');
          } else { mediaDelta.textContent = '7 dias'; mediaDelta.className = 'kpi-v2-chip neutral'; }
        } else { mediaDelta.textContent = records.length + ' dias'; mediaDelta.className = 'kpi-v2-chip neutral'; }
      }
      // Média diária barra: relativo ao melhor dia
      const mediaBar = document.getElementById('kpiMediaBar');
      if(mediaBar && melhorValor > 0) setTimeout(() => { mediaBar.style.width = Math.min(100, Math.round((mediaDiaria/melhorValor)*100)) + '%'; }, 60);

      // Total dias barra: relativo a dias no mês
      const diasDelta = document.getElementById('kpiTotalDiasDelta');
      if(diasDelta) {
        const now2 = new Date();
        const daysInMth = new Date(now2.getFullYear(), now2.getMonth()+1, 0).getDate();
        diasDelta.textContent = `/${daysInMth} dias`;
        diasDelta.className = 'kpi-v2-chip neutral';
        const diasBar = document.getElementById('kpiDiasBar');
        if(diasBar) setTimeout(() => { diasBar.style.width = Math.round((records.length/daysInMth)*100) + '%'; }, 60);
      }

      // Lucro médio/conta barra: relativo à média diária
      const contaBar = document.getElementById('kpiLucroContaBar');
      if(contaBar && mediaDiaria > 0) setTimeout(() => { contaBar.style.width = Math.min(100, Math.round((lucroMedioConta/Math.max(mediaDiaria,1))*100)) + '%'; }, 60);
      
      renderMonthlyGoal(totalLucro);
    }

    function renderMonthlyGoal(currentProfit) {
        const goal = state.monthlyGoal || 5000;
        const percent = Math.min(100, Math.max(0, (currentProfit / goal) * 100));

        // Days remaining in month
        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const dayOfMonth = now.getDate();
        const daysLeft = daysInMonth - dayOfMonth;
        const daysPassed = Math.max(1, dayOfMonth);

        // Projection = current / days passed * days in month
        const dailyAvg = currentProfit / daysPassed;
        const projection = dailyAvg * daysInMonth;
        const remaining = Math.max(0, goal - currentProfit);
        const willHit = projection >= goal;

        document.getElementById('goalTargetDisplay') && (document.getElementById('goalTargetDisplay').textContent = `R$ ${money(goal)}`);
        document.getElementById('goalPercentDisplay') && (document.getElementById('goalPercentDisplay').textContent = `${percent.toFixed(1)}%`);
        document.getElementById('goalPercentDisplay') && (document.getElementById('goalPercentDisplay').style.color = percent >= 100 ? 'var(--success)' : '');
        document.getElementById('goalBarFill') && (document.getElementById('goalBarFill').style.width = `${percent}%`);
        document.getElementById('goalDaysLeft') && (document.getElementById('goalDaysLeft').textContent = daysLeft > 0 ? `${daysLeft} dias restantes` : 'Último dia do mês');
        // Animate SVG ring: circumference = 2π*34 ≈ 213.6
        const ring = document.getElementById('goalRingCircle');
        if(ring){ const circ = 213.6; ring.style.strokeDashoffset = (circ * (1 - percent/100)).toFixed(2); ring.style.stroke = percent >= 100 ? 'var(--success)' : 'url(#goalRingGrad)'; }
        document.getElementById('goalCurrentDisplay') && (document.getElementById('goalCurrentDisplay').textContent = `R$ ${money(currentProfit)}`);
        document.getElementById('goalRemainingDisplay') && (document.getElementById('goalRemainingDisplay').textContent = remaining > 0 ? `R$ ${money(remaining)}` : 'R$ 0,00');
        document.getElementById('goalProjection') && (document.getElementById('goalProjection').textContent = `R$ ${money(projection)}`);
        document.getElementById('goalProjection') && (document.getElementById('goalProjection').className = `goal-proj-val ${projection >= goal ? 'green' : 'red'}`);
        const msg = document.getElementById('goalStatusMsg');
        if(msg) {
          if(percent >= 100) { msg.textContent = '🎉 Meta batida! Parabéns!'; msg.style.color = 'var(--success)'; }
          else if(willHit) { msg.textContent = '✓ No ritmo atual você vai bater a meta!'; msg.style.color = 'var(--success)'; }
          else { msg.textContent = `⚠ Precisaria de R$ ${money(dailyAvg > 0 ? (goal - currentProfit) / Math.max(1,daysLeft) : 0)}/dia para bater a meta`; msg.style.color = 'var(--danger)'; }
        }
    }

    document.getElementById('goalTargetDisplay')?.addEventListener('click', () => {
        showPrompt('Definir nova meta mensal (R$):', (val) => {
            const newGoal = parseDecimal(val);
            if(newGoal > 0) {
                state.monthlyGoal = newGoal;
                saveDataImmediate();
                renderKPIs(); // Re-render to update goal
            }
        }, state.monthlyGoal);
    });

    function updateUI(){
      // Sincroniza os inputs de gastos com o estado, garantindo que a UI reflita o state
      const gp = document.getElementById('gastoProxy');
      const gn = document.getElementById('gastoNumeros');
      const gb = document.getElementById('gastoBot');
      const gcs = document.getElementById('gastoChinaSms');
      if(gp) gp.value = String(state.gastoProxy || 0).replace('.',',');
      if(gn) gn.value = String(state.gastoNumeros || 0).replace('.',',');
      if(gb) gb.value = String(state.gastoBot || 0).replace('.',',');
      if(gcs) gcs.value = String(state.gastoChinaSms || 0).replace('.',',');

      renderPlatformsList();
      
      const autoMarkCheck = document.getElementById('autoMarkCpfToggle');
      if(autoMarkCheck) autoMarkCheck.checked = state.autoMarkCpf || false;

      renderSummary();
      renderContas();
      renderDiasTabela();
      renderKPIs();
      renderNotas();
      renderFintech();
      renderPendingNotes();
      renderSmsPanel();
      // Adicionado para popular os serviços do ChinaSMS na primeira carga
      renderChinaSmsServices();
      renderFilterHeader();
    }
    
    let dailyChart = null;

    // --- Actions
    function selectView(view){
      // Persiste a aba atual para restaurar no F5
      try {
        const snapshot = { view };
        if (view === 'plataformaDetalhe') snapshot.platform = state.selectedPlatform || null;
        localStorage.setItem('lastView_v1', JSON.stringify(snapshot));
      } catch(e) {}

      // Mapa view → panelId
      const panelMap = {
        'dashboard':         'dashboardPanel',
        'gastos':            'gastosPanel',
        'plataformas':       'platGridPanel',       // grade de plataformas
        'plataformaDetalhe': 'plataformasPanel',    // detalhe de uma plataforma
        'dados':             'dadosPanel',
        'fintech':           'fintechPanel',
        'notasPendentes':    'notasPendentesPanel',
        'sms':               'smsPanel',
        'admin':             'adminPanel',
        'proxys':            'proxysPanel',
      };

      // Título da página
      const titles = { dashboard:'Dashboard', gastos:'Gastos', plataformas:'Plataformas',
        plataformaDetalhe: state.selectedPlatform || 'Plataforma',
        dados:'CPFs', fintech:'Fintech', notasPendentes:'Notas Pendentes',
        sms:'SMS', admin:'Admin', proxys:'Proxys' };
      document.getElementById('pageTitle').textContent = titles[view] || (view.charAt(0).toUpperCase()+view.slice(1));

      // Nav item ativo — "plataformaDetalhe" mantém "plataformas" ativo
      const navActive = view === 'plataformaDetalhe' ? 'plataformas' : view;
      document.querySelectorAll('nav .nav-item[data-view]').forEach(el => {
        el.classList.toggle('active', el.dataset.view === navActive);
      });

      const skelCards = document.getElementById('cardsContainer');
      const realCards = document.getElementById('realCards');
      const showCards = view === 'dashboard';
      if(skelCards) skelCards.style.display = 'none';
      if(realCards) realCards.style.display = showCards ? 'flex' : 'none';

      const targetPanel = panelMap[view];
      document.querySelectorAll('.panel').forEach(el => {
        if(el.id === targetPanel){
          el.style.display = 'block';
          el.classList.remove('panel-enter');
          void el.offsetWidth;
          el.classList.add('panel-enter');
        } else {
          el.style.display = 'none';
        }
      });

      if (view === 'admin' && typeof renderAdminPanel === 'function') renderAdminPanel();
      if (view === 'proxys') renderProxies();
      if (view === 'plataformas') renderPlatGrid();

      if (view === 'sms') {
        fetchAndDisplaySmsPrices();
        if (!smsUiInterval) {
            renderSmsActivations();
            smsUiInterval = setInterval(renderSmsActivations, 1000);
        }
      } else {
        if (smsUiInterval) { clearInterval(smsUiInterval); smsUiInterval = null; }
      }
    }
    window.selectView = selectView; // expõe para onclick nos botões de atalho do HTML

    window.clearActivityLogs = () => {
      const el = document.getElementById('activityLogsList');
      if (el) el.innerHTML = '<div class="muted" style="font-size:12px">Log limpo.</div>';
    };

    function selectPlatform(name){
      state.selectedPlatform = name; scheduleSave();
      // switch to platform detail view
      selectView('plataformaDetalhe');
      document.getElementById('plataformaTitle').textContent = name;
      updateUI();
      // Fecha sidebar no mobile
      if (window.innerWidth <= 768) {
        document.querySelector('aside')?.classList.remove('open');
        document.getElementById('sidebarOverlay')?.classList.remove('open');
        const mmb = document.getElementById('mobileMenuBtn');
        if (mmb) mmb.textContent = '☰';
      }
    }

    // --- Event listeners (buttons, inputs)
    // Criação de plataforma movida para a aba de Plataformas (openPlatNewModal)

    document.getElementById('addContaBtn').onclick = ()=>{
      const p = state.selectedPlatform || Object.keys(state.platforms)[0];
      if(!p) return showToast('Crie uma plataforma primeiro', 'error');
      state.platforms[p].accounts.push({deposito:0,redeposito:0,saque:0, bau:0});
      scheduleSave(); updateUI(); renderContas();
      setTimeout(() => {
        const firstInput = document.querySelector('#contasTable tbody tr:last-child .inp.deposito');
        if(firstInput) firstInput.focus();
      }, 100);
    }

    document.getElementById('searchAccounts')?.addEventListener('input', () => {
        renderContas();
    });

    document.getElementById('searchPlatforms').addEventListener('input', renderPlatformsList);

    document.querySelectorAll('nav .nav-item').forEach(it=>{
      it.addEventListener('click',()=>{
        selectView(it.dataset.view);
        // Fecha sidebar no mobile após clicar em item de navegação
        if (window.innerWidth <= 768) {
          document.querySelector('aside').classList.remove('open');
          document.getElementById('sidebarOverlay').classList.remove('open');
        }
      });
    });

    // --- Mobile Menu (Hambúrguer) ---
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebarEl = document.querySelector('aside');
    const overlayEl = document.getElementById('sidebarOverlay');

    function openSidebar() {
      sidebarEl.classList.add('open');
      overlayEl.classList.add('open');
      mobileMenuBtn.textContent = '✕';
    }

    function closeSidebar() {
      sidebarEl.classList.remove('open');
      overlayEl.classList.remove('open');
      mobileMenuBtn.textContent = '☰';
    }

    mobileMenuBtn?.addEventListener('click', () => {
      if (sidebarEl.classList.contains('open')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });

    // Fechar sidebar ao clicar no overlay
    overlayEl?.addEventListener('click', closeSidebar);

    // Fechar sidebar ao apertar ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && sidebarEl.classList.contains('open')) {
        closeSidebar();
      }
    });

    // Fechar sidebar se janela aumentar (ex: rotação de tela)
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        sidebarEl.classList.remove('open');
        overlayEl.classList.remove('open');
        mobileMenuBtn.textContent = '☰';
      }
    });

    const sortDropdown = document.getElementById('sortPlatforms');
    if(sortDropdown) {
      sortDropdown.addEventListener('change', () => {
        renderSummary();
      });
    }

    document.getElementById('showKpiBtn').addEventListener('click', () => {
        document.getElementById('kpiContainer').style.display = 'block';
        document.getElementById('chartContainer').style.display = 'none';
        document.getElementById('showKpiBtn').classList.add('active');
        document.getElementById('showChartBtn').classList.remove('active');
    });

    document.getElementById('showChartBtn').addEventListener('click', () => {
        document.getElementById('kpiContainer').style.display = 'none';
        document.getElementById('chartContainer').style.display = 'block';
        document.getElementById('showChartBtn').classList.add('active');
        document.getElementById('showKpiBtn').classList.remove('active');
        renderDailyProfitChart(); // Render chart when shown
    });

    function renderDailyProfitChart() {
        const ctx = document.getElementById('dailyProfitChart').getContext('2d');
        if (!ctx) return;

        const isDark = document.body.classList.contains('dark');
        const textColor = isDark ? '#9ca3af' : '#6b7684';
        const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
        const cardBg = isDark ? '#1a1d22' : '#ffffff';
        const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
        const cardText = isDark ? '#e6eef8' : '#17233b';

        const records = getFilteredRecords();
        const sortedKeys = Object.keys(records).sort((a, b) => a.localeCompare(b));
        const labels = sortedKeys.map(key => key.split('-')[2]);
        const daily = sortedKeys.map(key => records[key].lucroLiquido);

        // Build accumulated series
        let accum = 0;
        const accumulated = daily.map(v => { accum += v; return accum; });

        if (dailyChart) dailyChart.destroy();

        // Custom tooltip plugin
        const tooltipPlugin = {
            id: 'customTooltip',
            afterDraw(chart) {
                const {ctx: c, chartArea, tooltip} = chart;
                if (!tooltip || !tooltip.dataPoints || !tooltip.dataPoints.length) return;
                const dp = tooltip.dataPoints.find(p => p.datasetIndex === 0) || tooltip.dataPoints[0];
                const x = dp.element.x;
                const dailyVal = daily[dp.dataIndex] ?? 0;
                const accumVal = accumulated[dp.dataIndex] ?? 0;
                const label = labels[dp.dataIndex] ?? '';
                const tw = 160, th = 68, pad = 10;
                let tx = x - tw / 2;
                if (tx < chartArea.left) tx = chartArea.left;
                if (tx + tw > chartArea.right) tx = chartArea.right - tw;
                const ty = chartArea.top + 8;
                c.save();
                c.fillStyle = cardBg;
                c.strokeStyle = cardBorder;
                c.lineWidth = 0.5;
                c.beginPath();
                if (c.roundRect) c.roundRect(tx, ty, tw, th, 8);
                else c.rect(tx, ty, tw, th);
                c.fill(); c.stroke();
                const isPos = dailyVal >= 0;
                c.fillStyle = isPos ? '#17b169' : '#ff4d4f';
                c.font = `500 14px 'DM Sans', sans-serif`;
                c.fillText(`${isPos ? '+' : ''}R$ ${money(dailyVal)}`, tx + pad, ty + 24);
                c.fillStyle = textColor;
                c.font = `11px 'DM Sans', sans-serif`;
                c.fillText(`Dia ${label} · diário`, tx + pad, ty + 40);
                c.fillStyle = '#2b7be4';
                c.font = `11px 'DM Sans', sans-serif`;
                c.fillText(`Acumulado: R$ ${money(accumVal)}`, tx + pad, ty + 57);
                c.restore();
            }
        };

        dailyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        type: 'bar',
                        label: 'Lucro diário',
                        data: daily,
                        backgroundColor: daily.map(v => v >= 0 ? 'rgba(23,177,105,0.8)' : 'rgba(255,77,79,0.8)'),
                        hoverBackgroundColor: daily.map(v => v >= 0 ? 'rgba(23,177,105,1)' : 'rgba(255,77,79,1)'),
                        borderRadius: 4,
                        borderSkipped: false,
                        barPercentage: 0.6,
                        categoryPercentage: 0.8,
                        yAxisID: 'y',
                        order: 2
                    },
                    {
                        type: 'line',
                        label: 'Acumulado',
                        data: accumulated,
                        borderColor: '#2b7be4',
                        backgroundColor: 'rgba(43,123,228,0.07)',
                        borderWidth: 2,
                        pointRadius: 3,
                        pointBackgroundColor: '#2b7be4',
                        pointHoverRadius: 5,
                        tension: 0.35,
                        fill: true,
                        yAxisID: 'y1',
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        position: 'left',
                        grid: { color: gridColor, drawBorder: false },
                        ticks: {
                            color: textColor,
                            font: { family: "'DM Sans', sans-serif", size: 11 },
                            callback: v => 'R$' + v.toLocaleString('pt-BR')
                        }
                    },
                    y1: {
                        position: 'right',
                        grid: { display: false },
                        ticks: {
                            color: '#2b7be4',
                            font: { family: "'DM Sans', sans-serif", size: 11 },
                            callback: v => 'R$' + v.toLocaleString('pt-BR')
                        }
                    },
                    x: {
                        grid: { display: false },
                        ticks: {
                            color: textColor,
                            font: { family: "'DM Sans', sans-serif", size: 11 },
                            autoSkip: true, maxTicksLimit: 15
                        }
                    }
                },
                interaction: { mode: 'index', intersect: false },
                animation: { duration: 600, easing: 'easeOutQuart' }
            },
            plugins: [tooltipPlugin]
        });
    }

    document.getElementById('addNotaBtn').onclick = ()=>{
      document.getElementById('cpfModal').style.display = 'block';
      setTimeout(() => document.getElementById('cpfImportArea').focus(), 100);
    };

    // --- Backup Logic
    document.getElementById('btnExportData').addEventListener('click', () => { window.exportData(); });
    document.getElementById('btnExportCsv')?.addEventListener('click', () => { window.exportCsv(); });
    document.getElementById('btnExportXlsx')?.addEventListener('click', () => { window.exportXlsx(); });
    
    document.getElementById('importFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => { window.importData(ev.target.result); };
        reader.readAsText(file);
    });

    document.getElementById('importDataHeaderBtn').addEventListener('click', () => {
        document.getElementById('importFile').click();
    });

    document.getElementById('autoMarkCpfToggle')?.addEventListener('change', (e) => {
        state.autoMarkCpf = e.target.checked;
        saveDataImmediate();
    });

    let cpfFilter = 'all';
    window.setCpfFilter = (btn, filter) => {
      cpfFilter = filter;
      cpfPage = 0; // reset to first page on filter change
      document.querySelectorAll('.cpf-filter-chip').forEach(b => b.classList.remove('active','green','red'));
      btn.classList.add('active');
      if(filter === 'avail') btn.classList.add('green');
      if(filter === 'used') btn.classList.add('red');
      renderNotas();
    };

    let cpfSelectAll = false;
    window.toggleSelectAllCpf = () => {
      cpfSelectAll = !cpfSelectAll;
      document.getElementById('selectAllCpfBtn').textContent = cpfSelectAll ? '☑ Desmarcar todos' : '☐ Selecionar todos';
      document.querySelectorAll('.cpf-checkbox').forEach(cb => cb.checked = cpfSelectAll);
      document.getElementById('copySelectedCpfBtn').style.display = cpfSelectAll ? '' : 'none';
    };

    window.copySelectedCpfs = () => {
      const selected = [];
      document.querySelectorAll('.cpf-checkbox:checked').forEach((cb, idx) => {
        const card = cb.closest('.note-card');
        if(card) selected.push(card.dataset.cpf);
      });
      if(!selected.length) return showToast('Nenhum CPF selecionado', 'error');
      navigator.clipboard.writeText(selected.join('\n')).then(() => {
        showToast(`${selected.length} CPF(s) copiados!`, 'success');
      }).catch(() => showToast('Não foi possível copiar', 'error'));
    };

    window.exportCpfCsv = () => {
      const available = state.notas.filter(n => !n.used);
      if(!available.length) return showToast('Nenhum CPF disponível para exportar', 'error');
      const csv = 'CPF\n' + available.map(n => n.text).join('\n');
      const a = document.createElement('a');
      a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
      a.download = 'cpfs_disponiveis_' + new Date().toISOString().slice(0,10) + '.csv';
      a.click();
      showToast(`${available.length} CPFs exportados!`, 'success');
    };

    function renderNotas(){
      const container = document.getElementById('notasList');
      if(!container) return;
      container.innerHTML = '';

      const searchTerm = document.getElementById('searchCpf') ? document.getElementById('searchCpf').value.toLowerCase() : '';
      const total = (state.notas || []).length;
      const available = (state.notas || []).filter(n => !n.used).length;
      const used = total - available;
      const usePct = total > 0 ? Math.round((used / total) * 100) : 0;

      // Update stats bar
      const avEl = document.getElementById('cpfAvailCount');
      const usEl = document.getElementById('cpfUsedCount');
      const totEl = document.getElementById('cpfTotalCount');
      const pctEl = document.getElementById('cpfUsePct');
      const fillEl = document.getElementById('cpfUseFill');
      if(avEl) avEl.textContent = available;
      if(usEl) usEl.textContent = used;
      if(totEl) totEl.textContent = total;
      if(pctEl) pctEl.textContent = usePct + '% utilizados';
      if(fillEl) fillEl.style.width = usePct + '%';

      // Update filter chip labels
      document.querySelectorAll('.cpf-filter-chip').forEach(chip => {
        const f = chip.dataset.filter;
        if(f === 'all') chip.textContent = `Todos (${total})`;
        if(f === 'avail') chip.textContent = `Disponíveis (${available})`;
        if(f === 'used') chip.textContent = `Usados (${used})`;
      });

      let filteredNotas = (state.notas || []).filter(n => {
        if(cpfFilter === 'avail' && n.used) return false;
        if(cpfFilter === 'used' && !n.used) return false;
        if(searchTerm && !(n.text && n.text.toLowerCase().includes(searchTerm))) return false;
        return true;
      });

      if(filteredNotas.length === 0){
        container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👤</div><div class="empty-state-title">Nenhum CPF encontrado</div><div class="empty-state-sub">${searchTerm ? 'Tente outro termo de busca' : 'Adicione CPFs clicando no botão acima'}</div></div>`;
        return;
      }

      // Paginação — clamp page to valid range
      const totalPages = getCpfTotalPages(filteredNotas);
      if(cpfPage >= totalPages) cpfPage = totalPages - 1;
      if(cpfPage < 0) cpfPage = 0;
      const pageSlice = filteredNotas.slice(cpfPage * CPF_PAGE_SIZE, (cpfPage + 1) * CPF_PAGE_SIZE);

      pageSlice.forEach((nota) => {
        const i = state.notas.indexOf(nota);
        const card = document.createElement('div');
        card.className = 'note-card' + (nota.used ? ' used' : '');
        card.dataset.cpf = nota.text || '';

        // Click card = copy
        card.onclick = (e) => {
          if(e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
          if(!nota.text) return;
          navigator.clipboard.writeText(nota.text).then(() => {
            showToast('CPF copiado!', 'success');
            if(state.autoMarkCpf && !nota.used) {
              state.notas[i].used = true;
              saveDataImmediate(); renderNotas(); renderSummary();
            }
          }).catch(() => showToast('Não foi possível copiar', 'error'));
        };

        const cpfText = document.createElement('div');
        cpfText.className = 'cpf-text';
        cpfText.textContent = nota.text || 'CPF não informado';

        const tag = document.createElement('span');
        tag.className = 'cpf-status-tag ' + (nota.used ? 'used-tag' : 'avail');
        tag.textContent = nota.used ? '✓ Usado' : 'Disponível';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'cpf-checkbox';
        checkbox.checked = nota.used || false;
        checkbox.title = 'Marcar como usado';
        checkbox.style.cssText = 'width:16px;height:16px;cursor:pointer;flex-shrink:0';
        checkbox.addEventListener('change', () => {
          const wasUsed = nota.used;
          state.notas[i].used = checkbox.checked;
          saveDataImmediate(); renderNotas(); renderSummary();
          if(!wasUsed && checkbox.checked) {
            showUndoToast('CPF marcado como usado', nota.text || '', () => {
              state.notas[i].used = false;
              saveDataImmediate(); renderNotas(); renderSummary();
            });
          }
        });

        const editBtn = document.createElement('button');
        editBtn.innerHTML = '✏️';
        editBtn.className = 'btn ghost';
        editBtn.style.cssText = 'padding:4px 8px;font-size:12px;flex-shrink:0';
        editBtn.title = 'Editar CPF';
        editBtn.onclick = (e) => {
          e.stopPropagation();
          showPrompt('Editar CPF:', (newVal) => {
            if(newVal && newVal.trim() !== '') {
              state.notas[i].text = newVal.trim();
              saveDataImmediate(); renderNotas();
            }
          }, nota.text);
        };

        card.appendChild(cpfText);
        card.appendChild(tag);
        card.appendChild(editBtn);
        card.appendChild(checkbox);
        container.appendChild(card);
      });

      renderCpfPagination(filteredNotas);
    }

    document.getElementById('searchCpf')?.addEventListener('input', () => { cpfPage = 0; renderNotas(); });
    document.getElementById('exportCpfCsvBtn')?.addEventListener('click', () => window.exportCpfCsv());

    document.getElementById('confirmCpfImport').addEventListener('click', async ()=>{
      const textarea = document.getElementById('cpfImportArea');
      const text = textarea.value.trim();
      if(!text) return showToast('Cole os CPFs no campo.', 'error');

      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      if(lines.length === 0) return showToast('Nenhum CPF válido encontrado.', 'error');

      let addedCount = 0;
      const existing = new Set(state.notas.map(n => n.text));

      lines.forEach(cpf => {
        if(!existing.has(cpf)) {
            state.notas.unshift({text: cpf, used: false, createdAt: new Date().toISOString()});
            existing.add(cpf);
            addedCount++;
        }
      });

      textarea.value = '';
      saveData();
      renderSummary();
      renderNotas();
      document.getElementById('cpfModal').style.display = 'none';
      showToast(`${addedCount} CPF(s) importado(s) com sucesso! (${lines.length - addedCount} duplicados ignorados)`, 'success');
    });

    document.getElementById('removeUsedBtn').addEventListener('click', ()=>{
      const usedCount = state.notas.filter(n => n.used).length;
      if(usedCount === 0) return showToast('Nenhum CPF marcado como usado.', 'info');
      
      showConfirm(`Remover <strong>${usedCount}</strong> CPF(s) marcado(s) como usado?`, () => {
        state.notas = state.notas.filter(n => !n.used);
        saveData();
        renderSummary();
        renderNotas();
      }, { isDanger: true, title: 'Remover CPFs Usados' });
    });

    function renderFintech(){
      const tbody = document.querySelector('#fintechTable tbody');
      if(!tbody) return;
      tbody.innerHTML = '';

      let totalFinal = 0;

      // Render 25% Accounts
      state.fintechAccounts.forEach((acc, i) => {
        const saque = Number(acc.saque) || 0;
        const valorFinal = saque * 0.75;
        totalFinal += valorFinal;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><input type="text" class="inp-name" value="${acc.name || ''}" placeholder="Nome da conta" style="width:100%;padding:8px;border-radius:6px;border:1px solid #e6edf6" /></td>
          <td><input type="text" inputmode="decimal" class="inp-saque" value="${String(saque).replace('.',',')}" style="width:120px;padding:8px;border-radius:6px;border:1px solid #e6edf6" /></td>
          <td class="valor-final lucro">R$ ${money(valorFinal)}</td>
          <td class="actions"><button class="btn ghost del-fintech">X</button></td>
        `;

        tr.querySelector('.inp-name').addEventListener('input', (e) => {
          state.fintechAccounts[i].name = e.target.value;
          scheduleSave();
        });

        tr.querySelector('.inp-saque').addEventListener('input', (e) => {
          const newSaque = parseDecimal(e.target.value);
          state.fintechAccounts[i].saque = newSaque;

          const newValorFinal = newSaque * 0.75;
          const valorFinalCell = tr.querySelector('.valor-final');
          valorFinalCell.textContent = `R$ ${money(newValorFinal)}`;

          updateFintechTotal();
          scheduleSave();
          renderSummary();
        });

        tr.querySelector('.del-fintech').addEventListener('click', () => {
          showConfirm('Tem certeza que deseja remover esta conta Fintech?', () => {
              state.fintechAccounts.splice(i, 1);
              scheduleSave();
              renderFintech();
              renderSummary();
          }, { isDanger: true, title: 'Remover Conta Fintech' });
        });

        tbody.appendChild(tr);
      });

      const totalEl = document.getElementById('fintechTotal');
      if(totalEl) totalEl.textContent = `R$ ${money(totalFinal)}`;
    }

    function updateFintechTotal() {
        let total = 0;
        state.fintechAccounts.forEach(acc => total += (Number(acc.saque)||0) * 0.75);
        const totalEl = document.getElementById('fintechTotal');
        if(totalEl) totalEl.textContent = `R$ ${money(total)}`;
    }

    document.getElementById('addFintechBtn').addEventListener('click', () => {
      state.fintechAccounts.push({ name: '', saque: 0 });
      scheduleSave();
      renderFintech();
    });

    // gastos inputs
    document.getElementById('gastoProxy').addEventListener('input', (e)=>{
      const val = parseDecimal(e.target.value);
      if(val < 0) {
        e.target.value = '0';
        showToast('Valores negativos não são permitidos', 'error');
        return;
      }
      state.gastoProxy = val;
      scheduleSave();
      renderSummary();
      renderDiasTabela();
    });

    document.getElementById('gastoNumeros').addEventListener('input', (e)=>{
      const val = parseDecimal(e.target.value);
      if(val < 0) {
        e.target.value = '0';
        showToast('Valores negativos não são permitidos', 'error');
        return;
      }
      state.gastoNumeros = val;
      scheduleSave();
      renderSummary();
      renderDiasTabela();
    });

    document.getElementById('gastoBot').addEventListener('input', (e)=>{
      const val = parseDecimal(e.target.value);
      if(val < 0) {
        e.target.value = '0';
        showToast('Valores negativos não são permitidos', 'error');
        return;
      }
      state.gastoBot = val;
      scheduleSave();
      renderSummary();
      renderDiasTabela();
    });

    document.getElementById('gastoChinaSms').addEventListener('input', (e)=>{
      const val = parseDecimal(e.target.value);
      if(val < 0) {
        e.target.value = '0';
        showToast('Valores negativos não são permitidos', 'error');
        return;
      }
      state.gastoChinaSms = val;
      scheduleSave();
      renderSummary();
      renderDiasTabela();
    });

    // fechar HOJE — seleciona o dia atual automaticamente
    document.getElementById('fecharHojeBtn').addEventListener('click', () => {
      const hoje = new Date().getDate();
      const sel = document.getElementById('diaSelecionado');
      sel.value = String(hoje);
      document.getElementById('fecharDiaBtn').click();
    });

    // fechar dia button (OPÇÃO B — manual)
    document.getElementById('fecharDiaBtn').addEventListener('click', ()=>{
      const diaSel = document.getElementById('diaSelecionado').value;
      if(!diaSel){
        return showToast('Selecione o dia do mês que deseja fechar.', 'error');
      }

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const day = Number(diaSel);
      const dateKey = formatDateKey(year, month, day);

      // Calcula o lucro bruto total, incluindo plataformas e fintech
      let totalLucroPlataformas = 0;
      Object.values(state.platforms).forEach(p=>{
        totalLucroPlataformas += p.accounts.reduce((s,a)=>
    s + (((a.saque||0) + (a.bau||0)) - ((a.deposito||0)+(a.redeposito||0))), 0);
      });

      let totalFintech = 0;
      if(state.fintechAccounts){
        state.fintechAccounts.forEach(acc => {
          totalFintech += (Number(acc.saque) || 0) * 0.75;
        });
      }

      const totalLucro = totalLucroPlataformas + totalFintech;
      const gastos = Number(state.gastoProxy||0) + Number(state.gastoNumeros||0) + Number(state.gastoBot||0) + Number(state.gastoChinaSms||0);
      const lucroFinal = totalLucro - gastos;

      const message = `Deseja fechar o dia <strong>${dateKey}</strong>?<br><br>
                       Lucro Bruto: R$ ${totalLucro.toFixed(2)}<br>
                       Gastos: R$ ${gastos.toFixed(2)}<br>
                       <strong>Lucro Líquido: R$ ${lucroFinal.toFixed(2)}</strong><br><br>
                       <strong style="color:var(--danger)">ATENÇÃO:</strong> Todos os valores de plataformas, fintech e gastos serão <strong>ZERADOS</strong>. Esta ação é irreversível.`;

      showConfirm(message, () => {
          state.dailyRecords[dateKey] = {
            lucroBruto: totalLucro,
            gastos: gastos,
            lucroLiquido: lucroFinal,
            savedAt: new Date().toISOString()
          };

          // Mover notas existentes para a aba Notas Pendentes
          Object.values(state.platforms).forEach(p => {
            p.accounts.forEach(acc => {
              if (acc.notes && acc.notes.length > 0) {
                acc.notes.forEach(note => {
                  state.pendingNotes.push({
                    platform: p.name,
                    account: acc.name || 'Conta sem nome',
                    text: note,
                    date: dateKey,
                    savedAt: new Date().toISOString()
                  });
                });
              }
            });
          });

          state.gastoProxy = 0;
          state.gastoNumeros = 0;
          state.gastoBot = 0;
          state.gastoChinaSms = 0;
          state.platforms = {};
          state.platformOrder = [];
          state.selectedPlatform = null;
          state.fintechAccounts = [];
          saveDataImmediate();
          updateUI();
      }, { isDanger: true, title: 'Fechar o Dia e Zerar Contas?', okText: 'Sim, Fechar o Dia' });
    });

    // limpar histórico (opcional)
    document.getElementById('limparHistoricoBtn').addEventListener('click', ()=>{
      showConfirm('Deseja limpar <strong>TODO</strong> o histórico diário? <br><br>Esta ação é irreversível.', () => {
          state.dailyRecords = {};
          saveDataImmediate();
          updateUI();
      }, { isDanger: true, title: 'Limpar Histórico' });
    });

    // populate day select (1..31)
    function populateDaySelect(){
      const sel = document.getElementById('diaSelecionado');
      sel.innerHTML = '<option value="">Selecione o dia</option>';
      for(let i=1;i<=31;i++){
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = String(i);
        sel.appendChild(opt);
      }
    }

    // --- Filter Logic
    let filterDate = new Date();
    let periodFilter = 'mes'; // 'mes' | '7d' | '30d' | '90d' | 'tudo'

    window.setPeriodFilter = (btn, period) => {
      periodFilter = period;
      document.querySelectorAll('.period-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Show/hide month nav based on period
      const monthNav = document.querySelector('.daily-box .btn.ghost[id="btnPrevMonth"]')?.parentElement;
      const navWrap = document.getElementById('btnPrevMonth')?.parentElement;
      if(navWrap) navWrap.style.display = period === 'mes' ? 'flex' : 'none';
      renderDiasTabela(); renderKPIs(); renderDailyProfitChart();
    };

    function getFilteredRecords() {
      const allKeys = Object.keys(state.dailyRecords);
      if(periodFilter === 'tudo') return { ...state.dailyRecords };

      if(periodFilter === 'mes') {
        const year = filterDate.getFullYear();
        const month = String(filterDate.getMonth() + 1).padStart(2, '0');
        const prefix = `${year}-${month}-`;
        const filtered = {};
        allKeys.forEach(key => { if(key.startsWith(prefix)) filtered[key] = state.dailyRecords[key]; });
        return filtered;
      }

      const days = periodFilter === '7d' ? 7 : periodFilter === '30d' ? 30 : 90;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().slice(0,10);
      const filtered = {};
      allKeys.forEach(key => { if(key >= cutoffStr) filtered[key] = state.dailyRecords[key]; });
      return filtered;
    }

    function renderFilterHeader() {
      const el = document.getElementById('displayMonthYear');
      if(el) {
        const opt = { month: 'long', year: 'numeric' };
        el.textContent = filterDate.toLocaleDateString('pt-BR', opt);
      }
      const title = document.getElementById('lucroMesTitle');
      if(title) {
         const monthName = filterDate.toLocaleDateString('pt-BR', { month: 'long' });
         title.textContent = `Lucro de ${monthName.charAt(0).toUpperCase() + monthName.slice(1)} (Dias Fechados)`;
      }
    }

    document.getElementById('btnPrevMonth').addEventListener('click', () => {
      filterDate.setMonth(filterDate.getMonth() - 1);
      periodFilter = 'mes';
      document.querySelectorAll('.period-chip').forEach(b => b.classList.remove('active'));
      document.querySelector('.period-chip[data-period="mes"]')?.classList.add('active');
      updateUI();
    });
    document.getElementById('btnNextMonth').addEventListener('click', () => {
      filterDate.setMonth(filterDate.getMonth() + 1);
      periodFilter = 'mes';
      document.querySelectorAll('.period-chip').forEach(b => b.classList.remove('active'));
      document.querySelector('.period-chip[data-period="mes"]')?.classList.add('active');
      updateUI();
    });

    // --- Custom Modal Logic
    let confirmCallback = null;

    function showConfirm(message, onConfirm, {title = 'Confirmação', okText = 'Confirmar', cancelText = 'Cancelar', isDanger = false, hideCancel = false} = {}) {
        document.getElementById('confirmModalTitle').textContent = title;
        document.getElementById('confirmModalText').innerHTML = message;
        
        const iconEl = document.getElementById('confirmModalIcon');
        if(isDanger){
          iconEl.style.display = 'flex';
          iconEl.className = 'modal-icon-big danger';
          iconEl.textContent = '🗑️';
        } else {
          iconEl.style.display = 'none';
        }

        const okBtn = document.getElementById('confirmOkBtn');
        const cancelBtn = document.getElementById('confirmCancelBtn');

        okBtn.textContent = okText;
        cancelBtn.textContent = cancelText;

        okBtn.classList.remove('danger');
        if (isDanger) okBtn.classList.add('danger');
        
        cancelBtn.style.display = hideCancel ? 'none' : 'block';

        confirmCallback = onConfirm;
        document.getElementById('confirmModal').style.display = 'block';
    }
    
    // Atalho para alertas simples (sem botão cancelar)
    window.showAlert = (message, {title = 'Aviso', okText = 'OK'} = {}) => {
        showConfirm(message, null, {title, okText, cancelText: '', hideCancel: true});
    }

    function hideConfirm() {
        document.getElementById('confirmModal').style.display = 'none';
        confirmCallback = null;
    }

    document.getElementById('confirmOkBtn').addEventListener('click', () => {
        if (typeof confirmCallback === 'function') {
            confirmCallback();
        }
        hideConfirm();
    });
    document.getElementById('confirmCancelBtn').addEventListener('click', hideConfirm);
    document.getElementById('closeConfirmModal').addEventListener('click', hideConfirm);
    
    // --- Custom Prompt Logic
    let promptCallback = null;

    function showPrompt(message, onConfirm, defaultValue = '') {
        document.getElementById('promptModalTitle').textContent = 'Entrada de Dados';
        document.getElementById('promptModalText').textContent = message;
        const input = document.getElementById('promptInput');
        input.value = defaultValue;
        
        promptCallback = onConfirm;
        document.getElementById('promptModal').style.display = 'block';
        setTimeout(() => input.focus(), 100);
    }

    function hidePrompt() {
        document.getElementById('promptModal').style.display = 'none';
        promptCallback = null;
    }

    document.getElementById('promptOkBtn').addEventListener('click', () => {
        const val = document.getElementById('promptInput').value;
        if (typeof promptCallback === 'function') {
            promptCallback(val);
        }
        hidePrompt();
    });
    document.getElementById('promptCancelBtn').addEventListener('click', hidePrompt);
    document.getElementById('closePromptModal').addEventListener('click', hidePrompt);
    
    // CPF Modal Logic
    const closeCpfModal = () => document.getElementById('cpfModal').style.display = 'none';
    document.getElementById('closeCpfModal').addEventListener('click', closeCpfModal);
    document.getElementById('cancelCpfImport').addEventListener('click', closeCpfModal);

    // Allow Enter key in prompt
    document.getElementById('promptInput').addEventListener('keydown', (e) => {
        if(e.key === 'Enter') document.getElementById('promptOkBtn').click();
    });
    
    window.onclick = (event) => {
      if (event.target == document.getElementById('notesModal')) {
        document.getElementById('notesModal').style.display = 'none';
      }
      if (event.target == document.getElementById('confirmModal')) {
        hideConfirm();
      }
      if (event.target == document.getElementById('promptModal')) {
        hidePrompt();
      }
      if (event.target == document.getElementById('moveAccountModal')) {
        document.getElementById('moveAccountModal').style.display = 'none';
      }
      if (event.target == document.getElementById('cpfModal')) {
        document.getElementById('cpfModal').style.display = 'none';
      }
    };
    // --- End Custom Modal Logic

    // --- Move Account Logic
    let accountToMoveIndex = null;
    
    window.openMoveModal = (index) => {
        accountToMoveIndex = index;
        const list = document.getElementById('moveTargetList');
        list.innerHTML = '';
        
        const currentPlat = state.selectedPlatform;
        const targets = (state.platformOrder || Object.keys(state.platforms)).filter(p => p !== currentPlat);
        
        if(targets.length === 0) {
            list.innerHTML = '<div class="muted">Nenhuma outra plataforma disponível.</div>';
        }

        targets.forEach(pName => {
            const btn = document.createElement('button');
            btn.className = 'btn ghost';
            btn.style.textAlign = 'left';
            btn.style.border = '1px solid #e6edf6';
            btn.textContent = pName;
            btn.onclick = () => {
                const acc = state.platforms[currentPlat].accounts.splice(accountToMoveIndex, 1)[0];
                state.platforms[pName].accounts.push(acc);
                scheduleSave();
                document.getElementById('moveAccountModal').style.display = 'none';
                renderContas();
                renderPlatformsList();
                renderSummary();
                showToast(`Conta movida para ${pName}`, 'success');
            };
            list.appendChild(btn);
        });
        
        document.getElementById('moveAccountModal').style.display = 'block';
    };
    
    document.getElementById('closeMoveModal').onclick = () => {
        document.getElementById('moveAccountModal').style.display = 'none';
    };

    // --- Notas por Conta Logic
    let currentEditingAccount = { platform: null, index: null };

    function openNotesModal(platform, index) {
      currentEditingAccount = { platform, index };
      const acc = state.platforms[platform].accounts[index];
      if(!acc.notes) acc.notes = [];

      document.getElementById('modalTitle').textContent = `Notas: ${acc.name || 'Conta ' + (index + 1)}`;
      renderAccountNotes();
      document.getElementById('notesModal').style.display = 'block';
    }

    function renderAccountNotes() {
      const container = document.getElementById('accountNotesList');
      container.innerHTML = '';
      const acc = state.platforms[currentEditingAccount.platform].accounts[currentEditingAccount.index];

      if(!acc.notes || acc.notes.length === 0) {
        container.innerHTML = '<div class="muted" style="text-align:center;padding:20px">Nenhuma nota adicionada.</div>';
        return;
      }

      acc.notes.forEach((note, i) => {
        const div = document.createElement('div');
        div.className = 'note-item';
        div.innerHTML = `<span>${note}</span><button class="btn ghost" style="padding:2px 6px;color:var(--danger);border-color:transparent" onclick="deleteAccountNote(${i})">remover</button>`;
        container.appendChild(div);
      });
    }

    window.deleteAccountNote = (i) => {
      const acc = state.platforms[currentEditingAccount.platform].accounts[currentEditingAccount.index];
      acc.notes.splice(i, 1);
      scheduleSave();
      renderAccountNotes();
      renderContas();
    };

    document.getElementById('saveAccountNoteBtn').onclick = () => {
      const input = document.getElementById('newAccountNote');
      const text = input.value.trim();
      if(!text) return;

      const acc = state.platforms[currentEditingAccount.platform].accounts[currentEditingAccount.index];
      if(!acc.notes) acc.notes = [];
      acc.notes.push(text);

      input.value = '';
      scheduleSave();
      renderAccountNotes();
      renderContas();
    };

    document.getElementById('closeNotesModal').onclick = () => {
      document.getElementById('notesModal').style.display = 'none';
    };

    // --- Pending Notes Logic
    function renderPendingNotes(){
      const container = document.getElementById('pendingNotesList');
      if(!container) return;
      container.innerHTML = '';
      
      if(!state.pendingNotes || state.pendingNotes.length === 0) {
        container.innerHTML = '<div class="muted" style="text-align:center;padding:40px">Nenhuma nota pendente.</div>';
        updateSidebarBadge();
        return;
      }

      state.pendingNotes.forEach((note, i) => {
        const el = document.createElement('div');
        el.className = 'note-card';
        el.innerHTML = `
          <div style="flex:1">
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 8px;">
              <span style="color: var(--muted); font-weight: 500;">Usuário:</span> ${note.account}
            </div>
            <div style="font-size:14px; color:inherit; padding-left: 10px; border-left: 3px solid var(--accent); margin-bottom: 8px;">
              ${note.text}
            </div>
            <div style="font-size:12px; color:var(--muted);">
              <strong>${note.platform}</strong> • ${note.date}
            </div>
          </div>
          <button class="btn ghost" style="color:var(--danger);border-color:transparent" onclick="deletePendingNote(${i})">Resolver</button>
        `;
        container.appendChild(el);
      });
      
      updateSidebarBadge();
    }

    window.deletePendingNote = (i) => {
        showConfirm('Marcar nota como resolvida/remover?', () => {
            state.pendingNotes.splice(i, 1);
            scheduleSave();
            renderPendingNotes();
        }, { title: 'Resolver Nota' });
    };

    function updateSidebarBadge() {
        const count = state.pendingNotes ? state.pendingNotes.length : 0;
        const badge = document.getElementById('navPendingBadge');
        if(badge) {
            const prev = parseInt(badge.textContent) || 0;
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
            // Pulsa quando o número aumenta
            if(count > prev && count > 0) {
                badge.style.animation = 'none';
                void badge.offsetWidth;
                badge.style.animation = 'badgePop 0.4s cubic-bezier(0.36,0.07,0.19,0.97)';
            }
        }
    }

    // --- Admin Logic (Simplificado para Cloud: Desativado por enquanto)
    let adminUsersCache = []; // Cache para facilitar a aprovação

    window.renderAdminPanel = async function() {
      const container = document.getElementById('adminPanel');
      if(!container) return;
      
      container.innerHTML = '<div class="muted">Carregando dados do servidor...</div>';

      // Busca todos os dados da tabela user_data
      const { data, error } = await supabase
        .from('user_data')
        .select('user_id, updated_at, content');

      if(error) {
        container.innerHTML = `
          <div style="color:var(--danger); padding:15px; border:1px solid var(--danger); border-radius:8px; background:rgba(255,0,0,0.05)">
            <strong>Erro de Permissão:</strong> O Supabase bloqueou o acesso aos dados dos outros usuários.<br><br>
            Para corrigir, vá no <strong>SQL Editor</strong> do Supabase e rode este comando:<br>
            <code style="display:block; background:#000; color:#0f0; padding:10px; margin-top:10px; border-radius:4px; font-size:12px">
              create policy "Admin ve tudo" on user_data for select using (auth.jwt() ->> 'email' = 'wrlinkluanadmin@gmail.com');
            </code>
          </div>
        `;
        return;
      }

      adminUsersCache = data; // Salva para uso nas funções de aprovar

      const pendingUsers = data.filter(u => u.content && u.content.status === 'pending');
      const activeUsers = data.filter(u => !u.content || u.content.status !== 'pending');

      // Renderiza a lista
      container.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <h3>Administração</h3>
          <button class="btn ghost" onclick="renderAdminPanel()">🔄 Atualizar Lista</button>
        </div>
        <div class="muted">Total de usuários: <strong>${data.length}</strong></div>
        
        <h4 style="margin-top:20px; color:var(--accent)">⏳ Pendentes (${pendingUsers.length})</h4>
        <div style="margin-top:15px; display:flex; flex-direction:column; gap:10px">
          ${pendingUsers.length === 0 ? '<div class="muted">Nenhuma solicitação pendente.</div>' : ''}
          ${pendingUsers.map(row => {
            const email = (row.content && row.content.savedBy) ? row.content.savedBy : 'Email não salvo (versão antiga)';
            const lastUpdate = new Date(row.updated_at).toLocaleString('pt-BR');
            const plataformas = row.content && row.content.platforms ? Object.keys(row.content.platforms).length : 0;
            
            return `
              <div class="card" style="padding:12px; display:flex; justify-content:space-between; align-items:center">
                <div>
                  <div style="font-weight:600; font-size:15px">${email}</div>
                  <div class="muted" style="font-size:12px">ID: ${row.user_id}</div>
                  <div class="muted" style="font-size:12px">Última sincronização: ${lastUpdate}</div>
                </div>
                <div style="display:flex; gap:8px;">
                  <button class="btn" onclick="approveUserCloud('${row.user_id}')">Aprovar</button>
                  <button class="btn danger" onclick="rejectUserCloud('${row.user_id}')">Reprovar</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <h4 style="margin-top:24px; color:var(--success)">✅ Ativos (${activeUsers.length})</h4>
        <div style="margin-top:15px; display:flex; flex-direction:column; gap:10px">
          ${activeUsers.map(row => {
            const email = (row.content && row.content.savedBy) ? row.content.savedBy : 'Email não salvo (antigo)';
            const lastUpdate = new Date(row.updated_at).toLocaleString('pt-BR');
            const plataformas = row.content && row.content.platforms ? Object.keys(row.content.platforms).length : 0;
            const isAdmin = email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
            const adminTag = isAdmin ? ' <span style="color:var(--accent); font-size:12px; font-weight:600;">(Admin)</span>' : '';
            const deleteButton = !isAdmin ? `<button class="btn ghost danger" style="padding:6px 10px;font-size:12px" onclick="deleteUserCloud('${row.user_id}', '${email}')">Excluir</button>` : '';
            
            return `
              <div class="card" style="padding:12px; display:flex; justify-content:space-between; align-items:center">
                <div>
                  <div style="font-weight:600; font-size:15px">${email}${adminTag}</div>
                  <div class="muted" style="font-size:12px">ID: ${row.user_id}</div>
                  <div class="muted" style="font-size:12px">Última sincronização: ${lastUpdate}</div>
                </div>
                <div style="display:flex;align-items:center;gap:10px">
                  <div class="muted">${plataformas} plataformas</div>
                  ${deleteButton}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    window.approveUserCloud = async (userId) => {
        const userRow = adminUsersCache.find(u => u.user_id === userId);
        if (!userRow) return;

        const newContent = { ...userRow.content, status: 'approved' };
        
        const { error } = await supabase.from('user_data').update({ content: newContent }).eq('user_id', userId);
        
        if (error) {
            showToast('Erro ao aprovar: ' + error.message, 'error');
        } else {
            showToast('Usuário aprovado com sucesso!', 'success');
            renderAdminPanel();
        }
    };

    window.rejectUserCloud = async (userId) => {
        showConfirm('Tem certeza que deseja REPROVAR este usuário? Isso excluirá a solicitação de cadastro.', async () => {
            const { error } = await supabase.from('user_data').delete().eq('user_id', userId);
            
            if (error) {
                showToast('Erro ao reprovar: ' + error.message, 'error');
            } else {
                showToast('Usuário reprovado com sucesso!', 'success');
                renderAdminPanel();
            }
        }, { isDanger: true, title: 'Reprovar Usuário' });
    };

    window.deleteUserCloud = async (userId, email) => {
        showConfirm(`ATENÇÃO: Tem certeza que deseja EXCLUIR o usuário "${email}"?\n\nIsso apagará todos os dados dele do banco de dados. Essa ação não pode ser desfeita.`, async () => {
            const { error } = await supabase.from('user_data').delete().eq('user_id', userId);
            
            if (error) {
                showToast('Erro ao excluir: ' + error.message, 'error');
            } else {
                showToast('Usuário excluído com sucesso!', 'success');
                renderAdminPanel();
            }
        }, { isDanger: true, title: 'Excluir Usuário' });
    };

    // --- Logout Logic (Botão Sair)
    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await supabase.auth.signOut();
      window.location.href = 'login.html';
    });

    // --- SMS Logic ---
    const SMS_API_URL = 'https://api.sms24h.org/stubs/handler_api';
    const CORS_PROXY = 'https://corsproxy.io/?';
    const CHINA_SMS_API_URL = 'https://chinasmsbot.top/api';
    const CHINA_SMS_SERVICES = [
        { id: 'mercado', name: 'Mercado Pago', price: 0.80 },
        { id: 'mpsrv2', name: 'Mercado Pago S2', price: 0.95 },
        { id: 'mpsrv3', name: 'Mercado Pago S3', price: 0.90 },
        { id: 'mpsrv4', name: 'Mercado Pago S4', price: 0.80 },
        { id: 'nubanksrv1', name: 'Nubank S1', price: 1.0 },
        { id: 'nubank', name: 'Nubank S2', price: 0.9 },
        { id: 'nubanksrv3', name: 'Nubank S3', price: 1.75 },
        { id: 'nubanksrv4', name: 'Nubank S4', price: 1.68 },
        { id: 'outros', name: 'Outros', price: 0.9 },
        { id: 'srv2', name: 'Outros S2', price: 0.65 },
        { id: 'outrossrv3', name: 'Outros S3', price: 1.5 },
        { id: 'outrossrv4', name: 'Outros S4', price: 0.65 },
        { id: 'santander', name: 'Santander S1', price: 0.48 },
        { id: 'santandersrv2', name: 'Santander S2', price: 0.48 },
        { id: 'santandersrv3', name: 'Santander S3', price: 0.48 },
        { id: 'infinitepay', name: 'InfinitePay S1', price: 0.9 },
        { id: 'infinitepaysrv2', name: 'InfinitePay S2', price: 0.6 },
        { id: 'infinitepaysrv3', name: 'InfinitePay S3', price: 1.6 },
        { id: 'picpay', name: 'PicPay', price: 0.65 },
        { id: 'picsrv3', name: 'PicPay S3', price: 1.05 },
        { id: 'picsrv4', name: 'PicPay S4', price: 0.8 },
    ];
    const CHINA_SMS_GROUPS_MAP = {
        'mercadopago': { name: 'Mercado Pago', icon: '🤝', ids: ['mercado', 'mpsrv2', 'mpsrv3', 'mpsrv4'] },
        'nubank': { name: 'Nubank', icon: '💜', ids: ['nubanksrv1', 'nubank', 'nubanksrv3', 'nubanksrv4'] },
        'santander': { name: 'Santander', icon: '♨️', ids: ['santander', 'santandersrv2', 'santandersrv3'] },
        'infinitepay': { name: 'InfinitePay', icon: '♾️', ids: ['infinitepay', 'infinitepaysrv2', 'infinitepaysrv3'] },
        'picpay': { name: 'PicPay', icon: '🟩', ids: ['picpay', 'picsrv3', 'picsrv4'] },
        'outros': { name: 'Outros', icon: '🌐', ids: ['outros', 'srv2', 'outrossrv3', 'outrossrv4'] }
    };
    // IDs dos serviços que exigem espera de 2 minutos para cancelar (Server 1 e 3)
    const CHINA_SMS_RESTRICTED_CANCEL = [
        'mercado', 'mpsrv3', 'nubanksrv1', 'nubanksrv3', 'santander', 'santandersrv3', 
        'infinitepay', 'infinitepaysrv3', 'picpay', 'picsrv3', 'outros', 'outrossrv3'
    ];

    let smsPollingIntervals = {}; // To store setInterval IDs
    let smsUiInterval = null;
    let smsPricesCache = {};
    const SMS_SERVICES_LIST = [ // Preços manuais definidos
        { id: 'lj',   name: 'Santander',    manualPrice: 0.50, icon: '♨️' },
        { id: 'aaa',  name: 'Nubank',       manualPrice: 1.20, icon: '💜' },
        { id: 'anx',  name: 'InfinitePay',  manualPrice: 0.64, icon: '♾️' },
        { id: 'abg',  name: 'PagBank',      manualPrice: 0.40, icon: '💳' },
        { id: 'aff',  name: 'C6 Bank',      manualPrice: 0.55, icon: '⚫' },
        { id: 'cq',   name: 'Mercado Pago', manualPrice: 1.30, icon: '🤝' },

        // novos bancos sms24h
        { id: 'btn',  name: 'Itau',         manualPrice: 0.60, icon: '🟧' },
        { id: 'awh',  name: 'NgCash',       manualPrice: 0.50, icon: '💰' },
        { id: 'ev',   name: 'PicPay',       manualPrice: 1.00, icon: '🟩' },

        { id: 'ot',   name: 'Outros',       manualPrice: 0.70, icon: '🌐' }
    ];

    // Helper para obter preço do serviço para contabilidade automática
    function getServicePrice(provider, serviceId) {
        if (provider === 'chinasms') {
            const svc = CHINA_SMS_SERVICES.find(s => s.id === serviceId);
            return svc ? svc.price : 0;
        } else {
            // SMS24h
            const manualSvc = SMS_SERVICES_LIST.find(s => s.id === serviceId);
            if (manualSvc && manualSvc.manualPrice) return manualSvc.manualPrice;
            // Tenta cache
            if (smsPricesCache[serviceId]) return smsPricesCache[serviceId].price / 100;
            // Fallback genérico
            return 1.00; 
        }
    }

    async function smsApiCall(params) {
        const apiKey = state.smsApiKey;
        if (!apiKey) {
            showToast('Por favor, insira e salve sua API Key do sms24h.org primeiro.', 'error');
            return null;
        }
        
        // Adiciona timestamp para evitar cache do browser/proxy em todas as chamadas
        const queryString = new URLSearchParams({ api_key: apiKey, _: Date.now(), ...params }).toString();
        const url = `${SMS_API_URL}?${queryString}`;
        const fetchOptions = { cache: 'no-store' };

        try {
            // Tenta conexão direta primeiro
            const response = await fetch(url, fetchOptions);
            if (!response.ok) throw new Error('Network response was not ok');
            return await response.text();
        } catch (error) {
            console.warn('Conexão direta falhou (provável CORS), tentando via proxy...', error);
            try {
                // Tenta via Proxy se a direta falhar
                const proxyUrl = `${CORS_PROXY}${encodeURIComponent(url)}`;
                const response = await fetch(proxyUrl, fetchOptions);
                if (!response.ok) throw new Error('Proxy response was not ok');
                return await response.text();
            } catch (proxyError) {
                console.error('Erro fatal na API SMS:', proxyError);
                return null;
            }
        }
    }

    function renderRepeatButtons() {
        const repeat24hBtn = document.getElementById('repeatSms24hBtn');
        const repeatChinaBtn = document.getElementById('repeatChinaSmsBtn');

        // Hide both by default
        if (repeat24hBtn) repeat24hBtn.style.display = 'none';
        if (repeatChinaBtn) repeatChinaBtn.style.display = 'none';

        if (state.lastSmsService) {
            const { provider, serviceName } = state.lastSmsService;
            
            if (provider === 'sms24h' && repeat24hBtn) {
                repeat24hBtn.style.display = 'inline-flex';
                repeat24hBtn.title = `Repetir último serviço: ${serviceName}`;
            } else if (provider === 'chinasms' && repeatChinaBtn) {
                repeatChinaBtn.style.display = 'inline-flex';
                repeatChinaBtn.title = `Repetir último serviço: ${serviceName}`;
            }
        }
    }

    function renderSmsPanel() {
        const apiKeyInput = document.getElementById('smsApiKey');
        const chinaSmsTokenInput = document.getElementById('chinaSmsToken');
        if (apiKeyInput) apiKeyInput.value = state.smsApiKey || '';
        if (chinaSmsTokenInput) chinaSmsTokenInput.value = state.chinaSmsToken || '';
        
        // Renderiza a interface correta baseada no provedor selecionado
        const targetProvider = state.currentSmsProvider || 'sms24h';
        selectSmsProvider(targetProvider);
        
        const autoCopyCheck = document.getElementById('autoCopyToggle');
        if(autoCopyCheck) {
            autoCopyCheck.checked = state.autoCopySms || false;
        }
        const soundCheck = document.getElementById('soundToggle');
        if(soundCheck) {
            soundCheck.checked = state.soundEnabled !== false;
        }
        
        if (Notification.permission === 'default') {
            document.getElementById('btnEnableNotif').style.display = 'block';
        }

        renderRepeatButtons();
        renderSmsActivations();
        renderSmsHistory();
    }

    function renderChinaSmsServices() {
        const container = document.getElementById('chinaSmsSelectionArea');
        const backBtn = document.getElementById('chinaSmsBackBtn');
        if (!container) return;
        
        if(backBtn) backBtn.style.display = 'none';
        container.innerHTML = '<div class="service-grid"></div>';
        const grid = container.querySelector('.service-grid');

        Object.keys(CHINA_SMS_GROUPS_MAP).forEach(key => {
            const group = CHINA_SMS_GROUPS_MAP[key];
            const el = document.createElement('div');
            el.className = 'service-item';
            el.innerHTML = `
                <div class="service-icon">${group.icon}</div>
                <div class="service-name">${group.name}</div>
            `;
            el.onclick = () => renderChinaSmsServers(key);
            grid.appendChild(el);
        });
    }
    // Expor função para o botão Voltar no HTML
    window.renderChinaSmsServices = renderChinaSmsServices;

    function renderChinaSmsServers(groupKey) {
        const container = document.getElementById('chinaSmsSelectionArea');
        const backBtn = document.getElementById('chinaSmsBackBtn');
        if (!container) return;

        if(backBtn) backBtn.style.display = 'block';
        const group = CHINA_SMS_GROUPS_MAP[groupKey];
        
        container.innerHTML = `<div class="muted" style="margin-bottom:8px">Servidores disponíveis para <strong class="group-name-label"></strong>:</div><div class="server-list"></div>`;
        container.querySelector('.group-name-label').textContent = group.name;
        const list = container.querySelector('.server-list');

        group.ids.forEach(svcId => {
            const svc = CHINA_SMS_SERVICES.find(s => s.id === svcId);
            if (!svc) return;

            const el = document.createElement('div');
            el.className = 'server-item';
            el.innerHTML = `
                <div class="server-info">
                    <div class="server-name">${svc.name}</div>
                    <div class="server-price">R$ ${svc.price.toFixed(2)}</div>
                </div>
                <button class="btn" style="padding: 6px 12px; font-size: 13px;">Comprar</button>
            `;
            
            // Handle buy click
            const btn = el.querySelector('button');
            btn.onclick = async (e) => {
                e.stopPropagation();
                showConfirm(`Confirmar compra de ${svc.name} por R$ ${svc.price.toFixed(2)}?`, async () => {
                    await buyChinaSmsNumber(svc.id, svc.name, btn);
                });
            };

            list.appendChild(el);
        });
    }

    async function chinaSmsApiCall(endpoint, body) {
        const token = state.chinaSmsToken;
        if (!token) {
            showToast('Por favor, insira e salve seu Token do ChinaSMS primeiro.', 'error');
            return null;
        }
        
        // Adiciona timestamp para evitar cache do proxy/navegador e forçar saldo atualizado
        const timestamp = new Date().getTime();
        const url = `${CHINA_SMS_API_URL}/${endpoint}?_=${timestamp}`;
        const options = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, ...body }),
            cache: 'no-store'
        };

        try {
            let response;
            try {
                response = await fetch(url, options);
            } catch (err) {
                console.warn('Falha na conexão direta (CORS?), tentando proxy...', err);
                response = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`, options);
            }
            
            const data = await response.json();

            if (!response.ok) {
                let errorMsg = data.error || `Erro ${response.status}`;
                if (response.status === 401) errorMsg = 'Token inválido.';
                if (response.status === 402) errorMsg = 'Saldo insuficiente.';
                if (response.status === 503) errorMsg = 'Sem números disponíveis para este serviço.';
                throw new Error(errorMsg);
            }
            
            return data;
        } catch (error) {
            console.error(`Erro na API ChinaSMS (${endpoint}):`, error);
            showToast(`Erro na API ChinaSMS: ${error.message}`, 'error');
            return null;
        }
    }

    function renderSmsServices() {
        const container = document.getElementById('sms24hSelectionArea');
        const backBtn = document.getElementById('sms24hBackBtn');
        const detailArea = document.getElementById('sms24hDetailArea');
        const gridArea = document.getElementById('sms24hGridArea');
        
        if (!container) return;
        
        // Reset view to grid
        if(backBtn) backBtn.style.display = 'none';
        if(detailArea) detailArea.style.display = 'none';
        if(gridArea) {
            gridArea.style.display = 'grid';
            gridArea.innerHTML = '';
        } else {
            // Se não existir, cria a estrutura
            container.innerHTML = `
                <div id="sms24hGridArea" class="service-grid"></div>
                <div id="sms24hDetailArea" style="display:none"></div>
            `;
        }
        
        const grid = document.getElementById('sms24hGridArea');
        
        // Renderiza apenas os serviços da lista definida (Bancos existentes)
        SMS_SERVICES_LIST.forEach(svc => {
            const el = document.createElement('div');
            el.className = 'service-item';
            el.innerHTML = `
                <div class="service-icon">${svc.icon}</div>
                <div class="service-name">${svc.name}</div>
            `;
            el.onclick = () => selectSms24hService(svc.id, svc.name);
            grid.appendChild(el);
        });
    }
    // Expor função para o botão Voltar no HTML
    window.renderSmsServices = renderSmsServices;

    function selectSms24hService(serviceId, serviceName) {
        const backBtn = document.getElementById('sms24hBackBtn');
        const detailArea = document.getElementById('sms24hDetailArea');
        const gridArea = document.getElementById('sms24hGridArea');
        
        if(backBtn) backBtn.style.display = 'block';
        if(gridArea) gridArea.style.display = 'none';
        if(detailArea) {
            detailArea.style.display = 'block';
            
            // Busca preço se disponível
            let priceDisplay = '';
            // Tenta pegar preço manual primeiro, depois cache da API
            const manualSvc = SMS_SERVICES_LIST.find(s => s.id === serviceId);
            if (manualSvc && manualSvc.manualPrice) {
                priceDisplay = `<div class="muted" style="margin-bottom:10px">Preço estimado: R$ ${manualSvc.manualPrice.toFixed(2)}</div>`;
            } else if (smsPricesCache[serviceId]) {
                priceDisplay = `<div class="muted" style="margin-bottom:10px">Preço estimado: R$ ${(smsPricesCache[serviceId].price / 100).toFixed(2)}</div>`;
            }

            detailArea.innerHTML = `
                <h3 style="margin-top:0; color:var(--accent)">${serviceName}</h3>
                ${priceDisplay}
                <div class="field" style="margin-bottom:16px">
                    <label for="smsOperator">Operadora (Brasil)</label>
                    <select id="smsOperator">
                        <option value="any">Qualquer</option>
                        <option value="vivo">Vivo</option>
                        <option value="tim">TIM</option>
                        <option value="claro">Claro</option>
                        <option value="oi">Oi</option>
                    </select>
                </div>
                <button class="btn" id="getNumberBtn" style="width: 100%; padding: 12px;">Pedir Número (${serviceName})</button>
            `;

            // Re-attach event listener for the new button
            document.getElementById('getNumberBtn').onclick = () => buySms24hNumber(serviceId, serviceName);
        }
    }

    document.getElementById('refreshSmsPrices')?.addEventListener('click', () => {
        fetchAndDisplaySmsPrices();
    });

    function updateSmsSaldoBar(label, val, gastoMes) {
        const bar = document.getElementById('smsSaldoBar');
        const labelEl = document.getElementById('smsSaldoLabel');
        const valEl = document.getElementById('smsSaldoBarVal');
        const gastoEl = document.getElementById('smsSaldoGasto');
        if(!bar) return;
        if(labelEl) labelEl.textContent = label;
        if(valEl) valEl.textContent = val ? `R$ ${parseFloat(val).toFixed(2)}` : 'R$ --,--';
        if(gastoEl && gastoMes !== undefined) gastoEl.textContent = `-R$ ${money(gastoMes)} gasto este mês`;
    }

    window.updateSmsBalance = async () => {
        const balanceEl = document.getElementById('smsBalance');
        if(balanceEl) balanceEl.textContent = '...';
        const response = await smsApiCall({ action: 'getBalance' });
        if (response && response.startsWith('ACCESS_BALANCE:')) {
            const balance = response.split(':')[1];
            if(balanceEl) balanceEl.textContent = `R$ ${parseFloat(balance).toFixed(2)}`;
            updateSmsSaldoBar('SMS24h', parseFloat(balance), state.gastoNumeros || 0);
        }
    };

    window.updateChinaSmsBalance = async () => {
        const balanceEl = document.getElementById('chinaSmsBalance');
        if(balanceEl && balanceEl.textContent === 'R$ --,--') balanceEl.textContent = '...';
        const response = await chinaSmsApiCall('balance', {});
        if (response) {
             const val = response.saldo !== undefined ? response.saldo : response.saldo_restante;
             if (val !== undefined && balanceEl) {
                 balanceEl.textContent = `R$ ${parseFloat(val).toFixed(2)}`;
                 updateSmsSaldoBar('China SMS', parseFloat(val), state.gastoChinaSms || 0);
             }
        }
    };

    function renderSmsActivations() {
        const container = document.getElementById('smsActivationsList');
        if (!container) return;

        if (!state.smsActivations || state.smsActivations.length === 0) {
            container.innerHTML = '<div class="sms-empty-msg muted" style="text-align: center; padding: 30px;">Nenhuma ativação em andamento.</div>';
            return;
        }
        
        // Filtra ativações pelo provedor atual
        const currentProvider = state.currentSmsProvider || 'sms24h';
        const filteredActivations = state.smsActivations.filter(act => 
            (act.provider === currentProvider) || (!act.provider && currentProvider === 'sms24h')
        );

        if (filteredActivations.length === 0) {
            container.innerHTML = '<div class="sms-empty-msg muted" style="text-align: center; padding: 30px;">Nenhuma ativação ativa neste provedor.</div>';
            return;
        }
        
        // Limpa mensagem de vazio se tiver itens
        const emptyMsg = container.querySelector('.sms-empty-msg');
        if (emptyMsg) container.innerHTML = '';

        // Remove cards de ativações que não existem mais
        const activeIds = new Set(filteredActivations.map(a => a.id));
        Array.from(container.children).forEach(child => {
            if (child.dataset.id && !activeIds.has(child.dataset.id)) {
                child.remove();
            }
        });

        filteredActivations.forEach((act) => {
            let card = document.getElementById(`sms-card-${act.id}`);
            
            const timeElapsed = (new Date() - new Date(act.startTime)) / 1000;
            const timeRemaining = Math.max(0, 1380 - timeElapsed); // 23 min timeout (1380s)
            const progressPercent = (timeRemaining / 1380) * 100;
            
            let statusText = 'Aguardando SMS...';
            let badgeClass = 'waiting';
            if (act.status === 'received') {
                statusText = 'SMS Recebido!';
                badgeClass = 'received';
            } else if (act.status === 'error' || timeRemaining <= 0) {
                statusText = 'Falhou ou expirou';
                badgeClass = 'error';
            }

            const timerText = `${Math.floor(timeRemaining/60)}:${String(Math.floor(timeRemaining%60)).padStart(2,'0')}`;
            const codeText = act.code || '------';

            // Lógica para mensagens longas (ex: serviço "Outros")
            const isLongText = codeText.length > 12;
            const displayStyle = isLongText 
                ? 'font-size: 15px; font-weight: 600; letter-spacing: normal; word-break: break-word; line-height: 1.4;' 
                : 'font-size: 24px; font-weight: 700; letter-spacing: 4px; font-family: monospace;';
            
            let extractedCode = null;
            if (isLongText) {
                const match = codeText.match(/\b\d{4,8}\b/);
                if (match) extractedCode = match[0];
            }

            if (!card) {
                card = document.createElement('div');
                card.className = 'sms-activation-card';
                card.id = `sms-card-${act.id}`;
                card.dataset.id = act.id;

                let numberNoDDI = act.number;
                if (numberNoDDI.startsWith('55')) numberNoDDI = numberNoDDI.substring(2);

                const progressColor = badgeClass === 'error' ? 'var(--danger)' : badgeClass === 'received' ? 'var(--success)' : 'var(--accent)';
                const codeDisplay = act.code
                    ? `<div class="${isLongText ? '' : 'sms-code-big'}" style="${isLongText ? 'font-size:15px;font-weight:500;word-break:break-word;color:var(--text)' : ''}">${codeText}</div>`
                    : `<div class="sms-code-waiting">— — — — — —</div>`;

                card.innerHTML = `
                    <div class="sms-card-header">
                      <div>
                        <div class="sms-card-service">${act.serviceName}</div>
                        <div class="sms-card-id">ID: ${act.id} · ${act.provider || 'sms24h'}</div>
                      </div>
                      <div style="display:flex;align-items:center;gap:8px">
                        <span class="status-badge ${badgeClass}">${statusText}</span>
                        <span class="timer-text" style="font-size:12px;color:var(--muted)">⏱ ${timerText}</span>
                      </div>
                    </div>
                    <div class="sms-card-body">
                      <div class="sms-card-number">
                        <span>${act.number}</span>
                        <button class="copy-btn" onclick="copyToClipboard('${numberNoDDI}', this)">Copiar</button>
                      </div>
                      <div class="sms-progress-track">
                        <div class="sms-progress-bar" style="width:${progressPercent}%;background:${progressColor}"></div>
                      </div>
                      <div class="sms-code-box">
                        <div>
                          <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">${isLongText ? 'Mensagem recebida' : 'Código recebido'}</div>
                          <div class="sms-code-display">${codeDisplay}</div>
                        </div>
                        ${act.code ? `
                          <div style="display:flex;flex-direction:column;gap:6px;margin-left:10px;flex-shrink:0">
                            <button class="sms-act-btn secondary" onclick="copyToClipboard('${act.code}', this)" style="flex:none;padding:6px 12px">${isLongText ? 'Copiar msg' : 'Copiar'}</button>
                            ${extractedCode ? `<button class="sms-act-btn secondary" onclick="copyToClipboard('${extractedCode}', this)" style="flex:none;padding:6px 12px">Copiar ${extractedCode}</button>` : ''}
                          </div>
                        ` : ''}
                      </div>
                      <div class="sms-card-actions">
                        ${act.status === 'received' ? `
                          <button class="sms-act-btn primary" onclick="finishSmsActivation('${act.id}')">✅ Finalizar</button>
                          <button class="sms-act-btn secondary" onclick="retrySmsActivation('${act.id}')">🔄 Outro SMS</button>
                        ` : act.status === 'waiting' ? `
                          <button class="sms-act-btn secondary" onclick="forceCheckSms('${act.id}')" style="flex:none;padding:8px 14px">⚡ Checar</button>
                        ` : ''}
                        <button class="sms-act-btn danger" onclick="cancelSmsActivation('${act.id}')">✖ Cancelar</button>
                      </div>
                    </div>
                `;
                container.appendChild(card);
            } else {
                // Atualiza apenas os elementos que mudam (evita piscar)
                const statusEl = card.querySelector('.status-badge');
                if (statusEl && statusEl.textContent !== statusText) {
                    statusEl.textContent = statusText;
                    statusEl.className = `status-badge ${badgeClass}`;
                }
                
                const timerEl = card.querySelector('.timer-text');
                const newTimerText = `⏱ ${timerText}`;
                if (timerEl && timerEl.textContent !== newTimerText) timerEl.textContent = newTimerText;

                const progressEl = card.querySelector('.sms-progress-bar');
                if (progressEl) {
                    progressEl.style.width = `${progressPercent}%`;
                    progressEl.style.background = badgeClass === 'error' ? 'var(--danger)' : (badgeClass === 'received' ? 'var(--success)' : 'var(--accent)');
                }

                const codeEl = card.querySelector('.sms-code-display');
                if (codeEl && codeEl.textContent.trim() !== codeText) {
                    const codeBox = card.querySelector('.sms-code-box');
                    if(codeBox) {
                        const codeDisplay2 = act.code
                            ? `<div class="${isLongText ? '' : 'sms-code-big'}" style="${isLongText ? 'font-size:15px;font-weight:500;word-break:break-word;color:var(--text)' : ''}">${codeText}</div>`
                            : `<div class="sms-code-waiting">— — — — — —</div>`;
                        codeBox.innerHTML = `
                          <div>
                            <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">${isLongText ? 'Mensagem recebida' : 'Código recebido'}</div>
                            <div class="sms-code-display">${codeDisplay2}</div>
                          </div>
                          ${act.code ? `<div style="display:flex;flex-direction:column;gap:6px;margin-left:10px;flex-shrink:0">
                            <button class="sms-act-btn secondary" onclick="copyToClipboard('${act.code}', this)" style="flex:none;padding:6px 12px">${isLongText ? 'Copiar msg' : 'Copiar'}</button>
                            ${extractedCode ? `<button class="sms-act-btn secondary" onclick="copyToClipboard('${extractedCode}', this)" style="flex:none;padding:6px 12px">Copiar ${extractedCode}</button>` : ''}
                          </div>` : ''}
                        `;
                    }
                }

                const actionsEl = card.querySelector('.sms-card-actions');
                if (actionsEl) {
                    const hasFinishBtn = actionsEl.querySelector('button[onclick^="finishSmsActivation"]');
                    if (act.status === 'received' && !hasFinishBtn) {
                        actionsEl.innerHTML = `
                            <button class="sms-act-btn primary" onclick="finishSmsActivation('${act.id}')">✅ Finalizar</button>
                            <button class="sms-act-btn secondary" onclick="retrySmsActivation('${act.id}')">🔄 Outro SMS</button>
                            <button class="sms-act-btn danger" onclick="cancelSmsActivation('${act.id}')">✖ Cancelar</button>
                        `;
                    }
                }
            }

            // Lógica do Temporizador de Cancelamento (China SMS)
            const cancelBtn = card.querySelector('.sms-act-btn.danger');
            if (cancelBtn && act.provider === 'chinasms' && act.status === 'waiting') {
                // Aplica a restrição de 2 minutos para todos os serviços do ChinaSMS, conforme solicitado.
                if (timeElapsed < 120) {
                    const remaining = 120 - Math.floor(timeElapsed);
                    const newText = `Cancelar (${remaining}s)`;
                    // Atualiza apenas o texto do nó de texto, evitando recriar o botão
                    if (cancelBtn.innerText !== newText) cancelBtn.innerText = newText;
                    if (!cancelBtn.disabled) {
                        cancelBtn.disabled = true;
                        cancelBtn.style.opacity = '0.6';
                        cancelBtn.style.cursor = 'not-allowed';
                    }
                } else {
                    if (cancelBtn.disabled) {
                        cancelBtn.disabled = false;
                        cancelBtn.style.opacity = '1';
                        cancelBtn.style.cursor = 'pointer';
                        cancelBtn.innerText = '✖ Cancelar';
                    }
                }
            }
        });
    }

    window.copyToClipboard = (text, btn) => {
        navigator.clipboard.writeText(text).then(() => {
            const original = btn.textContent;
            btn.textContent = 'Copiado!';
            setTimeout(() => btn.textContent = original, 1500);
        });
    };

    window.forceCheckSms = async (id) => {
        const act = state.smsActivations.find(a => a.id === id);
        if(!act) return;
        
        showToast('Verificando status na API...', 'info');
        
        if(act.provider === 'chinasms') {
            // Para ChinaSMS, abortamos o polling atual e iniciamos um novo imediatamente
            if(chinaSmsPollingControllers[id]) {
                chinaSmsPollingControllers[id].abort();
                delete chinaSmsPollingControllers[id];
            }
            startChinaSmsPolling(act);
        } else {
            // Para SMS24h, fazemos uma chamada direta
            const response = await smsApiCall({ action: 'getStatus', id: act.id });
            if (!response) { showToast('Falha de conexão com a API SMS24h.', 'error'); return; }
            if (response.trim().startsWith('STATUS_OK:')) {
                const code = response.trim().substring(10);
                const actIndex = state.smsActivations.findIndex(a => a.id === id);
                if (actIndex !== -1) {
                    state.smsActivations[actIndex].code = code;
                    state.smsActivations[actIndex].status = 'received';
                    
                    if (!state.smsActivations[actIndex].costAdded) {
                        const price = getServicePrice('sms24h', state.smsActivations[actIndex].service);
                        state.gastoNumeros = (state.gastoNumeros || 0) + price;
                        state.smsActivations[actIndex].costAdded = true;
                    }
                    saveDataImmediate();
                    renderSmsActivations();
                }
            }
        }
    };

    document.getElementById('saveSmsApiKey')?.addEventListener('click', () => {
        const key = document.getElementById('smsApiKey').value.trim();
        if (key) {
            state.smsApiKey = key;
            saveDataImmediate();
            showToast('Chave API salva com sucesso!', 'success');
            document.getElementById('checkSmsBalance').click();
        }
    });

    document.getElementById('checkSmsBalance')?.addEventListener('click', async () => {
        window.updateSmsBalance();
    });

    async function executeSms24hBuy(serviceId, serviceName, operator) {
        const response = await smsApiCall({ action: 'getNumber', service: serviceId, operator: operator, country: 73 });

        if (response && response.trim().startsWith('ACCESS_NUMBER:')) {
            const [, id, number] = response.trim().split(':');
            const newActivation = { id: id.trim(), number: number ? number.trim() : '', service: serviceId, serviceName, operator, startTime: new Date().toISOString(), status: 'waiting', code: null, provider: 'sms24h' };
            state.smsActivations.push(newActivation);
            
            state.lastSmsService = { provider: 'sms24h', serviceId, serviceName, operator };

            saveDataImmediate();
            renderSmsActivations();
            startSmsPolling(newActivation);
            window.updateSmsBalance(); // Atualiza saldo
            
            showToast(`Número para ${serviceName} adquirido!`, 'success');
            return true;
        } else {
            if (response) {
                showToast(`Erro ao pedir número: ${response}`, 'error');
            } else {
                showToast('Falha de conexão com a API SMS24h. Verifique sua internet ou se o proxy está acessível.', 'error');
            }
            return false;
        }
    }

    async function buySms24hNumber(serviceId, serviceName) {
        const btn = document.getElementById('getNumberBtn');
        if(!btn) return;
        btn.textContent = 'Aguarde...';
        btn.disabled = true;

        const operator = document.getElementById('smsOperator').value;
        await executeSms24hBuy(serviceId, serviceName, operator);

        btn.textContent = `Pedir Número (${serviceName})`;
        btn.disabled = false;
    }

    function startSmsPolling(activation) {
        if (smsPollingIntervals[activation.id]) clearInterval(smsPollingIntervals[activation.id]);
        
        const intervalId = setInterval(async () => {
            const actIndex = state.smsActivations.findIndex(a => a.id === activation.id);
            if (actIndex === -1) { clearInterval(intervalId); delete smsPollingIntervals[activation.id]; return; }
            
            const timeElapsed = (new Date() - new Date(state.smsActivations[actIndex].startTime)) / 1000;
            if (timeElapsed > 1380) { // 23 minutos
                clearInterval(intervalId); delete smsPollingIntervals[activation.id];
                // Cancela automaticamente para devolver o saldo
                cancelSmsActivation(activation.id);
            } else {
                const response = await smsApiCall({ action: 'getStatus', id: activation.id });
                if (response && response.startsWith('STATUS_OK:')) {
                    const code = response.substring(10); // Pega tudo após STATUS_OK: para não cortar mensagens com ":"
                    state.smsActivations[actIndex].code = code;
                    state.smsActivations[actIndex].status = 'received';
                    
                    // Contabilidade Automática
                    if (!state.smsActivations[actIndex].costAdded) {
                        const price = getServicePrice('sms24h', state.smsActivations[actIndex].service);
                        state.gastoNumeros = (state.gastoNumeros || 0) + price;
                        state.smsActivations[actIndex].costAdded = true;
                        showToast(`Custo de R$ ${price.toFixed(2)} adicionado aos gastos com Números.`, 'info');
                        updateUI(); // Atualiza a aba de gastos e totais automaticamente
                    }

                    clearInterval(intervalId); delete smsPollingIntervals[activation.id];
                    // Tocar som de notificação
                    showToast(`SMS Recebido: ${code}`, 'success');
                    if(state.autoCopySms) {
                        navigator.clipboard.writeText(code).catch(e => console.error(e));
                        showToast('Código copiado automaticamente!', 'info');
                    }
                    playNotificationSound();
                    sendBrowserNotification(`Código: ${code}`, `SMS Recebido de ${activation.serviceName}`);
                    sendSmsNotification(activation.serviceName, code);
                }
            }
            saveDataImmediate();
            renderSmsActivations();
        }, 10000); // Aumentado para 10s para reduzir carga no servidor
        smsPollingIntervals[activation.id] = intervalId;
    }
    
    function restartSmsPolls() {
        if (!state.smsActivations) return;
        state.smsActivations.forEach(act => {
            if (act.status === 'waiting') {
                const timeElapsed = (new Date() - new Date(act.startTime)) / 1000;
                if (timeElapsed > 1380) {
                    // Se já passou de 23 min ao carregar, cancela
                    cancelSmsActivation(act.id);
                } else {
                    if (act.provider === 'chinasms') {
                        startChinaSmsPolling(act);
                    } else {
                        startSmsPolling(act);
                    }
                }
            }
        });
    }

    window.checkExpiredActivations = async () => {
        if (!state.smsActivations) return;
        
        // Atualiza saldos
        window.updateSmsBalance();
        window.updateChinaSmsBalance();

        let count = 0;
        const activations = [...state.smsActivations]; // Cópia para iterar
        for (const act of activations) {
            const timeElapsed = (new Date() - new Date(act.startTime)) / 1000;
            if (act.status === 'waiting' && timeElapsed > 1380) {
                await cancelSmsActivation(act.id);
                count++;
            } else if (act.status === 'waiting' && act.provider === 'chinasms') {
                // Força reinício do polling se estiver parado, para garantir sincronia
                if (!chinaSmsPollingControllers[act.id]) {
                    startChinaSmsPolling(act);
                }
            }
        }
        
        if(count > 0) showToast(`${count} ativações expiradas foram canceladas.`, 'info');
        else {
            // Feedback visual sutil
            const btns = document.querySelectorAll('button[onclick="checkExpiredActivations()"]');
            btns.forEach(btn => {
                const original = btn.textContent;
                btn.textContent = 'Sincronizado!';
                setTimeout(() => btn.textContent = original, 2000);
            });
        }
    };

    window.getExtraSms = async (id) => {
        const index = state.smsActivations.findIndex(a => a.id == id);
        if (index === -1) return;
        const activation = state.smsActivations[index];
        const response = await smsApiCall({ action: 'getExtraActivation', activationId: activation.id });
        if (response && response.startsWith('ACCESS_NUMBER:')) {
            const [, newId] = response.split(':');
            state.smsActivations[index] = { ...activation, id: newId, startTime: new Date().toISOString(), status: 'waiting', code: null };
            saveDataImmediate();
            renderSmsActivations();
            startSmsPolling(state.smsActivations[index]);
            showToast('Nova ativação solicitada. Aguardando novo SMS.', 'info');
        } else {
            if(response) showToast(`Erro ao pedir SMS extra: ${response}`, 'error');
        }
    };

    window.finishSmsActivation = async (id) => {
        const index = state.smsActivations.findIndex(a => a.id == id);
        if (index === -1) return;
        const activation = state.smsActivations[index];
        
        // Salva no histórico antes de finalizar
        if (!state.smsHistory) state.smsHistory = [];
        state.smsHistory.unshift({ ...activation, finishedAt: new Date().toISOString() });
        if (state.smsHistory.length > 50) state.smsHistory.length = 50;
        renderSmsHistory();
        
        if (activation.provider !== 'chinasms') {
            await smsApiCall({ action: 'setStatus', status: 6, id: activation.id });
        }
        state.smsActivations.splice(index, 1);
        saveDataImmediate();
        renderSmsActivations();
        updateUI(); // Garante que a interface reflita qualquer mudança final
        window.updateSmsBalance(); // Atualiza saldo
    };

    window.retrySmsActivation = async (id) => {
        const index = state.smsActivations.findIndex(a => a.id == id);
        if (index === -1) return;
        const activation = state.smsActivations[index];
        
        // Salva o código atual no histórico antes de pedir outro
        if (activation.code) {
            if (!state.smsHistory) state.smsHistory = [];
            state.smsHistory.unshift({ ...activation, finishedAt: new Date().toISOString() });
            renderSmsHistory();
        }

        if (activation.provider === 'chinasms') {
            const response = await chinaSmsApiCall('retry', { aid: activation.id });
            if (response && response.status === 'success') {
                state.smsActivations[index].code = null;
                state.smsActivations[index].status = 'waiting';
                state.smsActivations[index].startTime = new Date().toISOString();
                saveDataImmediate();
                renderSmsActivations();
                startChinaSmsPolling(state.smsActivations[index]);
            }
        } else { // sms24h
            const response = await smsApiCall({ action: 'setStatus', status: 3, id: activation.id });
            
            if (response && (response.includes('ACCESS_RETRY_GET') || response.includes('ACCESS_READY'))) {
                 state.smsActivations[index].code = null;
                 state.smsActivations[index].status = 'waiting';
                 saveDataImmediate();
                 renderSmsActivations();
                 startSmsPolling(state.smsActivations[index]);
            } else {
                 showToast('Erro ao solicitar outro SMS: ' + response, 'error');
            }
        }
    };

    window.cancelSmsActivation = async (id) => {
        const index = state.smsActivations.findIndex(a => a.id == id);
        if (index === -1) return;
        const activation = state.smsActivations[index];

        if (activation.provider === 'chinasms') {
            const result = await chinaSmsApiCall('cancel', { aid: activation.id });
            
            // Correção Ghost SMS: Se falhar (null), não remove o card e tenta buscar o código
            if (!result) {
                // Se falhar, oferece a opção de forçar a remoção (caso o ID esteja expirado/inválido)
                showConfirm(
                    'O cancelamento falhou na API (provavelmente o ID expirou).<br><br>Deseja <strong>forçar a remoção</strong> deste card da tela?',
                    () => {
                        const currentIdx = state.smsActivations.findIndex(a => a.id == id);
                        if (currentIdx !== -1) {
                            if (chinaSmsPollingControllers[activation.id]) {
                                chinaSmsPollingControllers[activation.id].abort();
                                delete chinaSmsPollingControllers[activation.id];
                            }
                            state.smsActivations.splice(currentIdx, 1);
                            saveDataImmediate();
                            renderSmsActivations();
                            showToast('Removido forçadamente.', 'success');
                        }
                    },
                    { title: 'Erro no Cancelamento', okText: 'Forçar Remoção', isDanger: true }
                );

                if (!chinaSmsPollingControllers[activation.id]) {
                    startChinaSmsPolling(activation);
                }
                return; 
            }

            if (chinaSmsPollingControllers[activation.id]) {
                chinaSmsPollingControllers[activation.id].abort();
                delete chinaSmsPollingControllers[activation.id];
            }
            window.updateChinaSmsBalance();
        } else { // sms24h
            await smsApiCall({ action: 'setStatus', status: 8, id: activation.id });
            if (smsPollingIntervals[activation.id]) {
                clearInterval(smsPollingIntervals[activation.id]);
                delete smsPollingIntervals[activation.id];
            }
            window.updateSmsBalance();
        }

        state.smsActivations.splice(index, 1);
        saveDataImmediate();
        renderSmsActivations();
    };

    window.switchSmsTab = (tab) => {
        const activeContainer = document.getElementById('smsActiveContainer');
        const historyContainer = document.getElementById('smsHistoryContainer');
        const tabActive = document.getElementById('tabSmsActive');
        const tabHistory = document.getElementById('tabSmsHistory');

        activeContainer.style.display = tab === 'active' ? 'block' : 'none';
        historyContainer.style.display = tab === 'history' ? 'block' : 'none';
        
        if(tab === 'active') { tabActive.classList.add('active'); tabHistory.classList.remove('active'); }
        else { tabHistory.classList.add('active'); tabActive.classList.remove('active'); }
    };

    function renderSmsHistory() {
        const container = document.getElementById('smsHistoryList');
        if (!container) return;

        const searchTerm = document.getElementById('searchSmsHistory') ? document.getElementById('searchSmsHistory').value.trim().toLowerCase() : '';

        // Filtra histórico pelo provedor atual
        const currentProvider = state.currentSmsProvider || 'sms24h';
        let filteredHistory = state.smsHistory.filter(h => 
            (h.provider === currentProvider) || (!h.provider && currentProvider === 'sms24h')
        );

        if (searchTerm) {
            filteredHistory = filteredHistory.filter(h => h.number && h.number.includes(searchTerm));
        }

        if (filteredHistory.length === 0) {
            container.innerHTML = '<div class="muted" style="text-align: center; padding: 20px;">Nenhum histórico disponível.</div>';
            return;
        }

        container.innerHTML = '';
        filteredHistory.forEach(item => {
            const date = new Date(item.finishedAt).toLocaleString('pt-BR');
            const el = document.createElement('div');
            el.style.padding = '12px 14px';
            el.style.borderBottom = '0.5px solid rgba(128,128,128,0.15)';
            el.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:13px;">
                    <strong style="color:var(--accent)">${item.serviceName}</strong>
                    <span class="muted" style="font-size:11px">${date}</span>
                </div>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-family:monospace; font-size:13px; color:var(--muted);">${item.number}</div>
                    <div style="font-weight:700; font-family:monospace; color:var(--success); font-size:16px; letter-spacing:1px;">${item.code || '---'}</div>
                </div>
            `;
            container.appendChild(el);
        });
    }

    document.getElementById('searchSmsHistory')?.addEventListener('input', () => {
        renderSmsHistory();
    });

    window.clearSmsHistory = () => {
        showConfirm('Limpar todo o histórico de SMS?', () => {
            state.smsHistory = [];
            saveDataImmediate();
            renderSmsHistory();
        }, { isDanger: true, title: 'Limpar Histórico SMS' });
    };

    window.repeatLastSmsService = async function() {
        if (!state.lastSmsService) {
            showToast('Nenhum serviço usado recentemente.', 'info');
            return;
        }

        const { provider, serviceId, serviceName, operator } = state.lastSmsService;

        if (provider !== state.currentSmsProvider) {
            showToast(`O último serviço foi do provedor ${provider}. Mude para ele para repetir.`, 'info');
            return;
        }

        if (provider === 'sms24h') {
            showConfirm(`Repetir o último serviço?<br><br><strong>Serviço:</strong> ${serviceName}<br><strong>Operadora:</strong> ${operator === 'any' ? 'Qualquer' : operator}`, async () => {
                const btn = document.getElementById('repeatSms24hBtn');
                const originalText = btn.innerHTML;
                btn.innerHTML = '...';
                btn.disabled = true;

                await executeSms24hBuy(serviceId, serviceName, operator);

                btn.innerHTML = originalText;
                btn.disabled = false;
            }, { title: 'Repetir Serviço SMS24h' });
        } else if (provider === 'chinasms') {
            const svc = CHINA_SMS_SERVICES.find(s => s.id === serviceId);
            const price = svc ? `R$ ${svc.price.toFixed(2)}` : 'Preço desconhecido';

            showConfirm(`Repetir o último serviço?<br><br><strong>Serviço:</strong> ${serviceName}<br><strong>Preço:</strong> ${price}`, async () => {
                const btn = document.getElementById('repeatChinaSmsBtn');
                await buyChinaSmsNumber(serviceId, serviceName, btn);
            }, { title: 'Repetir Serviço ChinaSMS' });
        }
    };

    window.selectSmsProvider = (provider) => {
        state.currentSmsProvider = provider;
        saveDataImmediate();

        document.querySelectorAll('.provider-card').forEach(el => el.classList.remove('selected'));
        document.getElementById('card-' + provider).classList.add('selected');

        document.getElementById('sms24hContainer').style.display = provider === 'sms24h' ? 'block' : 'none';
        document.getElementById('chinaSmsContainer').style.display = provider === 'chinasms' ? 'block' : 'none';

        // Render the service grid for the selected provider
        if (provider === 'sms24h') {
            renderSmsServices();
            window.updateSmsBalance();
        } else if (provider === 'chinasms') {
            renderChinaSmsServices();
            window.updateChinaSmsBalance();
        }

        renderSmsActivations();
        renderSmsHistory();
    };

    window.switchSmsSubTab = (provider, tab) => {
        const activationView = document.getElementById(provider + 'ActivationView');
        const configView = document.getElementById(provider + 'ConfigView');
        const btnActivation = document.getElementById(provider === 'sms24h' ? 'btnSms24hActivation' : 'btnChinaSmsActivation');
        const btnConfig = document.getElementById(provider === 'sms24h' ? 'btnSms24hConfig' : 'btnChinaSmsConfig');

        activationView.style.display = tab === 'activation' ? 'block' : 'none';
        configView.style.display = tab === 'config' ? 'block' : 'none';

        // Update button styles
        btnActivation.style.borderColor = tab === 'activation' ? 'var(--accent)' : 'transparent';
        btnActivation.style.color = tab === 'activation' ? 'var(--text)' : 'var(--muted)';
        btnConfig.style.borderColor = tab === 'config' ? 'var(--accent)' : 'transparent';
        btnConfig.style.color = tab === 'config' ? 'var(--text)' : 'var(--muted)';
    };

    async function fetchAndDisplaySmsPrices() {
        const serviceSelect = document.getElementById('smsService');
        const refreshBtn = document.getElementById('refreshSmsPrices');
        
        if(refreshBtn) {
            refreshBtn.classList.add('active');
            refreshBtn.textContent = '⏳';
        }

        const response = await smsApiCall({ action: 'getPrices', country: 73 });
        
        if(refreshBtn) {
            refreshBtn.classList.remove('active');
            refreshBtn.textContent = '🔄';
        }

        if (response) {
            try {
                const prices = JSON.parse(response);
                const services = prices['73']; // Prices for Brazil
                if (!services) return;
                
                Object.keys(services).forEach(svcId => {
                    const priceMap = services[svcId];
                    const priceKeys = Object.keys(priceMap);
                    if (priceKeys.length > 0) {
                        const priceStr = priceKeys[0];
                        const count = priceMap[priceStr];
                        smsPricesCache[svcId] = { price: parseFloat(priceStr), count: count };
                    }
                });
                renderSmsServices(); // Re-renderiza com preços
                serviceSelect.dataset.pricesLoaded = 'true';
            } catch (e) {
                console.error('Erro ao processar preços do SMS:', e);
            }
        }
    }

    window.testNotificationSound = () => {
        const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        audio.play().catch(e => showToast('O navegador bloqueou o som. Interaja com a página.', 'error'));
    };

    // --- China SMS Specific Logic ---
    let chinaSmsPollingControllers = {}; // To allow aborting fetch requests
    let chinaSmsFailCounts = {}; // Track consecutive network failures per activation

    async function startChinaSmsPolling(activation) {
        if (chinaSmsPollingControllers[activation.id]) {
            chinaSmsPollingControllers[activation.id].abort();
        }
        const controller = new AbortController();
        chinaSmsPollingControllers[activation.id] = controller;

        const token = state.chinaSmsToken;
        if (!token) return;

        // Verifica timeout de 23 min (1380s)
        const timeElapsed = (new Date() - new Date(activation.startTime)) / 1000;
        if (timeElapsed > 1380) {
            cancelSmsActivation(activation.id);
            return;
        }

        try {
            const timestamp = new Date().getTime();
            const url = `${CHINA_SMS_API_URL}/wait?_=${timestamp}`;
            const options = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, aid: activation.id, timeout: 90 }),
                signal: controller.signal
            };

            let response;
            try {
                response = await fetch(url, options);
            } catch (err) {
                if (err.name === 'AbortError') throw err;
                response = await fetch(`${CORS_PROXY}${encodeURIComponent(url)}`, options);
            }

            if (!response.ok) {
                if (controller.signal.aborted) return;
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const actIndex = state.smsActivations.findIndex(a => a.id === activation.id);
            if (actIndex === -1) return;

            chinaSmsFailCounts[activation.id] = 0; // Reset on successful response
            if (data.status === 'received' && data.sms && data.sms.length > 0) {
                state.smsActivations[actIndex].code = data.sms[0];
                state.smsActivations[actIndex].status = 'received';
                delete chinaSmsPollingControllers[activation.id];
                delete chinaSmsFailCounts[activation.id];
                
                // Contabilidade Automática
                if (!state.smsActivations[actIndex].costAdded) {
                    const price = getServicePrice('chinasms', state.smsActivations[actIndex].service);
                    state.gastoChinaSms = (state.gastoChinaSms || 0) + price;
                    state.smsActivations[actIndex].costAdded = true;
                    showToast(`Custo de R$ ${price.toFixed(2)} adicionado aos gastos China SMS.`, 'info');
                    updateUI(); // Atualiza a aba de gastos e totais automaticamente
                }

                showToast(`SMS Recebido (China): ${data.sms[0]}`, 'success');
                if(state.autoCopySms) {
                    navigator.clipboard.writeText(data.sms[0]).catch(e => console.error(e));
                    showToast('Código copiado automaticamente!', 'info');
                }
                playNotificationSound();
                sendBrowserNotification(`Código: ${data.sms[0]}`, `China SMS: ${activation.serviceName}`);
                sendSmsNotification(activation.serviceName, data.sms[0]);
            } else if (data.status === 'canceled') {
                state.smsActivations.splice(actIndex, 1);
                delete chinaSmsPollingControllers[activation.id];
            } else {
                // Auto-Force: Se for 'waiting' ou qualquer outro status desconhecido, continua tentando.
                // Isso garante que o código apareça mesmo se a API falhar temporariamente.
                setTimeout(() => startChinaSmsPolling(activation), 3000);
            }
            
            saveDataImmediate();
            renderSmsActivations();

        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error in ChinaSMS long-polling:', error);
                chinaSmsFailCounts[activation.id] = (chinaSmsFailCounts[activation.id] || 0) + 1;
                if (chinaSmsFailCounts[activation.id] >= 3) {
                    // Parar retry após 3 falhas consecutivas de rede para não flood o servidor
                    const actIndex = state.smsActivations.findIndex(a => a.id === activation.id);
                    if (actIndex !== -1) {
                        state.smsActivations[actIndex].status = 'error';
                        saveDataImmediate();
                        renderSmsActivations();
                    }
                    delete chinaSmsPollingControllers[activation.id];
                    delete chinaSmsFailCounts[activation.id];
                    showToast('ChinaSMS: sem conexão com o servidor. Verifique sua internet ou cancele a ativação.', 'error');
                } else {
                    setTimeout(() => startChinaSmsPolling(activation), 5000);
                }
            }
        }
    }

    async function buyChinaSmsNumber(serviceId, serviceName, btnElement) {
        const originalText = btnElement.textContent;
        btnElement.textContent = '...'; btnElement.disabled = true;

        const response = await chinaSmsApiCall('buy', { service: serviceId });

        if (response && response.status === 'success') {
            const newActivation = { id: response.aid, number: response.number, service: serviceId, serviceName, startTime: new Date().toISOString(), status: 'waiting', code: null, provider: 'chinasms' };
            state.smsActivations.push(newActivation);
            
            state.lastSmsService = { provider: 'chinasms', serviceId, serviceName };

            saveDataImmediate();
            renderSmsActivations();
            startChinaSmsPolling(newActivation);
            
            if (response.saldo_restante !== undefined) {
                const balanceEl = document.getElementById('chinaSmsBalance');
                if(balanceEl) balanceEl.textContent = `R$ ${parseFloat(response.saldo_restante).toFixed(2)}`;
            } else {
                window.updateChinaSmsBalance();
            }
            
            // Go back to main grid or stay? Maybe stay to buy more.
            // But let's alert or scroll to active
            // alert('Número adquirido com sucesso!');
        }
        btnElement.textContent = originalText; btnElement.disabled = false;
    }

    window.toggleAutoCopy = (checked) => {
        state.autoCopySms = checked;
        saveDataImmediate();
    };

    window.toggleSound = (checked) => {
        state.soundEnabled = checked;
        saveDataImmediate();
    };

    window.playNotificationSound = () => {
        if(!state.soundEnabled) return;
        new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(e => console.warn('Som bloqueado:', e));
    };

    window.requestNotificationPermission = () => {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                showToast('Notificações ativadas!', 'success');
                document.getElementById('btnEnableNotif').style.display = 'none';
                new Notification("Painel Financeiro", { body: "As notificações estão funcionando!" });
            }
        });
    };

    window.sendBrowserNotification = (title, body) => {
        if (Notification.permission === "granted") {
            new Notification(title, { body: body, icon: 'https://cdn-icons-png.flaticon.com/512/561/561188.png' });
        }
    };

    window.showToast = (message, type = 'info') => {
        const container = document.getElementById('toastContainer');
        if(!container) return;

        const icons = { success: '✓', error: '✕', info: 'i' };
        const labels = { success: 'Sucesso', error: 'Erro', info: 'Aviso' };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || 'i'}</div>
            <div class="toast-body">
              <div class="toast-title">${labels[type] || 'Info'}</div>
              <div class="toast-sub">${message}</div>
            </div>
        `;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(110%)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    };

    // --- init
    loadData();
    // ensure gasto inputs exist and set their values
    const gp = document.getElementById('gastoProxy');
    const gn = document.getElementById('gastoNumeros');
    const gb = document.getElementById('gastoBot');
    const gcs = document.getElementById('gastoChinaSms');
    if(gp) gp.value = String(state.gastoProxy || 0).replace('.',',');
    if(gn) gn.value = String(state.gastoNumeros || 0).replace('.',',');
    if(gb) gb.value = String(state.gastoBot || 0).replace('.',',');
    if(gcs) gcs.value = String(state.gastoChinaSms || 0).replace('.',',');

    // ensure selected platform exists
    if(!state.selectedPlatform) state.selectedPlatform = Object.keys(state.platforms)[0] || null;

    populateDaySelect();

    document.getElementById('saveChinaSmsToken')?.addEventListener('click', () => {
        const token = document.getElementById('chinaSmsToken').value.trim();
        if (token) {
            state.chinaSmsToken = token;
            saveDataImmediate();
            showToast('Token do ChinaSMS salvo com sucesso!', 'success');
            document.getElementById('checkChinaSmsBalance').click();
        }
    });

    document.getElementById('checkChinaSmsBalance')?.addEventListener('click', async () => {
        window.updateChinaSmsBalance();
    });

    document.getElementById('logoUpload').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            // Comprime a imagem para max 120x120px antes de salvar
            const img = new Image();
            img.onload = () => {
                const MAX = 120;
                const canvas = document.createElement('canvas');
                const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
                canvas.width  = Math.round(img.width  * ratio);
                canvas.height = Math.round(img.height * ratio);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                // Mostra o logo imediatamente
                const logoEl = document.getElementById('brandLogo');
                if (logoEl) { logoEl.style.display = ''; logoEl.src = dataUrl; }
                state.brandLogo = dataUrl;
                saveDataImmediate();
                showToast('Logo atualizada!', 'success');
            };
            img.onerror = () => showToast('Erro ao carregar a imagem. Tente outro arquivo.', 'error');
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
        // Limpa o input para permitir selecionar o mesmo arquivo novamente
        event.target.value = '';
    });

    document.getElementById('editAppTitleBtn').addEventListener('click', () => {
        const current = state.appTitle || 'Painel Financeiro';
        showPrompt('Novo nome do Painel:', (newTitle) => {
            if(newTitle && newTitle.trim() !== '') {
                state.appTitle = newTitle.trim();
                document.getElementById('appTitleDisplay').textContent = state.appTitle;
                saveDataImmediate();
            }
        }, current);
    });

    const platformsListEl = document.getElementById('platformsList');
    if (platformsListEl) {
        new Sortable(platformsListEl, {
            animation: 150,
            onEnd: function (evt) {
                const newOrder = Array.from(evt.to.children).map(el => el.dataset.platformName);
                state.platformOrder = newOrder;
                saveDataImmediate();
            }
        });
    }


    window.addEventListener('beforeunload', (e) => {
      if(saveTimer) {
        clearTimeout(saveTimer);
        saveData();
      }
    });

    // autosave indicator change back to muted after some seconds
    setInterval(()=>{ setSaveStatus('synced', 'Sincronizado'); }, 5000);

    // keyboard shortcuts: Ctrl+S to save, Ctrl+E to export
    document.addEventListener('keydown', (e) => {
      if(e.ctrlKey && e.key === 's') {
        e.preventDefault();
        saveDataImmediate();
        setSaveStatus('synced', '✓ Salvo (Ctrl+S)');
        setTimeout(() => setSaveStatus('synced', 'Sincronizado'), 3000);
      }
      if(e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        window.exportData();
      }
    });

    // export/import shortcuts (dev)

window.exportData = () => {
  const a = document.createElement('a');
  a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state));
  a.download = 'painel_backup_' + new Date().toISOString().slice(0,10) + '.json';
  a.click();
};

window.exportCsv = () => {
  const rows = [['Plataforma','Conta','Depósito','Re-depósito','Saque','Baú','Lucro']];
  Object.values(state.platforms).forEach(p => {
    p.accounts.forEach(acc => {
      const lucro = ((acc.saque||0)+(acc.bau||0)) - ((acc.deposito||0)+(acc.redeposito||0));
      rows.push([
        p.name,
        acc.name || '',
        (acc.deposito||0).toFixed(2),
        (acc.redeposito||0).toFixed(2),
        (acc.saque||0).toFixed(2),
        (acc.bau||0).toFixed(2),
        lucro.toFixed(2)
      ]);
    });
  });
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv);
  a.download = 'painel_contas_' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  showToast('CSV exportado com sucesso!', 'success');
};

window.exportXlsx = () => {
  // Build HTML table that Excel can open
  let html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">';
  html += '<head><meta charset="UTF-8"><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>';
  html += '<x:Name>Painel Financeiro</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>';
  html += '</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml></head><body><table>';
  html += '<tr><th>Plataforma</th><th>Conta</th><th>Depósito</th><th>Re-depósito</th><th>Saque</th><th>Baú</th><th>Lucro</th></tr>';
  let totalLucro = 0;
  Object.values(state.platforms).forEach(p => {
    p.accounts.forEach(acc => {
      const lucro = ((acc.saque||0)+(acc.bau||0)) - ((acc.deposito||0)+(acc.redeposito||0));
      totalLucro += lucro;
      const color = lucro >= 0 ? '#e6f9ef' : '#fde8e8';
      html += `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(acc.name||'')}</td><td>${(acc.deposito||0).toFixed(2)}</td><td>${(acc.redeposito||0).toFixed(2)}</td><td>${(acc.saque||0).toFixed(2)}</td><td>${(acc.bau||0).toFixed(2)}</td><td style="background:${color}">${lucro.toFixed(2)}</td></tr>`;
    });
  });
  html += `<tr><td colspan="6" style="font-weight:bold;text-align:right">TOTAL</td><td style="font-weight:bold">${totalLucro.toFixed(2)}</td></tr>`;
  html += '</table></body></html>';
  const blob = new Blob([html], {type:'application/vnd.ms-excel;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'painel_contas_' + new Date().toISOString().slice(0,10) + '.xls';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Planilha Excel exportada!', 'success');
};

    // importData com validação definida acima (showConfirmImport)
  

// Improved theme toggle: explicitly sets CSS variables for dark and light to ensure full switch
(function(){
  const root = document.documentElement;
  const setVars = (vars) => {
    Object.keys(vars).forEach(k => root.style.setProperty(k, vars[k]));
  };

  const darkVars = {
    '--bg': '#0f1115',
    '--card': '#1a1d22',
    '--muted': '#9ca3af',
    '--accent': '#3b82f6',
    '--success': '#17b169',
    '--danger': '#ff4d4f'
  };

  const lightVars = {
    '--bg': '#e8ecf1',
    '--card': '#f0f3f7',
    '--muted': '#6b7684',
    '--accent': '#2b7be4',
    '--success': '#17b169',
    '--danger': '#ff4d4f'
  };

  const applyTheme = (theme) => {
    if(theme === 'dark') {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
      setVars(darkVars);
    } else {
      document.body.classList.remove('dark');
      document.body.classList.add('light');
      setVars(lightVars);
    }
  };

  // init from storage or system preference
  const saved = localStorage.getItem('temaPainel');
  if(saved === 'dark' || saved === 'light') {
    applyTheme(saved);
  } else {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  // wire toggle button (if exists) to flip theme
  const btn = document.getElementById('toggleTheme');
  if(btn) {
    btn.addEventListener('click', ()=>{
      const current = document.body.classList.contains('dark') ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('temaPainel', next);
      if(typeof renderDailyProfitChart === 'function' && document.getElementById('chartContainer').style.display !== 'none') {
        renderDailyProfitChart();
      }
    });
  }
})();

    // ══════════════════════════════════════════════
    //  PLATAFORMAS GRID
    // ══════════════════════════════════════════════
    function renderPlatGrid() {
      const container = document.getElementById('platGrid');
      if (!container) return;

      const platforms = state.platformOrder
        ? state.platformOrder.filter(k => state.platforms[k])
        : Object.keys(state.platforms);

      if (platforms.length === 0) {
        container.className = '';
        container.innerHTML = `
          <div class="plat-grid-empty">
            <div class="plat-grid-empty-icon">🖥️</div>
            <h3>Nenhuma plataforma ainda</h3>
            <p>Crie sua primeira plataforma para começar a registrar suas contas</p>
            <button class="btn" onclick="openPlatNewModal()" style="margin-top:4px">+ Criar primeira plataforma</button>
          </div>`;
        return;
      }

      const cards = platforms.map(pName => {
        const p = state.platforms[pName];
        if (!p) return null;
        const lucro = p.accounts.reduce((s, a) =>
          s + (((a.saque||0)+(a.bau||0)) - ((a.deposito||0)+(a.redeposito||0))), 0);
        const lucroClass = lucro >= 0 ? 'pos' : 'neg';
        const cardClass = lucro >= 0 ? 'lucro-pos' : 'lucro-neg';
        const contas = p.accounts.length;

        const el = document.createElement('div');
        el.className = `plat-grid-card ${cardClass}`;
        el.innerHTML = `
          <div class="plat-grid-name"></div>
          <div class="plat-grid-profit ${lucroClass}">R$ ${money(lucro)}</div>
          <div class="plat-grid-meta">${contas} conta${contas !== 1 ? 's' : ''}</div>
          <div class="plat-grid-btns">
            <button class="plat-grid-btn" data-action="edit" title="Renomear">✏️ Renomear</button>
            <button class="plat-grid-btn del" data-action="del" title="Excluir">🗑️</button>
          </div>`;
        el.querySelector('.plat-grid-name').textContent = p.name;

        el.addEventListener('click', (e) => {
          if (e.target.closest('.plat-grid-btns')) return;
          selectPlatform(pName);
        });
        el.querySelector('[data-action="edit"]').addEventListener('click', (e) => {
          e.stopPropagation();
          showPrompt('Novo nome para a plataforma:', (newName) => {
            if (!newName || !newName.trim() || newName === pName) return;
            if (state.platforms[newName]) return showToast('Já existe uma plataforma com este nome.', 'error');
            const data = state.platforms[pName];
            data.name = newName;
            state.platforms[newName] = data;
            delete state.platforms[pName];
            if (state.platformOrder) {
              const idx = state.platformOrder.indexOf(pName);
              if (idx >= 0) state.platformOrder[idx] = newName;
            }
            if (state.selectedPlatform === pName) state.selectedPlatform = newName;
            scheduleSave(); renderPlatformsList(); renderPlatGrid();
          }, pName);
        });
        el.querySelector('[data-action="del"]').addEventListener('click', (e) => {
          e.stopPropagation();
          showConfirm(`Excluir a plataforma "${pName}" e todas as suas contas?`, () => {
            delete state.platforms[pName];
            if (state.platformOrder) state.platformOrder = state.platformOrder.filter(k => k !== pName);
            if (state.selectedPlatform === pName) state.selectedPlatform = null;
            scheduleSave(); renderPlatformsList(); renderPlatGrid(); renderSummary();
          });
        });
        return el;
      }).filter(Boolean);

      // card de adicionar nova
      const addCard = document.createElement('div');
      addCard.className = 'plat-grid-card plat-grid-add';
      addCard.innerHTML = `<div class="plat-grid-add-icon">+</div><div class="plat-grid-add-label">Nova Plataforma</div>`;
      addCard.onclick = openPlatNewModal;

      container.className = 'plat-grid-wrap';
      container.innerHTML = '';
      cards.forEach(c => { if (c) container.appendChild(c); });
      container.appendChild(addCard);
    }
    window.renderPlatGrid = renderPlatGrid;

    /* ---------- modal nova plataforma ---------- */
    function openPlatNewModal() {
      const overlay = document.getElementById('platNewOverlay');
      if (overlay) { overlay.classList.add('open'); setTimeout(() => document.getElementById('platNewInput')?.focus(), 50); }
    }
    function closePlatNewModal() {
      const overlay = document.getElementById('platNewOverlay');
      if (overlay) overlay.classList.remove('open');
    }
    function confirmPlatNew() {
      const input = document.getElementById('platNewInput');
      const v = (input?.value || '').trim();
      if (!v) { input?.focus(); return; }
      if (state.platforms[v]) { showToast('Plataforma já existe', 'error'); return; }
      state.platforms[v] = { name: v, accounts: [], createdAt: new Date().toISOString() };
      if (!state.platformOrder) state.platformOrder = [];
      state.platformOrder.push(v);
      if (input) input.value = '';
      closePlatNewModal();
      scheduleSave(); renderPlatformsList(); renderPlatGrid();
      selectPlatform(v);
    }
    window.openPlatNewModal  = openPlatNewModal;
    window.closePlatNewModal = closePlatNewModal;
    window.confirmPlatNew    = confirmPlatNew;

    }); // Fim do window.addEventListener('load')

    // ══════════════════════════════════════════════
    //  PROXYS — Gerenciamento completo v2
    // ══════════════════════════════════════════════
    (function(){
      const STORAGE_KEY = 'proxys_data_v1';
      let proxyCurrentTab = 'all'; // 'all' | 'fixa' | 'rotativa'

      /* ---------- persistência local ---------- */
      function loadProxies() {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch(e){ return []; }
      }
      function saveProxies(list) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      }

      /* ---------- helpers ---------- */
      function countryFlag(code) {
        if (!code || code.length !== 2) return '';
        return code.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
      }
      function latencyClass(ms) {
        if (ms === null || ms === undefined) return '';
        if (ms < 500) return 'fast';
        if (ms < 1500) return 'medium';
        return 'slow';
      }
      function latencyLabel(ms) {
        if (ms === null || ms === undefined) return '';
        return ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;
      }
      function extractIp(address) {
        return address.split(':')[0];
      }

      /* ---------- render ---------- */
      window.renderProxies = function() {
        const list = loadProxies();
        const search = (document.getElementById('proxySearch')?.value || '').toLowerCase();
        const container = document.getElementById('proxyList');
        if (!container) return;

        const filtered = list.filter(p => {
          const matchTab = proxyCurrentTab === 'all' || p.type === proxyCurrentTab;
          const matchSearch = !search || p.address.toLowerCase().includes(search);
          return matchTab && matchSearch;
        });

        // stats
        document.getElementById('proxyActiveCount').textContent = list.filter(p => p.status === 'ok' && !p.used).length;
        document.getElementById('proxyInactiveCount').textContent = list.filter(p => p.status === 'fail').length;
        document.getElementById('proxyUntestedCount').textContent = list.filter(p => p.status === 'unknown' && !p.used).length;
        document.getElementById('proxyUsedCount').textContent = list.filter(p => p.used).length;
        document.getElementById('proxyTotalCount').textContent = list.length;
        // Atualiza badge no menu lateral
        const unusedCount = list.filter(p => !p.used).length;
        const proxyNavBadge = document.getElementById('navProxyBadge');
        if(proxyNavBadge){ proxyNavBadge.textContent = unusedCount; proxyNavBadge.style.display = unusedCount > 0 ? 'inline-block' : 'none'; }

        if (filtered.length === 0) {
          container.innerHTML = `<div class="empty-state">
            <div class="empty-state-icon">🔗</div>
            <div class="empty-state-title">${list.length === 0 ? 'Nenhuma proxy ainda' : 'Nenhuma proxy encontrada'}</div>
            <div class="empty-state-sub">${list.length === 0 ? 'Clique em "Em lote" para adicionar várias de uma vez' : 'Tente mudar o filtro ou a busca'}</div>
          </div>`;
          return;
        }

        container.innerHTML = filtered.map(p => {
          const dotClass = p.status === 'ok' ? 'ok' : p.status === 'fail' ? 'fail' : p.status === 'testing' ? 'testing' : 'unknown';
          const cardClass = p.used ? 'used-proxy' : p.status === 'ok' ? 'active-proxy' : p.status === 'fail' ? 'inactive-proxy' : '';
          const statusLabel = p.status === 'ok' ? 'Ativa' : p.status === 'fail' ? 'Inativa' : p.status === 'testing' ? 'Testando...' : 'Não testada';

          // Latência
          const latBadge = (p.status === 'ok' && p.latency != null)
            ? `<span class="proxy-latency ${latencyClass(p.latency)}">${latencyLabel(p.latency)}</span>`
            : '';

          // País
          const geoStr = p.country
            ? `<span class="proxy-country">${countryFlag(p.countryCode)} ${p.country}</span>`
            : '';

          // Tag usada
          const usedTag = p.used
            ? `<span class="proxy-used-tag">✓ Usada</span>`
            : '';

          return `<div class="proxy-card ${cardClass} proxy-card-clickable" id="proxy-card-${p.id}" onclick="proxyCopyAndMark('${p.id}', event)" title="Clique para copiar e marcar como usada">
            <div class="proxy-status-dot ${dotClass}" title="${statusLabel}"></div>
            <div class="proxy-addr">${p.address}</div>
            ${geoStr}
            ${latBadge}
            ${usedTag}
            <span class="proxy-type-badge ${p.type}">${p.type === 'fixa' ? '🔒 Fixa' : '🔄 Rotativa'}</span>
            <div style="font-size:10px;color:var(--muted);white-space:nowrap">${statusLabel}</div>
            <div class="proxy-actions">
              <button class="proxy-act-btn copy" onclick="proxyCopyOne('${p.id}')" title="Copiar sem marcar">📋</button>
              <button class="proxy-act-btn test" onclick="proxyTestOne('${p.id}')" title="Testar">⚡</button>
              <button class="proxy-act-btn del" onclick="proxyDelete('${p.id}')" title="Remover">🗑</button>
            </div>
          </div>`;
        }).join('');
      };

      /* ---------- geolocalização via ip-api.com (via corsproxy) ---------- */
      async function fetchProxyGeo(address) {
        const ip = extractIp(address);
        if (!ip || ip === 'localhost' || ip.startsWith('192.') || ip.startsWith('10.') || ip.startsWith('172.')) return null;
        try {
          const res = await fetch(`https://corsproxy.io/?https://ip-api.com/json/${ip}?fields=status,country,countryCode,city`, { signal: AbortSignal.timeout(5000) });
          if (!res.ok) return null;
          const data = await res.json();
          if (data.status !== 'success') return null;
          return { country: data.country, countryCode: data.countryCode, city: data.city };
        } catch { return null; }
      }

      /* ---------- testar proxy com latência ---------- */
      async function testProxyAddress(address) {
        const parts = address.split(':');
        const ip = parts[0];
        const port = parts[1] || '80';
        const t0 = Date.now();

        // Estratégia de timing para detectar porta aberta:
        // • Porta FECHADA  → TCP RST instantâneo → TypeError em < 400ms
        // • Porta ABERTA, proxy segura conexão → sem erro até nosso timer de 3s → AbortError (= VIVA)
        // • Porta ABERTA, proxy responde HTTP  → fetch resolve com opaque response (= VIVA)
        // • Porta ABERTA, proxy fecha rápido  → TypeError após 400ms+ (= VIVA)
        let timerFired = false;
        const directResult = await new Promise(resolve => {
          const ctrl = new AbortController();
          const timer = setTimeout(() => {
            timerFired = true;
            ctrl.abort();
            // 3s sem erro = conexão TCP foi aceita = proxy definitivamente ativa
            resolve({ alive: true, latency: Date.now() - t0 });
          }, 3000);

          fetch(`http://${ip}:${port}/`, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal })
            .then(() => {
              clearTimeout(timer);
              // Resposta opaque recebida = proxy respondeu = ativa
              resolve({ alive: true, latency: Date.now() - t0 });
            })
            .catch(err => {
              if (timerFired) return; // timer já resolveu, evita double-resolve
              clearTimeout(timer);
              const elapsed = Date.now() - t0;
              if (err.name === 'AbortError') {
                resolve({ alive: true, latency: elapsed });
                return;
              }
              if (elapsed > 400) {
                // Demorou >400ms para dar erro = servidor estava lá e respondeu algo = proxy ativa
                // (threshold 400ms é seguro mesmo em redes lentas/VPN onde RST pode demorar)
                resolve({ alive: true, latency: elapsed });
              } else {
                // Erro rápido = porta fechada OU mixed-content bloqueado (página HTTPS)
                resolve({ alive: false, reason: 'quick-fail' });
              }
            });
        });

        if (directResult.alive) {
          return { ok: true, latency: directResult.latency, code: 0 };
        }

        // Fallback: corsproxy.io — cobre páginas abertas via HTTPS onde fetch direto http:// é bloqueado
        const ctrl2 = new AbortController();
        const tmr2 = setTimeout(() => ctrl2.abort(), 8000);
        try {
          const res = await fetch(`https://corsproxy.io/?http://${ip}:${port}/`, {
            mode: 'cors', cache: 'no-store', signal: ctrl2.signal
          });
          clearTimeout(tmr2);
          if (res.status >= 500) return { ok: false, reason: `HTTP ${res.status} — inacessível` };
          return { ok: true, code: res.status, latency: Date.now() - t0 };
        } catch (err2) {
          clearTimeout(tmr2);
          if (err2.name === 'AbortError') return { ok: false, reason: 'timeout' };
          return { ok: false, reason: 'unreachable' };
        }
      }

      /* ---------- adicionar ---------- */
      window.proxyAdd = function() {
        const input = document.getElementById('proxyInput');
        const typeSelect = document.getElementById('proxyTypeSelect');
        const raw = (input?.value || '').trim();
        if (!raw) return;

        const list = loadProxies();
        const lines = raw.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
        let added = 0;
        lines.forEach(addr => {
          if (list.some(p => p.address === addr)) return;
          list.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2), address: addr, type: typeSelect?.value || 'fixa', status: 'unknown', addedAt: Date.now() });
          added++;
        });
        saveProxies(list);
        if (input) input.value = '';
        renderProxies();
        if (added > 0) proxyShowToast(`${added} prox${added > 1 ? 'ys adicionadas' : 'y adicionada'}!`, 'success');
      };

      /* ---------- deletar ---------- */
      window.proxyDelete = function(id) {
        const list = loadProxies().filter(p => p.id !== id);
        saveProxies(list);
        renderProxies();
      };

      /* ---------- copiar uma (sem marcar) ---------- */
      window.proxyCopyOne = function(id) {
        const p = loadProxies().find(x => x.id === id);
        if (!p) return;
        navigator.clipboard.writeText(p.address).then(() => {
          const card = document.getElementById('proxy-card-' + id);
          if (card) { card.style.outline = '2px solid var(--success)'; setTimeout(() => card.style.outline = '', 800); }
        });
      };

      /* ---------- clicar no card: copia e marca como usada ---------- */
      window.proxyCopyAndMark = function(id, event) {
        // ignora cliques nos botões de ação
        if (event && event.target.closest('.proxy-actions')) return;

        const list = loadProxies();
        const idx = list.findIndex(p => p.id === id);
        if (idx < 0) return;

        const addr = list[idx].address;

        // toggle: se já usada, desmarca ao clicar novamente
        list[idx].used = !list[idx].used;
        if (list[idx].used) list[idx].usedAt = Date.now();
        else delete list[idx].usedAt;
        saveProxies(list);

        // copia somente ao marcar (não ao desmarcar)
        if (list[idx].used) {
          navigator.clipboard.writeText(addr).catch(() => {});
          // feedback visual rápido no card
          const card = document.getElementById('proxy-card-' + id);
          if (card) {
            card.style.transition = 'outline 0s';
            card.style.outline = '2px solid var(--success)';
            setTimeout(() => { card.style.outline = ''; renderProxies(); }, 600);
          }
          proxyShowToast(`📋 Copiada e marcada como usada!`);
        } else {
          renderProxies();
        }
      };

      /* ---------- copiar todas visíveis ---------- */
      window.proxyCopyAll = function() {
        const list = loadProxies();
        const search = (document.getElementById('proxySearch')?.value || '').toLowerCase();
        const visible = list.filter(p => {
          const matchTab = proxyCurrentTab === 'all' || p.type === proxyCurrentTab;
          const matchSearch = !search || p.address.toLowerCase().includes(search);
          return matchTab && matchSearch;
        });
        if (!visible.length) return;
        navigator.clipboard.writeText(visible.map(p => p.address).join('\n')).then(() => {
          proxyShowToast(`${visible.length} proxys copiadas!`, 'success');
        });
      };

      /* ---------- remover inativas ---------- */
      window.proxyRemoveInactive = function() {
        const list = loadProxies().filter(p => p.status !== 'fail');
        saveProxies(list);
        renderProxies();
      };

      window.proxyRemoveUsed = function() {
        const all = loadProxies();
        const removed = all.filter(p => p.used).length;
        if (!removed) { proxyShowToast('Nenhuma proxy marcada como usada.'); return; }
        saveProxies(all.filter(p => !p.used));
        renderProxies();
        proxyShowToast(`${removed} prox${removed !== 1 ? 'ys removidas' : 'y removida'}!`);
      };

      /* ---------- tab ---------- */
      window.setProxyTab = function(tab, btn) {
        proxyCurrentTab = tab;
        document.querySelectorAll('.proxy-tab-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        renderProxies();
      };

      /* ---------- importar arquivo ---------- */
      window.proxyImportClick = function() { document.getElementById('proxyImportFile')?.click(); };
      window.proxyImportFile = function(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(ev) {
          const lines = (ev.target.result || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          const list = loadProxies();
          const type = document.getElementById('proxyTypeSelect')?.value || 'fixa';
          let added = 0;
          lines.forEach(addr => {
            if (list.some(p => p.address === addr)) return;
            list.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2), address: addr, type, status: 'unknown', addedAt: Date.now() });
            added++;
          });
          saveProxies(list);
          renderProxies();
          proxyShowToast(`${added} proxys importadas!`, 'success');
        };
        reader.readAsText(file);
        e.target.value = '';
      };

      /* ---------- modal em lote ---------- */
      window.proxyBulkOpenModal = function() {
        const overlay = document.getElementById('proxyBulkOverlay');
        if (overlay) { overlay.classList.add('open'); document.getElementById('proxyBulkTextarea')?.focus(); }
      };
      window.proxyBulkCloseModal = function() {
        const overlay = document.getElementById('proxyBulkOverlay');
        if (overlay) overlay.classList.remove('open');
      };
      window.proxyBulkCount = function() {
        const val = document.getElementById('proxyBulkTextarea')?.value || '';
        const lines = val.split(/\n/).map(s => s.trim()).filter(Boolean);
        const counter = document.getElementById('proxyBulkCounter');
        if (counter) counter.textContent = `${lines.length} prox${lines.length !== 1 ? 'ys' : 'y'} detectada${lines.length !== 1 ? 's' : ''}`;
      };
      window.proxyBulkConfirm = function() {
        const val = document.getElementById('proxyBulkTextarea')?.value || '';
        const type = document.getElementById('proxyBulkType')?.value || 'fixa';
        const lines = val.split(/\n/).map(s => s.trim()).filter(Boolean);
        if (!lines.length) return;

        const list = loadProxies();
        let added = 0;
        lines.forEach(addr => {
          if (list.some(p => p.address === addr)) return;
          list.push({ id: Date.now() + '-' + Math.random().toString(36).slice(2), address: addr, type, status: 'unknown', addedAt: Date.now() });
          added++;
        });
        saveProxies(list);
        renderProxies();
        proxyBulkCloseModal();
        if (document.getElementById('proxyBulkTextarea')) document.getElementById('proxyBulkTextarea').value = '';
        proxyBulkCount();
        proxyShowToast(`${added} prox${added !== 1 ? 'ys adicionadas' : 'y adicionada'}! (${lines.length - added} duplicatas ignoradas)`, 'success');
      };

      /* ---------- testar uma da lista ---------- */
      window.proxyTestOne = async function(id) {
        let list = loadProxies();
        const idx = list.findIndex(p => p.id === id);
        if (idx < 0) return;
        list[idx].status = 'testing';
        saveProxies(list); renderProxies();

        const [result, geo] = await Promise.all([
          testProxyAddress(list[idx].address),
          fetchProxyGeo(list[idx].address)
        ]);

        list = loadProxies();
        const idx2 = list.findIndex(p => p.id === id);
        if (idx2 < 0) return;
        list[idx2].status = result.ok ? 'ok' : 'fail';
        list[idx2].testedAt = Date.now();
        if (result.ok && result.latency != null) list[idx2].latency = result.latency;
        if (geo) { list[idx2].country = geo.country; list[idx2].countryCode = geo.countryCode; list[idx2].city = geo.city; }
        saveProxies(list); renderProxies();
      };

      /* ---------- testar todas ---------- */
      window.proxyTestAll = async function() {
        const list = loadProxies();
        const search = (document.getElementById('proxySearch')?.value || '').toLowerCase();
        const toTest = list.filter(p => {
          const matchTab = proxyCurrentTab === 'all' || p.type === proxyCurrentTab;
          const matchSearch = !search || p.address.toLowerCase().includes(search);
          return matchTab && matchSearch;
        });
        if (!toTest.length) return;

        const btn = document.getElementById('proxyTestAllBtn');
        if (btn) { btn.disabled = true; btn.textContent = `⏳ Testando (0/${toTest.length})...`; }

        // Marca todas como "testing" antes de começar
        let l0 = loadProxies();
        toTest.forEach(p => { const i = l0.findIndex(x => x.id === p.id); if (i >= 0) l0[i].status = 'testing'; });
        saveProxies(l0); renderProxies();

        // Fila com concorrência limitada (máx 10 simultâneos) — evita sobrecarregar o event loop
        const CONCURRENCY = 10;
        let done = 0;
        let idx = 0;
        const runNext = async () => {
          if (idx >= toTest.length) return;
          const p = toTest[idx++];

          const [result, geo] = await Promise.all([testProxyAddress(p.address), fetchProxyGeo(p.address)]);

          let l = loadProxies();
          const i2 = l.findIndex(x => x.id === p.id);
          if (i2 >= 0) {
            l[i2].status = result.ok ? 'ok' : 'fail';
            l[i2].testedAt = Date.now();
            if (result.ok && result.latency != null) l[i2].latency = result.latency;
            if (geo) { l[i2].country = geo.country; l[i2].countryCode = geo.countryCode; l[i2].city = geo.city; }
            saveProxies(l);
          }
          done++;
          if (btn) btn.textContent = `⏳ Testando (${done}/${toTest.length})...`;
          renderProxies();
          await runNext(); // pega próximo da fila
        };
        await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toTest.length) }, runNext));

        if (btn) { btn.disabled = false; btn.textContent = '⚡ Testar todas'; }
        renderProxies();
      };

      /* ---------- validador rápido avulso ---------- */
      window.proxySingleTest = async function() {
        const input = document.getElementById('proxyValidateInput');
        const resultBox = document.getElementById('proxyTestResult');
        const btn = document.getElementById('proxyValidateBtn');
        const addr = (input?.value || '').trim();
        if (!addr) return;

        if (resultBox) { resultBox.style.display = 'block'; resultBox.className = 'proxy-test-result testing'; resultBox.textContent = `⏳ Testando ${addr}...`; }
        if (btn) btn.disabled = true;

        const [result, geo] = await Promise.all([testProxyAddress(addr), fetchProxyGeo(addr)]);

        if (resultBox) {
          if (result.ok) {
            const geoInfo = geo ? ` · ${countryFlag(geo.countryCode)} ${geo.country}${geo.city ? ', ' + geo.city : ''}` : '';
            const latInfo = result.latency != null ? ` · ${latencyLabel(result.latency)}` : '';
            resultBox.className = 'proxy-test-result ok';
            const codeLabel = result.code === 0 ? 'Porta aberta' : `HTTP ${result.code}`;
            resultBox.innerHTML = `✅ Proxy ativa! ${codeLabel}${latInfo}${geoInfo}`;
          } else {
            resultBox.className = 'proxy-test-result fail';
            const reason = result.reason === 'timeout' ? 'Timeout — sem resposta em 8s.' : result.reason === 'unreachable' ? 'Inacessível — sem resposta.' : `Erro: ${result.reason}`;
            resultBox.textContent = `❌ Proxy inativa. ${reason}`;
          }
        }
        if (btn) btn.disabled = false;
      };

      /* ---------- helper toast ---------- */
      function proxyShowToast(msg) {
        if (typeof window.showToastNotif === 'function') { window.showToastNotif(msg); return; }
        const el = document.createElement('div');
        el.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1a1e24;color:#fff;padding:11px 18px;border-radius:10px;font-size:13px;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.2)';
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2800);
      }

      function countryFlag(code) {
        if (!code || code.length !== 2) return '';
        return code.toUpperCase().replace(/./g, c => String.fromCodePoint(c.charCodeAt(0) + 127397));
      }
      function latencyClass(ms) {
        if (ms == null) return '';
        return ms < 500 ? 'fast' : ms < 1500 ? 'medium' : 'slow';
      }
      function latencyLabel(ms) {
        if (ms == null) return '';
        return ms < 1000 ? `${ms}ms` : `${(ms/1000).toFixed(1)}s`;
      }
    })();
