package br.com.gestpro.plano.mercadopago;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import com.google.gson.JsonParser;
import com.mercadopago.core.MPRequestOptions;
import com.mercadopago.net.HttpMethod;
import com.mercadopago.net.MPDefaultHttpClient;
import com.mercadopago.net.MPRequest;
import java.util.Map;
import jakarta.annotation.PreDestroy;
import org.apache.http.impl.client.CloseableHttpClient;
import org.apache.http.impl.client.HttpClients;

@Component
@ConditionalOnProperty(name = "billing.provider", havingValue = "mercadopago", matchIfMissing = true)
public class MercadoPagoClient {
    private final String token;
    private final ObjectMapper mapper;
    private final CloseableHttpClient transport = HttpClients.custom()
            .disableAutomaticRetries().disableRedirectHandling().disableCookieManagement().build();
    private final MPDefaultHttpClient http = new MPDefaultHttpClient(transport) {};
    @PreDestroy
    public void close() throws java.io.IOException { transport.close(); }
    public MercadoPagoClient(@Value("${mercadopago.access-token:}") String token, ObjectMapper mapper) {
        this.token = token;
        this.mapper = mapper;
    }
    public void ensureConfigured() {
        if (token.isBlank()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "Configure MERCADO_PAGO_ACCESS_TOKEN no backend.");
    }
    public JsonNode request(String method, String path, Object body) {
        ensureConfigured();
        try {
            // Use the official SDK transport. Subscription duplicate protection is local;
            // the preapproval API does not promise X-Idempotency-Key semantics.
            MPRequest request = MPRequest.builder()
                    .uri("https://api.mercadopago.com" + path)
                    .method(HttpMethod.valueOf(method))
                    .headers(Map.of("Authorization", "Bearer " + token,
                            "Content-Type", "application/json", "User-Agent", "MercadoPago Java SDK/3.7.0"))
                    .accessToken(token)
                    .connectionTimeout(10000).connectionRequestTimeout(10000).socketTimeout(20000)
                    .payload(body == null ? null : JsonParser.parseString(mapper.writeValueAsString(body)).getAsJsonObject())
                    .build();
            var response = http.sendWithRetry(request, MPRequestOptions.builder().maxRetries(0).build());
            return mapper.readTree(response.getContent());
        } catch (ResponseStatusException e) { throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Não foi possível consultar o Mercado Pago.");
        }
    }
    public static String validId(String id) {
        if (id == null || !id.matches("[a-zA-Z0-9_-]{1,100}"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Identificador inválido.");
        return id;
    }
}
