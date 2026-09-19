package br.com.gestpro.plano.mercadopago;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;

@Component
@ConditionalOnProperty(name = "billing.provider", havingValue = "mercadopago", matchIfMissing = true)
public class MercadoPagoClient {
    private final String token;
    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    public MercadoPagoClient(@Value("${mercadopago.access-token:}") String token, ObjectMapper mapper) {
        this.token = token;
        this.mapper = mapper;
    }
    public JsonNode request(String method, String path, Object body) {
        if (token.isBlank()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "Configure MERCADO_PAGO_ACCESS_TOKEN no backend.");
        try {
            HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("https://api.mercadopago.com" + path))
                    .timeout(Duration.ofSeconds(20)).header("Authorization", "Bearer " + token)
                    .header("Content-Type", "application/json");
            request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
            HttpResponse<String> response = http.send(request.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() < 200 || response.statusCode() >= 300)
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "O Mercado Pago não concluiu a solicitação. Tente novamente.");
            return mapper.readTree(response.body());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Consulta ao Mercado Pago interrompida.");
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
