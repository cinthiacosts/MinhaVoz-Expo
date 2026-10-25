# Matriz de autorização — Professor

O papel considerado pela API é o vínculo `links.role` com o aluno, não o tipo
autodeclarado da conta. Nenhum vínculo existente é alterado por esta revisão.

## Leitura mínima

- Perfil/board/listagem: Professor recebe identificação, foto e configurações de
  comunicação, sem `notes`, `preferences`, data de nascimento ou metadados internos
  do cadastro. A prancha compartilhada continua utilizável.
- Rede: GET `/api/comm-users/{cid}/links` retorna somente `id`, `role`, `is_me`
  do próprio vínculo, sem listar outros membros ou seus dados.
- Convites e remoções continuam exclusivos de Responsável, também pela API.
- Registros terapêuticos privados continuam invisíveis. Somente título/trecho
  explicitamente compartilhados com `professor` são retornados. A revisão não
  altera o mecanismo de autorização do terapeuta.

## Histórico e indicadores

GET `/api/comm-users/{cid}/history` e `/stats` retornam 403 para Professor.
Parâmetros de query não transformam esses endpoints em uma permissão global.

GET `/api/comm-users/{cid}/school/history` retorna somente registros com
`context=escola` e `recorded_by` igual à conta docente autenticada. A resposta é
limitada a `id`, `text`, `source`, `created_at`.

GET `/api/comm-users/{cid}/school/stats` retorna apenas contagem das próprias
frases docentes no período e quantidades pendentes/realizadas das atividades
escolares ativas do aluno. Não retorna evolução global, sessões/durações alheias,
ranking geral de pictogramas, categorias ou comunicações de outras contas.

`source` indica o recurso da interface (`prancha`, `texto`, `frase_rapida`,
`escola`, `atividade`), não a localização física nem uma autorização. Por isso,
não usamos somente `source=escola|atividade` para liberar registros antigos.
O backend agora atribui contexto docente e autor a eventos novos conforme o
vínculo autenticado, ignorando metadados de autorização enviados pelo cliente.
Sessões informadas devem pertencer ao aluno; Professor não pode usar/encerrar
sessões de outra conta ou sessões fora do escopo escolar.

Registros legados não são reclassificados nem removidos. Sua ausência na visão
docente é intencional quando falta proveniência suficiente. A visão escolar não
é uma comprovação geográfica: significa uso pela conta com vínculo de Professor.

## Conteúdo escolar

- Atividades, avisos e status continuam disponíveis somente aos alunos vinculados.
- Rotinas: Professor lista/cria/edita/exclui/marca/reinicia somente `context=escola`.
  Não pode converter uma rotina de casa/terapia em escolar nem trocar uma rotina
  escolar para outro contexto para contornar a regra.
- Frases: Professor cria frases escolares e administra somente aquelas criadas
  pela própria conta nesse contexto. Frases globais continuam disponíveis para
  uso na comunicação, mas não para edição/exclusão docente.

## Frontend

O painel docente substitui histórico/indicadores globais por `Uso escolar` e
`Rede de apoio` por `Meu vínculo`. Rotinas/frases são identificadas como escolares.
URLs antigas de histórico/indicadores redirecionam para a visão escolar.
O cache de prancha passa a usar uma nova versão de chave para não reaproveitar
uma resposta ampla anterior; filas de eventos não mudam de chave.

## Verificação

12 testes backend aprovados em banco temporário `minhavoz_verification_<uuid>`.
As novas regressões tentam diretamente: histórico/indicadores globais, parâmetros
de escopo forjados, sessões de outra conta, alunos não vinculados, dados de rede,
convites/remoções, notas privadas e compartilhamentos de outros papéis, edição
de rotinas de casa/terapia e de frases globais. Também verificam os acessos
escolares permitidos e preservação das permissões do Responsável.

TypeScript e 5 testes frontend aprovados. Nenhum teste utiliza contas reais ou
grava em `minhavoz_dev`; os bancos temporários são excluídos ao terminar.
Nenhuma dependência, `.env`, credencial ou container é alterado nesta revisão.
