# Registro da implementação incremental

## Estado preservado

- Backup de fontes e manifesto SHA256 em `.local-backups/before-controlled-changes-20261025-150904/`.
- Nenhum `.env`, segredo, usuário ou documento existente foi alterado por esta implementação.
- `minhavoz_dev` recebeu somente consulta agregada dos rótulos Eu/UE durante a investigação.
- Testes de API usam `minhavoz_verification_<uuid>`, removido ao terminar; nunca Boraí.
- Nenhuma migração, reseed ou exclusão de banco de desenvolvimento.
- Servidores anteriores foram encerrados normalmente antes das mudanças.

## Etapa 1 — CORS e imagens

Arquivos: `.gitignore`, `backend/server.py`, novo `backend/local_storage.py`,
`backend/tests/local_pytest.ini`, `backend/tests/test_local_features.py`.

Endpoints mantidos/modificados: `POST /api/upload`, `GET /api/files/{path}`,
cadastro/edição de pessoa, pictogramas e atividades para verificar/associar imagens.
Origens CORS explícitas; limite de 8 MB lido com limite; MIME inferido por assinatura;
caminhos opacos; acesso exige vínculo ativo. Metadados antigos preservados.

Resultado inicial: 3 testes aprovados. Teste final inclui associação de foto antes
do cadastro e bloqueio da imagem após revogar vínculo.

## Etapa 2 — fala, rótulos e saída protegida

Arquivos: `frontend/src/tts.ts`, novos `voice-engine.ts`, `voice-engine.web.ts`,
`voice-types.ts`, `src/comm/BoardSection.tsx`, `ExitGuard.tsx`, novo `exit-policy.ts`,
`app/comunicacao/[id].tsx`, `app/usuario/[id]/configuracoes.tsx`, `src/theme.ts`,
`app/+html.tsx`, `app.json`, novo `public/index.html`, `package.json`, `yarn.lock`,
`backend/server.py`, `backend/requirements.txt`, novo `frontend/tests/local-features.mjs`.

- Adicionada somente `expo-speech==58.0.3`. Comparação do manifesto/lockfile confirmou
  que nenhuma dependência existente mudou de versão; o lock ganhou somente essa entrada.
- Removida a dependência Python `emergentintegrations==0.2.2`; a API de áudio antigo
  continua lendo cache, mas geração pelo servidor retorna 410. Nenhum frontend atual
  chama esse endpoint.
- Síntese do dispositivo/navegador para todos os caminhos de fala. Vozes legadas
  não são migradas; usam a voz portuguesa disponível como fallback.
- Saída abre desafio, nunca faz logout e substitui a rota pela área adulta do perfil.
- Foi corrigido um tipo antigo de StyleSheet incompatível com o RN instalado, sem
  alteração de estilos, para permitir verificação TypeScript.
- Eu/UE: banco, seed e renderização isolada da fonte corretos. HTML real da saída
  `single` usava inglês. Configurado português e bloqueio de tradução no template
  efetivamente usado pelo Expo. Não houve troca de letras ou regravação de rótulos.

Resultado: TypeScript aprovado; 5 testes frontend aprovados (vozes simuladas,
proteção contra voz cloud implícita, desafio de saída e cache por conta).
Áudio real e interação humana ainda precisam ser verificados nos dispositivos.

## Etapa 3 — rede, escola e privacidade

Arquivos: novo `backend/support_features.py`, `backend/server.py`,
`backend/tests/test_local_features.py`, `frontend/src/types.ts`, `src/offline.ts`,
`src/comm/Sections.tsx`, `app/painel.tsx`, `app/usuario/[id]/rede.tsx`,
`atividades.tsx`, `index.tsx`, novo `acompanhamento.tsx`.

Endpoints novos:

- `POST/GET /api/comm-users/{cid}/invitations`
- `GET /api/invitations`
- `POST /api/invitations/{id}/accept`
- `POST /api/invitations/{id}/decline`
- `DELETE /api/invitations/{id}`
- `POST/GET /api/comm-users/{cid}/therapy-notes`
- `GET/PUT /api/therapy-notes/{id}`
- `PUT /api/therapy-notes/{id}/sharing`
- `PUT /api/activities/{id}/status`

Modelos novos: InvitationIn, NoteIn, ShareIn, ActivityStatusIn. Atividades recebem
campos opcionais compatíveis `kind`, `audience`, `status`; filtros da prancha
excluem conteúdo destinado somente à rede. A rota legada POST `/links` passa a
criar convite com papel explícito e aceite, em vez de conceder acesso imediato.

Coleções adicionais: `invitations` e `therapy_notes`, sem migrar coleções antigas.
Notas privadas do autor não saem pela API para outros papéis/terapeutas; somente
o trecho explicitamente autorizado é serializado para destinatários. Não entram
na prancha nem no cache offline. Revogação exige vínculo ativo em cada chamada.
Respostas privadas da API usam `Cache-Control: no-store`.

Resultado: 9 testes backend aprovados, incluindo CORS, upload, vinculação por
convite, recusa/cancelamento, revogação, tentativa de elevação de papel, privacidade
terapêutica, compartilhamento e revogação de trecho, destinatários escolares,
status, perfil sem conta infantil e ausência de geração TTS externa.

## Build e limites de validação

- Exportação web concluída com 1.523 módulos; novas telas presentes nos bundles.
- HTML exportado inspecionado para português/bloqueio de tradução.
- Avisos existentes: deprecações de `on_event`, multipart e alias AnyIO nos testes;
  NO_COLOR/FORCE_COLOR no Metro; peer dependencies já conhecidas na instalação.
- Não foram atualizados Expo, React, React Native, Python ou outros pacotes existentes.
- Não foram realizados testes visuais por Computer Use nem testes em Android físico.
- Permanecem para validação manual: voz portuguesa instalada e modo avião,
  idioma/tradução do navegador, toque/teclado do desafio, dois dispositivos com
  contas separadas e arquivos de imagem reais (incluindo HEIC conforme navegador).
- E-mail de recuperação continua externo, fora desta substituição de armazenamento/TTS.
- Imagens remotas antigas exigem sua cópia local ou acesso explícito ao provedor;
  nenhuma conversão destrutiva foi feita.
- Criadores com vínculo legado de Cuidador não foram promovidos automaticamente
  a Responsável. A administração da rede exige um vínculo de Responsável; tratar
  eventual perfil legado sem responsável exige decisão explícita, não migração silenciosa.
