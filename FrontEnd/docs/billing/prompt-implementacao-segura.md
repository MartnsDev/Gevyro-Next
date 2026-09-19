# Prompt: concluir a integração segura com Mercado Pago

Execute a revisão e implementação no Gevyro (Next.js/React e Spring Boot/Java 17), preservando as alterações existentes. Não há assinaturas Stripe em produção. Mantenha os planos e preços atuais e o checkout hospedado de assinaturas mensais no Mercado Pago Brasil.

Consulte a documentação oficial atual para contratos de assinatura, pagamentos, notificações e testes. Audite a implementação existente antes de declarar que está pronta.

Requisitos:
1. Manter credenciais exclusivamente no backend e fora de logs, respostas públicas e arquivos versionados. Preparar exemplo sem valores reais e validação de configuração. Desabilitar cobranças até a configuração explícita do ambiente.
2. Validar URLs HTTPS, domínio do checkout, identidade do vendedor, IDs, moeda, valores, periodicidade e o estado real do pagamento. Autorização de assinatura não equivale a pagamento aprovado.
3. Exigir autenticação e CSRF nas ações do usuário; rejeitar assinatura de outra conta. Limitar consultas e mutações com o controle distribuído existente. Não armazenar cartões.
4. Impedir cobranças duplicadas em cliques concorrentes e falhas de rede. Não presumir suporte a idempotência da API sem documentação. Persistir a intenção de contratação antes da chamada remota, recuperar resultados ambíguos e bloquear novas tentativas inseguras.
5. Validar HMAC dos webhooks, recusar entradas malformadas e registrar somente identificadores mínimos. Processar de forma idempotente, com entrega durável, retentativas e reconciliação de notificações perdidas. Não depender do retorno do navegador para liberar o acesso.
6. Preservar período já pago no cancelamento e bloquear vencimento/reembolso conforme estado confirmado. Não inventar rateio ou reembolso automático. Distinguir cancelamento confirmado de falha posterior ao consultar o pagamento.
7. Tratar pendência, falha, cancelamento e atualização das telas de forma clara e acessível; limitar o polling e os redirecionamentos externos.
8. Adicionar migrações novas sem modificar V12 ou outras já existentes. Validar código e migrações localmente sem conectar a bancos produtivos ou fazer cobranças.
9. Cobrir falhas e fronteiras de segurança com testes. Corrigir os erros locais de TypeScript preservando a intenção das alterações existentes.
10. Documentar configuração do painel Mercado Pago, variáveis necessárias, homologação, operação e limites. Registrar evidências dos testes e separar claramente o que depende de credenciais/infraestrutura externa.

Execute todo trabalho local independente de credenciais. Não peça segredos no chat; use o gerenciador de segredos do backend. Não publique, não dispare cobranças e não altere banco remoto. Ao terminar, informe o resultado, testes e pendências concretas.
