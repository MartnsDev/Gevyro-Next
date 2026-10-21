# Deploy do Gevyro Next

O projeto usa Next.js com servidor e Supabase remoto. Não funciona como export estático/GitHub Pages. O runtime preparado é Node 22; `Backend` e `Backup` Java/MySQL não entram na imagem. A hospedagem escolhida é Vercel. O projeto independente foi criado com endereço atribuído https://gevyro-next.vercel.app, ainda sem aplicação publicada. Não há publicação automática neste pacote.

## Ambiente

Configure no provedor, durante build e execução:

```dotenv
NEXT_PUBLIC_APP_URL=https://SEU-DOMINIO-NEXT
NEXT_PUBLIC_SUPABASE_URL=https://zevgzuhtemnjrqeolmit.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=CHAVE_PUBLICAVEL_DO_PROJETO
```

Use a mesma origem exata em build/runtime. Nunca inclua chave service_role, segredo de pagamento ou senha em variável NEXT_PUBLIC. As credenciais do ambiente de desenvolvimento não entram no Docker. Antes de construir, carregue o ambiente no terminal e execute `npm run deploy:check`; o comando não imprime os valores. A validação recusa domínio original, origem sem HTTPS, projeto Supabase errado e variáveis públicas de segredo. Não cria recursos pagos.

## Vercel (destino escolhido)

Importar **MartnsDev/Gevyro-Next**, com Root Directory **FrontEnd**, framework Next.js, Node 22 e produção na branch main. `FrontEnd/vercel.json` define instalação por `npm ci` e build por `npm run build:deploy`; esse build recusa ambiente incompleto antes de compilar. O validador está dentro de FrontEnd para funcionar sem liberar acesso a arquivos fora da raiz do projeto. Não definir Output Directory nem comando Start manualmente na Vercel.

Cadastrar as três variáveis acima em Production e, com origem própria, em Preview. Não copiar NEXT_PUBLIC_APP_URL de produção para previews com outro host: o proxy recusa esse host. Para testar previews autenticados, usar um endereço de staging estável e callbacks exatos no Supabase. Desativar exposição pública de fonte/logs de build e habilitar Deployment Protection nos previews. Deixar a proteção de produção ativa durante a validação privada e revisar antes de liberar clientes.

