# Gevyro → Gevyro Next: status verificável

Atualizado em 20/10/2026. A migração **não está completa**. O frontend ainda utiliza o backend Java. Nenhum deploy ou acesso a banco de produção foi realizado.

Estados: Não iniciado; Em desenvolvimento; Implementado; Testado; Validado. Uma unidade testada não implica módulo completo.

| Módulo/etapa | Estado | Evidência e pendências |
|---|---|---|
| Auditoria integral | Em desenvolvimento | Inventário estático de 308 arquivos Java, 158 arquivos frontend, 22 migrations. Falta revisão semântica de todos os serviços, contratos e testes originais. |
| Cópia independente | Validado no escopo inventariado | Workspace já existente; 466 arquivos de código idênticos à origem localizada. Nenhum arquivo foi copiado neste incremento. Alterações Git anteriores preservadas. |
| Infraestrutura TypeScript | Testado | Compilação estrita e testes do primeiro serviço. Next, Supabase SSR e runtime final ainda não integrados. |
| PostgreSQL/Supabase | Em desenvolvimento | Migration parcial de empresas/RLS; não é o schema completo. Ver testes em `docs/VALIDATION.md`. |
| Auth/usuário/perfil/OAuth2/e-mail | Não iniciado | Login, cadastro, confirmação, recuperação, Google, cookies e autorização continuam Java. |
| Empresas e multiempresa | Em desenvolvimento | Leitura por dono em RLS preparada; serviços, limites, arquivamento, restauração e associações pendentes. |
| Dashboard | Não iniciado | Telas preservadas, consultas ainda Java. |
| Produtos/categorias/código de barras/fiscal | Não iniciado | Entidade e validações inventariadas; portar CRUD, busca, imagens, estoque e configuração fiscal. |
| PDV/vendas | Em desenvolvimento | Calculador monetário portado com seis testes. Persistência, autorização, caixa, estoque, cancelamento, observações e idempotência pendentes. |
| Estoque | Não iniciado | Bloqueio transacional por produto identificado no Java; falta PostgreSQL, movimentações e testes concorrentes. |
| Caixa | Não iniciado | Abertura/fechamento, totais, scheduler e limites pendentes. |
| Clientes e dívidas | Não iniciado | `Cliente` e `Divida` no original; portar regras e relações. |
| Fornecedores | Não iniciado | Existência de módulo próprio ainda não confirmada. Não inventar equivalência. |
| Pedidos | Não iniciado | Módulo identificado, além do checklist inicial. |
| Analytics/relatórios/exportação/impressão | Não iniciado | Preservar formatos encontrados após revisão dos geradores Java e frontend. |
| Assinaturas/planos | Não iniciado | Experimental, Básico, Pro, Premium; referências Stripe e Mercado Pago. Confirmar fluxos efetivamente ativos. |
| Marketplace | Não iniciado | Shopee e Mercado Livre, conexões OAuth, produtos, pedidos e webhooks identificados. |
| Fiscal/documentos | Não iniciado | NF-e/NFC-e/NFS-e, certificados, XML, sequências, jobs, contingência, auditoria, permissões e entregas. Avaliar runtime e alternativas Java. |
| Configurações | Não iniciado | Telas preservadas; persistência e permissões pendentes. |
| PWA/offline | Não iniciado | Manifest e SW existentes. SW atual é somente rede: não há offline funcional demonstrado. |
| Suporte/notificações/admin | Não iniciado | Revisão semântica pendente para confirmar recursos existentes. |
| Migração de dados/contas | Não iniciado | Nenhum dado original acessado. Preparar importação opcional, correspondência de IDs, reconciliação e estratégia de senha. |
| Qualidade completa | Em desenvolvimento | Seis testes financeiros, RLS local, tipos e build Next/Webpack passaram. Faltam autenticação, fluxos E2E, regressão visual, concorrência, pagamentos e equivalência com Java executado. |
| Cloudflare/Vercel | Não iniciado | Documentação comparada; nenhum adaptador/runtime validado ou deploy executado. |

## Próxima sequência necessária

1. Revisar integralmente contratos e regras por módulo a partir do inventário, começando auth/empresa/plano.
2. Completar modelo PostgreSQL e instalar Supabase SSR com sessões verificadas; testar isolamento de domínio e papéis.
3. Portar produtos/caixa/venda em transação com idempotência e testes de concorrência antes de conectar o PDV.
4. Migrar demais módulos e integrações sem remover recursos; manter matriz atualizada com evidências.
5. Validar UI, relatórios, impressão, offline e Workers; documentar custos e operação antes de publicar.
