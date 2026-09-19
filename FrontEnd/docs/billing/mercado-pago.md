# Mercado Pago: configuração e operação

A integração usa Assinaturas (`/preapproval`, status inicial `pending`) com checkout hospedado no Mercado Pago Brasil. Os planos são mensais em BRL: Básico 79,90, Pro 149,90 e Premium 299,90. O backend define o valor e identifica o usuário autenticado. Nenhum dado completo de cartão passa pelo Gevyro.

O escopo executado está em [prompt-implementacao-segura.md](prompt-implementacao-segura.md).

## Variáveis do backend

Use o gerenciador de segredos do deploy. O modelo [mercado-pago.env.example](mercado-pago.env.example) contém somente nomes e valores vazios; ele não é carregado automaticamente pelo Spring.

| Variável | Uso |
| --- | --- |
| `MERCADO_PAGO_ENABLED` | `false` por padrão. Mudar para `true` somente no ambiente que está configurando e homologando. |
| `MERCADO_PAGO_ACCESS_TOKEN` | Token privado do vendedor/aplicação que receberá as assinaturas. |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Segredo gerado na configuração Webhooks da mesma integração. |
| `MERCADO_PAGO_COLLECTOR_ID` | ID numérico do vendedor, conferido com o token por `GET /users/me`. |
| `APP_FRONTEND_URL` | Origem HTTPS do frontend, por exemplo `https://gevyro.com.br`, sem caminho ou parâmetros. |
| `CORS_ALLOWED_ORIGINS` | Origens exatas autorizadas do frontend em produção. Manter a lista restrita aos domínios efetivos. |

Neste checkout hospedado não é necessário colocar Public Key, Access Token ou Client Secret no frontend. Nunca usar `NEXT_PUBLIC_` para segredos, enviar tokens no chat ou versionar o arquivo preenchido. Para trocar de vendedor ou ambiente, use banco e configurações separados; o backend verifica o `collector_id` da assinatura e do pagamento.

Com a integração desabilitada, o restante do sistema inicia e a cobrança retorna indisponibilidade. Com ela habilitada, a inicialização rejeita credenciais incompletas ou origem de retorno insegura. Antes de criar uma contratação, o backend confere se o token corresponde ao vendedor brasileiro esperado.

O profile dev aceita `APP_FRONTEND_URL`; para testar o checkout hospedado use uma origem HTTPS acessível e ajuste as origens CORS exatas do ambiente. Nunca amplie CORS para `*` para resolver testes. Configure banco e Redis normalmente: se o limitador distribuído estiver indisponível, as ações de cobrança são recusadas.

## Painel Mercado Pago

1. Acesse a aplicação correta em Suas integrações e obtenha o Access Token do vendedor.
2. Configure Webhooks com a URL pública HTTPS do backend: `https://api.gevyro.com.br/api/payments/webhook` (ajuste se o domínio efetivo for outro).
3. Habilite `subscription_preapproval`, `subscription_authorized_payment` e `payment`.
4. Copie o segredo gerado para `MERCADO_PAGO_WEBHOOK_SECRET`. O webhook exige `data.id` na URL, `x-request-id`, `x-signature` e o mesmo ID no corpo JSON.
5. Faça a simulação de entrega assinada e, depois, uma contratação completa com contas de teste. Uma notificação sem assinatura não é aceita, inclusive durante testes.

