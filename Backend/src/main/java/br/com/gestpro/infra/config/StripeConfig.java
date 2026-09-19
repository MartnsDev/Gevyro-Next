package br.com.gestpro.infra.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import com.stripe.Stripe;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnProperty(name = "billing.provider", havingValue = "stripe")
public class StripeConfig {

    @Value("${stripe.api.key}")
    private String apiKey;

    @PostConstruct
    public void init() {
        Stripe.apiKey = apiKey;
    }
}