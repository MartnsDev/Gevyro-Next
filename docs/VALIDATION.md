# Validação do primeiro incremento

## Resultados executados

- `npm run audit`: 308 arquivos Java, 158 arquivos frontend e 22 migrations MySQL inventariados. Os 466 arquivos de código comparados eram idênticos à origem. Isso não verifica assets binários, segredos, histórico Git ou configurações fora do inventário.
- `npm install --ignore-scripts --no-audit --no-fund`: TypeScript 5.9.3 instalado e lockfile gerado. A primeira tentativa sem acesso de rede falhou com `EAI_AGAIN`; a tentativa autorizada com cache em `/tmp` passou.
- `npm ci --prefix FrontEnd --ignore-scripts --no-audit --no-fund`: 207 pacotes instalados a partir do lockfile existente. Não houve upgrade de dependências do frontend.
- `npm run typecheck`: passou para os serviços TypeScript novos.
- `npm test` e `node tests/sale-totals.test.cjs`: passaram. Execução direta mostrou seis testes: precisão/valores grandes, entrada inválida, desconto/troco, pagamento misto, comportamento legado do troco e vendas inválidas.
- `npm --prefix FrontEnd run typecheck`: passou.
- `npm run test:postgres`: passou em PostgreSQL 16 local descartável, após permitir o socket Unix local fora da restrição inicial do sandbox. Migration aplicada com sucesso, dois donos isolados por RLS, ausência de identidade sem dados, leitura anônima negada e INSERT/UPDATE/DELETE negados ao cliente.
- `git diff --check`: passou.
- `NEXT_PUBLIC_API_URL=http://localhost:8080 timeout 180s npm --prefix FrontEnd run build -- --webpack`: passou fora do sandbox após corrigir o CSS. Compilação, TypeScript, geração de 21 páginas e coleta de traces concluídos, exit code 0. O script `npm run build` da raiz usa esse mesmo compilador. Isso não testa fluxos com backend ou Workers.

Após a correção CSS, nova comparação registrou 465 arquivos idênticos e somente `FrontEnd/app/styles/auth.module.css` diferente entre os 466 arquivos inventariados. O backend Java permanece idêntico à origem nesse conjunto. O original foi somente lido.

## Limites

Os testes de cálculo foram derivados de leitura do Java e DTOs; não são comparação diferencial com a JVM executada. Não há testes E2E, concorrência financeira, idempotência de venda, webhook ou autenticação Supabase neste incremento.

O teste PostgreSQL emula a interface mínima `auth.uid()` e roles. Não comprova configuração de grants/default privileges no projeto Supabase hospedado, validade dos JWT, sessão SSR ou segurança dos módulos ainda não migrados.

O build Turbopack do frontend ficou na etapa `compile` sem produzir resultado e foi interrompido. Webpack no sandbox falhou ao interpretar a saída de `tsc --showConfig`; fora do sandbox avançou e encontrou erros anteriores em `FrontEnd/app/styles/auth.module.css`: `:local(:root)` e wrappers `:local(...)` de seletores complexos não são aceitos como seletores puros. As variáveis foram limitadas a `.authContainer` e `.dashboardContainer`, sem alterar seus valores; os wrappers redundantes foram removidos porque classes já são locais por padrão. A preservação visual desta correção ainda exige teste de navegador. Há aviso de múltiplos lockfiles (raiz e FrontEnd); não confundir esse aviso com validação de produção.

Nenhum build Cloudflare, preview Workers, deploy, chamada a API de produção, importação de dados ou pagamento real foi executado.

## Autenticação — 21/10/2026

Implementados `POST /api/auth/login`, `POST /api/auth/logout` e `GET /api/auth/session`, cliente SSR exclusivo do servidor e consulta de perfil autorizado sob RLS. As funções correspondentes de `api-v2.ts` agora chamam essas rotas na mesma origem, sem CSRF Java. Cadastro e demais fluxos de autenticação ainda não foram migrados.

`npm test` e a verificação de tipos do frontend passaram. Os testes cobrem validação de origem, entrada estrita, rejeição de sessão/e-mail não confirmado, plano do perfil em vez de metadata, expiração experimental, plano pago sem vencimento, invalidação da conta anterior, perfil ausente e resposta sem tokens. São testes com SDK simulado; não simulam login real de cliente nem provam rotação de cookies contra o serviço hospedado.

`npm run test:postgres` passou com ambas as migrations em PostgreSQL 16 descartável: trigger e backfill criam perfis, RLS isola usuários e metadados não permitem escolher plano Premium. Usuário autenticado não pode alterar seu plano.

Teste HTTP no servidor de desenvolvimento já existente em `localhost:3000`: consulta sem cookies retornou 401, logout com origem externa 403, logout na mesma origem 204 e login com entrada inválida 400. Nenhuma credencial real foi utilizada, nenhuma conta criada e nenhum fluxo de pagamento chamado. A tentativa inicial de iniciar outro servidor na porta 3100 foi recusada pelo lock do Next; o servidor existente não foi interrompido.

