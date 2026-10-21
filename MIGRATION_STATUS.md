# Gevyro → Gevyro Next: status verificável

Atualizado em 21/10/2026. A migração **não está completa**. O frontend agora usa sua própria origem HTTP. Autenticação, perfil, empresas, produtos, clientes/fornecedores, caixa e vendas têm implementação Next.js/PostgreSQL. Há módulos e validações ainda pendentes; remover chamadas ao Java não prova paridade funcional. Nenhum deploy de aplicação ou alteração em banco de produção foi realizado.

Estados: Não iniciado; Em desenvolvimento; Implementado; Testado; Validado. Uma unidade testada não implica módulo completo.

| Módulo/etapa | Estado | Evidência e pendências |
|---|---|---|
| Auditoria integral | Em desenvolvimento | Inventário estático de 308 arquivos Java, 158 arquivos frontend, 22 migrations. Falta revisão semântica de todos os serviços, contratos e testes originais. |
| Cópia independente | Validado no escopo inventariado | Workspace já existente; 466 arquivos de código idênticos à origem localizada. Nenhum arquivo foi copiado neste incremento. Alterações Git anteriores preservadas. |
| Infraestrutura TypeScript | Testado | Build Next.js/Webpack com Route Handlers passou em diretório separado; tipos e testes locais passaram. Runtime Workers ainda não validado. |
| PostgreSQL/Supabase | Em desenvolvimento | Oito migrations de domínio/Storage e testes reais PostgreSQL 16 passaram. Oito migrations aplicadas em zevgzuhtemnjrqeolmit em 21/10/2026; histórico local/remoto sincronizado. Google remoto desabilitado; confirmação de e-mail habilitada. |
| Auth/usuário/perfil/OAuth2/e-mail | Em desenvolvimento | Login, logout, cadastro, confirmação, reenvio, Google/PKCE, recuperação por OTP, perfil e foto privada implementados. Testes locais passaram. Validar e-mails, SMTP, configuração Google e sessões contra o Supabase real; contas Java não foram importadas. |
| Empresas e multiempresa | Em desenvolvimento | CRUD, documento fiscal, arquivamento/exclusão com reautenticação, restauração, cotas transacionais e RLS implementados/testados localmente. Associação de colaboradores/permissões fiscais e paginação completa da UI pendentes. |
| Dashboard | Não iniciado | Interface preservada. Agregações combinam PDV e pedidos no original; precisam de migração conjunta. As rotas não retornam indicadores simulados. |
| Produtos/categorias/código de barras/fiscal | Em desenvolvimento | CRUD, código único, preço/custo/margem decimal, estoque, exclusão/arquivamento e cotas implementados/testados. Configuração fiscal e integração completa de paginação/busca na UI pendentes. |
| PDV/vendas | Em desenvolvimento | Transação de venda/itens/estoque/caixa, pagamentos mistos, desconto/troco, observação, cancelamento e idempotência implementados. Concorrência/rollback passaram no PostgreSQL. Validar fluxo autenticado completo, impressão e grandes históricos na UI. |
| Estoque | Em desenvolvimento | Baixa/restituição transacional, ajustes via produto e registro de movimentações implementados; estoque concorrente testado. Endpoints específicos e UI de histórico/offline pendentes. |
| Caixa | Em desenvolvimento | Abertura, fechamento, consulta, histórico e totais implementados. Função de fechamento automático de 24 horas restrita ao servidor criada; agendamento/runtime ainda não configurados. |
| Clientes e dívidas | Em desenvolvimento | CRUD, e-mail ativo único por empresa/tipo e desativação implementados/testados. Dívidas, histórico, paginação da UI e fluxos relacionados ainda pendentes. |
| Fornecedores | Em desenvolvimento | Confirmado no Java como Cliente.tipo=FORNECEDOR; CNPJ, contato, observações e unicidade de e-mail por tipo preservados nas rotas novas. |
| Pedidos | Não iniciado | Módulo identificado, além do checklist inicial. |
| Analytics/relatórios/exportação/impressão | Não iniciado | Preservar formatos encontrados após revisão dos geradores Java e frontend. |
| Assinaturas/planos | Não iniciado | Experimental, Básico, Pro, Premium; referências Stripe e Mercado Pago. Confirmar fluxos efetivamente ativos. |
| Marketplace | Não iniciado | Shopee e Mercado Livre, conexões OAuth, produtos, pedidos e webhooks identificados. |
| Fiscal/documentos | Não iniciado | NF-e/NFC-e/NFS-e, certificados, XML, sequências, jobs, contingência, auditoria, permissões e entregas. Avaliar runtime e alternativas Java. |
| Configurações | Em desenvolvimento | Nome, foto privada, preferências de notificação e troca de senha via OTP implementados. Validar interface autenticada, entrega de e-mail e compatibilidade de imagens. |
| PWA/offline | Em desenvolvimento | Worker não intercepta a rede; worker antigo removido/recarregado em desenvolvimento. Chaves de venda sem confirmação persistem para retry. Cache de catálogo, carrinho offline e fila completa com conflitos ainda não implementados. |
| Suporte/notificações/admin | Não iniciado | Revisão semântica pendente para confirmar recursos existentes. |
| Migração de dados/contas | Não iniciado | Nenhum dado original acessado. Preparar importação opcional, correspondência de IDs, reconciliação e estratégia de senha. |
| Qualidade completa | Em desenvolvimento | Build, tipos, testes unitários, RLS, cotas, idempotência e concorrência reais PostgreSQL passaram. Faltam E2E autenticado, comparação diferencial JVM, módulos avançados e runtime Workers. |
| Cloudflare/Vercel | Não iniciado | Documentação comparada; nenhum adaptador/runtime validado ou deploy executado. |

## Pendências que impedem declarar a migração completa

1. Acesso autorizado ao Supabase, aplicação das migrations e validação real de Auth/Storage/SMTP/Google.
2. Dashboard, pedidos, dívidas, relatórios/exportações, assinaturas/webhooks, fiscal e marketplace.
3. Paginação e busca completas nas telas: APIs de lista já aceitam page/size e limitam o retorno; não considerar catálogos/históricos grandes validados até conectar os controles de navegação e os totais agregados. Hoje páginas sem page/size recebem até 500 itens (empresas: 1000).
4. Permissões delegadas/multiempresa além do dono, migração de dados/contas, offline completo e agendamento de caixa.
5. E2E/regressão visual, backup/restauração PostgreSQL e runtime/deploy Workers.

Nenhum módulo foi marcado como Validado apenas por existir uma tela ou endpoint.
