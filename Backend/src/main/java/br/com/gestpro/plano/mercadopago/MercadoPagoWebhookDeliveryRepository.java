package br.com.gestpro.plano.mercadopago;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import org.springframework.data.domain.Pageable;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface MercadoPagoWebhookDeliveryRepository extends JpaRepository<MercadoPagoWebhookDelivery, Long> {
    boolean existsByDeliveryKey(String key);
    Optional<MercadoPagoWebhookDelivery> findByDeliveryKey(String key);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select d from MercadoPagoWebhookDelivery d where d.id = :id")
    Optional<MercadoPagoWebhookDelivery> lockById(@Param("id") Long id);
    @Query("select d.id from MercadoPagoWebhookDelivery d where d.status = 'PENDING' and d.nextAttemptAt <= :now order by d.nextAttemptAt, d.id")
    List<Long> findDue(@Param("now") Instant now, Pageable pageable);
}
