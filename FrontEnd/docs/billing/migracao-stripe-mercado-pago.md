# Gevyro: inventário da migração Stripe → Mercado Pago

Análise do repositório em 21/09/2026, feita antes das alterações desta etapa. O pedido posterior autorizou implementar webhooks; a remoção geral da Stripe não foi executada. Foram examinados código, manifests, configurações, documentação, testes e nomes de variáveis locais. Valores de credenciais não são reproduzidos. Artefatos gerados (`target`, `.next`, `node_modules`, bundles e histórico Git) não são fontes de configuração ativa.

## Fluxo atual ativo

1. Cadastro cria `Usuario` experimental. `TipoPlano.EXPERIMENTAL` concede 30 dias; `dataPrimeiroLogin` é inicializada na persistência do usuário.
2. Login e operações protegidas usam `VerificarPlanoOperation`; `PlanAccessFilter` bloqueia contas inativas e libera gestão da cobrança.
3. Cards do dashboard e links de contratação levam a `/pagamento?plano=...`.
4. A tela valida a sessão e envia apenas `plano` para `POST /api/payments/create-checkout-session`.
5. `MercadoPagoController` deriva o e-mail da autenticação; `MercadoPagoService` resolve preço e recorrência no catálogo servidor.
6. Uma reserva durável com UUID impede POST duplicado. A API `/preapproval` cria contrato pendente. O browser redireciona para `init_point`.
7. O cliente autoriza no Mercado Pago e retorna a `/payment/sucesso`. A página consulta `session-info`; URL de retorno não prova pagamento.
8. Faturas e pagamentos consultados na API determinam a vigência. `Assinatura` e `Usuario` recebem os dados de acesso. Na etapa de webhooks, isso também ocorre de forma assíncrona, durável e idempotente.
9. `/pagamento/assinatura` permite consulta, pausa, reativação e cancelamento. Dias já pagos são preservados.

## Arquivos Stripe e destino da migração

Caminhos da tabela são relativos à raiz do repositório.

| Arquivo | Papel atual / destino |
| --- | --- |
| `Backend/pom.xml` | Mantém `com.stripe:stripe-java` e propriedade `stripe.version`; remover apenas depois de eliminar imports. MP SDK 3.7.0 já instalado. |
| `Backend/src/main/java/br/com/gestpro/infra/config/StripeConfig.java` | Inicializa `Stripe.apiKey`; condicional `billing.provider=stripe`. Remover no encerramento. |
| `Backend/src/main/java/br/com/gestpro/plano/stripe/service/PaymentService.java` | Checkout `Session` em modo subscription, Customer reutilizado, idempotência por janela de cinco minutos e Billing Portal. Substituído por preapproval e página de gestão local. |
| `Backend/src/main/java/br/com/gestpro/plano/stripe/service/StripePriceProperties.java` | Mapeia Básico/Pro/Premium ↔ Price ID. MP usa valores/recorrência do catálogo servidor. |
| `Backend/src/main/java/br/com/gestpro/plano/stripe/controller/CheckoutController.java` | Checkout, session-info, portal e webhook `Stripe-Signature`; condicional Stripe. Não pode coexistir na mesma rota do MP sem separar URLs. |
| `Backend/src/main/java/br/com/gestpro/plano/service/AtualizarPlanoOperation.java` | Consulta Subscription Stripe, metadados de usuário, Price ID, `current_period_end`; trata inadimplência/cancelamento. Substituir somente após contratos Stripe ativos serem encerrados/migrados. |
| `Backend/src/main/java/br/com/gestpro/plano/stripe/model/StripeWebhookEvent.java` | Histórico/deduplicação por `stripe_event_id`; preservar dados para auditoria. |
| `Backend/src/main/java/br/com/gestpro/plano/stripe/repository/StripeWebhookEventRepository.java` | Acesso ao histórico Stripe; remover código apenas após encerrar recepção legada. |
| `Backend/src/main/java/br/com/gestpro/plano/stripe/model/Assinatura.java` | Entidade compartilhada, inclusive pelo MP; campos `stripeSubscriptionId` e `stripeCustomerId`. Mover para pacote neutro; não apagar tabela/entidade. |
| `Backend/src/main/java/br/com/gestpro/plano/stripe/repository/AssinaturaRepository.java` | Consultas por usuário e IDs Stripe; mover para pacote neutro e retirar apenas métodos legados ao final. |
| `Backend/src/main/java/br/com/gestpro/plano/stripe/PlanoTipo.java` | Enum compartilhado de planos pagos; mover, não excluir sem substituto. |
| `Backend/src/main/java/br/com/gestpro/plano/stripe/dto/CheckoutRequest.java` | DTO compartilhado pelo controller MP; mover para pacote neutro. |
| `Backend/src/main/java/br/com/gestpro/plano/TipoPlano.java` | Limites de empresas/caixas/produtos/histórico e 30 dias experimentais; usa enum ainda no pacote Stripe. Preservar regras e atualizar import. |
| `Backend/src/main/java/br/com/gestpro/plano/service/VerificarPlanoOperation.java` | Acesso pago exige `ATIVO` e vencimento; depende da entidade compartilhada. Preservar, remover comentário/import legado ao mover o domínio. |
| `Backend/src/main/java/br/com/gestpro/plano/mercadopago/{MercadoPagoController,MercadoPagoService,MercadoPagoSubscription}.java` | Já usam MP, mas importam DTO/enum/entidade de `plano.stripe`. Atualizar após mover o domínio. |

