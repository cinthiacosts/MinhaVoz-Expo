# Auditoria de autorização — Cuidador

## Correção posterior de frontend — vínculo e navegação

- O novo layout de `/usuario/[id]` valida o vínculo atual antes de montar a
  tela de destino. Rotas administrativas do Cuidador redirecionam para cuidado;
  a edição de perfil por `/usuario/form?id=...` também exige vínculo Responsável.
- Resultados ficam associados a conta, sessão, pessoa e rota. Respostas atrasadas
  são descartadas, e sair/trocar de rota invalida o estado anterior. A pilha raiz
  é remontada na troca de conta. O tipo global não determina o menu do perfil.
- O navegador interno permanece montado durante a validação para preservar as
  transições entre destinos permitidos.
- Acompanhamento só aparece para Cuidador se a API retornar ao menos um trecho
  autorizado. Falha na consulta oculta esse item sem bloquear o cuidado diário.
- Consulta somente de leitura: o Cuidador de teste permanece vinculado ao
  Usuário de comunicação de teste no papel `cuidador`; há zero trechos autorizados
  ao papel. O painel validado mostra Modo Comunicação, Apoio
  ao cuidado e Meu vínculo. Conteúdo cotidiano permitido fica no cuidado e na
  comunicação. Cadastro de novo perfil continua no painel inicial da conta.
- 14 testes frontend aprovados: renderização de menu, papel por vínculo,
  isolamento de sessão, respostas fora de ordem e rotas diretas, além das
  regressões existentes. TypeScript e exportação web aprovados.
- Navegador real com APIs integralmente simuladas: menu, cuidado/Meu vínculo,
  navegação SPA entre vínculos diferentes da mesma conta, 11 URLs proibidas e
  compartilhamento/revogação aprovados; nenhuma chamada administrativa ou
  gravação foi encaminhada ao backend real. Nenhum erro de runtime.
- Backend, dados, vínculos, `.env` e dependências não foram alterados nesta
  correção. Metro serviu a versão corrigida durante o teste; sem reinício.
- Não há trilha disponível que permita atribuir retrospectivamente cada tela
  do teste manual anterior a uma sessão específica. A possibilidade de estado
  antigo foi corrigida e a separação entre vínculos foi validada em testes.

Revisão em 25/10/2026. A autorização de um perfil usa `links.role`, não
`users.role`. A revisão preserva as regras dos outros três papéis.

## Resultado da auditoria

O código recebido já continha bloqueios backend, redirecionamentos das telas
administrativas e a tela `cuidado`. Esses controles foram auditados e testados.
A declaração de permissões do menu ainda incluía Cuidador em itens administrativos,
embora a ordem do menu os omitisse. A declaração foi corrigida e a matriz de
navegação extraída para `frontend/src/hub-policy.ts`.

O filtro de atividades aceitava qualquer público diferente de `rede`. Agora,
para Cuidador, apenas público `comunicador` ou ausente/nulo (legado) é aceito.
O bloqueio também cobre a prancha, atualização de status e download de imagens.
Públicos desconhecidos ficam negados por padrão. Outros papéis não mudaram.

A descrição inicial de Cuidador deixou de prometer configuração da comunicação.
O cache de prancha usa `board_v4`, impedindo reaproveitar respostas amplas de
versões anteriores. As filas de eventos e os dados existentes não são apagados.

## Matriz final e endpoints (prefixo `/api`)

