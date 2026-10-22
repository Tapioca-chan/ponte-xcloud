# Xbox Cloud Gaming — login automático persistente (MongoDB Atlas separado)

## Arquitetura implementada

- Banco de dados **xbridge_auth**, coleção **remembered_xbox**, hospedado no projeto **XBridge Sessions** na segunda conta MongoDB Atlas.
- Usuário do banco exclusivo **xbridge_session_app**, com `readWrite` somente em `xbridge_auth`. Nenhuma conexão usa o MongoDB do Discord/Tsukai.
- Autorização Xbox armazenada criptografada com **AES-256-GCM** no backend, usando a variável `XBRIDGE_AUTH_KEY`; o MongoDB não recebe senha Microsoft em texto.
- O navegador da TV recebe apenas um cookie aleatório `xb_session` com flags **HttpOnly**, **Secure** e **SameSite=Strict**. A conta é recuperada pelo endpoint `POST /player/api/resume` depois do reinício do Render.
- O backend renova credenciais da Microsoft no servidor. **A Microsoft pode exigir nova autorização a qualquer momento.** O limite de persistência configurado é 30 dias e não garante 30 dias de validade Microsoft.
- Ao desconectar, o registro de autorização correspondente é excluído do banco.
- Para outras TVs, browsers ou após apagar os cookies da TV, o vínculo oficial Microsoft deve ser refeito. Discord não é usado para armazenar credenciais Xbox.

## Configuração

A URL MongoDB e a chave AES são **segredos exclusivos do serviço xbridge-player no Render**: `XBRIDGE_AUTH_MONGODB_URI` e `XBRIDGE_AUTH_KEY`. Nunca as coloque no repositório nem no frontend.
O Render precisa ter uma instalação consistente do driver `mongodb` no `package-lock.json`, gerado via `npm install --package-lock-only`, antes de um deploy com `npm ci`. O workflow `.github/workflows/sync-lock.yml` tenta sincronizar automaticamente esse arquivo quando `package.json` for alterado.
O serviço da TV `xcloud-tv` não precisa conhecer credenciais MongoDB; ele repassa apenas um cookie de sessão opaco pelo proxy `/player`.

## Verificação

1. Confira no Render um deploy bem-sucedido do commit com integração MongoDB.
2. Acesse `https://xcloud-tv.onrender.com/?role=tv` na TV e autorize uma vez em `https://www.microsoft.com/link`.
3. Feche e reabra a página. Ela deve abrir a biblioteca automaticamente.
4. Reinicie **somente** o serviço xbridge-player no Render e reabra o navegador mantendo os cookies. Ele deve restaurar a conta e buscar o catálogo novamente.
5. No MongoDB Atlas novo, deve existir a coleção `remembered_xbox` com payload cifrado, não em texto.
6. Em configurações, escolha desconectar e confirme que a sessão foi revogada.

Não use o banco antigo do bot. Se a instalação/deploy da dependência MongoDB falhar, a persistência ainda não estará em produção.
