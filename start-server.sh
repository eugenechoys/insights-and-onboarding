#!/bin/bash
cd "$(dirname "$0")"
exec /usr/bin/python3 -c "
import http.server, socketserver, os
os.chdir(os.path.dirname(os.path.abspath('$0')) or '.')
port = int(os.environ.get('PORT', 8080))
handler = http.server.SimpleHTTPRequestHandler
with socketserver.TCPServer(('', port), handler) as httpd:
    print(f'Serving on port {port}')
    httpd.serve_forever()
"
