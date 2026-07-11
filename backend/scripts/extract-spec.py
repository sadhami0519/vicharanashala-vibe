"""Extract OpenAPI spec from the Scalar reference HTML dump."""
import re, json

with open('extract-output.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Find "openapi" field
openapi_idx = content.index('"openapi"')
print(f'"openapi" at index {openapi_idx}')

# Search back ~1500 chars for the "const name = {" that starts the spec
search_region = content[max(0, openapi_idx - 2000):openapi_idx]

# Find "const <word> = {"
const_matches = list(re.finditer(r'const\s+\w+\s*=\s*\{', search_region))
print(f'Found {len(const_matches)} const assignments')

for m in const_matches:
    print(f'  idx={m.start()}: {search_region[m.start():m.start()+40].strip()}')

if const_matches:
    # Use the LAST const match before "openapi" -- that's the spec variable
    last = const_matches[-1]
    # Global index of the '{' that opens the spec object
    global_obj_start = openapi_idx - (len(search_region) - last.end() + 1)
    print(f'Spec object global start: {global_obj_start}')
    print(f'First 80 spec chars: {repr(content[global_obj_start:global_obj_start+80])}')
    
    # Now extract JSON by counting braces from global_obj_start
    brace_count = 0
    in_string = False
    escaped = False
    obj_end = -1
    
    for i in range(global_obj_start, len(content)):
        ch = content[i]
        if escaped:
            escaped = False
            continue
        if ch == '\\' and in_string:
            escaped = True
            continue
        if ch == '"' and not escaped:
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == '{':
            brace_count += 1
        elif ch == '}':
            brace_count -= 1
            if brace_count == 0:
                obj_end = i
                break
    
    if obj_end != -1:
        spec_json = content[global_obj_start:obj_end+1]
        print(f'Extracted JSON length: {len(spec_json)}')
        try:
            spec = json.loads(spec_json)
            print(f'✅ Valid JSON! openapi: {spec.get("openapi")}')
            print(f'Paths: {len(spec.get("paths", {}))}')
            sr_paths = [p for p in spec.get('paths', {}).keys() if 'spaced' in p]
            print(f'Spaced-repetition paths: {sr_paths}')
            with open('openapi-extracted.json', 'w', encoding='utf-8') as f:
                json.dump(spec, f, indent=2)
            print('✅ Written to openapi-extracted.json')
        except json.JSONDecodeError as e:
            print(f'❌ JSON error: {e}')
            print(f'Context: ...{spec_json[max(0,e.pos-50):e.pos+50]}...')
    else:
        print('❌ Could not find closing brace')
else:
    print('❌ No const assignment found before "openapi"')
    # Let me just grab a large chunk starting from "openapi" and try to fix it
    print('Trying alternative extraction...')
    # Try: find "openapi" and work forward to find matching }
    # Actually let's just search for all 5 spaced-repetition paths and build the section manually
    for path_pat in [
        '/api/spaced-repetition/{studentId}/seed',
        '/api/spaced-repetition/{studentId}/review',
        '/api/spaced-repetition/{studentId}/schedule',
        '/api/spaced-repetition/{studentId}/course/{courseId}',
        '/api/spaced-repetition/{studentId}/notifications'
    ]:
        idx = content.find(path_pat)
        if idx >= 0:
            print(f'Found: {path_pat} at index {idx}')
            # Show 200 chars before and after
            print(f'  Before: {repr(content[max(0,idx-100):idx])}')
            print(f'  After: {repr(content[idx:idx+200])}')
        else:
            print(f'NOT FOUND: {path_pat}')