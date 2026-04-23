#!/usr/bin/env python3
"""
patch_app.py — Applique les 3 modifications à App.tsx :
  1. Ajoute `import { PhotoCapture } from './PhotoCapture';`
  2. Supprime le bloc const PhotoUpload = ...
  3. Remplace <PhotoUpload par <PhotoCapture dans le JSX

Usage: python patch_app.py
"""
import re, shutil, os

SRC = "src/App.tsx"
BAK = "src/App.tsx.bak"

# ── Sauvegarde ────────────────────────────────────────────────────────────
shutil.copy(SRC, BAK)
print(f"✅ Backup saved → {BAK}")

with open(SRC, "r", encoding="utf-8") as f:
    code = f.read()

original_len = len(code)

# ── 1. Ajouter import PhotoCapture ────────────────────────────────────────
IMPORT_TRIGGER = "import KioskView from './KioskView';"
IMPORT_ADD     = "import { PhotoCapture } from './PhotoCapture';"

if IMPORT_ADD in code:
    print("⏭️  Import PhotoCapture already present — skipped")
elif IMPORT_TRIGGER in code:
    code = code.replace(IMPORT_TRIGGER, IMPORT_TRIGGER + "\n" + IMPORT_ADD)
    print("✅ Step 1: import PhotoCapture added")
else:
    # Fallback: try without semicolon
    trigger2 = "import KioskView from './KioskView'"
    if trigger2 in code:
        code = code.replace(trigger2, trigger2 + ";\n" + IMPORT_ADD)
        print("✅ Step 1: import PhotoCapture added (no-semicolon variant)")
    else:
        print("⚠️  Step 1: Could not find 'import KioskView' line — add manually:")
        print(f"   {IMPORT_ADD}")

# ── 2. Supprimer le bloc const PhotoUpload = ... ──────────────────────────
# The block starts at the comment and ends after the closing }; of the arrow function
# Pattern: match from the comment line to the closing }; that ends the component
photo_upload_pattern = re.compile(
    r'// PATIENT PHOTO UPLOAD\s*\n'   # comment line
    r'(?:// [═=]+\s*\n)?'              # optional separator line
    r'const PhotoUpload = \(\{.*?\}\) => \{.*?\};\s*\n',
    re.DOTALL
)

m = photo_upload_pattern.search(code)
if m:
    code = code[:m.start()] + code[m.end():]
    print("✅ Step 2: PhotoUpload component block removed")
else:
    # Try alternate pattern — just the const declaration and its body
    alt_pattern = re.compile(
        r'// PATIENT PHOTO UPLOAD.*?(?=\n// ══|const \w+View|export default)',
        re.DOTALL
    )
    m2 = alt_pattern.search(code)
    if m2:
        code = code[:m2.start()] + code[m2.end():]
        print("✅ Step 2: PhotoUpload block removed (alt pattern)")
    else:
        print("⚠️  Step 2: Could not auto-remove PhotoUpload block.")
        print("   Manually delete the block starting with '// PATIENT PHOTO UPLOAD'")

# ── 3. Remplacer <PhotoUpload par <PhotoCapture ───────────────────────────
if '<PhotoUpload' in code:
    count = code.count('<PhotoUpload')
    code = code.replace('<PhotoUpload', '<PhotoCapture')
    print(f"✅ Step 3: <PhotoUpload → <PhotoCapture ({count} occurrence(s))")
else:
    print("⏭️  Step 3: No <PhotoUpload found — already replaced or not present")

# ── Also replace PhotoUpload closing tag if any ────────────────────────────
if '</PhotoUpload>' in code:
    code = code.replace('</PhotoUpload>', '</PhotoCapture>')
    print("✅ Step 3b: </PhotoUpload> → </PhotoCapture>")

# ── Write ─────────────────────────────────────────────────────────────────
with open(SRC, "w", encoding="utf-8") as f:
    f.write(code)

delta = len(code) - original_len
print(f"\n✅ Done — {SRC} updated ({delta:+d} chars)")
print("   Run `npm run dev` to verify")