No Firewall da Vercel, preparar regra por IP para POST em `/api/auth/` (ponto inicial: 10 requisições por minuto), mantendo o rate limit do Supabase para OTP/e-mail. Revisar métricas e ajustar sem bloquear tráfego legítimo. A regra depende de acesso à conta e não foi publicada. Não ativar upgrade ou cobrança automaticamente. Consultar [configuração do projeto](https://vercel.com/docs/project-configuration/project-settings) e [rate limiting](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting).

A Vercel limita payloads de Functions a **4,5 MB**, enquanto o upload atual permite foto de até 5 MB no aplicativo. Arquivos próximos ao limite podem ser recusados pela plataforma antes de chegar à rota; o envio direto assinado ao Storage precisa ser implementado e validado para preservar integralmente esse limite. Não declarar paridade de upload de 5 MB na Vercel. [Limites de Functions](https://vercel.com/docs/functions/limitations).

O Hobby é restrito a uso pessoal não comercial. A utilização comercial do Gevyro precisa de plano compatível; não foi contratado plano nem prometido custo zero na Vercel. [Regras Hobby](https://vercel.com/docs/plans/hobby).

A sessão Vercel existente foi utilizada com a CLI 65.0.0. Projeto criado: `gevyro-next` (`prj_dAWA5pH9axemrUotDLmonwV5JgPH`), separado do projeto original. Foram confirmados Root Directory FrontEnd, framework Next.js, Node 22, proteção de forks e acesso a arquivos fora da raiz desativado. A proteção de acesso padrão `all_except_custom_domains` foi preservada. NEXT_PUBLIC_APP_URL foi cadastrada em Production com https://gevyro-next.vercel.app; URL/chave publicável Supabase em Production/Preview, com a chave armazenada criptografada. A pasta FrontEnd foi vinculada pelo arquivo local ignorado .vercel/project.json. WAF, callbacks hospedados e eventual domínio próprio continuam pendentes. Não houve deploy.

## Docker com HTTPS

Requer Docker Engine e plugin Docker Compose v2 instalados no host.

Na raiz, com as três variáveis exportadas:

```sh
npm run deploy:check
docker compose -f deploy/compose.yml build
docker compose -f deploy/compose.yml up -d
docker compose -f deploy/compose.yml ps
```

O container roda como usuário node, sem capabilities, sem escalada de privilégios, com filesystem somente leitura e volumes temporários limitados. A porta 3000 escuta somente em loopback no host. A imagem tem health check e os logs têm rotação. O Dockerfile deve ser construído a partir da raiz, com `.dockerignore` ativo. Não copiar arquivos .env ou diretórios pessoais para a imagem.

Instale Caddy no host, configure DNS A/AAAA para esse servidor, exporte `GEVYRO_DOMAIN` com o domínio independente e use `deploy/Caddyfile`. O Caddy termina TLS automaticamente e limita o corpo a 6 MB; permitir externamente apenas SSH administrativo e portas 80/443. Não expor Docker socket, PostgreSQL local ou porta 3000. Configure limitação de requisições no WAF/provedor para /api/auth e uploads; limites em memória do Node não são compartilhados entre instâncias. SMTP/captcha exigem conta e segredos próprios e não foram inventados.

## Supabase hospedado

As oito migrations foram aplicadas; conferir com `npm run supabase:status`. Não executar reset ou seed de produção. Configurar Site URL e redirects exatos: `/api/auth/confirm`, `/api/auth/callback`, `/esqueceu-senha` na origem de produção. Usar os templates versionados em supabase/templates; recuperação precisa de OTP de seis dígitos. Definir senha mínima 8 com letras/números, confirmação de e-mail, dupla confirmação de troca de e-mail, rotação de refresh token e validade do OTP 900 s. O arquivo TOML local contém esses requisitos, mas não comprova aplicação hospedada.

A tentativa de aplicar uma configuração mínima hospedada foi bloqueada pela revisão automática: o diff também continha diferenças remotas de MFA/domínio/pool. O comando não foi executado. Preservar MFA habilitado e as configurações existentes ao revisar a alteração remota. Não aplicar o TOML local completo sem revisão. Google permanece dependente de client ID/secret e SMTP depende de credenciais do provedor. O estado remoto consultado tinha OTP de oito dígitos e senha mínima 6: estes ajustes continuam necessários antes de liberar recuperação/cadastro ao público.

## Verificação e retorno

```sh
npm test
npm run test:postgres
npm --prefix FrontEnd audit --omit=dev
npm run build
npm run deploy:smoke -- https://SEU-DOMINIO-NEXT
```

O smoke test confirma health, bloqueio de acesso anônimo e origem externa, ausência de cache e CSP/nonce no HTML. Também validar manualmente cadastro, e-mail, login, logout, recuperação, OAuth, leitor de câmera e operação financeira com conta autorizada. Não criar dados fictícios em produção para substituir essa validação.

Guardar o identificador da imagem/release anterior para rollback da aplicação; não desfazer migrations com exclusão de tabelas. Preparar export criptografado do PostgreSQL e Storage fora do provedor e testar restauração em ambiente isolado antes de atender clientes reais; não há backup externo agendado configurado. O agendamento de fechamento de caixa continua pendente. A migração funcional ainda tem módulos pendentes em MIGRATION_STATUS.md: segurança de infraestrutura não torna esses módulos completos.

Referências: [standalone Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/output), [CSP com nonce](https://nextjs.org/docs/app/guides/content-security-policy), [configuração Supabase](https://supabase.com/docs/guides/local-development/cli/config).
