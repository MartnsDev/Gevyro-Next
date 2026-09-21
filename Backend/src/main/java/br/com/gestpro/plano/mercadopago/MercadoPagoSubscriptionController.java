package br.com.gestpro.plano.mercadopago;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.Map;

@RestController
@RequestMapping("/api/subscriptions")
@RequiredArgsConstructor
@ConditionalOnProperty(name = "billing.provider", havingValue = "mercadopago", matchIfMissing = true)
public class MercadoPagoSubscriptionController {
    private final MercadoPagoService service;

    private String email(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated())
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Entre novamente.");
        return authentication.getName();
    }

    @GetMapping("/{id}")
    public Map<String, Object> lookup(@PathVariable String id, Authentication auth) {
        return service.status(email(auth), id);
    }

    @PostMapping("/{id}/lifecycle")
    public Map<String, Object> lifecycle(@PathVariable String id, @RequestParam String action, Authentication auth) {
        return service.lifecycle(email(auth), id, action);
    }
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> error(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode()).body(Map.of("error",
                exception.getReason() == null ? "Não foi possível atualizar a assinatura." : exception.getReason()));
    }
}
