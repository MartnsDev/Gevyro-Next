"""Concorrência e retry contra PostgreSQL real, não mocks de repositório."""
import concurrent.futures
import json
import subprocess
import sys
import threading
import uuid

psql, host, port = sys.argv[1:]
base=[psql,'-X','-qAt','-h',host,'-p',port,'-d','postgres','-v','ON_ERROR_STOP=1']
def query(sql):
    return subprocess.run(base+['-c',sql],text=True,capture_output=True)
for index, same_key in [(10,False),(11,True)]:
    owner=f'00000000-0000-0000-0000-{index:012d}'
    setup=query(f"""
    insert into auth.users(id,email) values('{owner}','sale{index}@example.invalid');
    set role authenticated;select set_config('request.jwt.claim.sub','{owner}',false);
    select row_to_json(public.company_write(null,'Sales concurrency {index}',null,true));
    select row_to_json(public.product_write(null,jsonb_build_object('empresaId',(select id from public.empresas limit 1),'nome','Stock One','preco','10.00','quantidadeEstoque',1)));
    select row_to_json(public.cash_write(null,jsonb_build_object('empresaId',(select id from public.empresas limit 1),'saldoInicial','0')));
    """)
    assert setup.returncode==0,setup.stderr
    values=[json.loads(line) for line in setup.stdout.splitlines() if line.startswith('{')]
    company,product,cash=values
    body=json.dumps({'idCaixa':cash['id'],'formaPagamento':'PIX','itens':[{'idProduto':product['id'],'quantidade':1}]})
    shared=str(uuid.uuid4())
    barrier=threading.Barrier(2)
    def sell(worker):
        key=shared if same_key else str(uuid.uuid4())
        barrier.wait()
        return query(f"set role authenticated;select set_config('request.jwt.claim.sub','{owner}',false);select public.sale_register('{body}'::jsonb,'{key}'::uuid);")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(sell,[1,2]))
    expected=[0,0] if same_key else [0,1]
    assert sorted(r.returncode for r in results)==expected,[r.stderr for r in results]
    if same_key:
        ids=[json.loads(r.stdout.splitlines()[-1])['id'] for r in results]
        assert ids[0]==ids[1],'Retry produziu outra venda'
    else:
        assert any('Estoque insuficiente' in r.stderr for r in results),'Falha inesperada na disputa de estoque'
    snapshot=query(f"select json_build_object('stock',(select quantidade_estoque from public.produto where id={product['id']}),'sales',(select count(*) from public.vendas where caixa_id={cash['id']}),'total',(select total_vendas from public.caixas where id={cash['id']}));")
    actual=json.loads(snapshot.stdout)
    assert actual=={'stock':0,'sales':1,'total':10},actual
print('PASS: vendas simultâneas não deixam estoque negativo; retry simultâneo gera uma única venda e um único total de caixa.')
