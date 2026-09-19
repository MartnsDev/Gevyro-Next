package br.com.gestpro.plano.mercadopago;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
public interface MercadoPagoSubscriptionRepository extends JpaRepository<MercadoPagoSubscription, Long> {
    Optional<MercadoPagoSubscription> findByUsuarioEmail(String email);
    @org.springframework.data.jpa.repository.Query("select s.usuario.email from MercadoPagoSubscription s where s.preapprovalId = :id")
    Optional<String> findEmailByPreapprovalId(@org.springframework.data.repository.query.Param("id") String id);
}
