package br.com.gestpro.produto.service;

import br.com.gestpro.auth.model.Usuario;
import br.com.gestpro.auth.repository.UsuarioRepository;
import br.com.gestpro.empresa.model.Empresa;
import br.com.gestpro.empresa.repository.EmpresaRepository;
import br.com.gestpro.infra.exception.ApiException;
import br.com.gestpro.plano.TipoPlano;
import br.com.gestpro.produto.dto.CriarProdutoDTO;
import br.com.gestpro.produto.model.Produto;
import br.com.gestpro.produto.repository.ProdutoRepository;
import br.com.gestpro.produto.CodigoBarras;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.dao.DataIntegrityViolationException;

import java.util.List;

@Service
public class ProdutoServiceImpl implements ProdutoServiceInterface {

    private final ProdutoRepository produtoRepository;
    private final UsuarioRepository usuarioRepository;
    private final EmpresaRepository empresaRepository;

    public ProdutoServiceImpl(ProdutoRepository pr, UsuarioRepository ur, EmpresaRepository er) {
        this.produtoRepository = pr;
        this.usuarioRepository = ur;
        this.empresaRepository = er;
    }

    private Usuario buscarUsuario(String email) {
        return usuarioRepository.findByEmail(email)
                .orElseThrow(() -> new ApiException(
                        "Usuário não encontrado", HttpStatus.NOT_FOUND, "/api/v1/produtos"));
    }

    private Empresa buscarEmpresa(Long empresaId, String emailUsuario) {
        Empresa empresa = empresaRepository.findById(empresaId)
                .orElseThrow(() -> new ApiException(
                        "Empresa não encontrada", HttpStatus.NOT_FOUND, "/api/v1/produtos"));
        if (!empresa.getDono().getEmail().equals(emailUsuario))
            throw new ApiException(
                    "Sem permissão para esta empresa.", HttpStatus.FORBIDDEN, "/api/v1/produtos");
        if (!Boolean.TRUE.equals(empresa.getAtivo()))
            throw new ApiException(
                    "Esta empresa está arquivada.", HttpStatus.CONFLICT, "/api/v1/produtos");
        return empresa;
    }


    private void validarLimiteProdutos(Empresa empresa, Usuario usuario) {
        TipoPlano plano = usuario.getTipoPlano();

        if (plano.isProdutosIlimitado()) return;

        long totalProdutos = produtoRepository.countByEmpresaAndAtivoTrue(empresa);

        if (totalProdutos >= plano.getLimiteProdutos()) {
            throw new ApiException(
                    String.format(
                            "Limite de %d produto(s) atingido no plano %s. " +
                                    "Faça upgrade para o plano Pro e cadastre produtos ilimitados!",
                            plano.getLimiteProdutos(),
                            plano.name()
                    ),
                    HttpStatus.FORBIDDEN,
                    "/api/v1/produtos"
            );
        }
    }

    private void preencherCampos(Produto produto, CriarProdutoDTO dto) {
        produto.setNome(dto.getNome());
        produto.setPreco(dto.getPreco());
        produto.setQuantidadeEstoque(dto.getQuantidadeEstoque());
        produto.setAtivo(Boolean.TRUE.equals(dto.getAtivo()));
        produto.setCategoria(dto.getCategoria());
        produto.setDescricao(dto.getDescricao());
        produto.setUnidade(dto.getUnidade());
        produto.setCodigoBarras(normalizarCodigo(dto.getCodigoBarras()));
        produto.setPrecoCusto(dto.getPrecoCusto());
        produto.setEstoqueMinimo(dto.getEstoqueMinimo() != null ? dto.getEstoqueMinimo() : 0);
    }

    private String normalizarCodigo(String codigo) {
        return CodigoBarras.normalizar(codigo);
    }

    private void validarCodigoDisponivel(String codigo, Empresa empresa, Long produtoId) {
        if (codigo == null || empresa == null) return;
        boolean usado = produtoId == null
                ? produtoRepository.findByEmpresa_IdAndCodigoBarras(empresa.getId(), codigo).isPresent()
                : produtoRepository.existsByEmpresa_IdAndCodigoBarrasAndIdNot(empresa.getId(), codigo, produtoId);
        if (usado) {
            Produto existente = produtoRepository.findByEmpresa_IdAndCodigoBarras(empresa.getId(), codigo).orElse(null);
            String nome = existente != null && existente.getNome() != null ? " pelo produto '" + existente.getNome() + "'" : "";
            throw new ApiException("Código de barras já está sendo utilizado" + nome + ".", HttpStatus.CONFLICT, "/api/v1/produtos");
        }
    }

    @Override
    @Transactional
    public Produto criar(CriarProdutoDTO dto) {
        Usuario usuario = buscarUsuario(dto.getEmailUsuario());
        Empresa empresa = buscarEmpresa(dto.getEmpresaId(), dto.getEmailUsuario());

        validarLimiteProdutos(empresa, usuario);

        Produto produto = new Produto();
        preencherCampos(produto, dto);
        validarCodigoDisponivel(produto.getCodigoBarras(), empresa, null);
        produto.setUsuario(usuario);
        produto.setEmpresa(empresa);
        try {
            return produtoRepository.save(produto);
        } catch (DataIntegrityViolationException ex) {
            throw new ApiException("Código de barras já está sendo utilizado nesta empresa.", HttpStatus.CONFLICT, "/api/v1/produtos");
        }
    }

