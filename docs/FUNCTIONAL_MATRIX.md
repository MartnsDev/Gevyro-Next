# Matriz de equivalência funcional

Gerada por `npm run audit`. Os destinos são propostas; presença no inventário não significa migração concluída.

| Módulo original | Classes Java | Controllers | Entidades JPA | Destino previsto | Estado |
|---|---:|---:|---:|---|---|
| GestproBackendApplication.java | 1 | 0 | 0 | `src/server/GestproBackendApplication.java` | Não iniciado |
| analytics | 7 | 1 | 1 | `src/server/analytics` | Não iniciado |
| auth | 32 | 6 | 1 | `src/server/auth` | Não iniciado |
| caixa | 13 | 1 | 1 | `src/server/caixa` | Não iniciado |
| cliente | 12 | 2 | 2 | `src/server/cliente` | Não iniciado |
| configuracao | 8 | 1 | 1 | `src/server/configuracao` | Não iniciado |
| dashboard | 11 | 1 | 0 | `src/server/dashboard` | Não iniciado |
| empresa | 8 | 1 | 1 | `src/server/empresa` | Não iniciado |
| infra | 22 | 0 | 0 | `src/server/infra` | Não iniciado |
| marketplace | 17 | 2 | 2 | `src/server/marketplace` | Não iniciado |
| nota | 117 | 6 | 13 | `src/server/nota` | Não iniciado |
| pedidos | 10 | 1 | 2 | `src/server/pedidos` | Não iniciado |
| plano | 26 | 4 | 4 | `src/server/plano` | Não iniciado |
| produto | 14 | 2 | 2 | `src/server/produto` | Não iniciado |
| venda | 10 | 1 | 2 | `src/server/venda` | Em desenvolvimento |

## Interfaces preservadas

- `FrontEnd/app/auth/cadastro/page.tsx`
- `FrontEnd/app/auth/login/page.tsx`
- `FrontEnd/app/cancelamento-reembolsos/page.tsx`
- `FrontEnd/app/como-usar/page.tsx`
- `FrontEnd/app/confirmar-email/page.tsx`
- `FrontEnd/app/contato/page.tsx`
- `FrontEnd/app/cookies/page.tsx`
- `FrontEnd/app/dashboard/components/Clientes.tsx`
- `FrontEnd/app/dashboard/components/Configuracoes.tsx`
- `FrontEnd/app/dashboard/components/DashboardHome.tsx`
- `FrontEnd/app/dashboard/components/GerenciarEmpresas.tsx`
- `FrontEnd/app/dashboard/components/MobileNav.tsx`
- `FrontEnd/app/dashboard/components/Modalcaixa.tsx`
- `FrontEnd/app/dashboard/components/Modalprodutorapido.tsx`
- `FrontEnd/app/dashboard/components/NotaFiscal.tsx`
- `FrontEnd/app/dashboard/components/Pedidos.tsx`
- `FrontEnd/app/dashboard/components/Plano.tsx`
- `FrontEnd/app/dashboard/components/Produtos.tsx`
- `FrontEnd/app/dashboard/components/Relatorios.tsx`
- `FrontEnd/app/dashboard/components/Seletorempresa.tsx`
- `FrontEnd/app/dashboard/components/Vendas.tsx`
- `FrontEnd/app/dashboard/components/complementos/FormularioProduto.tsx`
- `FrontEnd/app/dashboard/components/graphs/AreaTrendChart.tsx`
- `FrontEnd/app/dashboard/components/graphs/BarChart.tsx`
- `FrontEnd/app/dashboard/components/graphs/Linechart.tsx`
- `FrontEnd/app/dashboard/components/graphs/PieChart.tsx`
- `FrontEnd/app/dashboard/page.tsx`
- `FrontEnd/app/esqueceu-senha/page.tsx`
- `FrontEnd/app/pagamento/assinatura/page.tsx`
- `FrontEnd/app/pagamento/page.tsx`
- `FrontEnd/app/page.tsx`
- `FrontEnd/app/payment/sucesso/page.tsx`
- `FrontEnd/app/privacidade/page.tsx`
- `FrontEnd/app/seguranca/page.tsx`
- `FrontEnd/app/termos/page.tsx`

## Limites do levantamento

Os mappings no JSON mantêm as anotações de classe e método separadas. Revisar composição, verbos, DTOs e autorização ao portar cada controller.
Categorias, fornecedores, suporte e notificações citados no pedido ainda precisam de confirmação semântica: não criar módulos fictícios a partir do checklist.
Credenciais, dumps e dados reais não integram este inventário.
