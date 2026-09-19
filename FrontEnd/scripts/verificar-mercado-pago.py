#!/usr/bin/env python3
"""Verificação somente leitura; execute com o ambiente seguro do BACKEND."""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--remote', action='store_true', help='Valida o vendedor por GET /users/me; não cria cobranças.')
    args = parser.parse_args()
    names = ('MERCADO_PAGO_ACCESS_TOKEN', 'MERCADO_PAGO_WEBHOOK_SECRET', 'MERCADO_PAGO_COLLECTOR_ID', 'APP_FRONTEND_URL')
    missing = [name for name in names if not os.environ.get(name, '').strip()]
    if missing:
        print('Configuração pendente: ' + ', '.join(missing))
        return 1
    token = os.environ[names[0]]
    secret = os.environ[names[1]]
    collector = os.environ[names[2]]
    url = urllib.parse.urlsplit(os.environ[names[3]])
    if any(c.isspace() for c in token + secret) or not collector.isascii() or not collector.isdigit() or len(collector) > 20:
        print('Credenciais ou ID do vendedor em formato inválido (valores ocultos).')
        return 1
    try:
        valid_url = url.scheme == 'https' and url.hostname and not url.username and not url.password and not url.query and not url.fragment and url.path in ('', '/') and url.port in (None, 443)
    except ValueError:
        valid_url = False
    if not valid_url:
        print('APP_FRONTEND_URL deve ser uma origem HTTPS sem caminho ou parâmetros.')
        return 1
    print('Formato das variáveis validado. Valores secretos não são exibidos.')
    print('Cobranças habilitadas: ' + str(os.environ.get('MERCADO_PAGO_ENABLED', 'false').lower() == 'true'))
    if not args.remote:
        print('Vendedor, webhook e cobrança ainda não validados contra o Mercado Pago.')
        return 0
    # Do not follow redirects carrying Authorization to another origin.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            return None
    request = urllib.request.Request('https://api.mercadopago.com/users/me', headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/json'})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=15) as response:
            raw = response.read(65537)
            if len(raw) > 65536:
                print('Resposta de validação excedeu o limite.'); return 1
            data = json.loads(raw)
        if not isinstance(data, dict) or str(data.get('id')) != collector or data.get('site_id') != 'MLB':
            print('O token não corresponde ao vendedor brasileiro configurado.'); return 1
        print('Token e vendedor brasileiro conferem. Nenhuma cobrança foi criada.')
        print('O segredo do webhook ainda deve ser validado com uma entrega assinada pelo painel.')
        return 0
    except urllib.error.HTTPError as error:
        print('Validação recusada pelo provedor. HTTP ' + str(error.code)); return 1
    except Exception:
        print('Não foi possível validar o vendedor. Confira rede e configuração; detalhes sensíveis foram omitidos.'); return 1


if __name__ == '__main__':
    sys.exit(main())
