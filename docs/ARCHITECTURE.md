# Arquitetura e decisões iniciais

## Estado real

`FrontEnd/` conserva o Next.js existente e `Backend/` conserva o Spring Boot como referência executável. Ambos já estavam copiados neste workspace. A origem localizada em `/home/matheus-martins/Documentos/GestPro/Gest-Pro` foi somente lida para comparação de código. Não houve cópia de configurações privadas.

`src/server/services/` mantém os cálculos monetários puros. `FrontEnd/server/` agora contém auth, perfil, empresas, catálogo e a entrada de operações financeiras. Route Handlers recebem Zod e sessões SSR; RPCs PostgreSQL mantêm preço, estoque, caixa, idempotência e auditoria em transações. Os caminhos de API são da própria aplicação, sem fallback para o Java. A implementação completa de todos os módulos ainda está pendente e o Supabase remoto não recebeu as migrations.

## Inventário

Execute `npm run audit`: gera `inventory.json` com hashes, arquivos, dependências de construtor, anotações HTTP e tabelas JPA; gera também `FUNCTIONAL_MATRIX.md`. A análise estática não substitui leitura semântica de cada serviço. Não chamar a auditoria integral de concluída com base nesse relatório.

O código revela recursos além da lista inicial: dívidas de clientes, pedidos, marketplace Shopee/Mercado Livre, emissão fiscal NF-e/NFC-e/NFS-e, certificado digital, XML, contingência, jobs, entregas, sequências, permissões fiscais e webhooks. Stripe e Mercado Pago aparecem no backend: confirmar uso efetivo por fluxo e configuração antes de escolher provedores. Existem referências a Cloudinary, Resend, consultas cadastrais, CEP e IBGE.

## Fronteiras a implementar

Route Handlers: autenticar sessão verificada, validar Zod, verificar origem nas mutações com cookies, resolver empresa e papel autorizados, chamar serviço de domínio e retornar erro padronizado. Não aceitar identidade fornecida no corpo como autorização.

Supabase SSR: clientes de navegador e servidor separados, cookies via `@supabase/ssr`, renovação de sessão e identidade verificada por `getClaims` ou `getUser`, nunca por confiar no usuário retornado de `getSession`. Revalidar associação e permissão no banco em cada operação. Não compartilhar cache de respostas autenticadas entre empresas. Referência: https://supabase.com/docs/guides/auth/server-side/creating-a-client

Venda: obter preços e estoque do banco; transação única para bloqueios de caixa/produtos, validação de empresa/cliente, baixa, itens, venda, total de caixa, auditoria e chave de idempotência com hash do pedido. Ordenar bloqueios de produtos por ID, agregar itens repetidos e tratar conflitos. Cancelamento requer bloqueio da venda e caixa para impedir devolução duplicada. Nada disso está implementado pelo calculador puro.

## Dinheiro e comportamento original

Decimais textuais nas fronteiras, centavos `bigint` no domínio e `numeric(p,2)` no PostgreSQL. Nenhuma conversão via `parseFloat` ou `Number` para fazer contas. Quantidades inteiras conforme o DTO Java.

`sale-totals.ts` preserva subtotal, desconto, total, pagamento dividido e troco de `VendaServiceImpl`. O DTO rejeita descontos negativos mesmo que o serviço isoladamente os normalize: a porta TypeScript reproduz a entrada HTTP validada. Mais de duas casas decimais são rejeitadas explicitamente; o DTO Java não fixa essa escala, portanto é uma diferença a resolver antes da integração.

O Java aceita valor recebido inferior ao total e produz troco zero. Também calcula troco sobre o total final completo em pagamento misto e para qualquer método. Essas regras foram preservadas e testadas, mas merecem decisão de produto antes de qualquer correção. Semântica não deve mudar silenciosamente.

## PostgreSQL

A primeira migration cria apenas empresas, com dono em `auth.users`, leitura sob RLS e nenhuma escrita para clientes. Não é a migração completa das entidades. Os IDs legados poderão ser importados por ferramenta explícita; usuários precisam de tabela de correspondência de IDs e redefinição de senha ou importação comprovadamente compatível. Nunca copiar hashes para tabelas próprias de senha.

Antes de liberar escritas: portar limites e validações de CPF/CNPJ, serviços de criação/arquivamento/restauração, garantir papel autorizado, testar RLS com dois usuários e concorrência contra PostgreSQL real. Migrations antigas continuam intactas. Não executar importação ou migration no banco original.

## PWA

Há `manifest.ts` e `public/sw.js`; o SW inspecionado somente encaminha requisições para a rede. Fila de vendas offline, IndexedDB e resolução de conflitos ainda precisam de auditoria e implementação. Não declarar vendas sincronizadas antes da confirmação persistida. Pagamentos externos dependem de conexão. Limpar dados locais por sessão/empresa e nunca armazenar segredos.

## Regras migradas e diferenças documentadas em 21/10

A criação de empresa conta inclusive empresas arquivadas, como no Java; restaurar considera apenas as ativas. RPCs serializam cotas por perfil para impedir bypass concorrente. CPF/CNPJ são validados no servidor e no banco. Os cinco provedores cadastrais presentes no Java são mantidos como fallbacks, sem tornar sua disponibilidade requisito para cadastrar um CNPJ válido.

Produtos mantêm códigos de barras textuais (inclusive zeros), unicidade por empresa, custo/preço/margem e arquivamento se houve venda. Reativação/mudança de empresa passam a verificar cota: correção do bypass de limite identificado no serviço original, necessária para não permitir contornar planos. Clientes e fornecedores compartilham a tabela, com e-mail único entre contatos ativos do mesmo tipo na mesma empresa.

A venda registra itens, baixa estoque, atualiza caixa, grava chave/hash e audita em uma única transação. Itens repetidos têm estoque validado agregado; as linhas originais são mantidas no comprovante. Preço do navegador não é aceito. Cancelamento bloqueia a venda e devolve o estoque uma única vez. A chave de tentativa sem confirmação é persistida no navegador; requisições simultâneas do mesmo carrinho compartilham envio, e a chave só é removida após ler confirmação válida do servidor.

O Java `Caixa.recalcularTotalVendas` incluía vendas canceladas, reintroduzindo seus valores depois de o cancelamento descontá-los. A migração corrige essa inconsistência financeira: resumo/fechamento consideram somente vendas não canceladas. O troco misto ainda segue a fórmula original do servidor; nenhuma regra comercial foi inventada para corrigi-lo silenciosamente. Saldos de caixa preservam quatro casas decimais do modelo Java; preços de produtos e vendas usam decimais apropriados no PostgreSQL, sem cálculo por float no servidor.

As APIs de listas têm paginação limitada. Ainda falta conectar paginação, busca global, categorias e totais agregados a todas as telas e ao PDV para catálogos grandes. Os oito arquivos de migration não equivalem à conversão de todas as entidades JPA: pedidos, dívidas, fiscal, marketplace e assinaturas ainda precisam de schema/serviços próprios. As interfaces permanecem no repositório; suas operações não migradas não devem ser tratadas como concluídas por apontarem à mesma origem.
