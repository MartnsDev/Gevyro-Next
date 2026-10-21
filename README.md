# Gevyro Next

Migração incremental da Gevyro de Spring Boot/MySQL para TypeScript/Supabase PostgreSQL, preservando o frontend existente.

Projeto independente, com repositório próprio: [MartnsDev/Gevyro-Next](https://github.com/MartnsDev/Gevyro-Next). A Gevyro original serve como referência funcional; alterações, configurações e futuras publicações pertencem exclusivamente ao Gevyro Next. Não reutilizar bancos, credenciais ou ambientes de produção da Gevyro original.

**Ainda em migração. Não utilizar como backend substituto em produção.** Consulte [MIGRATION_STATUS.md](MIGRATION_STATUS.md) para o estado real de cada módulo.

## Estrutura

- `Backend/`: Java original mantido como referência; não modificado nesta etapa.
- `FrontEnd/`: interface existente, ainda conectada à API Java.
- `src/server/services/`: primeiros serviços TypeScript independentes de React.
- `supabase/migrations/`: migrations PostgreSQL novas; schema ainda parcial.
- `tests/`: regras financeiras e isolamento RLS da fundação.
- `docs/`: inventário, equivalência, decisões e resultados de validação.

## Desenvolvimento e verificação

Requer Node 20.9+ para o frontend atual, npm e Python 3. Para testes PostgreSQL locais, PostgreSQL 16 e usuário de sistema não root.

```sh
npm ci
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

Em desenvolvimento, `NEXT_PUBLIC_API_URL` usa `http://localhost:8080` por padrão. Para outro endereço, configure `FrontEnd/.env.local`. Em produção e no build, a variável é obrigatória. O script de build da raiz utiliza Webpack; a tentativa com Turbopack não terminou neste ambiente. A execução funcional ainda requer o backend Java e suas integrações. Não reutilizar credenciais de produção. Não apontar testes para a API pública original.

Não existem ainda scripts de deploy ou migrations contra ambiente remoto: serão adicionados com a integração efetiva e sua validação. Nenhum serviço pago foi contratado.

## Documentação

- [Matriz funcional](docs/FUNCTIONAL_MATRIX.md) e [inventário técnico](docs/inventory.json).
- [Arquitetura, segurança e comportamento financeiro](docs/ARCHITECTURE.md).
- [Avaliação de hospedagem](docs/HOSTING.md).
- [Validação deste incremento](docs/VALIDATION.md).

## Supabase e migração

Provisionar somente um projeto separado de desenvolvimento ao iniciar a integração. A migration atual depende de `auth.users`/`auth.uid()` fornecidos pelo Supabase e contém apenas empresas. Não aplicar no MySQL original nem tratá-la como conversão completa do modelo JPA. Chave publicável vai no cliente; chaves secretas somente no servidor, se realmente necessárias. A integração SSR ainda está pendente.

Contas legadas exigirão correspondência entre IDs Java e Supabase e uma estratégia validada de importação ou redefinição de senha. A migração de dados deve usar exportação autorizada, execução de ensaio, contagem por empresa, chaves estrangeiras, saldos financeiros/estoque e reconciliação antes do corte.

## Backup e recuperação

O diretório `Backup/` é legado e não foi convertido para PostgreSQL. Antes de operar clientes: definir RPO/RTO, backups criptografados do banco e Storage, retenção, acesso restrito e restauração testada em projeto isolado. Não considerar recursos de backup do plano Supabase disponíveis sem conferência. Não há backup ou restauração de produção validado nesta etapa.
