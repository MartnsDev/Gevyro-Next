"""Duas conexões reais concorrem pela última vaga do plano Experimental."""
import concurrent.futures
import subprocess
import sys
import threading

psql, host, port = sys.argv[1:]
base = [psql, '-X', '-qAt', '-h', host, '-p', port, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
owner = '00000000-0000-0000-0000-000000000009'
setup = f"""
insert into auth.users(id,email) values('{owner}','concurrency@example.invalid');
create function public.test_company_delay() returns trigger language plpgsql as $$
begin
  if new.dono_id='{owner}' then perform pg_sleep(0.2);end if;
  return new;
end $$;
create trigger test_delay after insert on public.empresas for each row execute function public.test_company_delay();
"""
subprocess.run(base + ['-c', setup], check=True, capture_output=True, text=True)
barrier = threading.Barrier(2)
def create(index):
    barrier.wait()
    sql = f"set role authenticated;select set_config('request.jwt.claim.sub','{owner}',false);select public.company_write(null,'Concorrente {index}',null,true);"
    return subprocess.run(base + ['-c', sql], capture_output=True, text=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    results = list(pool.map(create, [1, 2]))
assert sorted(r.returncode for r in results) == [0, 1], 'Exatamente uma criação deveria ser autorizada'
assert any('Limite de empresas' in r.stderr for r in results), 'A segunda criação deve falhar por cota'
count = subprocess.check_output(base + ['-c', f"select count(*) from public.empresas where dono_id='{owner}'"], text=True).strip()
assert count == '1', 'Criações simultâneas ultrapassaram o plano'
print('PASS: concorrência real de criação de empresas preserva limite do plano.')
