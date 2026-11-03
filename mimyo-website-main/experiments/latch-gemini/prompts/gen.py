# Generate latch illustrations with Gemini image models.
# Usage: python3 -I gen.py <prompt.txt> <out_prefix> <n> [model] [ref1.png ref2.png ...]
# Reads GEMINI_API_KEY from the environment; never prints it.
import base64, json, os, sys, urllib.request, concurrent.futures as cf

prompt_file, prefix, n = sys.argv[1], sys.argv[2], int(sys.argv[3])
model = sys.argv[4] if len(sys.argv) > 4 else 'gemini-3-pro-image'
refs = sys.argv[5:]
key = os.environ['GEMINI_API_KEY']
prompt = open(prompt_file).read()

parts = [{'inline_data': {'mime_type': 'image/png', 'data': base64.b64encode(open(r, 'rb').read()).decode()}} for r in refs]
parts.append({'text': prompt})
body = json.dumps({
    'contents': [{'parts': parts}],
    'generationConfig': {'responseModalities': ['IMAGE'],
                         'imageConfig': {'aspectRatio': '4:3', 'imageSize': '2K'}},
}).encode()
url = f'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent'

def run(i):
    req = urllib.request.Request(url, body, {'Content-Type': 'application/json', 'x-goog-api-key': key})
    try:
        d = json.load(urllib.request.urlopen(req, timeout=300))
    except urllib.error.HTTPError as e:
        return f'{i}: HTTP {e.code} {e.read()[:300]!r}'
    for c in d.get('candidates', []):
        for p in c.get('content', {}).get('parts', []):
            data = p.get('inlineData') or p.get('inline_data')
            if data:
                ext = 'jpg' if 'jpeg' in data.get('mimeType', data.get('mime_type', '')) else 'png'
                path = f'{prefix}_{i}.{ext}'
                open(path, 'wb').write(base64.b64decode(data['data']))
                return f'{i}: saved {path}'
    return f'{i}: no image ({json.dumps(d)[:300]})'

with cf.ThreadPoolExecutor(n) as ex:
    for line in ex.map(run, range(1, n + 1)):
        print(line)
