"""Build a macOS .icns file from PNG renders (no Apple tools needed). Usage: make-icns.py out.icns 1024.png 512.png 256.png 128.png"""
import struct, sys
TYPES = {1024: b'ic10', 512: b'ic09', 256: b'ic08', 128: b'ic07'}
out, *pngs = sys.argv[1:]
chunks = b''
for path in pngs:
    data = open(path, 'rb').read()
    w = struct.unpack('>I', data[16:20])[0]
    chunks += TYPES[w] + struct.pack('>I', len(data) + 8) + data
open(out, 'wb').write(b'icns' + struct.pack('>I', len(chunks) + 8) + chunks)
