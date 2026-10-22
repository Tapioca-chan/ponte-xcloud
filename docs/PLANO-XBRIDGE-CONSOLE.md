# xBridge Cloud — plano de experiência console VIDAA
**Implementação:** 22/10/2026

## Premissas
- Xbox Cloud Gaming roda no navegador da Toshiba VIDAA, sem PC, Bluetooth na TV ou espelhamento do Android.
- O Android apenas encaminha o controle ao player WebRTC independente.
- Continuar utilizando as APIs reais de streaming do Xbox; não inventar catálogo ou jogos comprados.
- Preservar a interface original de pareamento do xBridge.
- Não pedir senha Microsoft no site xBridge; apenas autorização por QR/código oficial.

## 1. Prioridade máxima: vídeo em tela grande — implementada, aguardando teste no aparelho
- Expandir o iframe **no xBridge pai**, além do vídeo **dentro** do iframe.
- Usar evento de primeiro quadro de mídia para ativar CSS full viewport.
- Ocultar catálogo, navegação e outros elementos durante o jogo.
- Manter imagem inteira `object-fit: contain` sem cortar HUD do game.
- Disponibilizar **Menu • Voltar** para encerrar a partida sem encerrar a autorização Microsoft.
- Reativação de áudio/vídeo em Configurações caso o navegador suspenda autoplay.
- Não afirmar correção do possível travamento: decodificação H.264, latência e RAM da Toshiba precisam de validação presencial.

## 2. Home gamer tipo console — implementada
- Visual xBridge próprio com Xbox Cloud Gaming, banner/capa grande e navegação por seção.
- Home, jogos recentes na nuvem e catálogo, com dados reais da conta/serviço quando disponíveis.
- Capas reais da Microsoft; nenhuma capa ou título inventado.
- Botões técnicos e diagnósticos retirados da home e colocados em Configurações.
- Play, seleção de jogos, pesquisa e controle pelo Android continuam conectados ao backend original.

## 3. Autorização Xbox que não exige QR a cada recarregamento — implementada com limite
- Browser recebe somente cookie opaco `xb_session` HttpOnly, Secure, SameSite Strict.
- O proxy xBridge permite somente esse cookie, com escopo `/player`, e não o envia para terceiros.
- O backend guarda o token no servidor, renova quando necessário e cria sala transitória nova.
- Permite sair da partida, voltar ao catálogo e recarregar a página sem fazer login repetidamente.
- Pode exigir nova autorização se o token for revogado ou a Microsoft pedir novo login.
- **Limitação conhecida:** o serviço Render gratuito usa armazenamento em memória volátil; reinicializações apagam as autorizações em memória.
- Um módulo criptográfico `src/auth-store.mjs` (AES-256-GCM, coleção separada) está preparado para futura ativação com conexão MongoDB e chave em ambiente privado; **não está ativo nem foi testado**. Jamais colocar tokens/chaves no repositório.

## 4. Testes executados / restantes
- [x] Compilar xBridge e o serviço player no Render.
- [x] Preservar ponte Android → TV e protocolo WebRTC existente.
- [x] Testes unitários existentes do controle, catálogo e ICE.
- [x] Adicionar layouts com navegação pelo controle remoto e áreas de configurações.
- [ ] Confirmar largura 16:9, sem mini player ou cortes, **na Toshiba real**.
- [ ] Confirmar que vídeo e áudio continuam fluindo por minutos, sem congelamento.
- [ ] Medir decodificação, uso de memória e resposta do controle no VIDAA 9.
- [ ] Validar QR apenas uma vez em sequência de recarregamentos do navegador com serviço Render ativo.
- [ ] Habilitar e testar persistência criptografada com banco separado para retomada após reinicializações do Render.

## Diagnóstico no aparelho
1. Abrir `https://xcloud-tv.onrender.com/?role=tv` na Toshiba, atualizar a página.
2. Parear o celular Android pelo xBridge e iniciar jogo pelo catálogo.
3. Verificar se a imagem ocupa toda a tela com proporção correta.
4. Se o vídeo pausar, abrir Configurações e usar *Reativar áudio e vídeo*.
5. Voltar para biblioteca, testar outra partida, recarregar o site e conferir se o Xbox restaura a conta sem QR.
6. Quando houver erro, registrar a mensagem exata e o passo onde ocorreu. Não interpretar testes unitários como prova de streaming na TV.
