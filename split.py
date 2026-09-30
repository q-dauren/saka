import re, sys, os
text = open(sys.argv[1], encoding='utf-8').read()
pat = re.compile(r'^#{2,4}\s+`?([\w./\-\[\]]+\.\w+)`?[ \t]*\n+```[\w]*\n(.*?)\n```[ \t]*$', re.S | re.M)
n = 0
for m in pat.finditer(text):
    path, code = m.group(1), m.group(2)
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(code + '\n')
    print('создан:', path)
    n += 1
print('Всего файлов:', n)