Consulta remota com `limit=0` retornou `404/PGRST205` para `usuarios`, sem solicitar dados de clientes. A migration remota de perfis ainda precisa ser aplicada pela conta autorizada. O login válido completo com perfil remoto continua pendente de validação; não declarar autenticação completa nem migração completa.

## Ampliação da migração — 21/10/2026

- Build real `GEVYRO_VALIDATE_BUILD=1 timeout 180s npm run build` passou: Next 16.3.2/Webpack, TypeScript, 21 páginas estáticas e as novas Route Handlers dinâmicas. Artefatos separados do servidor de desenvolvimento; sem deploy.
- `npm test` passou com testes monetários, atualização do worker, auth/cadastro/recuperação, assinatura de imagens e chaves de idempotência. SDK de Auth é simulado nos testes unitários; não são contas falsas em produção.
- `npm run test:postgres` passou aplicando migrations em PostgreSQL 16 real descartável, com fixtures sintéticas. Valida trigger/backfill, RLS, plano, CPF/CNPJ, cota de empresas, Storage por conta, produto/código/margem decimal, clientes e fornecedores, baixa e restituição de estoque, pagamento misto, desconto/troco, cancelamento repetido e fechamento de caixa. A interface mínima de Storage não substitui teste de upload HTTP no serviço hospedado.
- Concorrência real em duas conexões: duas empresas não ultrapassam o último slot; duas vendas disputando a última unidade produzem um único débito de estoque e uma venda; retry simultâneo com a mesma chave devolve o mesmo ID e não soma duas vezes no caixa.
- HTTP no Next local: Auth/empresas/produtos/clientes/caixa sem sessão retornam 401; signup/recover/reset inválidos retornam 400; mutação com origem externa retorna 403. Não houve chamadas ao Java nem criação de conta no Supabase durante esses testes.
- A configuração pública do Supabase respondeu 200: cadastro permitido, confirmação de e-mail habilitada e Google desabilitado. O link da CLI continuou recusado por falta de privilégios; não havia navegador conectado para alternativa autenticada. Migrations e alterações remotas não foram executadas.
- Backend original não foi modificado. Exclusões preexistentes no workspace continuam fora destas alterações.

Não foram validados E2E autenticado completo, importação MySQL, SMTP/Google/Storage hospedado, paginação completa da UI, pagamentos, fiscal, relatórios, pedidos, offline completo, cron ou runtime Workers. O resultado é implementação incremental verificável; não é aceite final de paridade integral.

## Supabase remoto — 21/10/2026

Login interativo concluído e vínculo confirmado com `zevgzuhtemnjrqeolmit`. Dry-run listou as oito migrations; aplicação terminou com sucesso e `supabase:status` confirmou as oito versões locais/remotas iguais. Consultas anônimas de zero linhas a usuarios, empresas, clientes, caixas e vendas retornaram 401, sem leitura de dados de clientes. Não foram criados usuários de teste nem importados dados Java. Login completo com conta confirmada, configurações hospedadas de e-mail/Google e deploy da aplicação continuam pendentes. Este resultado substitui os bloqueios de acesso remoto registrados anteriormente.

## Preparação de deploy e segurança — 21/10/2026

Destino escolhido: Vercel, Root Directory FrontEnd. Adicionados vercel.json, validação de ambiente antes do build, health check, Node 22 e alternativa Docker standalone. CSP com nonce por requisição foi validada no HTML de produção; a origem canônica protege callbacks atrás de proxy. Smoke local passou para 200 no health, 401 nas APIs anônimas, 403 em mutação com origem externa, 421 para Host adulterado e ausência de cache/exposição X-Powered-By. A impressão foi adaptada para não depender de scripts/onclick inline; validação visual manual continua pendente.

Next atualizado de 16.3.2 para 16.3.8, sharp para 0.35.5 e dependências transitivas corrigidas. Auditoria npm das dependências de produção retornou zero vulnerabilidades conhecidas. Build standalone final e testes passaram. Docker build com Node 22.23.3 concluiu usando rede do host, após falha inicial do npm na rede isolada. A execução com no-new-privileges foi bloqueada pelo Docker instalado (operation not permitted ao executar Node); execução simples do Node na imagem passou. Não foi removida essa proteção da configuração de produção. Plugin Compose não está instalado; validação operacional completa do Compose permanece pendente.

A revisão automática rejeitou config push hospedado por risco de alterar MFA/domínio/pool que apareciam como diferenças remotas. O comando não executou alterações. O diff mostrou OTP remoto de oito dígitos e senha mínima 6; alinhar com OTP de seis dígitos e senha 8/letras/números antes de liberar cadastro/recuperação. Configuração de conta Vercel, domínio, WAF, SMTP/Google e fluxo real com conta confirmada continuam pendentes. O limite de payload Vercel de 4,5 MB também exige adaptação para preservar uploads de 5 MB. Não houve deploy público nem contratação de plano.

A sessão Vercel já existente foi encontrada posteriormente: projeto independente gevyro-next criado, configurações de raiz/runtime/build/proteção aplicadas e três variáveis públicas cadastradas. O endereço atribuído é https://gevyro-next.vercel.app. Nenhum deployment foi criado. Esse resultado substitui a pendência anterior de acesso à conta; WAF e callbacks ainda não foram aplicados.
