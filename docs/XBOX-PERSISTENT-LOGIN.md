# Xbox login persistente — SEM MongoDB

O xBridge já restaura a sessão no mesmo navegador por cookie HTTP-only. Esta atualização permite que a autorização sobreviva ao reinício do Render, usando Cloudflare Workers KV separado do bot Discord.

## Ativar
1. Cloudflare → Workers & Pages → KV → Create namespace, nome sugerido `xbridge_xbox_sessions`.
2. Crie um Worker **novo** chamado `xbridge-session-store`, cole o conteúdo de `cloudflare/xbridge-session-worker.js`. Não altere o Worker existente usado por outros projetos.
3. Em Settings → Bindings, adicione KV namespace existente com nome de variável **SESSIONS** e selecione `xbridge_xbox_sessions`.
4. Gere DUAS chaves aleatórias diferentes. Em máquina com Node: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Uma será a chave de criptografia (64 caracteres hex); a outra poderá servir de segredo compartilhado com 64 caracteres.
5. No Worker, adicione Secret `XBRIDGE_STORE_SECRET` (o segredo compartilhado) e publique.
6. No Render → serviço **xbridge-player** → Environment, configure:
   - `XBRIDGE_STORE_URL` = URL HTTPS do Worker novo, por exemplo `https://xbridge-session-store.<seu-subdominio>.workers.dev`
   - `XBRIDGE_STORE_SECRET` = exatamente o mesmo segredo usado no Worker
   - `XBRIDGE_AUTH_KEY` = a chave AES-256 separada, 64 dígitos hex.
7. Deixe o Render reiniciar; autentique uma vez pelo QR Microsoft. Feche/reabra e depois verifique que o login persiste após o próximo restart.

## Segurança
- Jamais cole valores secretos no GitHub, prints, chat ou navegador.
- O KV recebe somente ciphertext AES-256-GCM; a chave de decriptação fica exclusivamente no serviço Render.
- O Worker só aceita Bearer secret para leitura/gravação; sem esse segredo não serve sessões.
- O cookie `xb_session` é HttpOnly/Secure/SameSite Strict e contém apenas identificador aleatório.
- Sessão expirará no armazenamento após 30 dias; Microsoft pode pedir nova autorização antes.
- Não há compartilhamento automático por Discord: a restauração funciona no mesmo navegador, mantendo os cookies. Trocar de navegador/TV requer novo vínculo.
- Se o Render reiniciar sem as variáveis de Cloudflare configuradas, a sessão continua em memória e será perdida na reinicialização.
- Use o mesmo domínio do xBridge `https://xcloud-tv.onrender.com` sempre; o cookie é específico do domínio.
- O Worker deve ser privado na prática (segredo exclusivo); não usa MongoDB nem o banco do seu bot.
