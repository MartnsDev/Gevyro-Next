package br.com.gestpro.plano.mercadopago;

import br.com.gestpro.auth.model.Usuario;
import br.com.gestpro.plano.stripe.PlanoTipo;
import jakarta.persistence.*;
import lombok.Data;

@Entity
@Table(name = "mercado_pago_subscriptions")
@Data
public class MercadoPagoSubscription {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @OneToOne @JoinColumn(name = "usuario_id", nullable = false, unique = true)
    private Usuario usuario;
    @Column(nullable = false, unique = true)
    private String externalReference;
    @Column(unique = true)
    private String preapprovalId;
    @Enumerated(EnumType.STRING) @Column(nullable = false)
    private PlanoTipo plano;
}
