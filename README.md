# Gevyro Next

Migração incremental da Gevyro de Spring Boot/MySQL para TypeScript/Supabase PostgreSQL, preservando o frontend existente.

Projeto independente, com repositório próprio: [MartnsDev/Gevyro-Next](https://github.com/MartnsDev/Gevyro-Next). A Gevyro original serve como referência funcional; alterações, configurações e futuras publicações pertencem exclusivamente ao Gevyro Next. Não reutilizar bancos, credenciais ou ambientes de produção da Gevyro original.

**Ainda em migração. Não utilizar como backend substituto em produção.** Consulte [MIGRATION_STATUS.md](MIGRATION_STATUS.md) para o estado real de cada módulo.

## Estrutura

- `Backend/`: Java original mantido como referência; não modificado nesta etapa.
- `FrontEnd/`: interface existente e Route Handlers. Os serviços migrados usam Supabase; módulos restantes ainda não possuem backend novo completo.
- `FrontEnd/server/auth/`: autenticação, perfil, recuperação e proteção de origem das mutações.
- `FrontEnd/server/company`, `catalog`, `finance`: empresas, produtos/clientes e operações transacionais de caixa/venda.
- `src/server/services/`: primeiros serviços TypeScript independentes de React.
- `supabase/migrations/`: migrations PostgreSQL novas; schema ainda parcial.
- `tests/`: regras financeiras e isolamento RLS da fundação.
- `docs/`: inventário, equivalência, decisões e resultados de validação.

## Desenvolvimento e verificação

Requer Node 20.9+ para o frontend atual, npm e Python 3. Para testes PostgreSQL locais, PostgreSQL 16 e usuário de sistema não root.

```sh
npm ci
npm ci --prefix FrontEnd --ignore-scripts
npm run audit
npm run typecheck
npm test
npm run test:postgres
```

O teste PostgreSQL cria um cluster sintético exclusivo em `/tmp`, escuta apenas em socket Unix, aplica a migration e desliga ao terminar. Não acessa bancos existentes. A interface mínima `auth.uid()` do teste não substitui validação em Supabase real. Se os binários estiverem em outro caminho, configure `GEVYRO_PG_BIN`.

Para executar a interface legada:

```sh
npm ci --prefix FrontEnd
# Criar FrontEnd/.env.local manualmente com valores LOCAIS do .env.example.
npm run dev
npm --prefix FrontEnd run typecheck
npm run build
```

A API está na mesma origem do Next.js. Não configurar `NEXT_PUBLIC_API_URL` nem executar Java para os fluxos migrados. O script de build da raiz utiliza Webpack. Para validar o build sem disputar os artefatos do servidor de desenvolvimento, execute `GEVYRO_VALIDATE_BUILD=1 npm run build`; o resultado fica em `FrontEnd/.next-validation`. As rotas pendentes estão documentadas no status e não são substituídas por dados fictícios.

Scripts de status, dry-run e aplicação de migrations verificam o project-ref antes de chamar a CLI: `npm run supabase:status`, `npm run supabase:migrate:check`, `npm run supabase:migrate`. A conta CLI atual não possui acesso remoto. Deploy de aplicação ainda não está configurado; nenhum serviço pago foi contratado.

## Documentação

- [Matriz funcional](docs/FUNCTIONAL_MATRIX.md) e [inventário técnico](docs/inventory.json).
- [Arquitetura, segurança e comportamento financeiro](docs/ARCHITECTURE.md).
- [Avaliação de hospedagem](docs/HOSTING.md).
- [Validação deste incremento](docs/VALIDATION.md).
- [Configuração do Supabase do Gevyro Next](docs/SUPABASE_SETUP.md).

## Supabase e migração

Utilizar o projeto separado `zevgzuhtemnjrqeolmit`. As migrations dependem de `auth.users`/`auth.uid()` e cobrem perfis, empresas, catálogo, clientes/fornecedores, movimentações, caixa, vendas, itens, idempotência e auditoria, além das políticas de Storage. Não aplicar no MySQL original nem tratá-las como conversão completa do modelo JPA. A integração SSR está implementada, mas exige aplicar as migrations no Supabase remoto e configurar os provedores antes da validação funcional completa. Veja [configuração](docs/SUPABASE_SETUP.md). Nenhuma chave secreta é exigida por essas rotas.

Contas legadas exigirão correspondência entre IDs Java e Supabase e uma estratégia validada de importação ou redefinição de senha. A migração de dados deve usar exportação autorizada, execução de ensaio, contagem por empresa, chaves estrangeiras, saldos financeiros/estoque e reconciliação antes do corte.

## Backup e recuperação

O diretório `Backup/` é legado e não foi convertido para PostgreSQL. Antes de operar clientes: definir RPO/RTO, backups criptografados do banco e Storage, retenção, acesso restrito e restauração testada em projeto isolado. Não considerar recursos de backup do plano Supabase disponíveis sem conferência. Não há backup ou restauração de produção validado nesta etapa.

## Preparação de deploy

Consulte [docs/DEPLOY.md](docs/DEPLOY.md) para ambiente, Node 22, imagem Docker sem root, TLS, configuração hospedada pendente e validação. `npm run deploy:check` valida o ambiente e `npm run deploy:smoke -- https://SEU-DOMINIO` verifica uma instância. Nenhum deploy automático foi ativado.