| Recurso | Cuidador |
|---|---|
| `GET /comm-users` | Somente perfis vinculados, com papel por vínculo |
| `GET /comm-users/{cid}` e `/board` | Identificação e comunicação; sem notas privadas, preferências familiares, nascimento ou autor do cadastro |
| `PUT /comm-users/{cid}` e `/settings` | 403; gestão do perfil e configurações persistentes ficam com Responsável |
| `GET /comm-users/{cid}/history`, `/stats`, `/school/history`, `/school/stats` | 403; nenhuma visão histórica é necessária para executar o cuidado atual |
| `DELETE /comm-users/{cid}/history` | 403 |
| Categorias, pictogramas, movimentação e frases — criação/edição/exclusão | 403; uso da prancha continua permitido |
| `GET /comm-users/{cid}/links` | Somente `id`, `role`, `is_me` do próprio vínculo |
| Convites do perfil, inclusão legada `/links`, remoção `/links/{lid}`, cancelamento de convite | 403 para gestão da rede |
| `GET /comm-users/{cid}/therapy-notes`, `GET /therapy-notes/{nid}` | Somente título/trecho explicitamente compartilhados com `cuidador`; sem original privado ou dados do autor |
| Notas privadas, edição e compartilhamento por não autor | 404 conforme regra existente de ocultação da existência; revogar remove acesso imediatamente pela API |
| `GET /comm-users/{cid}/routines` e rotinas da prancha | Somente contexto `casa`; sem dados do autor |
| Criar/editar/excluir rotinas | 403 |
| Marcar etapas e reiniciar rotina | Permitido somente em rotina `casa` do perfil vinculado |
| Atividades | Somente ativas e destinadas à pessoa; sem autores ou dados administrativos de atualização |
| Criar/editar/excluir atividades | 403; concluir atividade visível continua permitido |
| Sessões e eventos de comunicação | Permitidos; contexto/autor atribuídos no backend; sessões alheias negadas |
| `GET /files/{path}` | Somente foto do perfil, imagem de pictograma ou atividade visível; vínculo sozinho não libera outros arquivos do perfil |
| Upload associado ao perfil como Cuidador | 403; upload de rascunho para novo perfil continua permitido |

Todas essas rotas de perfil exigem vínculo também quando acessadas diretamente.
O frontend mantém Modo Comunicação, Apoio ao cuidado, trechos compartilhados e
Meu vínculo. URLs administrativas antigas redirecionam para a área de cuidado.
Não foi concedida administração da prancha ao Cuidador.

## Cadastrar usuário

Não é qualquer conta que pode criar: o modelo atual permite contas com tipo
Responsável ou Cuidador. Professor/Terapeuta permanecem bloqueados nesse fluxo.
Cuidador confirma responsabilidade pelo novo perfil no formulário e no backend
(`responsibility_confirmed`); sem isso recebe 400. Essa declaração não constitui
verificação jurídica documental.

O criador recebe `responsavel` apenas no novo vínculo, sem alterar seu tipo
global nem os vínculos anteriores. A mesma conta pode, portanto, cuidar de uma
pessoa e ser Responsável por outra. Nenhum acesso a perfis preexistentes é
concedido pela criação. O botão permanece.

## Verificação

- 16 testes backend aprovados em `tests/test_local_features.py`, usando
  TestClient HTTP, autenticação Bearer real da aplicação e MongoDB temporário
  `minhavoz_verification_<uuid>`, removido ao terminar.
- Cobertura: recursos administrativos negados com 403, leitura mínima, perfis
  não vinculados, rede, conteúdo escolar, rotinas por contexto, sessões alheias,
  compartilhamento/revogação de trechos, imagens restritas, públicos desconhecidos,
  compatibilidade legada e criação sem elevação dos vínculos anteriores.
- Regressões existentes de Professor, Terapeuta e Responsável aprovadas.
- 7 testes frontend aprovados, incluindo menu e isolamento/invalidação do cache.
- `tsc --noEmit` aprovado. Não foi realizada uma nova rodada manual de UI.
- Banco real consultado apenas para leitura: vínculo do Cuidador de teste com
  o Usuário de comunicação de teste confirmado como `cuidador`. As identificações
  da validação foram anonimizadas neste relatório. Nenhum teste usa a conta real.
- A comparação final manteve as contagens de todas as coleções de dados da
  aplicação. Apenas um contador transitório de `rate_limits` expirou durante
  a auditoria; o vínculo real foi reconfirmado ao final.
- Sem alterações de dependências, `.env`, permissões dos demais papéis, migrações
  ou gravações em dados reais. Mudanças estão no código local; servidores não
  foram reiniciados por esta auditoria.
