# Operação com leitor de código de barras

O Gevyro usa o modo HID Keyboard dos leitores USB e Bluetooth. O leitor deve
ser pareado/conectado ao sistema operacional e configurado, quando possível,
para enviar `Enter` ao final da leitura. Nenhum driver ou marca específica é
necessário.

## Cadastro

No cadastro de produto, clique em **Código de barras** e bipe o produto. O
campo aceita EAN-8, EAN-13, UPC, GTIN e códigos alfanuméricos (por exemplo,
Code 128). O valor é tratado como texto; espaços nas extremidades são
removidos, mas zeros à esquerda e letras são preservados. O Enter do leitor
não envia o formulário.

## PDV

Com o caixa aberto, abra uma nova venda e mantenha o foco fora de campos de
texto. O indicador `Leitor ativo` confirma que o scanner global está montado.
Cada leitura é enfileirada, consultada no backend pela empresa autenticada e
adicionada ao carrinho. Releituras incrementam a quantidade. Códigos não
encontrados oferecem o cadastro rápido com o código já preenchido.

O estoque só é movimentado pela finalização oficial da venda. A consulta usa
um cache curto durante a venda, e o backend continua sendo a autoridade para
preço, estoque, empresa e produto ativo.

## Teste manual recomendado

1. Cadastre dois produtos bipando seus códigos.
2. Abra o caixa e uma venda.
3. Bipe A duas vezes e confirme quantidade 2.
4. Bipe B e confirme a inclusão.
5. Bipe um código inexistente e use o cadastro rápido.
6. Altere manualmente a quantidade de A, bipe A novamente e finalize.
7. Confira estoque, caixa, relatório e faça uma segunda venda.

Leitores sem Enter usam um timeout curto como fallback. Caso o leitor esteja
configurado com intervalo muito alto entre caracteres, configure o sufixo
Enter no próprio leitor para evitar que a sequência seja dividida.
