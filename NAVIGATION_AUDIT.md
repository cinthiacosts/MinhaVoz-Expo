# Auditoria de navegação — Minha Voz

Revisão de 25/10/2026. Escopo: frontend e navegação dos quatro papéis.
Backend, dados, vínculos, dependências e `.env` permanecem intactos.

## Problemas encontrados e correção

- Setas e ações de conclusão usavam `router.back()` em telas acessíveis sem
  histórico. Isso podia despachar GO_BACK sem um navegador capaz de atendê-lo.
  Todas essas chamadas foram substituídas por destinos explícitos.
- O painel da pessoa agora retorna a `/painel`; funções retornam ao painel da
  mesma pessoa. O retorno não faz logout nem muda o tipo da conta ou o vínculo.
- A seleção de tipo de perfil não tinha saída sem concluir uma alteração.
  Contas com tipo já definido agora podem voltar ao painel sem salvar.
- Telas que aguardavam dados podiam ficar somente com um indicador de espera.
  Há agora uma saída explícita mesmo durante carregamento ou falha da consulta.
- O login perdia o destino de uma URL interna. O destino interno validado é
  preservado, inclusive `id` da edição de pessoa e `pid/cat` do pictograma.
  Endereços externos e destinos de autenticação que poderiam formar ciclos são
  rejeitados. O destino continua sujeito à validação do vínculo após o login.
- O frontend valida as rotas diretas dos quatro papéis contra as funções de
  seus menus, mantendo as permissões do backend. Rotas docentes antigas de
  histórico/indicadores levam à visão escolar; demais destinos negados têm
  retorno seguro. A condição de compartilhamento do Cuidador foi preservada.
- URLs antigas/desconhecidas têm uma tela de página não encontrada com saída
  para o painel da conta autenticada ou para o início sem autenticação.

## Inventário de telas

Foram inventariados 22 arquivos de tela de rota. Layouts e `+html` são estrutura,
não telas adicionais. O formulário de pessoa possui dois fluxos na mesma rota.

| Rota | Função e saída |
|---|---|
| `/` | Boas-vindas; conta autenticada segue ao painel ou à seleção inicial de tipo |
| `/login` | Entrar; seta → início; sucesso → destino interno validado ou painel |
| `/cadastro` | Criar conta; seta → início; sucesso → seleção de tipo |
| `/recuperar` | Recuperação; seta/conclusão → login |
| `/perfil` | Seleção de tipo; conta existente pode voltar ao painel sem salvar; conta inicial pode sair explicitamente |
| `/painel` | Lista vinculada à conta; troca de tipo, cadastro quando permitido e logout confirmado |
| `/usuario/form` | Novo perfil, conforme autorização atual da API; seta → lista |
| `/usuario/form?id=...` | Editar perfil somente com vínculo Responsável; seta/conclusão → painel da pessoa |
| `/usuario/:id` | Painel pelo papel do vínculo atual; seta → lista da conta |
| `/usuario/:id/prancha` | Responsável; seta → painel da pessoa |
| `/usuario/:id/pictograma` | Responsável; seta/conclusão → painel da pessoa |
| `/usuario/:id/frases` | Responsável/Professor; seta → painel da pessoa |
| `/usuario/:id/rotinas` | Responsável/Professor; seta → painel da pessoa |
| `/usuario/:id/atividades` | Responsável/Professor; seta → painel da pessoa |
| `/usuario/:id/rede` | Responsável administra; Cuidador/Professor veem Meu vínculo; Terapeuta mantém sua visão existente; seta → painel da pessoa |
| `/usuario/:id/historico` | Responsável/Terapeuta; Professor → escolar; Cuidador → cuidado |
| `/usuario/:id/indicadores` | Responsável/Terapeuta; Professor → escolar; Cuidador → cuidado |
| `/usuario/:id/acompanhamento` | Regras de compartilhamento existentes; Cuidador somente quando há trecho autorizado; seta → painel da pessoa |
| `/usuario/:id/configuracoes` | Responsável; seta → painel da pessoa |
| `/usuario/:id/cuidado` | Cuidador; seta → painel da pessoa |
| `/usuario/:id/escolar` | Professor; seta → painel da pessoa |
| `/comunicacao/:id` | Vínculo obrigatório; saída protegida → painel da mesma pessoa; falha/carregamento → lista por botão explícito |
| `+not-found` | Endereço inexistente; saída explícita para painel/início |

Os dois fluxos de `/usuario/form` contam como um único arquivo de tela. A tabela
separa os fluxos para tornar seus destinos claros.

## Modo Comunicação

O desafio de saída foi mantido. Além do botão e do BackHandler nativo existente,
`usePreventRemove` protege a remoção da tela pelo navegador/navegação. Cancelar
mantém a prancha. Responder corretamente libera somente essa saída e navega
explicitamente ao painel da mesma pessoa, sem executar logout ou alterar vínculo.
Uma recarga web pode também exibir a confirmação nativa do navegador.

## Auditoria técnica

- Nenhuma chamada restante a `router.back()`, `navigation.goBack()` ou
  `dismiss()/dismissAll()` nas telas da aplicação.
- `push()` é usado para entrar em uma função; setas e conclusões usam destinos
  explícitos com `replace()`. Os destinos foram conferidos contra os arquivos de
  rota atuais. Não foi encontrado link interno para rota antiga inexistente.
- Nenhuma definição de rota duplicada ou função de menu sem arquivo de destino.
- Redirecionamentos de autorização foram testados para terminar em rota permitida,
  sem ciclos. O navegador do perfil permanece montado durante a verificação.
- Navegação não determina permissões pelo tipo global: a pessoa atual é validada
  pelo vínculo; conta, sessão, pessoa e rota continuam isoladas.

## Verificação

- 18 testes frontend de código/renderização aprovados. Incluem a ausência de
  comandos cegos de retorno, catálogo de telas, destinos de login, prevenção de
  ciclos, menu por vínculo e descarte de respostas de sessões/perfis anteriores.
- TypeScript (`tsc --noEmit`) e exportação web aprovados.
- Navegador Edge em modo headless, usando o frontend em `localhost:3000`, com
  contas sintéticas em contextos isolados. Todas as chamadas `/api` interceptadas;
  nenhum login, consulta de conta ou gravação foi encaminhado ao backend real.
- Cobertura por papel: login, lista, painel da pessoa, cada função do menu,
  retorno da função ao painel e à lista, entrada direta, refresh, troca de pessoa,
  logout, destino preservado após login, troca de conta e vínculo recalculado.
- Cobertura adicional: cancelar/concluir saída protegida, voltar do navegador,
  comunicação aberta diretamente e recarregada, token preservado, rotas negadas,
  pessoa sem vínculo, consulta com erro, endereços desconhecidos e formulários.
- Funções verificadas: 10 de Responsável, 3 de Cuidador (com trecho autorizado
  simulado), 6 de Professor e 4 de Terapeuta. Inclui abrir/fechar os formulários
  modais disponíveis nos cenários, sem salvar conteúdo real.
- Não há erros GO_BACK não tratado ou erros de runtime nos cenários aprovados.
  As verificações de navegador são web; não substituem teste em aparelho nativo.

Frontend e backend continuam ligados. Não foi necessário reiniciar os serviços;
o Metro serviu o código atualizado durante os testes.
