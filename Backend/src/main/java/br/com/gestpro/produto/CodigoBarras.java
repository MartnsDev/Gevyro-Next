package br.com.gestpro.produto;

/** Normalização textual comum para cadastro e consulta de códigos. */
public final class CodigoBarras {
    private CodigoBarras() {}

    public static String normalizar(String codigo) {
        if (codigo == null) return null;
        String valor = codigo.trim();
        return valor.isEmpty() ? null : valor;
    }
}
