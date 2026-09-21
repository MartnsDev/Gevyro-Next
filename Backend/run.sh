#!/usr/bin/env bash

set -Eeuo pipefail

# Garante que o script funcione independentemente da pasta atual
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

SECRETS_FILE="$SCRIPT_DIR/.env.secrets"

if [[ ! -f "$SECRETS_FILE" ]]; then
    echo "Erro: arquivo .env.secrets não encontrado."
    exit 1
fi

# Exporta automaticamente tudo que estiver no arquivo secreto
set -a
source "$SECRETS_FILE"
set +a

# ===============================
# PERFIL
# ===============================
export APP_PROFILE="dev"

# ===============================
# BANCO DE DADOS — MYSQL
# ===============================
export DB_URL="jdbc:mysql://localhost:3306/gestpro?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=America/Sao_Paulo"
export DB_USERNAME="root"

# ===============================
# REDIS
# ===============================
export SPRING_DATA_REDIS_HOST="localhost"
export SPRING_DATA_REDIS_PORT="6379"
export SPRING_DATA_REDIS_PASSWORD=""

# ===============================
# SERVIDOR
# ===============================
export APP_BASE_URL="http://localhost:8080"
export APP_FRONTEND_URL="http://localhost:3000"
export NEXT_PUBLIC_API_URL="http://localhost:8080"

# ===============================
# BASIC AUTH — TESTES
# ===============================
export BASIC_AUTH_USER="Martins"

# ===============================
# GOOGLE OAUTH2
# ===============================
export GOOGLE_REDIRECT_URI="http://localhost:8080/login/oauth2/code/google"

# ===============================
# CLOUDINARY
# ===============================
export CLOUDINARY_CLOUD_NAME="dkrxepc7y"

# ===============================
# INTEGRAÇÕES
# ===============================
export GESTPRO_MARKETPLACE_SHOPEE_WEBHOOK_URL="https://yourdomain.com/api/webhooks/shopee"

# ===============================
# MERCADO PAGO — credenciais somente no backend
# ===============================

# Confere as variáveis essenciais sem revelar os valores
VARIAVEIS_OBRIGATORIAS=(
    DB_PASSWORD
    JWT_SECRET
    GOOGLE_CLIENT_ID
    GOOGLE_CLIENT_SECRET
    FISCAL_MASTER_KEY
    MERCADO_PAGO_ACCESS_TOKEN
    MERCADO_PAGO_WEBHOOK_SECRET
)

for VARIAVEL in "${VARIAVEIS_OBRIGATORIAS[@]}"; do
    if [[ -z "${!VARIAVEL:-}" ]]; then
        echo "Erro: variável $VARIAVEL não configurada."
        exit 1
    fi
done

echo -e "\e[32mVariáveis de desenvolvimento carregadas.\e[0m"
echo -e "\e[33mIniciando o backend...\e[0m"

# Mais rápido que executar clean install e depois java -jar
exec ./mvnw spring-boot:run -DskipTests
