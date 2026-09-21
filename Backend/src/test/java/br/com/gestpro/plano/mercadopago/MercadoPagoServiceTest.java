package br.com.gestpro.plano.mercadopago;

import br.com.gestpro.auth.model.Usuario;
import br.com.gestpro.auth.repository.UsuarioRepository;
import br.com.gestpro.plano.TipoPlano;
import br.com.gestpro.plano.stripe.PlanoTipo;
import br.com.gestpro.plano.stripe.model.Assinatura;
import br.com.gestpro.plano.stripe.repository.AssinaturaRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Optional;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class MercadoPagoServiceTest {
    MercadoPagoClient client = mock(MercadoPagoClient.class, withSettings().mockMaker(org.mockito.MockMakers.SUBCLASS));
    MercadoPagoSubscriptionRepository subscriptions = mock(MercadoPagoSubscriptionRepository.class, withSettings().mockMaker(org.mockito.MockMakers.SUBCLASS));
    AssinaturaRepository assinaturas = mock(AssinaturaRepository.class, withSettings().mockMaker(org.mockito.MockMakers.SUBCLASS));
    UsuarioRepository usuarios = mock(UsuarioRepository.class, withSettings().mockMaker(org.mockito.MockMakers.SUBCLASS));
    ObjectMapper mapper = new ObjectMapper();
    org.springframework.transaction.PlatformTransactionManager transactionManager = mock(org.springframework.transaction.PlatformTransactionManager.class);
    MercadoPagoService service = new MercadoPagoService(client, subscriptions, assinaturas, usuarios, "https://gevyro.com.br", transactionManager);
    Usuario usuario = new Usuario();
    MercadoPagoSubscription local = new MercadoPagoSubscription();
    LocalDate today = LocalDate.now(ZoneId.of("America/Sao_Paulo"));

    @BeforeEach void setup() {
        usuario.setId(1L); usuario.setEmail("cliente@example.com"); usuario.setTipoPlano(TipoPlano.EXPERIMENTAL);
        local.setUsuario(usuario); local.setPlano(PlanoTipo.PRO); local.setPreapprovalId("abc123"); local.setExternalReference("gevyro-1-PRO");
        when(usuarios.findByEmailForUpdate(usuario.getEmail())).thenReturn(Optional.of(usuario));
        when(subscriptions.findByUsuarioEmail(usuario.getEmail())).thenReturn(Optional.of(local));
        when(assinaturas.findByUsuarioEmail(usuario.getEmail())).thenReturn(Optional.empty());
    }
    void remote(String status) throws Exception {
        when(client.request("GET", "/preapproval/abc123", null)).thenReturn(mapper.readTree("""
            {"id":"abc123","collector_id":99,"external_reference":"gevyro-1-PRO","status":"%s",
            "auto_recurring":{"currency_id":"BRL","frequency":1,"frequency_type":"months","transaction_amount":149.90}}
            """.formatted(status)));
    }
    void invoices(boolean paid, String paymentStatus) throws Exception {
        String results = paid ? """
            [{"preapproval_id":"abc123","debit_date":"%sT12:00:00-03:00","payment":{"id":123,"status":"approved"}}]
            """.formatted(today) : "[]";
        when(client.request("GET", "/authorized_payments/search?preapproval_id=abc123&limit=100&offset=0", null))
                .thenReturn(mapper.readTree("{\"paging\":{\"total\":1},\"results\":" + results + "}"));
        if (paid) when(client.request("GET", "/v1/payments/123", null)).thenReturn(mapper.readTree("""
            {"id":123,"collector_id":99,"status":"%s","currency_id":"BRL","transaction_amount":149.90,"transaction_amount_refunded":0}
            """.formatted(paymentStatus)));
    }
    @Test void authorizationWithoutPaymentDoesNotActivatePlan() throws Exception {
        remote("authorized"); invoices(false, "");
        assertThat(service.status(usuario.getEmail(), null)).containsEntry("paid", false);
        verify(assinaturas, never()).save(any());
        assertThat(usuario.getTipoPlano()).isEqualTo(TipoPlano.EXPERIMENTAL);
    }
    @Test void approvedPaymentActivatesAndDuplicatesDoNotExtendCycle() throws Exception {
        remote("authorized"); invoices(true, "approved");
        assertThat(service.status(usuario.getEmail(), null)).containsEntry("paid", true);
        service.status(usuario.getEmail(), null);
        ArgumentCaptor<Assinatura> saved = ArgumentCaptor.forClass(Assinatura.class);
        verify(assinaturas, times(2)).save(saved.capture());
        assertThat(saved.getAllValues()).allSatisfy(a -> assertThat(a.getDataVencimento()).isEqualTo(today.plusMonths(1).minusDays(1)));
    }
    @Test void cancelledRenewalPreservesPaidAccess() throws Exception {
        remote("cancelled"); invoices(true, "approved");
        assertThat(service.status(usuario.getEmail(), null)).containsEntry("paid", true).containsEntry("status", "cancelled");
    }
    @Test void refundedPaymentDoesNotActivatePlan() throws Exception {
        remote("authorized"); invoices(true, "refunded");
        assertThat(service.status(usuario.getEmail(), null)).containsEntry("paid", false);
        verify(assinaturas, never()).save(any());
    }
    @Test void otherAccountsSubscriptionIsRejectedBeforeProviderCall() {
        assertThatThrownBy(() -> service.status(usuario.getEmail(), "other-id")).hasMessageContaining("403");
        verifyNoInteractions(client);
    }
    @Test void existingAuthorizationPreventsSecondCheckout() throws Exception {
        remote("authorized");
        assertThatThrownBy(() -> service.checkout(usuario.getEmail(), PlanoTipo.PREMIUM)).hasMessageContaining("409");
        verify(client, never()).request(eq("POST"), anyString(), any());
    }
    @Test void wrongAmountFailsClosed() throws Exception {
        remote("authorized"); local.setPlano(PlanoTipo.BASICO);
        assertThatThrownBy(() -> service.status(usuario.getEmail(), null)).hasMessageContaining("502");
        verify(assinaturas, never()).save(any());
    }
    @Test void publicHttpReturnUrlIsRejected() {
        assertThatThrownBy(() -> new MercadoPagoService(client, subscriptions, assinaturas, usuarios,
                "http://example.com", transactionManager)).isInstanceOf(IllegalArgumentException.class);
    }
    @Test void returnUrlWithCredentialsOrPathIsRejected() {
        for (String url : java.util.List.of("https://user@example.com", "https://example.com/other", "https://example.com?x=y")) {
            assertThatThrownBy(() -> new MercadoPagoService(client, subscriptions, assinaturas, usuarios,
                    url, transactionManager)).isInstanceOf(IllegalArgumentException.class);
        }
    }
    @Test void lifecycleRejectsUnknownActionBeforeProviderCall() {
        assertThatThrownBy(() -> service.lifecycle(usuario.getEmail(), "abc123", "refund")).hasMessageContaining("400");
        verifyNoInteractions(client);
    }
}
