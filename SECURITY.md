# Segurança

Não publique senhas, tokens, certificados, dados de clientes ou provas de exploração em issues públicas. Para relatar uma vulnerabilidade, use a aba Security → Report a vulnerability do repositório Gevyro-Next quando disponível; caso indisponível, contate o mantenedor por um canal privado conhecido.

Controles implementados: identidade Supabase validada no servidor, RLS por proprietário, políticas de plano, escrita financeira transacional por RPC, cookies HttpOnly, verificação de Origin, Storage privado, CSP com nonce e bloqueio de cache para APIs/HTML dinâmico. O nonce exige renderização dinâmica e aumenta uso de servidor. Estilos inline permanecem permitidos para compatibilidade com a interface; scripts inline sem nonce são bloqueados em produção.

Limites de segurança e implantação ainda pendentes estão em docs/DEPLOY.md e MIGRATION_STATUS.md. Nenhum arquivo deste repositório garante segurança absoluta ou substitui validação do ambiente hospedado.