## Configuração e variáveis

- `Backend/src/main/resources/application-dev.properties` e `application-prod.properties`: `billing.provider=mercadopago`; carregam `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_WEBHOOK_SECRET`.
- `Backend/src/test/resources/application-test.properties`: mantém `billing.provider=stripe`, `stripe.api.key`, `stripe.webhook.secret` e `stripe.price.basico/pro/premium` para testes legados. Os testes MP sobrescrevem a seleção quando necessário.
- `Backend/.env.secrets`: foram encontrados os nomes `STRIPE_API_KEY` e `STRIPE_WEBHOOK_SECRET`; nenhum valor foi exibido. Remover/rotacionar somente após encerramento operacional da Stripe.
- `StripePriceProperties`: propriedades `stripe.price.basico`, `stripe.price.pro`, `stripe.price.premium`; equivalentes de ambiente por binding Spring podem existir no deploy, que não foi inspecionado.
- `Backend/.env.example`, `FrontEnd/docs/billing/mercado-pago.env.example`: configuração MP sem credenciais preenchidas.
- `Backend/.gitignore`: referência residual ao Stripe CLI; `.gitleaks.toml`: regras ligadas a segredos Stripe. Não retirar proteção contra vazamento prematuramente.

## Frontend, acesso e outros consumidores

Não foram encontrados SDKs/imports Stripe ativos no código Next.js pesquisado. Os pontos de integração são:

- `FrontEnd/lib/billing.ts`: catálogo visual, checkout autenticado, validação da URL e consultas/ações da assinatura.
- `FrontEnd/app/pagamento/page.tsx`: único CTA de criação; total e confirmação da conta.
- `FrontEnd/app/pagamento/assinatura/page.tsx`: gestão da assinatura e estado da cobrança.
- `FrontEnd/app/payment/sucesso/page.tsx`: polling do backend; não confia em query string como aprovação.
- `FrontEnd/app/dashboard/components/Plano.tsx`: entrada nos planos; período experimental visual de 30 dias.
- `Backend/src/main/java/br/com/gestpro/auth/model/Usuario.java`: plano, status de acesso, datas do trial e de assinatura.
- `Backend/src/main/java/br/com/gestpro/auth/service/{LoginManualOperation,LoginGoogleOperation}.java`: validam acesso ao autenticar.
- `Backend/src/main/java/br/com/gestpro/empresa/service/EmpresaService.java`: limites/acesso.
- `Backend/src/main/java/br/com/gestpro/dashboard/service/VisaoGeralOperation.java` e `dashboard/dto/PlanoDTO.java`: dias restantes e plano exibido.
- `Backend/src/main/java/br/com/gestpro/configuracao/controller/ConfiguracaoController.java`, `configuracao/service/ConfiguracaoServiceImpl.java` e `configuracao/dto/PerfilDTO.java`: perfil e contagem de dias.
- `Backend/src/main/java/br/com/gestpro/infra/{filter/PlanAccessFilter,filter/JwtAuthenticationFilter,security/SecurityConfig}.java`: regras de autenticação, CSRF e acesso à cobrança.

