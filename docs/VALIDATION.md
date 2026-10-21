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
