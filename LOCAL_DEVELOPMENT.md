# Minha Voz — desenvolvimento local

O perfil da pessoa comunicadora continua em `comm_users`, sem conta ou senha própria.
Contas adultas usam `users`; cada permissão é concedida em um vínculo `links`.
Os registros existentes são preservados. Não há migração ou reseed automático.

## Ambiente

- MongoDB exclusivo: `127.0.0.1:27018`, banco de desenvolvimento `minhavoz_dev`.
- Nunca utilizar o container ou volume do Boraí.
- Configurações privadas ficam nos `.env`, ignorados pelo Git.
- Backups de fontes antes desta implementação: `.local-backups/`, também ignorada.

Backend, a partir da raiz:

```powershell
.\backend\.venv\Scripts\python.exe -m uvicorn server:app --app-dir .\backend --host 127.0.0.1 --port 8001
```

Frontend, em `frontend`:

```powershell
corepack.cmd yarn web --localhost --port 3000
```

`CORS_ORIGINS` é opcional, separado por vírgulas. O padrão aceita somente
`http://localhost:3000` e `http://127.0.0.1:3000`. Para celular, adicionar a origem
web pertinente quando houver e configurar backend/frontend para o IP LAN; não usar `*`.

## Imagens locais

Uploads novos ficam em `backend/local_uploads/`, fora do versionamento e sem
servidor estático público. `LOCAL_UPLOAD_DIR` permite escolher outro diretório.
Mantenha backup desse diretório junto com o MongoDB. A API valida tamanho,
assinatura de formato, caminho e vínculo antes de servir uma imagem.
Fotos enviadas antes de cadastrar o perfil são associadas ao perfil ao salvar.
Foto continua opcional.

Metadados/caminhos de imagens antigas não são apagados. Para objetos que só
existem no armazenamento anterior, a API informa indisponibilidade local.
Somente a opção explícita `STORAGE_BACKEND=emergent` permite ler esses objetos
pela integração antiga; não é necessária nem usada no desenvolvimento local.
O startup não chama mais o armazenamento remoto. Nenhuma credencial antiga foi
reutilizada.

## Voz

- Android/iOS: `expo-speech` 58.0.3, compatível com o Expo existente. Instalar uma
  voz de português offline no motor TTS do aparelho. São priorizadas vozes locais
  e descartadas as identificadas como online/network. A API do Expo não expõe
  `isNetworkConnectionRequired`; confirmar o motor escolhido em modo avião no
  aparelho real é necessário antes de uso offline assistivo.
- Web: Web Speech API, somente vozes portuguesas com `localService=true`.
  Se não houver voz local, a interface informa como disponibilizá-la. Não há
  envio silencioso de textos para uma voz de nuvem.
- Os antigos nomes de vozes ficam preservados nos registros. Quando não
  correspondem a uma voz instalada, é utilizada a voz portuguesa disponível.
- Todas as áreas usam o mesmo serviço de fala. Não há chave de API no frontend.
- O endpoint `/api/tts` preserva leitura de áudios antigos em cache, mas responde
  410 para geração nova; o aplicativo atual não o chama.
- Recuperação de senha por e-mail continua sendo uma integração externa separada;
  os placeholders locais não enviam e-mail válido. Não confundir isso com TTS.

## Rede de apoio e privacidade

Responsável envia convite para uma conta existente e escolhe explicitamente o
papel. Convites expiram em sete dias; a pessoa aceita/recusa no próprio painel.
O convite não concede acesso antes do aceite. Links existentes continuam ativos.
A rota antiga de inclusão `/links` também exige papel explícito e cria convite.

Notas terapêuticas são privadas do terapeuta autor, inclusive perante outros
terapeutas. Compartilhar exige escrever um título/trecho separado e selecionar
os papéis destinatários. Todos os integrantes atualmente vinculados com aqueles
papéis veem somente o trecho. Revogar retira o acesso pela API. A prancha nunca
inclui notas terapêuticas. Indicadores gerais de uso continuam separados.

Atividades aceitam `kind=atividade|aviso`, `audience=comunicador|rede` e status
`pendente|realizada`. Registros antigos sem esses campos mantêm o comportamento
de atividade pendente destinada à pessoa comunicadora. Conteúdo `rede` não entra
na resposta da prancha.

O cache offline passa a ser separado por conta. Respostas 401/403/404 invalidam
a prancha daquela conta; não são tratadas como falta de internet. Um dispositivo
sem conexão não consegue receber imediatamente uma revogação remota: não se deve
prometer revogação instantânea offline.

## Verificação

```powershell
# Em backend: cria e remove somente um banco temporário minhavoz_verification_<uuid>.
.\.venv\Scripts\python.exe -m pytest -c tests/local_pytest.ini tests/test_local_features.py
# Em frontend:
corepack.cmd yarn tsc --noEmit
node --test tests/local-features.mjs
```

Os testes antigos exportados pressupõem o ambiente original e alguns contratos
anteriores de vínculo/TTS. Não executá-los contra `minhavoz_dev` sem adaptação.
Os testes novos não enviam e-mail nem usam serviços Emergent.

A inversão EU/UE não foi encontrada no banco, seed ou fonte. O HTML estava
declarado como inglês, permitindo tradução automática de siglas; agora usa
`lang=pt-BR` e impede tradução automática. Confirmar visualmente no navegador.

Validação manual ainda necessária: áudio real no Android em modo avião,
disponibilidade de voz portuguesa local no Windows/navegador, toque/teclado na
confirmação de saída e fluxo entre duas contas em dispositivos diferentes.
