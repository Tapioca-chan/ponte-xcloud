// Xbox-inspired, low-overhead TV dashboard for the REAL xCloud WebRTC client.
// This is not an embedded xbox.com page and never displays invented games.
export function mountEmbeddedDashboard({api, QRCode, status, notifyParent, handlers}) {
  const $ = id => document.getElementById(id);
  // This selection originated from a console game tile, not an Xbox
  // entitlement assertion. Preserve it across Microsoft device auth/reload.
  const requestedParam=typeof location!=='undefined'?new URLSearchParams(location.search).get('game'):null;
  // Parent TV offers only featured titles or REAL Xbox MRU titles.
  // Treat this solely as a display/search hint; validate against Xbox
  // catalog IDs before ever passing a game to the streaming API.
  const requestedGame=typeof requestedParam==='string'&&requestedParam.length<=150
    && !/[<>\u0000-\u001f]/.test(requestedParam)?requestedParam:'';
  let selectionResolved=false;
  const autoLaunchRequested=typeof location!=='undefined' &&
    new URLSearchParams(location.search).get('autolaunch')==='1';
  let autoLaunchDone=false;
  $('tv').innerHTML = `
    <div class="xb-console">
      <div class="xb-app-top">
        <div class="xb-brand"><span class="xb-brand-orbit" aria-hidden="true">✕</span>
          <div><strong>xBridge <span>CLOUD</span></strong><small>Xbox Cloud Gaming • cliente independente</small></div></div>
        <nav class="xb-console-nav" aria-label="Biblioteca"><button type="button" id="xb-nav-home" class="is-active">Início</button><button type="button" id="xb-nav-recent">Recentes</button><button type="button" id="xb-nav-library">Biblioteca</button></nav>
        <div class="xb-app-tag"><span class="xb-signal"></span><span id="xb-auth-badge">Xbox não conectada</span>
          <button type="button" id="xb-settings-toggle" class="xb-gear" aria-label="Configurações">⚙</button>
        </div>
      </div>

      <section class="xb-gateway" id="xb-auth">
        <div class="xb-gateway-intro">
          <span class="xb-overline">SUA BIBLIOTECA, NA SUA TV</span>
          <h1>Comece a jogar.<br><em>O resto é com a nuvem.</em></h1>
          <p>Seu controle já está ligado ao xBridge. Conecte a conta Microsoft para encontrar os jogos realmente disponíveis no Xbox Cloud Gaming.</p>
          <div class="xb-gateway-stats"><span>◈ Jogos reais do Xbox</span><span>◉ Controle pelo Android</span><span>◇ Sem instalar apps na TV</span></div>
        </div>
        <div class="xb-login-panel">
          <div class="xb-label">01 / VINCULAR CONTA</div>
          <h2>Entre com a Microsoft</h2>
          <p>Use o celular para autorizar seu Xbox. Você não digita senha aqui.</p>
          <p id="xb-requested-game" class="xb-requested-game" hidden></p>
          <button id="embed-login" class="xb-button xb-button-primary" disabled>Conectar conta Microsoft <span aria-hidden="true">↗</span></button>
          <div class="xb-authorization" id="xb-authorization" hidden>
            <div class="xb-authorization-main">
              <div class="xb-qr-frame"><canvas id="xb-ms-qr" aria-label="QR Code para a página oficial de autorização Microsoft"></canvas></div>
              <div class="xb-authorization-text">
                <div class="xb-label">ESCANEIE COM SEU CELULAR</div>
                <p>Abra a página oficial da Microsoft e digite este código:</p>
                <div id="embed-code" class="xb-login-code" aria-label="Código de autorização"></div>
                <a id="xb-ms-link" class="xb-ms-link" href="https://www.microsoft.com/link" target="_blank" rel="noopener noreferrer">microsoft.com/link ↗</a>
              </div>
            </div>
            <div class="xb-auth-progress"><i class="xb-pulse"></i><span id="xb-auth-state">Aguardando você confirmar no celular…</span></div>
            <button id="embed-verify" class="xb-button xb-button-muted" type="button">Verificar agora</button>
            <small>Esse código expira. Se necessário, gere outro com o botão abaixo.</small>
          </div>
          <div id="xb-login-feedback" role="status" class="xb-login-feedback">Aguardando o servidor do xBridge.</div>
          <button id="xb-resume-retry" type="button" class="xb-button xb-button-muted" hidden>↻ Restaurar sessão Xbox salva novamente</button>
        </div>
      </section>

      <section id="xb-library" class="xb-library" hidden>
        <div class="xb-library-hero" id="xb-library-hero">
          <div class="xb-library-hero-art" id="xb-hero-art"></div>
          <div class="xb-library-hero-content">
            <div class="xb-label xb-featured-label"><span class="xb-featured-dot"></span> DESTAQUE · XBOX CLOUD GAMING</div>
            <h1 id="xb-hero-title">Sua próxima aventura</h1>
            <p id="xb-hero-description">Selecione um jogo da biblioteca para começar sua sessão na nuvem.</p>
            <div class="xb-hero-actions">
              <button id="embed-play" class="xb-button xb-button-primary" disabled>▶ Jogar agora</button>
              <span id="xb-hero-source">Biblioteca carregada da Microsoft</span>
            </div>
            <p id="xb-game-access" class="xb-game-access">O acesso será verificado quando escolher um jogo.</p>
            <p id="xb-launch-status" class="xb-launch-status" role="status" aria-live="polite"></p>
          </div>
        </div>
        <section id="xb-quick-access" class="xb-quick-access" aria-label="Acesso rápido a jogos" hidden>
          <div class="xb-row-heading"><div><span class="xb-label">ESCOLHIDOS PARA SUA SESSÃO</span><h2>Acesso rápido <span class="xb-row-arrow">↗</span></h2></div><span class="xb-row-hint">DIRECIONAL PARA NAVEGAR · A PARA SELECIONAR</span></div>
          <div id="xb-quick-row" class="xb-quick-row" role="group" aria-label="Jogos recentes e disponíveis na nuvem"></div>
        </section>
        <div class="xb-library-heading">
          <div><div class="xb-label">EXPLORE A NUVEM</div><h2>Biblioteca de jogos</h2></div>
          <div class="xb-library-tools"><input id="xb-game-search" type="search" autocomplete="off" placeholder="Pesquisar nos jogos carregados…" aria-label="Pesquisar jogos"/><button id="embed-titles" class="xb-button xb-button-muted" type="button">Atualizar</button></div>
        </div>
        <div class="xb-library-filters">
          <button id="xb-filter-cloud" class="xb-filter is-active" type="button">Catálogo na nuvem</button>
          <button id="xb-filter-access" class="xb-filter" type="button">Com acesso na conta</button>
          <button id="xb-filter-recent" class="xb-filter" type="button">Jogados recentemente</button>
          <button id="xb-filter-favorites" class="xb-filter" type="button">★ Meus favoritos</button>
        </div>
        <p class="xb-library-notice">O catálogo na nuvem não é a lista de compras da sua conta. “Com acesso” pode incluir jogos por assinatura Game Pass, não apenas os que você comprou. Títulos adquiridos sem suporte ao Xbox Cloud Gaming não aparecem aqui.</p>
        <div id="xb-results-count" class="xb-results-count">Carregando títulos reais do Xbox…</div>
        <div id="xb-games-grid" class="xb-games-grid" role="group" aria-label="Jogos disponíveis"></div>
        <div class="xb-catalog-bottom"><button id="xb-more" class="xb-button xb-button-muted" type="button" hidden>Carregar mais jogos ↓</button></div>
        <select id="embed-games" aria-label="Jogo selecionado" hidden></select>
      </section>

      <section class="xb-game-hub" id="xb-game-hub" hidden aria-label="Página do jogo selecionado">
       <div class="xb-game-hub-backdrop" id="xb-hub-backdrop"></div>
       <div class="xb-game-hub-body">
        <div class="xb-game-hub-top">
         <span class="xb-label">XBRIDGE / PERFIL DO JOGO</span>
         <button type="button" id="xb-hub-close" class="xb-button xb-button-muted" aria-label="Voltar à biblioteca">✕ Voltar</button>
        </div>
        <div class="xb-game-hub-intro">
         <div class="xb-game-hub-cover" id="xb-hub-cover"></div>
         <div class="xb-game-hub-text">
          <span class="xb-label" id="xb-hub-genre">XBOX CLOUD GAMING</span>
          <h2 id="xb-hub-name">Jogo</h2>
          <p id="xb-hub-description">Informações do catálogo Xbox.</p>
          <div class="xb-game-hub-metadata">
           <span id="xb-hub-publisher">Distribuidora não informada</span>
           <span id="xb-hub-access">Acesso Xbox a verificar</span>
           <span id="xb-hub-time">Tempo registrado no XBridge: 0 min</span>
          </div>
          <div class="xb-game-hub-actions">
           <button type="button" class="xb-button xb-button-primary" id="xb-hub-play">▶ Jogar agora</button>
           <button type="button" class="xb-button xb-button-muted" id="xb-hub-favorite">☆ Adicionar aos favoritos</button>
           <a class="xb-button xb-button-muted" id="xb-hub-store" href="https://www.xbox.com/pt-BR/games" target="_blank" rel="noopener noreferrer">↗ Loja Xbox</a>
          </div>
          <p class="xb-game-hub-help" id="xb-hub-favorite-status">Favoritos ficam neste dispositivo até conectar Discord e ativar a sincronização.</p>
          <p class="xb-game-hub-help">A compra, o Game Pass e a disponibilidade do jogo são verificados somente pelo Xbox.</p>
         </div>
        </div>
       </div>
      </section>

      <aside class="xb-settings-panel" id="xb-settings-panel" hidden aria-label="Configurações de jogos">
        <div class="xb-settings-heading"><div><div class="xb-label">XBRIDGE</div><h2>Configurações</h2></div><button type="button" id="xb-settings-close" aria-label="Fechar configurações">✕</button></div>
        <p class="xb-settings-hint">Os comandos técnicos ficam aqui. Sua biblioteca permanece limpa.</p>
        <div class="xb-player-tools" id="xb-player-tools">
        <div class="xb-player-buttons">
          <button id="embed-sound" class="xb-button xb-button-muted">Ativar áudio</button>
          <button id="embed-fullscreen" class="xb-button xb-button-muted">Tela cheia</button>
          <button id="embed-stop" class="xb-button xb-button-danger">Encerrar partida / fechar player</button>
          <button id="xb-logout" class="xb-button xb-button-danger" type="button">Desconectar conta Xbox deste navegador</button>
        </div>
        </div>
        <p class="xb-settings-hint">O xBridge mantém a autorização criptografada no banco MongoDB separado do bot. Reabrir o navegador ou reiniciar o servidor normalmente restaura a sessão. A Microsoft poderá exigir nova autorização quando ela for revogada ou expirar.</p>
      </aside>
    </div>`;
  if(requestedGame){
    $('xb-requested-game').hidden=false;
    $('xb-requested-game').textContent='JOGO SELECIONADO NO CONSOLE: '+requestedGame;
  }
  // The standalone player already uses these canonical element IDs.
  // The redesigned embedded markup deliberately prefixes them to avoid
  // collisions before mount. Switch them back BEFORE reading or binding any
  // handler. Omitting this causes a null.onclick TypeError, making the entire
  // player appear blank/forever loading on VIDAA.
  for (const id of ['login','verify','titles','play','sound','fullscreen','stop','code','games']) {
    const element = $('embed-' + id);
    if (!element) throw new Error('xBridge: missing embedded player element ' + id);
    element.id = id;
  }

    // Preserve the real game streaming handlers, never simulate a successful session.
  for (const id of ['play','sound','fullscreen','stop']) {
    const element=$(id);
    if (handlers[id]) element.onclick=handlers[id];
  }
  $('fullscreen').onclick=()=>notifyParent({type:'xbridge-fullscreen'});
  let authorized=false, authPolling=false, authTimer=0, authDeadline=0, authUri='', canAsk=false;
  const settingsPanel=$('xb-settings-panel');
  const toggleSettings=()=>{settingsPanel.hidden=!settingsPanel.hidden};
  $('xb-settings-toggle').onclick=toggleSettings;
  $('xb-settings-close').onclick=()=>{settingsPanel.hidden=true};
  $('xb-nav-home').onclick=()=>setFilter('cloud');
  $('xb-nav-recent').onclick=()=>setFilter('recent');
  $('xb-nav-library').onclick=()=>setFilter('cloud');
  $('xb-logout').onclick=async()=>{
    if(!authorized){settingsPanel.hidden=true;return}
    $('xb-logout').disabled=true;
    try{
      await api('logout');
      authorized=false;stopPolling();settingsPanel.hidden=true;
      show('xb-library',false);show('xb-auth',true);show('xb-authorization',false);
      $('login').disabled=false;$('xb-auth-badge').textContent='Xbox não conectada';
      status('Conta desconectada. Use o QR Code para entrar novamente.');
      $('xb-login-feedback').textContent='Conta Xbox desconectada com sucesso.';
    }catch(e){
      status('Não foi possível desconectar a conta Xbox.');
    }finally{$('xb-logout').disabled=false}
  };
  let currentGames=[], recentGames=[], nextOffset=0, loading=false, selectedId='', currentSearch='', activeFilter='cloud';
  let xboxRateLimitedUntil=0;
  function show(id, visible) { const el=$(id); if(el)el.hidden=!visible; }
  function authInfo(message){$('xb-auth-state').textContent=message;$('xb-login-feedback').textContent=message;}
  function allowOfficialLink(input) {
    try {
      const u=new URL(input);
      const host=u.hostname.toLowerCase();
      if (u.protocol==='https:' && (host==='microsoft.com'||host.endsWith('.microsoft.com')||host==='live.com'||host.endsWith('.live.com')||host==='microsoftonline.com'||host.endsWith('.microsoftonline.com'))) return u.href;
    }catch(_){}
    return 'https://www.microsoft.com/link';
  }
  function stopPolling(){ if(authTimer)clearTimeout(authTimer);authTimer=0;authPolling=false; }
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function loadCatalog(reset=false){
    if(loading||!authorized)return;
    if(Date.now()<xboxRateLimitedUntil){
      $('xb-results-count').textContent='O Xbox limitou temporariamente as consultas (HTTP 429). Aguarde aproximadamente um minuto antes de atualizar.';
      return;
    }
    loading=true;
    const btn=$('titles'), more=$('xb-more');
    btn.disabled=true;more.disabled=true;
    if(reset){currentGames=[];nextOffset=0;selectedId='';$('games').replaceChildren();$('xb-games-grid').replaceChildren();}
    $('xb-results-count').textContent='Buscando jogos reais da Microsoft…';
    try{
      const result=await api('catalog',{offset:nextOffset,limit:36});
      if(!Array.isArray(result.games))throw Error('Catálogo indisponível.');
      for(const game of result.games){
        if(!game||!game.titleId||currentGames.some(x=>x.titleId===game.titleId))continue;
        currentGames.push(game);
      }
      nextOffset=typeof result.next==='number'?result.next:null;
      show('xb-more',activeFilter==='cloud'&&nextOffset!==null);
      displayGames();
      renderQuickAccess();
      if(requestedGame&&!selectionResolved){
        // The highlighted home game may not be on catalog page 1.
        // Search the real Xbox title registry once, never launch an
        // unverified ID or endlessly paginate (429 risk).
        const norm=v=>String(v||'').toLowerCase().normalize('NFD')
          .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
        let match=currentGames.find(game=>norm(game.name)===norm(requestedGame));
        if(!match){
          try{
            const lookup=await api('catalog',{search:requestedGame,offset:0,limit:12});
            for(const game of Array.isArray(lookup.games)?lookup.games:[]){
              if(game?.titleId&&!currentGames.some(x=>x.titleId===game.titleId))currentGames.push(game);
            }
            match=currentGames.find(game=>norm(game.name)===norm(requestedGame))
              ||currentGames.find(game=>norm(game.name).includes(norm(requestedGame)));
          }catch(_){ /* Xbox search unavailable: preserve normal library. */ }
        }
        selectionResolved=true;
        if(match){
          selectGame(match.titleId);
          displayGames();
          renderQuickAccess();
          if(match.accessible===false){
            // Real Xbox catalog explicitly reports no entitlement. Show
            // purchase/plan alternatives; never silently launch a denied game.
            notifyParent({type:'xbridge-game-access',status:'not_owned',
              name:String(match.name||requestedGame).slice(0,150),
              productId:String(match.productId||'').slice(0,40)});
            status(requestedGame+' sem acesso confirmado no Xbox. Confira a loja ou assinatura.');
          }else if(autoLaunchRequested&&!autoLaunchDone){
            autoLaunchDone=true;
            status('Abrindo '+requestedGame+' diretamente na TV…');
            // The normal Xbox stream handler validates entitlement again.
            // Autoplay restrictions on VIDAA may require pressing A on TV.
            setTimeout(()=>{if(!$('play').disabled)$('play').click();},120);
          }else status(requestedGame+' localizado na biblioteca Xbox. Selecione Jogar agora.');
        }else{
          $('xb-results-count').textContent='O jogo '+requestedGame+
            ' não foi encontrado no catálogo Xbox disponível nesta conta. Você pode procurar outro título abaixo.';
          status('Jogo destacado não encontrado neste catálogo. Não foi iniciada nenhuma sessão.');
        }
      }
      if(!selectedId&&currentGames.length&&!requestedGame)selectGame(currentGames[0].titleId);
      if(!currentGames.length)$('xb-results-count').textContent='Nenhum jogo disponível foi retornado pela Microsoft nesta conta.';
      status(currentGames.length+' títulos reais carregados. Selecione um jogo.');
    }catch(error){
      if(error?.status===429){
        xboxRateLimitedUntil=Date.now()+90000;
        $('xb-results-count').textContent='O Xbox limitou temporariamente as solicitações (HTTP 429). Aguarde antes de atualizar; não é necessário fazer novo login.';
        status('Limite temporário no catálogo Xbox. Sua conta permanece salva.');
      }else{
        $('xb-results-count').textContent='Não foi possível carregar os jogos: '+String(error.message||error).slice(0,160)+'. Tente Atualizar.';
        status('O catálogo não foi carregado.');
      }
    }finally{loading=false;btn.disabled=false;more.disabled=false;}
  }
  function safeCover(uri){
    try {
      const u=new URL(uri);
      const host=u.hostname.toLowerCase();
      return u.protocol==='https:' && (host==='xbox.com'||host.endsWith('.xbox.com')||host.endsWith('.xboxlive.com')||host.endsWith('.s-microsoft.com')||host.endsWith('.microsoft.com'))
        ?u.href:'';
    }catch(_){return ''}
  }
  // Reuse only titles returned by the actual Xbox Cloud catalog or account.
  // Limit artwork to 8 extra covers so VIDAA's browser remains responsive.
  const localFavoriteKey='xbridge:device-favorites-v1';
  let savedFavorites=[];
  let hubGame=null;
  async function refreshFavoriteGames(){
    let values=localFavorites();
    try{
      const response=await fetch('/api/console/favorites',{credentials:'same-origin'});
      if(response.ok){const data=await response.json();
       values=Array.isArray(data.favorites)?data.favorites:[];}
    }catch(_){}
    savedFavorites=values.filter(g=>g&&g.titleId&&g.name).slice(0,100);
  }
  const localFavorites=()=>{
   try{const a=JSON.parse(localStorage.getItem(localFavoriteKey)||'[]');return Array.isArray(a)?a:[];}
   catch{return [];}
  };
  async function updateFavoriteLabel(){
   if(!hubGame)return;
   let favorites=localFavorites(),synced=false;
   try{
    const response=await fetch('/api/console/favorites',{credentials:'same-origin'});
    if(response.ok){const data=await response.json();favorites=data.favorites||[];synced=true;}
   }catch(_){}
   $('xb-hub-favorite').textContent=favorites.some(x=>x.titleId===hubGame.titleId)
     ?'★ Remover dos favoritos':'☆ Adicionar aos favoritos';
   $('xb-hub-favorite-status').textContent=synced
     ?'Favoritos sincronizados com sua conta Discord.'
     :'Favoritos salvos neste dispositivo. Conecte Discord e configure a sincronização para acessar em outros dispositivos.';
  }
  const normGameTitle=value=>String(value||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
  function openGameHub(id){
   const game=currentGames.find(x=>x.titleId===id)||recentGames.find(x=>x.titleId===id)||savedFavorites.find(x=>x.titleId===id);
   if(!game)return;
   selectGame(id);hubGame=game;
   $('xb-hub-name').textContent=game.name||'Jogo';
   $('xb-hub-genre').textContent=game.genre||'XBOX CLOUD GAMING';
   $('xb-hub-description').textContent=game.description||'Informações adicionais não fornecidas pelo catálogo Xbox.';
   $('xb-hub-publisher').textContent='Estúdio / Editora: '+(game.publisher||'não informado');
   $('xb-hub-access').textContent=game.accessible===true?'Acesso à nuvem informado pelo Xbox':
     game.accessible===false?'O Xbox não confirmou acesso':'Acesso não confirmado';
   const art=$('xb-hub-cover');art.replaceChildren();
   const imgSrc=safeCover(game.hero||game.tile);
   if(imgSrc){const img=document.createElement('img');img.src=imgSrc;img.alt='Arte de '+game.name;art.appendChild(img);}
   else{art.textContent=String(game.name||'?').slice(0,1);}
   let minutes=0;
   try{const times=JSON.parse(localStorage.getItem('xbridge:local-playtime-v1')||'{}');
    minutes=Number(times[String(game.name||'').toLowerCase()]?.minutes)||0;}catch(_){}
   $('xb-hub-time').textContent='Tempo jogado neste XBridge: '+(minutes<1?'<1 min':Math.floor(minutes/60)+'h '+Math.floor(minutes%60)+'min');
   $('xb-hub-play').disabled=game.accessible===false;
   const product=String(game.productId||'');
   const slug=String(game.name||'').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
   const store=$('xb-hub-store');
   // Xbox product IDs come from Microsoft's own catalog. Without one,
   // open the official game store index instead of fabricating a URL.
   store.href=/^[A-Z0-9]{12}$/i.test(product)
    ?'https://www.xbox.com/pt-BR/games/store/'+slug+'/'+product.toUpperCase()
    :'https://www.xbox.com/pt-BR/games';
   store.textContent=/^[A-Z0-9]{12}$/i.test(product)?'↗ Ver na Loja Xbox':'↗ Explorar Loja Xbox';
   show('xb-game-hub',true);
   $('xb-hub-play').focus();
   void updateFavoriteLabel();
  }
  $('xb-hub-close').onclick=()=>show('xb-game-hub',false);
  $('xb-hub-play').onclick=()=>{
   show('xb-game-hub',false);
   if(!$('play').disabled)$('play').click();
  };
  $('xb-hub-favorite').onclick=async()=>{
   if(!hubGame)return;
   const game={titleId:hubGame.titleId,name:hubGame.name,tile:safeCover(hubGame.tile),
    hero:safeCover(hubGame.hero),genre:hubGame.genre||'',publisher:hubGame.publisher||'',
    description:hubGame.description||'',productId:hubGame.productId||''};
   try{
    const result=await fetch('/api/console/favorites',{method:'POST',
     headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({game})});
    if(result.ok){await refreshFavoriteGames();await updateFavoriteLabel();if(activeFilter==='favorites')displayGames();return;}
   }catch(_){}
   const existing=localFavorites(),has=existing.some(x=>x.titleId===game.titleId);
   try{localStorage.setItem(localFavoriteKey,JSON.stringify(has
    ?existing.filter(x=>x.titleId!==game.titleId):[game,...existing].slice(0,100)));}catch(_){}
   await refreshFavoriteGames();await updateFavoriteLabel();
   if(activeFilter==='favorites')displayGames();
  };
  function launchXboxRecentDirectly(game){
    if(!game?.titleId)return;
    selectGame(game.titleId);
    // The original Xbox stream handler checks titleId and access against
    // the authenticated cloud session. Never bypass a denied entitlement.
    if(game.accessible===false || $('play').disabled){
      notifyParent({type:'xbridge-game-access',status:'not_owned',
        name:String(game.name||'').slice(0,150),
        productId:String(game.productId||'').slice(0,40)});
      return;
    }
    status('Abrindo '+String(game.name||'jogo')+' diretamente na sessão Xbox…');
    $('play').click();
  }
  function renderQuickAccess(){
    const row=$('xb-quick-row');
    row.replaceChildren();
    const ids=new Set();
    const quick=[...recentGames,...currentGames].filter(game=>{
      if(!game?.titleId || ids.has(game.titleId))return false;
      ids.add(game.titleId);return true;
    }).slice(0,8);
    show('xb-quick-access',quick.length>0);
    for(const game of quick){
      const button=document.createElement('button');
      button.type='button';
      button.className='xb-quick-card';
      button.setAttribute('aria-label','Selecionar '+String(game.name||'jogo'));
      const cover=safeCover(game.tile||game.hero);
      const art=document.createElement('span');
      art.className='xb-quick-art';
      if(cover){
        const image=document.createElement('img');
        image.src=cover;image.alt='';image.loading='lazy';art.appendChild(image);
      }else{
        const fallback=document.createElement('b');
        fallback.textContent=String(game.name||'?').charAt(0);art.appendChild(fallback);
      }
      const label=document.createElement('span');
      label.className='xb-quick-title';
      label.textContent=String(game.name||'Jogo');
      const meta=document.createElement('small');
      meta.textContent=recentGames.some(item=>item.titleId===game.titleId)
        ?'Jogado recentemente':'Xbox Cloud Gaming';
      button.appendChild(art);button.appendChild(label);button.appendChild(meta);
      button.onclick=()=>{
        if(recentGames.some(x=>x.titleId===game.titleId))
          launchXboxRecentDirectly(game);
        else openGameHub(game.titleId);
      };
      row.appendChild(button);
    }
  }
  function displayGames(){
    const q=currentSearch.trim().toLocaleLowerCase('pt-BR');
    const grid=$('xb-games-grid');
    grid.replaceChildren();
    const source=activeFilter==='recent'?recentGames:
      activeFilter==='favorites'?savedFavorites.map(g=>currentGames.find(x=>x.titleId===g.titleId)||g):
      activeFilter==='access'?currentGames.filter(g=>g.accessible===true):currentGames;
    const results=source.filter(g=>!q||String(g.name||g.titleId).toLocaleLowerCase('pt-BR').includes(q));
    const fragment=document.createDocumentFragment();
    for (const game of results){
      const button=document.createElement('button');
      button.type='button';
      button.className='xb-game-card'+(game.titleId===selectedId?' is-selected':'');
      button.setAttribute('aria-label','Selecionar '+(game.name||game.titleId));
      button.dataset.titleId=game.titleId;
      const art=document.createElement('div');art.className='xb-game-art';
      const image=safeCover(game.tile);
      if(image){
        const img=document.createElement('img');img.src=image;img.alt='';img.loading='lazy';
        art.appendChild(img);
      }else{
        const fallback=document.createElement('span');fallback.textContent=String(game.name||game.titleId).slice(0,1).toUpperCase();
        fallback.className='xb-art-initial';art.appendChild(fallback);
      }
      const label=document.createElement('div');label.className='xb-card-name';label.textContent=String(game.name||game.titleId);
      const tag=document.createElement('small');tag.className='xb-card-sub';
      tag.textContent=game.accessible===true?'● Acesso confirmado na nuvem':game.accessible===false?'Sem acesso confirmado':game.genre||'Acesso não verificado';
      button.appendChild(art);button.appendChild(label);button.appendChild(tag);
      button.onclick=()=>activeFilter==='recent'?
        launchXboxRecentDirectly(game):openGameHub(game.titleId);
      fragment.appendChild(button);
    }
    grid.appendChild(fragment);
    const noResults=activeFilter==='recent'?'Sem jogos recentes da conta identificados na nuvem.':
      activeFilter==='favorites'?'Nenhum favorito. Abra o perfil do jogo e adicione à sua lista.':
      activeFilter==='access'?'Nenhum jogo com acesso confirmado neste lote. Carregue mais títulos ou consulte o catálogo oficial.':
      'Nenhum jogo corresponde à pesquisa.';
    $('xb-results-count').textContent=results.length
      ?results.length+' jogos exibidos • '+source.length+' nesta seção'
      :noResults;
  }
  function selectGame(id){
    const game=currentGames.find(x=>x.titleId===id)||recentGames.find(x=>x.titleId===id)||savedFavorites.find(x=>x.titleId===id);if(!game)return;
    selectedId=id;
    const select=$('games');select.replaceChildren();
    const option=document.createElement('option');option.value=game.titleId;option.textContent=game.name||game.titleId;
    select.appendChild(option);
    const cover=safeCover(game.hero||game.tile);
    const hero=$('xb-hero-art');hero.replaceChildren();
    if(cover){const img=document.createElement('img');img.alt='';img.src=cover;hero.appendChild(img);}
    $('xb-hero-title').textContent=game.name||game.titleId;
    $('xb-hero-description').textContent=game.description||game.genre||'Inicie um jogo real dos servidores Xbox Cloud Gaming. A disponibilidade depende da sua conta.';
    $('xb-hero-source').textContent=game.publisher||'Biblioteca oficial de jogos na nuvem';
    $('xb-game-access').textContent=game.accessible===true
      ?'Esta conta informa acesso ao jogo pela nuvem (não confirma compra permanente).'
      :game.accessible===false
        ?'Esta conta não informa acesso a este jogo. Confirme no Xbox oficial.'
        :'Não foi possível verificar a licença desta conta. O Xbox poderá recusar a partida.';
    $('xb-launch-status').textContent='';
    // Send only the selected title, never the Microsoft account or tokens.
    notifyParent({type:'xbridge-selected-title',title:String(game.name||'').slice(0,150)});
    $('play').disabled=game.accessible===false;
    const cards=document.querySelectorAll('.xb-game-card');cards.forEach(c=>{c.classList.toggle('is-selected',c.dataset.titleId===id)});
  }
  $('xb-game-search').addEventListener('input',e=>{currentSearch=e.target.value;displayGames()});
  function setFilter(mode){
    activeFilter=mode;
    settingsPanel.hidden=true;
    for(const name of ['home','recent','library']) $('xb-nav-'+name).classList.toggle('is-active',
      mode==='recent'?name==='recent':name==='home'||name==='library');
    for (const key of ['cloud','access','recent','favorites'])
      $('xb-filter-'+key).classList.toggle('is-active',mode===key);
    displayGames();
    show('xb-more',mode==='cloud'&&typeof nextOffset==='number');
  }
  $('xb-filter-cloud').onclick=()=>setFilter('cloud');
  $('xb-filter-access').onclick=()=>setFilter('access');
  $('xb-filter-recent').onclick=()=>setFilter('recent');
  $('xb-filter-favorites').onclick=async()=>{await refreshFavoriteGames();setFilter('favorites');};
  async function loadRecent(){
    if(Date.now()<xboxRateLimitedUntil)return;
    try{
      const result=await api('recent');
      recentGames=Array.isArray(result.games)?result.games.filter(g=>g&&g.titleId):[];
      // Real Xbox MRU only; no made-up recent game list or entitlement.
      notifyParent({type:'xbridge-xbox-recent',games:recentGames.slice(0,6).map(game=>({
       titleId:String(game.titleId||'').slice(0,160),name:String(game.name||'').slice(0,150),
       tile:safeCover(game.tile),hero:safeCover(game.hero),genre:String(game.genre||'').slice(0,90),
       ...(typeof game.accessible==='boolean'?{accessible:game.accessible}:{}),
       publisher:String(game.publisher||'').slice(0,80),description:String(game.description||'').slice(0,450),
       productId:String(game.productId||'').slice(0,40)
      }))});
      if(activeFilter==='recent')displayGames();
      renderQuickAccess();
    }catch(error){
      recentGames=[];
      if(activeFilter==='recent')$('xb-results-count').textContent='Não foi possível consultar os jogos recentes desta conta. Verifique se este recurso está disponível.';
    }
  }
  $('xb-more').onclick=()=>{if(typeof nextOffset==='number')loadCatalog(false)};
  $('titles').onclick=()=>loadCatalog(true);

  async function finishAuth(){
    if(authorized)return;
    authorized=true;stopPolling();show('xb-auth',false);show('xb-library',true);
    notifyParent({type:'xbridge-xbox-auth',authenticated:true});
    $('xb-auth-badge').textContent='Xbox conectada';
    authInfo('Conta conectada.');
    status('Conta Xbox conectada. Carregando jogos reais…');
    await loadCatalog(true);
    void refreshFavoriteGames();
    // The MRU list is personalized account activity, not purchased ownership.
    void loadRecent();
  }
  async function pollAuth(){
    if(!canAsk||authorized||authPolling)return;
    if(Date.now()>authDeadline){stopPolling();canAsk=false;authInfo('Este código expirou. Selecione Conectar conta Microsoft para gerar outro.');return;}
    authPolling=true;
    try{
      const data=await api('verify');
      if(data.ok)await finishAuth();
      else if(data.remembered===true && data.reason==='cloud_unavailable'){
        // Microsoft consent was valid and encrypted credentials are already
        // saved. Reload to use the normal resume flow, not another QR code.
        authInfo('Conta Microsoft salva. Restaurando sua sessão Xbox…');
        stopPolling();
        window.location.reload();
      }
    }catch(_){
      if(!authorized)authInfo('Aguardando sua confirmação na página Microsoft…');
    }finally{authPolling=false;}
  }
  async function beginAuth(){
    if(authPolling)return;
    stopPolling();canAsk=false;$('login').disabled=true;
    $('xb-login-feedback').textContent='Gerando autorização segura…';
    try{
      const data=await api('login');
      if(!data||typeof data.user_code!=='string')throw Error('A Microsoft não retornou um código.');
      authUri=allowOfficialLink(data.verification_uri);
      const directQr=typeof data.verification_uri_complete==='string' && data.verification_uri_complete
        ? allowOfficialLink(data.verification_uri_complete) : authUri;
      $('code').textContent=data.user_code;
      notifyParent({type:'xbridge-xbox-auth',authenticated:false,code:data.user_code,url:authUri});
      const link=$('xb-ms-link');link.href=authUri;link.textContent=new URL(authUri).hostname+new URL(authUri).pathname+' ↗';
      show('xb-authorization',true);
      try{await QRCode.toCanvas($('xb-ms-qr'),directQr,{width:176,margin:1,color:{dark:'#07130e',light:'#ffffff'}})}
      catch(_){$('xb-ms-qr').hidden=true}
      canAsk=true;authDeadline=Date.now()+Math.max(120,Number(data.expires_in)||900)*1000;
      const delay=Math.max(9000,Math.min(30000,Number(data.interval||8)*1000+1500));
      authInfo('Escaneie o QR Code no celular. Esta tela reconhecerá o login automaticamente.');
      $('verify').onclick=()=>{void pollAuth()};
      authTimer=setInterval(()=>{void pollAuth()},delay);
      // Device-flow requests should respect the server-provided poll interval.
    }catch(e){$('xb-login-feedback').textContent='Não foi possível iniciar a autorização: '+String(e.message||e).slice(0,160)}
    finally{$('login').disabled=false;$('login').textContent='Gerar outro código Microsoft ↗'}
  }
  $('xb-resume-retry').onclick=()=>window.location.reload();
  $('login').onclick=()=>{void beginAuth()};
  $('verify').onclick=()=>{void pollAuth()};
  window.addEventListener('pagehide',stopPolling,{once:true});
  return {
    beginAuth(){if(!authorized)return beginAuth();return Promise.resolve();},
    ready(){ $('login').disabled=false; $('xb-login-feedback').textContent='Pronto. Autorize com sua conta Microsoft.'; },
    restored(){ return finishAuth(); },
    error(message){ $('xb-login-feedback').textContent=message; }
  };
}
