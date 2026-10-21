# Hospedagem: avaliação inicial, sem deploy

Documentação consultada em 20/10/2026:

- https://developers.cloudflare.com/workers/framework-guides/web-apps/opennext/
- https://developers.cloudflare.com/pages/framework-guides/nextjs/
- https://developers.cloudflare.com/workers/framework-guides/automatic-configuration/

A documentação atual recomenda vinext para novos projetos. OpenNext adapta o resultado do `next build` e documenta suporte a App Router, Route Handlers e SSR. Este projeto é uma migração de frontend existente; a escolha depende de regressão funcional e compatibilidade efetiva, não somente da recomendação para aplicações novas.

O manifesto fornecido já declara Next `^16.3.2` e React 19, divergindo do Next 14 descrito no pedido. Não realizar upgrade adicional por pressupor que a descrição está atualizada. Primeiro reproduzir instalação/build do lockfile e registrar resultados. Nenhum adaptador foi instalado ou validado nesta etapa.

Para decidir entre OpenNext e vinext: executar navegação, cookies SSR/OAuth, uploads, relatórios, impressão, middleware, CSP, PWA e pagamentos em preview local do runtime Workers, com testes equivalentes nos dois ambientes. Bibliotecas fiscais de certificados, assinatura XML e comunicação mTLS merecem avaliação específica de runtime; não presumir que Node local e Workers são equivalentes.

Publicação está pendente. Depois de validado: projeto Supabase separado, migrations revisadas, URLs de callback e OAuth por ambiente, segredos configurados no provedor, webhooks autenticados e domínio próprio com TLS. Não configurar serviços pagos nem publicar sem autorização.

Não há estimativa verificada de custo ou limites gratuitos neste incremento. Conferir preços oficiais no momento da escolha e documentar CPU, memória, requests, banco, Storage, egress e tarefas agendadas antes de contratar. Não pressupor adequação de planos gratuitos a clientes reais.