Para **Assinaturas**, a orientação específica do Mercado Pago utiliza credenciais de produção da **conta de teste do vendedor** e comprador de teste. Isso não significa usar a conta real para cobranças de homologação. Não inferir o ambiente apenas pelo prefixo do token; mantenha vendedor, comprador, aplicação e banco de teste separados. Veja a [orientação oficial de testes de Assinaturas](https://www.mercadopago.com.br/developers/pt/news/2023/11/16/Questions-on-how-to-test-your-integration--).

## Verificação sem cobrar

Execute [verificar-mercado-pago.py](../../scripts/verificar-mercado-pago.py) em um shell que já tenha as variáveis seguras do **backend**:

```sh
python3 scripts/verificar-mercado-pago.py
python3 scripts/verificar-mercado-pago.py --remote
```

O primeiro comando verifica a configuração local. O segundo faz somente `GET /users/me`, sem criar assinatura ou pagamento. Não imprime tokens nem o corpo de erro do provedor. Não valida o segredo do webhook: isso exige uma entrega assinada real do painel. Sem credenciais, o script informa somente os nomes pendentes.

## Banco e publicação

As migrações **V18 e V19** usam MySQL 8/InnoDB. A V18, criada nesta integração e ainda não publicada por esta tarefa, foi corrigida antes da homologação para usar `AUTO_INCREMENT` e uma chave estrangeira explícita. A V19 adiciona recuperação de contratação, agendamento de reconciliação e a caixa de entrada de webhooks.

Não editar V12/V17, não desativar a validação do Flyway, não usar `ddl-auto=update` em produção e não executar `repair` amplo. O ambiente de produção já configura Flyway e `ddl-auto=validate`. O banco real não foi acessado nesta tarefa. Se alguém já tentou aplicar a versão inicial da V18, inspecione `flyway_schema_history` e a existência da tabela antes de publicar; não apague marcadores ou tabelas automaticamente.

Publique backend e frontend compatíveis. Componentes Stripe continuam no código para compatibilidade de testes legados, mas ficam desativados em dev/prod. Não habilite `billing.provider=stripe` com este frontend.

## Fluxos e contratos

Todas as rotas abaixo, exceto o webhook, exigem autenticação, CSRF e controle distribuído por conta. As consultas que sincronizam o banco usam POST. As respostas mantêm os cabeçalhos de prevenção de cache configurados pelo Spring Security.

| Rota | Resultado |
| --- | --- |
| `POST /api/payments/create-checkout-session` | Recebe `{ "plano": "PRO" }` e retorna `{ "url": "..." }`. |
| `POST /api/payments/session-info?preapprovalId=...` | Sincroniza a assinatura da conta. O ID é opcional; IDs de outra conta são rejeitados. |
| `POST /api/payments/subscription` | Retorna `status`, `plano`, `paid` e `paidUntil`. |
| `POST /api/payments/cancel` | Confirma o cancelamento da renovação no provedor; mantém o período pago. |
| `POST /api/payments/webhook` | Verifica assinatura e grava entrega durável antes de responder 200. |

Limites: 5 mutações e 20 consultas por minuto por conta, independentemente do IP. O frontend usa o cliente autenticado existente para obter e enviar CSRF. O retorno do checkout consulta no máximo 12 vezes, com intervalo de 5 segundos entre respostas pendentes.

O acesso exige contrato do vendedor esperado, moeda BRL, periodicidade mensal, valor do plano, fatura vinculada ao contrato e pagamento aprovado do mesmo vendedor, sem reembolso. Contrato autorizado não equivale a cobrança aprovada. Datas futuras não liberam acesso e notificações repetidas não somam dias. O período é calculado pela data de débito da fatura; o filtro de acesso bloqueia vencimentos.

O cancelamento interrompe a renovação e preserva o acesso já pago. Uma falha posterior ao consultar faturas não transforma um cancelamento já confirmado em aparente falha. Mudança de plano pendente exige cancelamento explícito. Outra contratação fica disponível após o vencimento do período pago. Rateio, upgrade imediato e reembolso automático não fazem parte deste fluxo; o sistema reconhece reembolsos confirmados pelo provedor.

## Falhas de rede e contratação ambígua

A intenção é persistida e confirmada no banco antes do POST externo, com referência aleatória única e estado `UNCERTAIN`. Apenas o processo que reservou essa intenção envia o POST. Cliques concorrentes, reinício do servidor ou timeout não repetem a criação; a recuperação consulta `/preapproval/search` pela mesma referência. Um contrato recuperado é validado antes de ser vinculado ao usuário.

Se o provedor não retornar contrato para uma tentativa ambígua, o sistema permanece em `processing`. Isso evita criar outra cobrança quando não é possível provar que a primeira falhou. A reconciliação volta a consultar periodicamente. A operação deve verificar a referência no provedor e confirmar a ausência de requisição em andamento antes de liberar uma nova tentativa. Somente após essa verificação é seguro alterar a intenção sem `preapproval_id` de `UNCERTAIN` para `RESERVED` em uma transação restrita ao registro auditado. Não há endpoint público para forçar esse procedimento e nenhuma cobrança é repetida automaticamente.

## Webhooks, recuperação e monitoramento

- HMAC SHA256 é comparado em tempo constante. IDs/cabeçalhos malformados e campos de assinatura duplicados são rejeitados. A janela local aceita até 24 horas de atraso e 5 minutos de adiantamento; sincronize o relógio do servidor.
- A assinatura é verificada antes da leitura do corpo; limite de 16 KiB, incluindo requisições sem Content-Length. O ID do corpo deve coincidir com o da URL.
- A caixa de entrada guarda somente tipo, ID do recurso, hash da entrega, estados e horários. Não armazena payload bruto, segredo, token ou dados de cartão.
- O worker consulta a fila a cada 5 segundos, usa uma reserva temporária para concorrência e tenta até 12 vezes, com espera crescente limitada a 1 hora. Falhas ficam em `FAILED` e geram um log com o ID interno, sem segredos.
- A reconciliação busca até 10 assinaturas vencidas para conferência por minuto, agendando a próxima conferência normalmente para 15 minutos depois. Sob fila grande ou indisponibilidade, o intervalo efetivo pode ser maior. Ela cobre notificações perdidas e reavalia pagamentos/reembolsos sem depender do navegador.
- Entregas concluídas são retidas por 30 dias. Pendências e falhas não são apagadas pelo expurgo.

Consultas operacionais somente leitura:

```sql
SELECT status, COUNT(*) FROM mercado_pago_webhook_inbox GROUP BY status;
SELECT id, topic, attempts, received_at, next_attempt_at
FROM mercado_pago_webhook_inbox WHERE status = 'FAILED' ORDER BY id;
SELECT id, creation_state, creation_attempted_at, next_reconcile_at
FROM mercado_pago_subscriptions WHERE preapproval_id IS NULL;
```

Depois de corrigir a causa de uma falha de entrega, a operação pode reabrir somente os IDs revisados para `PENDING`, zerar `attempts`, limpar `lease_until` e definir `next_attempt_at` para o instante atual. O replay consulta o estado atual do Mercado Pago; não soma mensalidades. Configure alertas para aumento de `FAILED`, tentativas `UNCERTAIN` antigas e atraso da reconciliação. Não exponha endpoints de gestão ou banco publicamente.

## Homologação pendente das credenciais

Validar com o provedor: primeira contratação, retorno sem ID, pendência, aprovação, renovação, cancelamento, reembolso, assinatura de outra conta, notificações duplicadas e recuperação após timeout. Conferir o status de acesso após cada etapa. Testes locais não substituem essa validação.

Fontes oficiais adicionais:
- [Assinatura com pagamento pendente](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/pending-payments)
- [Dados do contrato e vendedor](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/get-preapproval/get)
- [Faturas da assinatura](https://www.mercadopago.com.br/developers/pt/reference/online-payments/subscriptions/authorized-payment-search/get)
- [Gerenciamento e cancelamento](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/subscription-management)
- [Notificações](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications)
