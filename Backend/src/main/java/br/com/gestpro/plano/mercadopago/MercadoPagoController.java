package br.com.gestpro.plano.mercadopago;

import br.com.gestpro.plano.stripe.dto.CheckoutRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.util.Map;

@RestController
@RequestMapping("/api/payments")
@RequiredArgsConstructor
@ConditionalOnProperty(name = "billing.provider", havingValue = "mercadopago", matchIfMissing = true)
public class MercadoPagoController {
    private final MercadoPagoService service;
    private String email(Authentication authentication) {
        if (authentication == null || !authentication.isAuthenticated())
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Entre novamente.");
        return authentication.getName();
    }
    @PostMapping("/create-checkout-session")
    public Map<String, String> checkout(@Valid @RequestBody CheckoutRequest request, Authentication auth) {
        return Map.of("url", service.checkout(email(auth), request.plano()));
    }
    @GetMapping("/session-info")
    public Map<String, Object> session(@RequestParam(required = false) String preapprovalId, Authentication auth) {
        return service.status(email(auth), preapprovalId);
    }
    @GetMapping("/subscription")
    public Map<String, Object> subscription(Authentication auth) { return service.status(email(auth), null); }
    @PostMapping("/cancel")
    public Map<String, Object> cancel(Authentication auth) { return service.cancel(email(auth)); }
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> error(ResponseStatusException exception) {
        return ResponseEntity.status(exception.getStatusCode()).body(Map.of("error",
                exception.getReason() == null ? "Falha ao processar cobrança." : exception.getReason()));
    }
}
