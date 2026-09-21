# Mercado Pago: assinaturas no Brasil

Integração `without-plan-pending`, recebimento integral na conta do vendedor e SDK oficial Java `com.mercadopago:sdk-java:3.7.0`. O backend usa o transporte oficial do SDK, com repetição automática desativada, para preservar os contratos JSON existentes. A criação usa `POST /preapproval`, status `pending`, sem token de cartão e sem plano associado do Mercado Pago. O navegador abre somente o `init_point` HTTPS validado.

Os planos do Gevyro são definidos no servidor: Básico R$ 79,90, Pro R$ 149,90 e Premium R$ 299,90, todos mensais em BRL. O navegador envia apenas o identificador do plano. O e-mail vem do usuário autenticado.

## Configuração

Use [mercado-pago.env.example](mercado-pago.env.example) ou `Backend/.env.example`. Exporte as variáveis no processo Java ou configure-as no gerenciador de segredos do deploy; Spring não importa `.env` automaticamente.

| Variável | Uso |
| --- | --- |
| `MERCADO_PAGO_ACCESS_TOKEN` | Token privado da aplicação/vendedor. |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Segredo de assinatura das notificações. |
| `APP_FRONTEND_URL` | Origem pública HTTPS do frontend em produção. |

O profile dev usa `http://localhost:3000`; o profile prod usa `APP_FRONTEND_URL`. A configuração rejeita origens públicas sem HTTPS, caminhos, parâmetros e credenciais na URL. Nenhuma chave pública é necessária para este fluxo hospedado. `billing.provider=mercadopago` já está configurado em dev/prod. O código não utiliza `MERCADO_PAGO_ENABLED` nem `MERCADO_PAGO_COLLECTOR_ID`. Sem token, a contratação é recusada antes da reserva no banco.

## Fluxo

Os botões de entrada convergem para `/pagamento?plano=PRO`. Apenas o botão final de `/pagamento` inicia a contratação. A tela mostra total, processamento e erros. `/payment/sucesso` consulta o backend e só confirma acesso quando houver pagamento aprovado; autorizar a renovação não prova pagamento. O retorno consulta até 12 vezes, com 5 segundos entre respostas pendentes.

`/pagamento/assinatura` permite consultar, continuar uma contratação pendente, pausar, reativar e cancelar a renovação. A gestão continua acessível com plano vencido, exigindo autenticação e propriedade da assinatura.

| Rota | Resultado |
| --- | --- |
| `POST /api/payments/create-checkout-session` | Recebe `{ "plano": "PRO" }`; retorna `{ "url": "..." }`. |
| `GET /api/payments/session-info?preapprovalId=...` | Consulta e sincroniza o contrato da conta. |
| `GET /api/payments/subscription` | Retorna `id`, `status`, `paymentStatus`, `plano`, `paid`, `paidUntil` quando disponíveis. |
| `POST /api/payments/cancel` | Cancela a renovação, preservando o período pago confirmado. |
| `GET /api/subscriptions/{id}` | Consulta o contrato pertencente ao usuário. |
| `POST /api/subscriptions/{id}/lifecycle?action=pause` | Aceita somente `pause`, `reactivate` ou `cancel`. |
| `POST /api/payments/webhook` | Valida HMAC, grava uma entrega durável e responde 200; o worker consulta a API. |

O SDK não fornece uma garantia de idempotência contratual para `/preapproval`; não dependemos de `X-Idempotency-Key`. Uma transação bloqueia o usuário, grava uma referência UUID e confirma a reserva antes do POST externo. `preapproval_id` nulo representa uma tentativa ainda não reconciliada. Apenas o processo que criou essa reserva pode enviar o POST. Timeout, reinício ou clique concorrente não repetem a criação. A recuperação busca a referência e verifica ID, valor, moeda e recorrência antes de vincular o contrato.

Quando não é possível determinar o resultado anterior, o estado é `processing`. Consultar o status tenta recuperar novamente, sem criar outra assinatura. Não há liberação automática de reserva incerta: a operação precisa investigar no provedor antes de intervir. A migração também tenta recuperar contratos da antiga referência determinística antes da primeira reserva nova.

## Banco

A V18 agora usa `BIGINT AUTO_INCREMENT` e chave estrangeira explícita para MySQL. A sintaxe anterior era `BIGSERIAL`. Foi verificada com H2 em modo MySQL; não houve acesso a banco de produção. Se V18 já constar como aplicada em alguma instalação, examine seu checksum e schema antes do deploy. Não execute `flyway repair` automaticamente. Esta alteração não foi implantada.

A V19 adiciona os estados da assinatura/cobrança e a tabela `mercado_pago_webhook_deliveries`. O worker consulta as entregas pendentes a cada 5 segundos. A atualização da assinatura e a conclusão da entrega são atômicas; falhas e reinícios deixam a entrega disponível para retomada. Não há varredura periódica de todos os contratos: o status também pode ser reconciliado por consulta autenticada. Veja [webhooks-mercado-pago.md](webhooks-mercado-pago.md) para operação, deduplicação e novas tentativas.

## Validação

```sh
# Na raiz do repositório
mvn -f Backend/pom.xml -Dtest=MercadoPagoServiceTest,MercadoPagoCheckoutPersistenceTest,MercadoPagoMigrationTest,MercadoPagoWebhookSignatureTest,MercadoPagoWebhookIntegrationTest,PlanAccessFilterSubscriptionTest test
npm --prefix FrontEnd run typecheck
```

Os testes usam respostas simuladas e banco H2, sem criar cobranças. Cobrem concorrência, timeout, recuperação após reinício, valor incorreto, acesso entre contas, aprovação, reembolso e preservação do período pago.

O validador `validate-subscriptions-integration.mjs` da skill 4.3.2 não lê `.java` e exige padrões de JavaScript para o servidor; suas falhas sobre payload/rotas não substituem os testes Java. Essa limitação não deve ser contornada com arquivos fictícios.

## Homologação

1. Configurar o callback público e validar a entrega real conforme [webhooks-mercado-pago.md](webhooks-mercado-pago.md).
2. `/mp-integrate test-setup`: preparar as contas e credenciais de teste.
3. Validar contratação, retorno, renovação, pausa, reativação, cancelamento e notificações com o provedor.
4. `/mp-review`: revisão obrigatória antes da produção.

Nenhuma assinatura real foi criada pelos testes automatizados. Configure o webhook público HTTPS em `/api/payments/webhook` e os eventos de assinatura/cobrança. O receptor atual trata `subscription_preapproval`, `subscription_authorized_payment` e `payment`.

Referências: [Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/overview), [SDK Java](https://repo.maven.apache.org/maven2/com/mercadopago/sdk-java/3.7.0/).
