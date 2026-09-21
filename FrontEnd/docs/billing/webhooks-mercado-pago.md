# Webhooks Mercado Pago Subscriptions

Implementação local: Spring Boot, SDK oficial Java 3.7.0 e MySQL. Não houve deploy, alteração de conta externa ou cobrança real.

## Contrato HTTP e autenticidade

`POST /api/payments/webhook?data.id=<recurso>` com `Content-Type: application/json`, `x-request-id`, `x-signature` e corpo contendo `type` e `data.id`. O callback público deve usar HTTPS.

A assinatura é validada pelo `WebhookSignatureValidator` oficial, com HMAC-SHA256 e comparação em tempo constante. O ID vem da query e é normalizado para minúsculas; o ID no corpo precisa coincidir. Cabeçalhos/query duplicados, campos `ts`/`v1` duplicados, assinatura inválida e IDs malformados são rejeitados. O corpo só é lido depois da autenticação, limitado a 16 KiB, com rejeição de chaves JSON duplicadas e conteúdo extra.

O manifesto é `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`. Estados, valores e IDs de usuário no corpo não são usados para alterar acesso. Não há janela curta de expiração local: entregas legítimas atrasadas continuam verificáveis; replays exatos são deduplicados e a API é a fonte de estado atual.

| Resposta | Significado |
| --- | --- |
| 200 | Entrega suportada persistida, entrega duplicada já persistida, ou tópico autenticado não utilizado. |
| 400 | Corpo inválido ou ID divergente. |
| 401 | Assinatura ausente/inválida ou manifesto ambíguo. |
| 413 | Corpo maior que 16 KiB. |
| 415 | Content-Type incompatível. |
| 503 | Persistência indisponível; o provedor deve reenviar. |

A rota permanece pública e isenta de CSRF somente para a chamada do provedor. Essa exceção não alcança checkout, cancelamento ou gestão da assinatura, que continuam autenticados.

## Eventos e confirmação na API

| Tópico | Consultas |
| --- | --- |
| `subscription_preapproval` | `GET /preapproval/{id}` e faturas/pagamentos do contrato. |
| `subscription_authorized_payment` | `GET /authorized_payments/{id}`, contrato e pagamentos confirmados. |
| `payment` | `GET /v1/payments/{id}`, busca de faturas por `payment_id` e contrato associado. |

`subscription_preapproval_plan` não é necessário: o fluxo atual é sem plano associado do Mercado Pago. Planos Básico/Pro/Premium são ofertas do Gevyro.

Se a notificação chegar antes da gravação do ID externo do checkout, o vínculo é recuperado pela referência persistida pelo servidor. Referências desconhecidas não criam usuários ou assinaturas. IDs retornados, referência, vendedor, valor, moeda, recorrência e associação entre fatura e contrato são conferidos. Fatura ainda não indexada na busca gera nova tentativa, sem apagar acesso pago.

## Persistência e idempotência

`mercado_pago_webhook_deliveries` guarda somente hash da entrega, tópico, ID do recurso, estado, tentativas e horários. Não guarda payload, token, assinatura HMAC, segredo ou dados de cartão.

A chave única deriva de tópico + recurso + request ID + timestamp assinado. Duplicar a mesma entrega não duplica a linha. Uma nova notificação do mesmo recurso pode trazer uma mudança legítima e recebe seu próprio processamento. Também nesse caso, o período de acesso é recalculado a partir da cobrança confirmada, nunca somado à data atual.

O worker usa um scheduler dedicado, iniciado/parado com o Spring, para não bloquear jobs fiscais durante chamadas ao provedor. Busca até 10 entregas por rodada, com intervalo configurável de 5 segundos. Um bloqueio transacional por entrega e por usuário serializa concorrência; atualização de acesso e `DONE` são confirmados na mesma transação. Uma falha reverte ambas. Não existe estado `PROCESSING` persistido nem lease que possa ficar preso após crash: o banco libera o bloqueio e mantém `PENDING`.

