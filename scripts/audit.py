#!/usr/bin/env python3
"""Inventário estático reproduzível. Nunca lê .env, certificados ou dumps."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JAVA = ROOT / 'Backend/src/main/java/br/com/gestpro'
entries = []
for path in sorted(JAVA.rglob('*.java')):
    source = path.read_text()
    entries.append({
        'path': str(path.relative_to(ROOT)),
        'module': path.relative_to(JAVA).parts[0],
        'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'annotations': sorted(set(re.findall(r'@(\w+)', source))),
        'httpMappings': re.findall(r'@((?:Request|Get|Post|Put|Patch|Delete)Mapping)\s*(?:\(([^)]*)\))?', source),
        'tables': re.findall(r'@Table\s*\(\s*name\s*=\s*"([^"]+)"', source),
        'dependencies': re.findall(r'private\s+final\s+([\w<>]+)\s+\w+\s*;', source),
    })
frontend = []
for folder in ['app', 'components', 'lib', 'hooks', 'public']:
    for path in sorted((ROOT / 'FrontEnd' / folder).rglob('*')):
        if path.is_file() and path.suffix in {'.ts', '.tsx', '.js', '.mjs', '.css', '.json'}:
            frontend.append({'path': str(path.relative_to(ROOT)), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
migrations = [str(p.relative_to(ROOT)) for p in sorted((ROOT / 'Backend/src/main/resources/db/migration').glob('*.sql'))]
original = Path('/home/matheus-martins/Documentos/GestPro/Gest-Pro')
comparison = {'source': str(original), 'available': original.is_dir(), 'equal': 0, 'different': [], 'missing': []}
if original.is_dir():
    for entry in entries + frontend:
        path = original / entry['path']
        if not path.is_file():
            comparison['missing'].append(entry['path'])
        elif hashlib.sha256(path.read_bytes()).hexdigest() == entry['sha256']:
            comparison['equal'] += 1
        else:
            comparison['different'].append(entry['path'])
result = {'scope': 'Inventário estático; não prova equivalência funcional nem auditoria semântica completa.',
          'java': entries, 'frontend': frontend, 'mysqlMigrations': migrations, 'originalComparison': comparison}
out = ROOT / 'docs/inventory.json'
out.parent.mkdir(exist_ok=True)
out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + '\n')
modules = sorted({e['module'] for e in entries})
lines = ['# Matriz de equivalência funcional', '',
         'Gerada por `npm run audit`. Os destinos são propostas; presença no inventário não significa migração concluída.', '',
         '| Módulo original | Classes Java | Controllers | Entidades JPA | Destino previsto | Estado |',
         '|---|---:|---:|---:|---|---|']
for module in modules:
    group = [e for e in entries if e['module'] == module]
    controllers = sum('RestController' in e['annotations'] or 'Controller' in e['annotations'] for e in group)
    entities = sum('Entity' in e['annotations'] for e in group)
    state = 'Em desenvolvimento' if module == 'venda' else 'Não iniciado'
    lines.append(f'| {module} | {len(group)} | {controllers} | {entities} | `src/server/{module}` | {state} |')
lines += ['', '## Interfaces preservadas', '']
lines += [f'- `{e["path"]}`' for e in frontend if '/app/' in e['path'] and (e['path'].endswith('page.tsx') or '/components/' in e['path'])]
lines += ['', '## Limites do levantamento', '',
          'Os mappings no JSON mantêm as anotações de classe e método separadas. Revisar composição, verbos, DTOs e autorização ao portar cada controller.',
          'Categorias, fornecedores, suporte e notificações citados no pedido ainda precisam de confirmação semântica: não criar módulos fictícios a partir do checklist.',
          'Credenciais, dumps e dados reais não integram este inventário.']
(ROOT / 'docs/FUNCTIONAL_MATRIX.md').write_text('\n'.join(lines) + '\n')
print(json.dumps({'java': len(entries), 'frontendFiles': len(frontend), 'migrations': len(migrations), 'modules': modules, 'originalComparison': comparison}, ensure_ascii=False))
