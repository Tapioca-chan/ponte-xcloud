# Ponte xCloud — protótipo experimental 0.1

Cliente próprio para testar Xbox Cloud Gaming em uma Toshiba VIDAA com um controle 8BitDo Ultimate 2C conectado ao Android. Código do player e da autenticação deriva do Greenlight (MIT); referência exata em vendor/UPSTREAM.txt.

**Não está publicado nem validado com uma conta Xbox ou com a Toshiba. Não é uma solução pronta garantida.** O player realiza WebRTC e envia pacotes de controle reais; não incorpora xbox.com em iframe. As APIs não oficiais podem mudar ou rejeitar o cliente. Abrir jogos no cliente oficial da TV não prova que este player será compatível.

## Componentes

- `public/` e `src/client.ts`: interface da TV e do Android, pareamento por QR, calibração de botões/eixos, navegação pelas setas do controle remoto.
- `src/server.ts`: servidor Node, login por código Microsoft, catálogo, criação/sinalização da sessão, relay WebSocket. Tokens ficam apenas em memória no servidor, por sala. O celular recebe uma chave distinta, somente para transmitir comandos.
- `vendor/`: fontes MIT do Greenlight utilizadas para autenticação, sinalização e player.
- `.github/workflows/pages.yml`: publica **somente a interface** no GitHub Pages.
- `Dockerfile`: prepara o servidor para uma hospedagem Node/Docker com HTTPS e WebSockets.

**GitHub Pages sozinho não executa o servidor. GitHub Actions não é um servidor permanente.** Não preencha um endereço fictício de backend: a aplicação só funciona com o servidor realmente publicado. O servidor também pode servir as páginas, dispensando Pages; o código ainda pode ficar no GitHub.

## Executar localmente (desenvolvimento)

Requer Node 22+:

```sh
npm ci
npm run build
npm test
npm start
```

Abra http://localhost:3000. Por padrão, a origem autorizada é `http://localhost:3000`. Para testar Android/TV, publique atrás de HTTPS; HTTP por IP local pode impedir a Gamepad API no Android. Não desative a segurança do navegador.

## Publicação no GitHub

1. Crie o repositório `ponte-xcloud` na sua conta.
2. Envie o conteúdo desta pasta, inclusive `.github`, `vendor`, `package-lock.json` e a licença. Não envie node_modules, .env ou tokens.
3. Em Settings → Pages → Source, selecione GitHub Actions.
4. O workflow compila, testa e valida cada push em main. Para publicar a interface após habilitar Pages, abra Actions → Build and publish interface → Run workflow.
5. A disponibilidade de Pages para repositório privado depende do plano. Repositório privado não implica site privado.

## Servidor auxiliar

Publique o Dockerfile ou rode `npm ci && npm run build && npm start` em um serviço Node. Configure:

- `PORT`: porta informada pela hospedagem, padrão 3000.
- `ALLOWED_ORIGINS`: origens completas autorizadas, separadas por vírgula, sem barra final. Ex.: `https://USUARIO.github.io,https://servidor.exemplo`.
- HTTPS/WSS no proxy da hospedagem, com suporte a WebSocket e requisições de até 60 segundos.

Use uma única instância: salas e tokens não são distribuídos entre processos. Reiniciar o servidor encerra as salas. Limite de 20 salas e duração de quatro horas. Ainda não há autenticação administrativa para limitar criação de salas; destina-se a testes pessoais, não a serviço público multiusuário.

Na TV, informe o endereço HTTPS do servidor real e escolha Preparar esta TV. Leia o QR no Android, conecte o 8BitDo e escolha Conectar controle à TV. Se o mapeamento não for standard, configure cada comando seguindo a tela. Somente o mapeamento é persistido no celular, nunca tokens Microsoft. Não compartilhe o link de pareamento.

Na TV, gere o código de login e autorize no endereço Microsoft exibido. Depois clique Já autorizei, carregue o catálogo e escolha um jogo. Seu acesso à conta/assinatura continua sendo necessário. Se áudio/vídeo não iniciar automaticamente, use Ativar áudio / vídeo. Para trocar de jogo, encerre a sala e crie outra.

## Estado e limitações

- Compilação de frontend e backend validada.
- Testes locais cobrem sanitização, mapeamento não padrão, relay real, bloqueio de origem estranha, separação da chave do celular e liberação dos botões ao desconectar.
- A TV zera os comandos após 400 ms sem dados.
- Sem validação de login Microsoft, catálogo real, handshake xCloud, vídeo, áudio, desempenho ou navegação no aparelho físico.
- Transmissão inicial solicitada em 720p; vídeo direto da nuvem para TV. Comandos passam pelo relay: sua região influencia a latência. Ainda não há canal direto WebRTC entre Android e TV.
- O celular deve ficar com a página em primeiro plano. Wake Lock é solicitado quando suportado.
- Sem vibração remota, sem reconexão automática, sem renovação automática da conta, sem troca de jogos na mesma sala.
- Falha no player não é corrigida instalando um driver: o suporte WebRTC/codecs do VIDAA precisa ser verificado em execução.

O trabalho seguinte é publicar o servidor e interface, verificar o login e testar um jogo na TV. Não considere a conexão do controle equivalente a uma sessão Xbox validada.