Referências documentais/testes adicionais: `FrontEnd/docs/billing/prompt-implementacao-segura.md`, `FrontEnd/docs/COMPLIANCE-PRODUCAO.md`, `Backend/docs/fiscal/arquitetura-e-operacao.md`, `Backend/src/test/java/br/com/gestpro/plano/service/{AtualizarPlanoOperationTest,VerificarPlanoOperationTest}.java` e testes MP que importam o domínio compartilhado. Documentos históricos podem descrever o objetivo, não necessariamente o código efetivo.

## Correspondência dos contratos

| Stripe | Mercado Pago Subscriptions |
| --- | --- |
| Checkout Session / URL | Preapproval pendente / `init_point` |
| Price ID | Oferta e recorrência definidas no servidor; `preapproval_plan_id` não é usado neste modelo |
| `sub_*` | `preapproval_id`; IDs históricos não são convertidos |
| `cus_*` | Não há migração automática de Customer/cartão; associação local e comprador autorizado no MP |
| `current_period_end` | Período calculado a partir da fatura/ciclo pago confirmado |
| `invoice.paid` / `invoice.payment_failed` | `subscription_authorized_payment` + consulta de pagamento |
| `customer.subscription.updated/deleted` | `subscription_preapproval` + consulta atual de contrato |
| `Stripe-Signature` | `x-signature` + `x-request-id` + query `data.id`, HMAC oficial |
| Billing Portal | Gestão autenticada local com consulta/pausa/reativação/cancelamento |
| Deduplicação `event_id` | Entrega durável + chave única + reconciliação transacional e sem soma de vigência |

## Novos arquivos desta etapa

Em `Backend/src/main/java/br/com/gestpro/plano/mercadopago/`:
`MercadoPagoWebhookController`, `MercadoPagoWebhookDelivery`, `MercadoPagoWebhookDeliveryRepository`, `MercadoPagoWebhookInbox`, `MercadoPagoWebhookProcessor`, `MercadoPagoWebhookWorker`.

Além deles: migração `Backend/src/main/resources/db/migration/V19__mercado_pago_webhook_deliveries.sql`, teste `MercadoPagoWebhookIntegrationTest.java` e documentação `webhooks-mercado-pago.md`. O verificador HMAC, o serviço, a entidade MP e seus testes foram adaptados.

## Riscos e ordem segura de conclusão

1. Inventariar no ambiente real contratos Stripe ainda ativos e períodos pagos. O repositório não revela cobranças em andamento. Evitar renovação simultânea nos dois provedores.
2. Validar MySQL, histórico Flyway e checksum da V18 já alterada na etapa anterior; aplicar V19 em homologação. Nunca reparar checksums ou apagar dados automaticamente.
3. Homologar callback MP acessível, assinatura real, aprovação, recusa, renovação, cancelamento, duplicatas e recuperação. Testes locais não demonstram entrega externa.
4. Planejar a transição de clientes: uma assinatura Stripe não vira preapproval MP por renomear ID; o cliente precisa autorizar o novo contrato. Preservar direito de acesso já pago e parar a renovação antiga no momento acordado.
5. Separar/rotear corretamente recepção de eventos legados enquanto houver assinaturas Stripe. Hoje os dois controllers usam `/api/payments/webhook`, escolhidos por propriedade; selecionar MP desativa a recepção Stripe.
6. Mover DTO, enum, entidade e repository compartilhados para pacotes neutros, atualizar imports e testes sem perder dados.
7. Corrigir inconsistências de acesso remanescentes: `ConfiguracaoServiceImpl` calcula dias pagos por duração fixa (zero nos planos pagos), ao contrário de `VerificarPlanoOperation`; comentário antigo menciona sete dias, mas a regra efetiva é trinta. Uniformizar timezone e revisar como contas sem novo evento são bloqueadas após vencer, pois o filtro usa `statusAcesso` e a verificação de vencimento ocorre em outras operações.
8. Somente após nenhum contrato Stripe ativo: retirar controller/service/config/price mapper e SDK Stripe, propriedades/testes exclusivamente Stripe e segredos legados. Arquivar histórico; eliminar colunas Stripe apenas por migração posterior revisada.

Ainda necessários na conclusão geral: domínio neutro e eventual adaptador temporário para contratos Stripe vivos. Não foram criados aqui porque a etapa autorizada de implementação foi a de webhooks MP. Não foi feito deploy nem acionada API de cobrança real.

Fontes oficiais: [Webhooks](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks), [contrato de assinatura](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-preapproval/get), [faturas recorrentes](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/authorized-payment-search/get).