    @Override
    @Transactional
    public Produto atualizar(Long id, CriarProdutoDTO dto) {
        Produto produto = produtoRepository.findById(id)
                .orElseThrow(() -> new ApiException(
                        "Produto não encontrado", HttpStatus.NOT_FOUND, "/api/v1/produtos/" + id));
        if (!produto.getUsuario().getEmail().equals(dto.getEmailUsuario()))
            throw new ApiException(
                    "Sem permissão para editar este produto.", HttpStatus.FORBIDDEN, "/api/v1/produtos/" + id);
        Empresa empresaDestino = produto.getEmpresa();
        if (dto.getEmpresaId() != null) {
            empresaDestino = buscarEmpresa(dto.getEmpresaId(), dto.getEmailUsuario());
        }
        preencherCampos(produto, dto);
        validarCodigoDisponivel(produto.getCodigoBarras(), empresaDestino, id);
        produto.setEmpresa(empresaDestino);
        try {
            return produtoRepository.save(produto);
        } catch (DataIntegrityViolationException ex) {
            throw new ApiException("Código de barras já está sendo utilizado nesta empresa.", HttpStatus.CONFLICT, "/api/v1/produtos/" + id);
        }
    }

    @Override
    @Transactional
    public void excluir(Long id, String emailUsuario) {
        Produto produto = produtoRepository.findById(id)
                .orElseThrow(() -> new ApiException("Produto não encontrado", HttpStatus.NOT_FOUND, "/api/v1/produtos/" + id));

        if (!produto.getUsuario().getEmail().equals(emailUsuario)) {
            throw new ApiException("Sem permissão para excluir este produto.", HttpStatus.FORBIDDEN, "/api/v1/produtos/" + id);
        }

        // 1. Pergunta ao banco se o produto já foi vendido alguma vez
        boolean temVenda = produtoRepository.isProdutoVinculadoAVenda(id);

        if (temVenda) {
            // 2A. Já foi vendido? Fazemos o SOFT DELETE (Arquivamento)
            produto.setAtivo(false);
            produtoRepository.save(produto);
        } else {
            // 2B. Nunca foi vendido? Apagamos de verdade (Hard Delete)
            produtoRepository.delete(produto);
        }
    }
    @Override
    @Transactional(readOnly = true)
    public List<Produto> listarPorEmpresa(Long empresaId, String emailUsuario) {
        Empresa empresa = buscarEmpresa(empresaId, emailUsuario);
        return produtoRepository.findByEmpresa(empresa);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Produto> listarPorEmail(String email) {
        return produtoRepository.findByUsuario(buscarUsuario(email));
    }

    @Override
    @Transactional(readOnly = true)
    public Produto buscarPorId(Long id, String emailUsuario) {
        Produto produto = produtoRepository.findById(id)
                .orElseThrow(() -> new ApiException(
                        "Produto não encontrado", HttpStatus.NOT_FOUND, "/api/v1/produtos/" + id));
        buscarEmpresa(produto.getEmpresa().getId(), emailUsuario);
        return produto;
    }

    @Override
    @Transactional(readOnly = true)
    public Produto buscarPorCodigoBarras(String codigoBarras, Long empresaId, String emailUsuario) {
        Empresa empresa = buscarEmpresa(empresaId, emailUsuario);
        String codigo = normalizarCodigo(codigoBarras);
        if (codigo == null) {
            throw new ApiException("Informe um código de barras válido.", HttpStatus.BAD_REQUEST, "/api/v1/produtos/por-codigo-barras");
        }
        Produto produto = produtoRepository.findByEmpresa_IdAndCodigoBarras(empresa.getId(), codigo)
                .orElseThrow(() -> new ApiException("Produto não encontrado para o código de barras informado.", HttpStatus.NOT_FOUND, "/api/v1/produtos/por-codigo-barras"));
        if (!Boolean.TRUE.equals(produto.getAtivo())) {
            throw new ApiException("O código de barras pertence ao produto inativo '" + produto.getNome() + "'.", HttpStatus.CONFLICT, "/api/v1/produtos/por-codigo-barras");
        }
        return produto;
    }

    @Override @Transactional(readOnly = true)
    public List<Produto> listarTodos() { return produtoRepository.findAll(); }

    @Override @Transactional
    public Produto salvar(Produto produto) {
        produto.setCodigoBarras(normalizarCodigo(produto.getCodigoBarras()));
        if (produto.getEmpresa() != null) validarCodigoDisponivel(produto.getCodigoBarras(), produto.getEmpresa(), produto.getId());
        try {
            return produtoRepository.save(produto);
        } catch (DataIntegrityViolationException ex) {
            throw new ApiException("Código de barras já está sendo utilizado nesta empresa.", HttpStatus.CONFLICT, "/api/v1/produtos");
        }
    }

    @Override @Transactional(readOnly = true)
    public List<Produto> listarPorUsuario(Long usuarioId) {
        Usuario usuario = usuarioRepository.findById(usuarioId)
                .orElseThrow(() -> new ApiException(
                        "Usuário não encontrado", HttpStatus.NOT_FOUND, "/api/v1/produtos"));
        return produtoRepository.findByUsuario(usuario);
    }
}
