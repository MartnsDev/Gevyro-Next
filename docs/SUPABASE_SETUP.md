# Supabase do Gevyro Next

Projeto independente: `zevgzuhtemnjrqeolmit`.
URL: https://zevgzuhtemnjrqeolmit.supabase.co

Configuração inicial criada com a CLI oficial 2.121.0. `supabase/config.toml` configura o ambiente local, com identidade `gevyro-next`, URL de autenticação local na porta 3000 e seeds desativados porque ainda não há seed definido. Não altera automaticamente as configurações hospedadas.

As variáveis públicas fornecidas foram configuradas em `FrontEnd/.env.local`, ignorado pelo Git. A chave publicável não substitui login da CLI, senha PostgreSQL ou chave secreta de servidor. Auth, perfil, empresas, catálogo, clientes/fornecedores, caixa e venda já possuem rotas próprias com Supabase. O frontend não aponta mais para a API Java; módulos ainda não migrados permanecem pendentes, sem respostas simuladas.

## Vínculo com a conta correta

Em 21/10/2026, o login interativo foi concluído e o projeto correto foi vinculado com sucesso. Para autenticar novamente quando necessário:

```sh
npm run supabase:login
npm run supabase:link
```

O diretório já foi inicializado; não é necessário repetir `init`. Concluir o fluxo de login no navegador e informar dados privados somente no terminal local quando solicitados. Não enviar token de conta ou senha do banco pelo chat nem gravá-los no Git.

A URI PostgreSQL enviada contém `[YOUR-PASSWORD]`, um placeholder, e não foi salva como conexão utilizável. Nenhuma senha real foi configurada. As oito migrations foram aplicadas ao projeto remoto e seu histórico foi confirmado como sincronizado. Não houve importação de dados do Java nem criação de usuários de teste.

Referência oficial: https://supabase.com/docs/guides/local-development/cli/getting-started

## Migration de perfis necessária para login

As rotas de autenticação incluem login/logout/sessão, signup, resend, recover, reset, Google, callback, confirmação e foto privada. As rotas de negócio ficam em `/api/v1`. Não usam mais `/auth/csrf` do Java. O servidor valida a identidade com `auth.getUser()`, carrega o perfil via RLS e não retorna tokens ao navegador. Cookies são HttpOnly, SameSite=Lax e Secure em produção; mutações exigem Origin da própria aplicação. As rotas renovam os cookies usando o cliente SSR por requisição; não há autenticação por Server Components nesta fase.

Após o login correto em 21/10/2026, as oito migrations foram aplicadas no projeto **zevgzuhtemnjrqeolmit**. A consulta anônima de zero linhas a `usuarios` passou a retornar 401, em vez do erro anterior de tabela ausente. Para conferir o histórico e futuras alterações:

```sh
npm run supabase:status
npm run supabase:migrate:check
npm run supabase:migrate
```

Confirmar o projeto vinculado antes de aplicar. A migration `202610210001_auth_profiles.sql` cria `usuarios`, RLS, trigger e perfis para contas já presentes em Supabase Auth; não cria contas falsas nem importa senhas Java. Plano e status são definidos no banco, nunca a partir dos metadados editáveis de autenticação. Plano pago sem vencimento confirmado não libera acesso. A sincronização com pagamentos ainda está pendente.

As contas existentes somente no Java não passam a existir em Supabase automaticamente. Cadastro, confirmação, Google, recuperação de senha, foto e edição de perfil já têm implementação nova, mas dependem das migrations e da configuração hospedada para validação completa. Não houve criação de usuários de teste no projeto remoto.

Dependências fixadas: `@supabase/ssr@0.8.0` e `@supabase/supabase-js@2.95.3`, com peer dependencies compatíveis e suporte ao Node 20 existente. As versões mais recentes consultadas exigiam Node 22; não foi feito upgrade indiscriminado do runtime.

## Configuração hospedada que exige acesso à conta

A verificação pública de 21/10 confirmou `disable_signup=false`, `mailer_autoconfirm=false` e `external.google=false`. O bloqueio anterior de privilégios da CLI foi resolvido pelo login interativo com código temporário. Senhas e tokens permanentes não foram enviados pelo chat.

Configurar Site URL e Redirect URLs para o domínio do Gevyro Next, incluindo `/api/auth/callback` e `/api/auth/confirm`. Na Console Google, o callback do provedor é `https://zevgzuhtemnjrqeolmit.supabase.co/auth/v1/callback`. Client ID/secret do Google ficam no painel Supabase, nunca no frontend ou Git. O provedor Google está desabilitado até essa configuração.

Os modelos versionados em `supabase/templates` usam TokenHash para confirmação (funciona sem depender do navegador que iniciou o cadastro) e Token de seis dígitos para recuperação, preservando a tela existente. Configurar esses modelos no projeto remoto e manter OTP de seis dígitos. O arquivo TOML configura o ambiente local; sua presença não prova que as configurações hospedadas foram aplicadas. Configurar SMTP com o provedor de e-mail utilizado pela Gevyro, sem presumir que o serviço padrão do Supabase atende clientes reais. A política de senha das rotas é de pelo menos oito caracteres com letras e números.

## Dados, Storage e tarefas

São oito migrations, da fundação de empresas às políticas de domínio, sem apagar migrations MySQL. As RPCs de escrita usam a identidade autenticada, validam plano e dono, bloqueiam linhas e registram auditoria na mesma transação. Não existe escrita direta de preço, estoque, plano ou venda pelo navegador. As políticas também bloqueiam leitura de domínio por plano inativo; o próprio perfil continua legível para permitir cobrança/reativação.

O bucket `profile-photos` é privado, limitado a 5 MB por arquivo e a diretórios da própria conta. As imagens são servidas pela aplicação com sessão verificada, sem URL pública permanente. A foto opcional do cadastro aguarda confirmação de e-mail em IndexedDB no dispositivo que iniciou o cadastro; é considerada expirada após 24 horas e é removida quando verificada. Após login, o envio ao Storage acontece antes de concluir a navegação; uma falha mantém o arquivo para tentar novamente. A foto escolhida em um dispositivo não é enviada automaticamente por outro dispositivo. A detecção/corte de rosto do Cloudinary original ainda não tem equivalente validado; registrar como diferença, não declarar paridade de imagens.

`cash_close_expired()` implementa o fechamento de caixas com mais de 24 horas e só pode ser executada pelo papel servidor `service_role`. O agendamento por hora ainda não foi instalado em Workers/Supabase. Nunca colocar a chave secreta no navegador. Não há processo automático de migração, cron ou deploy conectado neste momento.

Os scripts de status/dry-run/aplicação recusam um project-ref diferente de `zevgzuhtemnjrqeolmit`. Não alteram credenciais ou projetos da Gevyro original.
