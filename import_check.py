import ast
from pathlib import Path
from collections import Counter

backend_path = Path('backend')
all_imports = []

for py_file in backend_path.rglob('*.py'):
    with open(py_file, 'r', encoding='utf-8') as f:
        try:
            tree = ast.parse(f.read())
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        all_imports.append(alias.name.split('.')[0])
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        all_imports.append(node.module.split('.')[0])
        except:
            pass

counter = Counter(all_imports)
stdlib = {'os', 'sys', 'json', 'time', 'datetime', 'hashlib', 'base64', 'random', 
          'asyncio', 're', 'functools', 'typing', 'collections', 'enum', 'logging',
          'uuid', 'secrets', 'pathlib', 'email', 'hmac', 'struct', 'pickle', 'warnings', 'math', 'copy', 'socket', 'contextlib', 'sqlite3', 'inspect'}

print('=== ALL IMPORTS (by frequency) ===')
for imp, count in counter.most_common():
    if imp not in stdlib and imp:
        print(f'{imp}: {count}')
