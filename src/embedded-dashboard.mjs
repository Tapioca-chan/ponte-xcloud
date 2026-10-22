// Xbox-inspired, low-overhead TV dashboard for the REAL xCloud WebRTC client.
// This is not an embedded xbox.com page and never displays invented games.
export function mountEmbeddedDashboard({api, QRCode, status, notifyParent, handlers}) {
  const $ = id => document.getElementById(id);
  $('tv').innerHTML = `
    <div class="xb-console">
      <div class="xb-app-top">
        <div class="xb-brand"><span class="xb-brand-orbit" aria-hidden="true">✕</span>
          <div><strong>XBOX <span>CLOUD GAMING</span></strong><small>via xBridge • cliente experimental</small></div></div>
        <div class="xb-app-tag"><span class="xb-signal"></span> Xbox Cloud • WebRTC</div>
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
        </div>
      </section>

      <section id="xb-library" class="xb-library" hidden>
        <div class="xb-library-hero">
          <div class="xb-library-hero-art" id="xb-hero-art"></div>
          <div class="xb-library-hero-content">
            <div class="xb-label">XBOX CLOUD GAMING • SELEÇÃO</div>
            <h1 id="xb-hero-title">Sua próxima aventura</h1>
            <p id="xb-hero-description">Selecione um jogo da biblioteca para começar sua sessão na nuvem.</p>
            <div class="xb-hero-actions">
              <button id="embed-play" class="xb-button xb-button-primary" disabled>▶ Jogar agora</button>
              <span id="xb-hero-source">Biblioteca carregada da Microsoft</span>
            </div>
          </div>
        </div>
        <div class="xb-library-heading">
          <div><div class="xb-label">SUA BIBLIOTECA</div><h2>Jogos na nuvem</h2></div>
          <div class="xb-library-tools"><input id="xb-game-search" type="search" autocomplete="off" placeholder="Pesquisar nos jogos carregados…" aria-label="Pesquisar jogos"/><button id="embed-titles" class="xb-button xb-button-muted" type="button">Atualizar</button></div>
        </div>
        <div id="xb-results-count" class="xb-results-count">Carregando títulos reais do Xbox…</div>
        <div id="xb-games-grid" class="xb-games-grid" role="group" aria-label="Jogos disponíveis"></div>
        <div class="xb-catalog-bottom"><button id="xb-more" class="xb-button xb-button-muted" type="button" hidden>Carregar mais jogos ↓</button></div>
        <select id="embed-games" aria-label="Jogo selecionado" hidden></select>
      </section>

      <div class="xb-player-tools" id="xb-player-tools">
        <span class="xb-tool-tip">Xbox Cloud Gaming • transmissão experimental direta por WebRTC</span>
        <div class="xb-player-buttons">
          <button id="embed-sound" class="xb-button xb-button-muted">Ativar áudio</button>
          <button id="embed-fullscreen" class="xb-button xb-button-muted">Tela cheia</button>
          <button id="embed-stop" class="xb-button xb-button-danger">Encerrar sessão</button>
        </div>
      </div>
    </div>`;
  // Preserve the real game streaming handlers, never simulate a successful session.
  for (const id of ['play','sound','fullscreen','stop']) {
    const element=$(id);
    if (handlers[id]) element.onclick=handlers[id];
  }
  $('fullscreen').onclick=()=>notifyParent({type:'xbridge-fullscreen'});
  let authorized=false, authPolling=false, authTimer=0, authDeadline=0, authUri='', canAsk=false;
  let currentGames=[], nextOffset=0, loading=false, selectedId='', currentSearch='';
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
      show('xb-more',nextOffset!==null);
      displayGames();
      if(!selectedId&&currentGames.length)selectGame(currentGames[0].titleId);
      if(!currentGames.length)$('xb-results-count').textContent='Nenhum jogo disponível foi retornado pela Microsoft nesta conta.';
      status(currentGames.length+' títulos reais carregados. Selecione um jogo.');
    }catch(error){
      $('xb-results-count').textContent='Não foi possível carregar os jogos: '+String(error.message||error).slice(0,160)+'. Tente Atualizar.';
      status('O catálogo não foi carregado.');
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
  function displayGames(){
    const q=currentSearch.trim().toLocaleLowerCase('pt-BR');
    const grid=$('xb-games-grid');
    grid.replaceChildren();
    const results=currentGames.filter(g=>!q||String(g.name||g.titleId).toLocaleLowerCase('pt-BR').includes(q));
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
      const tag=document.createElement('small');tag.className='xb-card-sub';tag.textContent=game.genre||'Xbox Cloud Gaming';
      button.appendChild(art);button.appendChild(label);button.appendChild(tag);
      button.onclick=()=>selectGame(game.titleId);
      fragment.appendChild(button);
    }
    grid.appendChild(fragment);
    $('xb-results-count').textContent=results.length+' jogos exibidos • '+currentGames.length+' carregados';
  }
  function selectGame(id){
    const game=currentGames.find(x=>x.titleId===id);if(!game)return;
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
    $('play').disabled=false;
    const cards=document.querySelectorAll('.xb-game-card');cards.forEach(c=>{c.classList.toggle('is-selected',c.dataset.titleId===id)});
  }
  $('xb-game-search').addEventListener('input',e=>{currentSearch=e.target.value;displayGames()});
  $('xb-more').onclick=()=>{if(typeof nextOffset==='number')loadCatalog(false)};
  $('titles').onclick=()=>loadCatalog(true);

  async function finishAuth(){
    if(authorized)return;
    authorized=true;stopPolling();show('xb-auth',false);show('xb-library',true);
    authInfo('Conta conectada.');
    status('Conta Xbox conectada. Carregando jogos reais…');
    await loadCatalog(true);
  }
  async function pollAuth(){
    if(!canAsk||authorized||authPolling)return;
    if(Date.now()>authDeadline){stopPolling();canAsk=false;authInfo('Este código expirou. Selecione Conectar conta Microsoft para gerar outro.');return;}
    authPolling=true;
    try{
      const data=await api('verify');
      if(data.ok)await finishAuth();
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
  $('login').onclick=()=>{void beginAuth()};
  $('verify').onclick=()=>{void pollAuth()};
  window.addEventListener('pagehide',stopPolling,{once:true});
  return {
    ready(){ $('login').disabled=false; $('xb-login-feedback').textContent='Pronto. Autorize com sua conta Microsoft.'; },
    error(message){ $('xb-login-feedback').textContent=message; }
  };
}