São feitas até 12 tentativas, com espera crescente de 15 segundos até uma hora. Depois, a entrega fica em `FAILED` para investigação. Os logs exibem apenas ID interno e estado, sem erro bruto do provedor. Entregas não são apagadas automaticamente.

Propriedades opcionais: `mercadopago.webhooks.worker-enabled` (padrão `true`) e `mercadopago.webhooks.poll-delay-ms` (padrão `5000`). O worker só é ativado com `billing.provider=mercadopago`.

## Estados

`mercado_pago_subscriptions.provider_status` guarda `pending`, `authorized`, `paused` ou `cancelled`. `payment_status` guarda o estado confirmado da cobrança mais recente já vencida para cobrança: `approved`, `pending`, `rejected`, `in_process`, `in_mediation`, `authorized`, `cancelled`, `refunded`, `charged_back` ou `none`.

- Aprovação válida: atualiza o período pago do ciclo e ativa o acesso.
- Pendência/recusa: não concede dias. Preserva período anterior ainda pago e período experimental vigente.
- Pausa/cancelamento: interrompem a renovação; dias já pagos permanecem.
- Reativação: registra `authorized`; acesso exige pagamento confirmado ou período já pago.
- Estorno/contestação: deixa de considerar o pagamento afetado no cálculo do período.
- Fatura futura: não ativa acesso antes do início do ciclo.
- Notificação fora de ordem: lê o estado atual, sem reaplicar o estado do payload antigo.

A entidade compartilhada `Assinatura` mantém `ATIVO` enquanto o acesso estiver pago; estado da renovação permanece separado. Sem período pago, o registro gerenciado pode ficar `PENDENTE`, `INADIMPLENTE`, `PAUSADO`, `CANCELADO` ou `VENCIDO`.

## Operação e publicação posterior

1. Revisar a compatibilidade/checksum da V18 existente e aplicar V19 pelo Flyway no processo normal de publicação. Não foi executado `repair` nem acessado banco produtivo.
2. Configurar `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET` e o callback HTTPS na aplicação correta do Mercado Pago, conforme o mecanismo de notificações disponível para Subscriptions. Não inserir credenciais no frontend.
3. Habilitar os três tópicos acima e confirmar uma entrega assinada real com contas de teste. A documentação do provedor contém orientações específicas para configuração em Assinaturas; confirmar a modalidade da aplicação antes de registrar a URL.
4. Monitorar pendências antigas e `FAILED`. Em manutenção controlada, somente após corrigir a causa e revisar o ID, uma entrega pode ser recolocada em `PENDING`, com tentativas zeradas e `next_attempt_at` atualizado. Não há endpoint público de replay.

```sql
SELECT status, COUNT(*) FROM mercado_pago_webhook_deliveries GROUP BY status;
SELECT id, topic, resource_id, attempts, received_at, next_attempt_at, failure_code
FROM mercado_pago_webhook_deliveries WHERE status <> 'DONE' ORDER BY received_at;
```

A integração não transfere assinaturas/cartões Stripe automaticamente. Veja o [inventário da migração](migracao-stripe-mercado-pago.md).

## Testes e limites

Os testes usam HTTP simulado, o validador HMAC real, respostas controladas da API e banco H2. Cobrem autenticação, corpo adulterado, deduplicação, concorrência, retry, falha de banco, eventos antes do checkout, renovação, pausa, cancelamento, estorno, vendedor incorreto e faturas futuras. A migração SQL é testada em modo MySQL do H2; não equivale a executar MySQL de produção.

A entrega externa pelo Mercado Pago e a homologação com contas de teste dependem de callback acessível e credenciais; não foram executadas nesta etapa. Rodar `/mp-review` antes de produção.

Fontes: [Webhooks oficiais](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks), [consulta de contrato](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-preapproval/get), [busca de faturas](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/authorized-payment-search/get).
